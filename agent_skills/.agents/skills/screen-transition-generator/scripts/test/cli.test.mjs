// CLI の E2E: run / generate / エラー停止（接続失敗・上限到達・config 不正）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startExample, exampleConfig } from './helpers.mjs';

const STG = resolve(dirname(fileURLToPath(import.meta.url)), '../stg.mjs');
const run = async (args, cwd) => {
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [STG, ...args], { cwd, timeout: 600000 });
    return { code: 0, json: JSON.parse(stdout) };
  } catch (e) {
    return { code: e.code, json: e.stdout ? JSON.parse(e.stdout) : null, stderr: e.stderr };
  }
};

let env;
before(async () => {
  env = await startExample();
});
after(() => env?.close());

async function workdir(config) {
  const cwd = await mkdtemp(join(tmpdir(), 'stg-cli-'));
  const out = join(cwd, 'screen-transition-generator');
  await mkdir(out);
  await writeFile(join(out, 'config.json'), JSON.stringify(config));
  return { cwd, out };
}

test('run で draw.io・画像・graph.json・summary.md・execution.log を出力し、再実行で退避する', async () => {
  const { cwd, out } = await workdir(await exampleConfig(env.app.url, { scenarios: [], limits: { maxScreens: 20 } }));
  const r = await run(['run'], cwd);
  assert.equal(r.code, 0, JSON.stringify(r.json));
  assert.equal(r.json.status, 'ok');
  const files = (await readdir(out)).sort();
  for (const f of ['config.json', 'execution.log', 'graph.json', 'images', 'screen-transition.drawio', 'summary.md']) assert.ok(files.includes(f), f);
  const xml = await readFile(join(out, 'screen-transition.drawio'), 'utf8');
  const summary = await readFile(join(out, 'summary.md'), 'utf8');
  assert.match(summary, /画面数 \| \d+/);
  assert.match(summary, /履歴を削除/);

  // 整形式チェック（Chromium の DOMParser）
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const parsed = await page.evaluate((x) => {
    const d = new DOMParser().parseFromString(x, 'application/xml');
    return {
      error: d.querySelector('parsererror')?.textContent ?? null,
      cells: d.querySelectorAll('mxCell').length,
      edges: d.querySelectorAll('mxCell[edge="1"]').length,
      layer: d.querySelectorAll('mxCell#layer-common[visible="0"]').length,
      inLayer: d.querySelectorAll('mxCell[edge="1"][parent="layer-common"]').length,
    };
  }, xml);
  await browser.close();
  assert.equal(parsed.error, null);
  const graph = JSON.parse(await readFile(join(out, 'graph.json'), 'utf8'));
  assert.equal(parsed.edges, graph.transitions.length);
  const collapsed = graph.transitions.filter((t) => t.collapsed).length;
  assert.ok(collapsed > 0, '共通ナビゲーションが集約される');
  assert.equal(parsed.layer, 1);
  assert.equal(parsed.inLayer, collapsed);
  assert.equal(parsed.cells, 3 + graph.screens.length + graph.transitions.length);

  // generate のみ再実行（graph.json 編集の反映）
  graph.screens[0].name = '編集した画面名';
  await writeFile(join(out, 'graph.json'), JSON.stringify(graph));
  const g = await run(['generate'], cwd);
  assert.equal(g.code, 0);
  assert.match(await readFile(join(out, 'screen-transition.drawio'), 'utf8'), /value="編集した画面名"/);

  // 再実行 → 前回分は .history へ
  const r2 = await run(['explore'], cwd);
  assert.equal(r2.code, 0);
  const hist = await readdir(join(out, '.history'));
  assert.equal(hist.length, 1);
  assert.ok((await readdir(join(out, '.history', hist[0]))).includes('screen-transition.drawio'));
  assert.ok((await stat(join(out, 'config.json'))).isFile());
});

test('接続できない場合は接続失敗エラーで停止し error-report.md を出す', async () => {
  const { cwd, out } = await workdir({ baseUrl: 'http://127.0.0.1:9', connectTimeoutSec: 1 });
  const r = await run(['run'], cwd);
  assert.equal(r.code, 1);
  assert.equal(r.json.kind, 'CONNECTION');
  const report = await readFile(join(out, 'error-report.md'), 'utf8');
  assert.match(report, /接続失敗/);
  assert.match(report, /推奨する解決方法/);
  assert.match(report, /探索を停止しました/);
});

test('探索上限に到達したらエラーとして停止し、途中成果物は残す', async () => {
  const { cwd, out } = await workdir(await exampleConfig(env.app.url, { limits: { maxScreens: 3 } }));
  const r = await run(['run'], cwd);
  assert.equal(r.code, 1);
  assert.equal(r.json.kind, 'LIMIT_REACHED');
  const graph = JSON.parse(await readFile(join(out, 'graph.json'), 'utf8'));
  assert.equal(graph.screens.length, 3);
  assert.equal((await readdir(join(out, 'images'))).length, 3);
  assert.match(await readFile(join(out, 'error-report.md'), 'utf8'), /探索上限到達/);
  await assert.rejects(stat(join(out, 'screen-transition.drawio')));
});

test('config が不正なら CONFIG_INVALID', async () => {
  const { cwd } = await workdir({ baseUrl: 'nope' });
  const r = await run(['explore'], cwd);
  assert.equal(r.code, 1);
  assert.equal(r.json.kind, 'CONFIG_INVALID');
});

test('シナリオの固定テキスト欄が見つからなければシナリオ再現エラー', async () => {
  const { cwd } = await workdir(await exampleConfig(env.app.url, {
    scenarios: [{ name: 'x', steps: [{ fill: { role: 'textbox', name: '存在しない欄' }, text: 'a' }, { click: { role: 'button', name: '送信' } }] }],
  }));
  const r = await run(['explore'], cwd);
  assert.equal(r.code, 1);
  assert.equal(r.json.kind, 'SCENARIO_FAILED');
});

test('probe は操作候補と安全判定を返す', async () => {
  const { cwd, out } = await workdir(await exampleConfig(env.app.url));
  const r = await run(['probe', '--click', 'button:料金を知りたい'], cwd);
  assert.equal(r.code, 0, JSON.stringify(r.json));
  const names = r.json.candidates.map((c) => c.name);
  assert.ok(names.includes('無料プランの詳細'));
  assert.equal(r.json.candidates.find((c) => c.name === '履歴を削除').safety.safe, false);
  assert.ok(r.json.allInteractive.some((c) => c.role === 'textbox' && c.name === 'メッセージ'));
  assert.ok((await stat(join(out, 'probe.png'))).isFile());
});
