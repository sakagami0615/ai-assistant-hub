import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeAction } from '../lib/safety.mjs';

const cand = (o) => ({ role: 'button', name: '', attrs: {}, ...o });

test('通常のボタンは安全', () => {
  assert.equal(judgeAction(cand({ name: '料金を知りたい' })).safe, true);
});

for (const name of ['履歴を削除', 'Delete', '保存する', 'Save', '更新', '購入する', 'Buy now', '送信', 'Submit', '登録', 'ログアウト', 'Sign out', '支払う', 'Remove item']) {
  test(`危険キーワード: ${name}`, () => {
    const r = judgeAction(cand({ name }));
    assert.equal(r.safe, false);
    assert.match(r.reason, /危険/);
  });
}

test('aria-label / title / data 属性も照合する', () => {
  assert.equal(judgeAction(cand({ name: '×', attrs: { 'aria-label': 'delete message' } })).safe, false);
  assert.equal(judgeAction(cand({ name: '🗑', attrs: { title: '削除' } })).safe, false);
  assert.equal(judgeAction(cand({ name: 'x', attrs: { 'data-action': 'remove' } })).safe, false);
});

test('mailto / tel / download リンクはスキップ', () => {
  assert.equal(judgeAction(cand({ role: 'link', name: 'お問い合わせ', href: 'mailto:a@b' })).safe, false);
  assert.equal(judgeAction(cand({ role: 'link', name: '電話', href: 'tel:000' })).safe, false);
  assert.equal(judgeAction(cand({ role: 'link', name: '資料', href: '/a.pdf', attrs: { download: '' } })).safe, false);
});

test('POST フォームの submit はスキップ', () => {
  assert.equal(judgeAction(cand({ name: '次へ', type: 'submit', formMethod: 'post' })).safe, false);
  assert.equal(judgeAction(cand({ name: '検索', type: 'submit', formMethod: 'get' })).safe, true);
});

test('deny パターンを追加できる', () => {
  assert.equal(judgeAction(cand({ name: 'リセット' }), { deny: ['リセット'] }).safe, false);
});

test('allow パターンは辞書判定より優先', () => {
  assert.equal(judgeAction(cand({ name: '保存した会話を見る' }), { allow: ['保存した会話を見る'] }).safe, true);
});

test('英単語は単語境界で判定し過検出しない', () => {
  assert.equal(judgeAction(cand({ name: 'Updates log' })).safe, true);
  assert.equal(judgeAction(cand({ name: 'Paypal guide' })).safe, true);
});

test('javascript: リンクも href がなければ通常判定', () => {
  assert.equal(judgeAction(cand({ role: 'link', name: '設定', href: 'http://localhost/settings' })).safe, true);
});
