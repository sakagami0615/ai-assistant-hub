import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareOutputDir, timestamp, renderSummary } from '../lib/output.mjs';

test('timestamp は YYYYMMDD-HHmmss', () => {
  assert.equal(timestamp(new Date(2026, 10, 13, 9, 5, 7)), '20261113-090507');
});

test('存在しなければ作成して images/ を用意', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stg-'));
  const out = join(root, 'screen-transition-generator');
  const r = await prepareOutputDir(out, new Date(2026, 0, 1));
  assert.equal(r.archivedTo, null);
  assert.ok((await stat(join(out, 'images'))).isDirectory());
});

test('既存成果物を .history/<ts>/ へ退避し、config.json はコピーで残す', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stg-'));
  const out = join(root, 'screen-transition-generator');
  await mkdir(join(out, 'images'), { recursive: true });
  await mkdir(join(out, '.history', 'old'), { recursive: true });
  await writeFile(join(out, 'screen-transition.drawio'), 'x');
  await writeFile(join(out, 'images', 'screen-001.png'), 'p');
  await writeFile(join(out, 'config.json'), '{}');
  const r = await prepareOutputDir(out, new Date(2026, 10, 13, 1, 2, 3));
  const hist = join(out, '.history', '20261113-010203');
  assert.equal(r.archivedTo, hist);
  assert.deepEqual((await readdir(hist)).sort(), ['config.json', 'images', 'screen-transition.drawio']);
  assert.deepEqual((await readdir(out)).sort(), ['.history', 'config.json', 'images']);
  assert.deepEqual(await readdir(join(out, 'images')), []);
  assert.equal(await readFile(join(out, 'config.json'), 'utf8'), '{}');
  assert.deepEqual((await readdir(join(out, '.history'))).sort(), ['20261113-010203', 'old']);
});

test('config.json だけなら退避しない', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stg-'));
  const out = join(root, 'o');
  await mkdir(out);
  await writeFile(join(out, 'config.json'), '{}');
  const r = await prepareOutputDir(out, new Date());
  assert.equal(r.archivedTo, null);
});

test('summary に件数・スキップ・外部・警告・ファイルサイズを含む', () => {
  const md = renderSummary({
    graph: {
      screens: [{ id: 'screen-001', name: 'A', external: false, url: 'u' }, { id: 'screen-002', name: '外部: x', external: true, url: 'v' }],
      transitions: [{ id: 'transition-001', from: 'screen-001', to: 'screen-002', action: { label: 'ヘルプ', offscreen: true } }],
      skippedActions: [{ screen: 'screen-001', label: '履歴を削除', reason: '危険操作（キーワード「削除」）' }],
      noChangeActions: [{ screen: 'screen-001', label: 'x' }],
      warnings: ['JS エラー: boom'],
    },
    outDir: '/abs/out',
    drawioBytes: 2 * 1024 * 1024,
    durationSec: 12.3,
  });
  for (const s of ['画面数', '2', '遷移数', '1', '履歴を削除', '外部', 'ヘルプ', '画像外', 'boom', '2.0 MB', '/abs/out/screen-transition.drawio', '変化なし']) assert.ok(md.includes(s), s);
});
