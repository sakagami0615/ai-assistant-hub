import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULTS } from '../lib/config.mjs';
import { StgError } from '../lib/errors.mjs';

test('最小構成に既定値を補う', () => {
  const c = normalizeConfig({ baseUrl: 'http://localhost:8080' });
  assert.equal(c.start.url, 'http://localhost:8080/');
  assert.deepEqual(c.start.steps, []);
  assert.deepEqual(c.viewport, { width: 1920, height: 1080 });
  assert.deepEqual(c.internalOrigins, ['http://localhost:8080']);
  assert.deepEqual(c.actionRoots, [{ selector: 'body', pick: 'all' }]);
  assert.equal(c.limits.maxScreens, 50);
  assert.equal(c.limits.maxTransitions, 200);
  assert.equal(c.limits.maxDepth, 10);
  assert.equal(c.limits.maxDurationSec, 1800);
  assert.equal(c.limits.actionTimeoutMs, 10000);
  assert.equal(c.display.scale, 0.5);
  assert.equal(c.display.collapseCommonActions, true);
  assert.equal(c.quietMs, DEFAULTS.quietMs);
});

test('start.url は相対パスを baseUrl から解決する', () => {
  const c = normalizeConfig({ baseUrl: 'http://localhost:8080/app/', start: { url: 'chat' } });
  assert.equal(c.start.url, 'http://localhost:8080/app/chat');
});

test('start.url の絶対 URL はそのまま', () => {
  const c = normalizeConfig({ baseUrl: 'http://localhost:8080', start: { url: 'http://localhost:3000/x' } });
  assert.equal(c.start.url, 'http://localhost:3000/x');
  assert.deepEqual(c.internalOrigins, ['http://localhost:3000', 'http://localhost:8080']);
});

test('actionRoots の文字列は pick:all に正規化', () => {
  const c = normalizeConfig({ baseUrl: 'http://a', actionRoots: ['header', { selector: '.m', pick: 'last' }] });
  assert.deepEqual(c.actionRoots, [{ selector: 'header', pick: 'all' }, { selector: '.m', pick: 'last' }]);
});

test('internalOrigins は origin に正規化し重複を除く', () => {
  const c = normalizeConfig({ baseUrl: 'http://localhost:8080', internalOrigins: ['http://localhost:8080/', 'http://localhost:9000/api'] });
  assert.deepEqual(c.internalOrigins, ['http://localhost:8080', 'http://localhost:9000']);
});

test('viewport・limits の部分指定はマージされる', () => {
  const c = normalizeConfig({ baseUrl: 'http://a', viewport: { width: 1280 }, limits: { maxScreens: 5 } });
  assert.deepEqual(c.viewport, { width: 1280, height: 1080 });
  assert.equal(c.limits.maxScreens, 5);
  assert.equal(c.limits.maxDepth, 10);
});

const invalid = [
  ['baseUrl なし', {}],
  ['baseUrl が URL でない', { baseUrl: 'localhost' }],
  ['未知のキー', { baseUrl: 'http://a', foo: 1 }],
  ['viewport が負', { baseUrl: 'http://a', viewport: { width: -1 } }],
  ['limits が数値でない', { baseUrl: 'http://a', limits: { maxScreens: 'x' } }],
  ['pick が不正', { baseUrl: 'http://a', actionRoots: [{ selector: 'a', pick: 'first' }] }],
  ['step の形式不正', { baseUrl: 'http://a', start: { steps: [{ tap: {} }] } }],
  ['fill に text なし', { baseUrl: 'http://a', start: { steps: [{ fill: { role: 'textbox', name: 'x' } }] } }],
  ['scenario from が start 以外', { baseUrl: 'http://a', scenarios: [{ name: 's', from: 'x', steps: [] }] }],
  ['scale が範囲外', { baseUrl: 'http://a', display: { scale: 0 } }],
];
for (const [name, raw] of invalid) {
  test(`不正: ${name}`, () => {
    assert.throws(() => normalizeConfig(raw), (e) => e instanceof StgError && e.kind === 'CONFIG_INVALID');
  });
}

test('scenarios は from 既定 start、ステップ正規化', () => {
  const c = normalizeConfig({ baseUrl: 'http://a', scenarios: [{ name: 'demo', steps: [
    { fill: { role: 'textbox', name: 'メッセージ' }, text: 'デモ開始' },
    { click: { role: 'button', name: '送信' } },
  ] }] });
  assert.equal(c.scenarios[0].from, 'start');
  assert.equal(c.scenarios[0].steps.length, 2);
});
