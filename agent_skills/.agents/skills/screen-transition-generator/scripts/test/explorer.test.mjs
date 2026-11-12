// 統合テスト: お試しアプリを実際に Chromium で探索する
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { explore } from '../lib/explorer.mjs';
import { normalizeConfig } from '../lib/config.mjs';
import { prepareOutputDir } from '../lib/output.mjs';
import { Graph } from '../lib/graph.mjs';
import { startExample, exampleConfig } from './helpers.mjs';

let env;
let graph;
let outDir;

before(async () => {
  env = await startExample();
  outDir = join(await mkdtemp(join(tmpdir(), 'stg-it-')), 'screen-transition-generator');
  await prepareOutputDir(outDir);
  const cfg = normalizeConfig(await exampleConfig(env.app.url));
  graph = await explore(cfg, { outDir, log: () => {} });
});

after(() => env?.close());

const byName = (re) => graph.screens.filter((s) => re.test(s.name));
const edgesFrom = (id) => graph.transitions.filter((t) => t.from === id);
const edge = (fromId, label) => graph.transitions.find((t) => t.from === fromId && t.action.label === label);

test('開始画面が screen-001 で、すべての画面に PNG がある', async () => {
  const s1 = graph.screens[0];
  assert.equal(s1.id, 'screen-001');
  assert.equal(s1.name, 'サポートチャット');
  assert.equal(s1.depth, 0);
  for (const s of graph.screens) {
    const png = await readFile(join(outDir, s.screenshot));
    assert.equal(png.readUInt32BE(16), 1920, s.id); // IHDR width
    assert.equal(png.readUInt32BE(20), s.image.height, s.id);
  }
});

test('期待どおりの画面数（重複状態は統合）', () => {
  assert.equal(graph.screens.length, 12, graph.screens.map((s) => s.name).join('\n'));
});

test('レコメンドボタンで状態が遷移し、矢印の起点にボタン座標がある', () => {
  const t = edge('screen-001', '料金を知りたい');
  assert.ok(t);
  const to = graph.getScreen(t.to);
  assert.match(to.name, /「料金を知りたい」後/);
  assert.ok(t.action.width > 0 && t.action.height > 0);
  assert.ok(t.action.x >= 0 && t.action.x < 1920 && t.action.y >= 0 && t.action.y < to.image.height);
});

test('同じ状態に到達する別の操作は同一画面へ統合される', () => {
  const pricing = graph.getScreen(edge('screen-001', '料金を知りたい').to);
  const free = edge(pricing.id, '無料プランの詳細');
  const paid = edge(pricing.id, '有料プランの詳細');
  assert.equal(free.to, paid.to);
});

test('初期状態へ戻る遷移は開始画面に合流する', () => {
  const pricing = graph.getScreen(edge('screen-001', '料金を知りたい').to);
  const detail = edge(pricing.id, '無料プランの詳細').to;
  assert.equal(edge(detail, '他の質問をする').to, 'screen-001');
});

test('URL 遷移（設定ページ）と、ページからの戻り', () => {
  const settings = graph.getScreen(edge('screen-001', '設定').to);
  assert.match(settings.url, /\/settings\.html$/);
  assert.equal(settings.name, '設定');
  assert.equal(edge(settings.id, 'チャットに戻る').to, 'screen-001');
});

test('外部リンクと新しいタブは外部画面（終端）になる', () => {
  const ext = graph.screens.filter((s) => s.external);
  assert.equal(ext.length, 2);
  for (const s of ext) {
    assert.match(s.name, /^外部: 127\.0\.0\.1/);
    assert.equal(edgesFrom(s.id).length, 0);
  }
  assert.ok(graph.getScreen(edge('screen-001', 'ヘルプ').to).external);
  assert.ok(graph.getScreen(edge('screen-001', '利用規約').to).external);
});

test('危険な操作はスキップされ、記録される', () => {
  const labels = graph.skippedActions.map((x) => x.label);
  assert.ok(labels.includes('履歴を削除'));
  assert.ok(labels.includes('お問い合わせ'));
  assert.ok(labels.includes('保存'));
});

test('状態が変わらない操作は図に描かず記録だけ残す', () => {
  assert.ok(graph.noChangeActions.some((x) => x.screen === 'screen-001' && x.label === '新しいチャット'));
  assert.ok(!graph.transitions.some((t) => t.from === t.to));
});

test('ダイアログは別画面になり、閉じると開始画面へ戻る', () => {
  const d = graph.getScreen(edge('screen-001', 'このアプリについて').to);
  assert.equal(d.name, 'このアプリについて');
  assert.equal(edge(d.id, '閉じる').to, 'screen-001');
  assert.equal(edgesFrom(d.id).length, 1);
});

test('固定テキストシナリオの到達画面とその先も探索される', () => {
  const t = graph.transitions.find((x) => x.kind === 'scenario');
  assert.ok(t);
  assert.equal(t.from, 'screen-001');
  assert.equal(t.action.label, '入力: デモ開始');
  assert.ok(t.action.y > 900, '起点は画面下部の送信ボタン');
  const step2 = edge(t.to, 'デモ: 次のステップへ');
  assert.ok(step2);
  assert.equal(edge(step2.to, 'デモを終了する').to, 'screen-001');
});

test('graph.json として往復できる', () => {
  const g = Graph.fromJSON(JSON.parse(JSON.stringify(graph.toJSON())));
  assert.equal(g.screens.length, graph.screens.length);
});

test('長い回答では追加部分が見える位置へスクロールし、ボタンは画像内にある', () => {
  const howto = graph.getScreen(edge('screen-001', '使い方を知りたい').to);
  const t = edge(howto.id, '詳しい手順を見る');
  assert.ok(t);
  assert.ok(!t.action.offscreen);
  assert.ok(t.action.y + t.action.height <= howto.image.height);
});
