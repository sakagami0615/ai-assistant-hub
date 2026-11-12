import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from '../lib/layout.mjs';

const scr = (id, depth, w = 1920, h = 1080) => ({ id, depth, image: { width: w, height: h } });
const tr = (id, from, to) => ({ id, from, to });

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

test('深さごとに上から下へ層を作り、表示倍率を適用', () => {
  const g = { screens: [scr('s1', 0), scr('s2', 1), scr('s3', 1), scr('s4', 2)], transitions: [tr('t1', 's1', 's2'), tr('t2', 's1', 's3'), tr('t3', 's2', 's4')] };
  const l = layoutGraph(g, { scale: 0.5 });
  assert.equal(l.nodes.s1.w, 960);
  assert.equal(l.nodes.s1.h, 540);
  assert.ok(l.nodes.s1.y < l.nodes.s2.y);
  assert.equal(l.nodes.s2.y, l.nodes.s3.y);
  assert.ok(l.nodes.s2.y < l.nodes.s4.y);
  assert.ok(l.nodes.s2.x < l.nodes.s3.x);
});

test('ノード同士が重ならず、層間に 160px 以上の余白', () => {
  const screens = [scr('a', 0), ...Array.from({ length: 5 }, (_, i) => scr(`b${i}`, 1)), scr('c', 2, 1920, 3000)];
  const transitions = screens.slice(1).map((s, i) => tr(`t${i}`, 'a', s.id));
  const l = layoutGraph({ screens, transitions }, { scale: 0.5 });
  const ns = Object.values(l.nodes);
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) assert.ok(!overlaps(ns[i], ns[j]), `${i}-${j}`);
  assert.ok(l.nodes.b0.y - (l.nodes.a.y + l.nodes.a.h) >= 160);
});

test('重心法で交差を減らす（子は親の並びに揃う）', () => {
  // s1→x2, s2→x1 のとき、層2は x2, x1 の順になるべき
  const g = {
    screens: [scr('r', 0), scr('s1', 1), scr('s2', 1), scr('x1', 2), scr('x2', 2)],
    transitions: [tr('a', 'r', 's1'), tr('b', 'r', 's2'), tr('c', 's1', 'x2'), tr('d', 's2', 'x1')],
  };
  const l = layoutGraph(g, { scale: 0.5 });
  assert.ok(l.nodes.x2.x < l.nodes.x1.x);
});

test('浅い層へ戻る遷移は backEdges', () => {
  const g = { screens: [scr('a', 0), scr('b', 1)], transitions: [tr('f', 'a', 'b'), tr('r', 'b', 'a')] };
  const l = layoutGraph(g, { scale: 0.5 });
  assert.deepEqual([...l.backEdges], ['r']);
});

test('決定的（同じ入力なら同じ出力）', () => {
  const g = { screens: [scr('a', 0), scr('b', 1), scr('c', 1)], transitions: [tr('1', 'a', 'b'), tr('2', 'a', 'c')] };
  assert.deepEqual(layoutGraph(g, { scale: 0.5 }), layoutGraph(g, { scale: 0.5 }));
});

test('外部画面は層の右端に寄せる', () => {
  const ext = (id) => ({ ...scr(id, 1), external: true });
  const g = { screens: [scr('r', 0), ext('e'), scr('a', 1), scr('b', 1)], transitions: [tr('1', 'r', 'e'), tr('2', 'r', 'a'), tr('3', 'r', 'b')] };
  const l = layoutGraph(g, { scale: 0.5 });
  assert.ok(l.nodes.e.x > l.nodes.a.x && l.nodes.e.x > l.nodes.b.x);
});
