import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph, truncate } from '../lib/graph.mjs';

const base = { url: 'http://localhost:8080/', title: 'デモ', heading: 'チャット', external: false, image: { width: 1920, height: 1080, fullPage: false } };

test('ID は発見順に screen-001 から採番', () => {
  const g = new Graph();
  const a = g.addScreen({ ...base, key: 'k1', depth: 0, path: [] });
  const b = g.addScreen({ ...base, key: 'k2', depth: 1, path: [{ click: { role: 'button', name: 'A' } }], viaLabel: 'A' });
  assert.equal(a.id, 'screen-001');
  assert.equal(b.id, 'screen-002');
  assert.equal(a.screenshot, 'images/screen-001.png');
  assert.equal(g.findByKey('k2'), b);
  assert.equal(g.findByKey('nope'), undefined);
});

test('名前: 最初は見出し、同名がある場合は直前ボタン名を付与', () => {
  const g = new Graph();
  assert.equal(g.addScreen({ ...base, key: 'k1', depth: 0, path: [] }).name, 'チャット');
  assert.equal(g.addScreen({ ...base, key: 'k2', depth: 1, path: [], viaLabel: '料金を知りたい' }).name, 'チャット ─「料金を知りたい」後');
  assert.equal(g.addScreen({ ...base, heading: '設定', key: 'k3', depth: 1, path: [], viaLabel: '設定' }).name, '設定');
});

test('直前ボタン名を付けても衝突する場合は画面 ID を付けて一意にする', () => {
  const g = new Graph();
  g.addScreen({ ...base, key: 'k1', depth: 0, path: [] });
  g.addScreen({ ...base, key: 'k2', depth: 1, path: [], viaLabel: 'A' });
  assert.equal(g.addScreen({ ...base, key: 'k3', depth: 2, path: [], viaLabel: 'A' }).name, 'チャット ─「A」後 (screen-003)');
  assert.equal(g.addScreen({ ...base, key: 'k4', depth: 2, path: [] }).name, 'チャット (screen-004)');
});

test('見出しが無ければ title、どちらも無ければ「画面」', () => {
  const g = new Graph();
  assert.equal(g.addScreen({ ...base, heading: '', key: 'a', depth: 0, path: [] }).name, 'デモ');
  assert.equal(g.addScreen({ ...base, heading: '', title: '', key: 'b', depth: 0, path: [] }).name, '画面');
});

test('外部画面の名前', () => {
  const g = new Graph();
  const s = g.addScreen({ ...base, url: 'http://localhost:8081/help.html', title: 'ヘルプセンター', external: true, key: 'x', depth: 1, path: [] });
  assert.equal(s.name, '外部: localhost ─ ヘルプセンター');
});

test('名前は 40 文字で省略', () => {
  assert.equal(truncate('あ'.repeat(50), 40), 'あ'.repeat(39) + '…');
  assert.equal(truncate('abc', 40), 'abc');
});

test('遷移・スキップ・変化なし・警告を記録し JSON 往復できる', () => {
  const g = new Graph();
  const a = g.addScreen({ ...base, key: 'k1', depth: 0, path: [] });
  const b = g.addScreen({ ...base, key: 'k2', depth: 1, path: [], viaLabel: 'x' });
  const t = g.addTransition({ from: a.id, to: b.id, kind: 'action', action: { role: 'button', label: 'x', x: 1, y: 2, width: 3, height: 4 } });
  assert.equal(t.id, 'transition-001');
  g.addSkipped({ screen: a.id, role: 'button', label: '削除', reason: '危険操作' });
  g.addNoChange({ screen: a.id, role: 'button', label: 'noop' });
  g.addWarning('w');
  const j = JSON.parse(JSON.stringify(g.toJSON()));
  const g2 = Graph.fromJSON(j);
  assert.equal(g2.screens.length, 2);
  assert.equal(g2.transitions[0].action.label, 'x');
  assert.equal(g2.skippedActions.length, 1);
  assert.equal(g2.noChangeActions.length, 1);
  assert.deepEqual(g2.warnings, ['w']);
  assert.equal(g2.getScreen('screen-002').name, b.name);
});

test('遷移先・遷移元の存在を検証', () => {
  const g = new Graph();
  assert.throws(() => g.addTransition({ from: 'screen-001', to: 'screen-002', kind: 'action', action: {} }));
});
