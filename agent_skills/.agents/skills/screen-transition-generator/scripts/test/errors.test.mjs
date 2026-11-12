import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StgError, ERROR_KINDS, formatErrorReport, toErrorJson } from '../lib/errors.mjs';

test('StgError は種別ごとの既定の想定原因と解決策を持つ', () => {
  const e = new StgError('STATE_RESTORE', { where: 'screen-005 の再現処理', message: 'ボタンを検出できませんでした' });
  assert.equal(e.kind, 'STATE_RESTORE');
  assert.equal(e.title, ERROR_KINDS.STATE_RESTORE.title);
  assert.ok(e.causes.length > 0);
  assert.ok(e.fixes.length > 0);
});

test('個別の原因と解決策で既定値を上書きできる', () => {
  const e = new StgError('CONFIG_INVALID', { where: 'config', message: 'x', causes: ['A'], fixes: ['B'] });
  assert.deepEqual(e.causes, ['A']);
  assert.deepEqual(e.fixes, ['B']);
});

test('未知の種別は例外', () => {
  assert.throws(() => new StgError('NOPE', { where: '', message: '' }));
});

test('formatErrorReport は要件 14.3 の形式で出力する', () => {
  const e = new StgError('LIMIT_REACHED', { where: '探索', message: '最大画面数 50 に到達しました' });
  const md = formatErrorReport(e);
  for (const h of ['エラー種別', '発生箇所', 'エラー内容', '想定原因', '推奨する解決方法', '処理結果']) {
    assert.match(md, new RegExp(h));
  }
  assert.match(md, /探索を停止しました/);
  assert.match(md, /1\. /);
});

test('toErrorJson は機械可読な形にする', () => {
  const e = new StgError('CONNECTION', { where: 'http://localhost:1', message: 'x' });
  const j = toErrorJson(e);
  assert.equal(j.status, 'error');
  assert.equal(j.kind, 'CONNECTION');
  assert.equal(j.where, 'http://localhost:1');
});

test('全種別に title・causes・fixes が定義されている', () => {
  for (const [k, v] of Object.entries(ERROR_KINDS)) {
    assert.ok(v.title, k);
    assert.ok(v.causes.length, k);
    assert.ok(v.fixes.length, k);
  }
});
