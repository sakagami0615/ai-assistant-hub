import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnapshot, stateKey, normalizeText } from '../lib/state-key.mjs';

const snap = (o = {}) => ({
  url: 'http://localhost:8080/?a=1&b=2#top',
  actions: [{ role: 'button', name: 'B' }, { role: 'button', name: 'A' }],
  headings: ['チャット'],
  dialog: false,
  ...o,
});

test('normalizeText は空白を正規化', () => {
  assert.equal(normalizeText('  a \n\t b  '), 'a b');
});

test('ラベルは集合化（順序・重複を無視）', () => {
  const a = stateKey(snap());
  const b = stateKey(snap({ actions: [{ role: 'button', name: 'A' }, { role: 'button', name: 'B' }, { role: 'button', name: 'A' }] }));
  assert.equal(a, b);
});

test('ラベル空白差は同一', () => {
  assert.equal(stateKey(snap()), stateKey(snap({ actions: [{ role: 'button', name: ' B ' }, { role: 'button', name: 'A\n' }] })));
});

test('role が違えば別状態', () => {
  assert.notEqual(stateKey(snap()), stateKey(snap({ actions: [{ role: 'link', name: 'B' }, { role: 'button', name: 'A' }] })));
});

test('見出し・dialog・URL の違いは別状態', () => {
  const base = stateKey(snap());
  assert.notEqual(base, stateKey(snap({ headings: ['設定'] })));
  assert.notEqual(base, stateKey(snap({ dialog: true })));
  assert.notEqual(base, stateKey(snap({ url: 'http://localhost:8080/settings' })));
});

test('ignoreQueryParams で query を除外、query の順序は無視', () => {
  const cfg = { ignoreQueryParams: ['a'] };
  assert.equal(stateKey(snap(), cfg), stateKey(snap({ url: 'http://localhost:8080/?b=2&a=9#top' }), cfg));
  assert.equal(stateKey(snap()), stateKey(snap({ url: 'http://localhost:8080/?b=2&a=1#top' })));
});

test('キーは 40 桁の hex で決定的', () => {
  const k = stateKey(snap());
  assert.match(k, /^[0-9a-f]{40}$/);
  assert.equal(k, stateKey(snap()));
});

test('normalizeSnapshot は比較用の素材を返す', () => {
  const n = normalizeSnapshot(snap());
  assert.deepEqual(n.actions, ['button:A', 'button:B']);
  assert.equal(n.url, 'http://localhost:8080/?a=1&b=2#top');
});
