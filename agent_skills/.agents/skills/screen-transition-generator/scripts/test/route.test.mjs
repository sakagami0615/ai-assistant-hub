// レイアウトと矢印経路の性質テスト（設計 Q35〜Q38）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph } from '../lib/layout.mjs';

const scr = (id, depth, o = {}) => ({ id, name: o.name ?? id, depth, external: !!o.external, image: { width: 1920, height: o.h ?? 1080 } });
const tr = (id, from, to, x = 500, y = 500) => ({ id, from, to, action: { role: 'button', label: `操作${id}`, x, y, width: 100, height: 40 } });

/** 線分 (a→b) が矩形の内部を通るか（境界上は通らない扱い） */
function segHitsRect([a, b], r, eps = 0.5) {
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  return maxX > r.x + eps && minX < r.x + r.w - eps && maxY > r.y + eps && minY < r.y + r.h - eps;
}
const rectsHit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;

function polyline(route) {
  return [route.exit, ...route.points, route.entry];
}

function checkInvariants(graph, l) {
  const rects = Object.entries(l.nodes);
  for (const t of graph.transitions) {
    if (t.from === t.to) continue;
    const route = l.routes.get(t.id);
    assert.ok(route, `${t.id} に経路がある`);
    const pts = polyline(route);
    const segs = pts.slice(1).map((p, i) => [pts[i], p]);
    for (const [a, b] of segs) assert.ok(a.x === b.x || a.y === b.y, `${t.id} は直交経路`);
    // 起点はボタン中心
    const src = l.nodes[t.from];
    const ex = src.x + Math.min(1, (t.action.x + t.action.width / 2) / 1920) * src.w;
    assert.ok(Math.abs(route.exit.x - ex) < 1, `${t.id} 起点 x`);
    // 他画面を通過しない。遷移元は最初の区間のみ、遷移先は最後の区間のみ
    segs.forEach((seg, i) => {
      for (const [id, r] of rects) {
        if (!segHitsRect(seg, r)) continue;
        if (id === t.from && i === 0) continue;
        if (id === t.to && i === segs.length - 1) continue;
        assert.fail(`${t.id} の区間${i} が ${id} を通過 ${JSON.stringify(seg)}`);
      }
    });
    // draw.io のラベル位置（全長に対する割合）から求めた中心が、ラベル矩形の中心と一致する
    const full = [route.port, ...route.points, route.entry];
    const lens = full.slice(1).map((p, i) => Math.abs(p.x - full[i].x) + Math.abs(p.y - full[i].y));
    let d = ((route.labelRel + 1) / 2) * lens.reduce((a, b) => a + b, 0);
    let at = full[0];
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) {
        const f = lens[i] ? d / lens[i] : 0;
        at = { x: full[i].x + (full[i + 1].x - full[i].x) * f, y: full[i].y + (full[i + 1].y - full[i].y) * f };
        break;
      }
      d -= lens[i];
    }
    assert.ok(Math.abs(at.x - (route.label.x + route.label.w / 2)) < 2 && Math.abs(at.y - (route.label.y + route.label.h / 2)) < 2, `${t.id} のラベル位置`);
    // ラベルはどの画面とも重ならない
    for (const [id, r] of rects) assert.ok(!rectsHit(route.label, r), `${t.id} のラベルが ${id} に重なる`);
  }
  // 画面同士は重ならない
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!rectsHit(rects[i][1], rects[j][1]), `${rects[i][0]}-${rects[j][0]}`);
  // 異なる矢印の水平区間・垂直区間が同一直線上で重ならない（起点・終点の区間は除く）
  const lines = [];
  for (const [id, route] of l.routes) {
    const pts = polyline(route);
    for (let i = 1; i < pts.length - 2; i++) lines.push({ id, a: pts[i], b: pts[i + 1] });
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const p = lines[i], q = lines[j];
      if (p.id === q.id) continue;
      const ph = p.a.y === p.b.y, qh = q.a.y === q.b.y;
      if (ph && qh && p.a.y === q.a.y) {
        const o = Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x)) - Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x));
        assert.ok(o <= 0, `${p.id} と ${q.id} の水平区間が重なる`);
      }
      if (!ph && !qh && p.a.x === q.a.x) {
        const o = Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y)) - Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y));
        assert.ok(o <= 0, `${p.id} と ${q.id} の垂直区間が重なる`);
      }
    }
  }
}

// お試しアプリに近いグラフ
function chatLike() {
  const screens = [
    scr('s1', 0), scr('s2', 1), scr('s3', 1), scr('s6', 1), scr('s7', 1), scr('s8', 1, { h: 1400 }), scr('s9', 1),
    scr('s4', 1, { external: true }), scr('s5', 1, { external: true }), scr('s10', 2), scr('s11', 2), scr('s12', 2),
  ];
  const transitions = [
    tr('a', 's1', 's2', 1250, 1030), tr('b', 's1', 's3', 300, 35), tr('c', 's1', 's4', 390, 35), tr('d', 's1', 's5', 490, 35),
    tr('e', 's1', 's6', 630, 35), tr('f', 's1', 's7', 520, 300), tr('g', 's1', 's8', 700, 300), tr('h', 's1', 's9', 880, 300),
    tr('i', 's2', 's10', 520, 500), tr('j', 's3', 's1', 900, 300), tr('k', 's6', 's1', 1000, 600), tr('l', 's7', 's11', 520, 600),
    tr('m', 's7', 's11', 700, 600), tr('n', 's8', 's12', 530, 1300), tr('o', 's9', 's1', 520, 600), tr('p', 's10', 's1', 520, 600),
    tr('q', 's11', 's1', 520, 600), tr('r', 's12', 's3', 300, 400), tr('s', 's12', 's1', 500, 400), tr('t', 's2', 's1', 800, 35),
  ];
  return { screens, transitions };
}

test('1 行は最大 maxColumns 枚で、超える層は下の行へ折り返す（上から下が優先）', () => {
  const g = chatLike();
  const l = layoutGraph(g, { scale: 0.5, maxColumns: 3 });
  const rows = new Map();
  for (const [id, n] of Object.entries(l.nodes)) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)).push(id);
  for (const ids of rows.values()) assert.ok(ids.length <= 3);
  // 深さ 1 の 8 画面は 3 行に分かれ、すべて開始画面より下、深さ 2 はさらに下
  const d1 = g.screens.filter((s) => s.depth === 1).map((s) => l.nodes[s.id]);
  assert.equal(new Set(d1.map((n) => n.y)).size, 3);
  assert.ok(d1.every((n) => n.y > l.nodes.s1.y));
  const maxD1 = Math.max(...d1.map((n) => n.y + n.h));
  for (const id of ['s10', 's11', 's12']) assert.ok(l.nodes[id].y > maxD1);
  // 縦長になる
  const W = Math.max(...Object.values(l.nodes).map((n) => n.x + n.w));
  const H = Math.max(...Object.values(l.nodes).map((n) => n.y + n.h));
  assert.ok(H > W, `縦長: ${W}x${H}`);
});

test('外部画面は層の最後に並ぶ', () => {
  const l = layoutGraph(chatLike(), { scale: 0.5, maxColumns: 3 });
  const order = (id) => l.nodes[id].y * 1e6 + l.nodes[id].x;
  for (const id of ['s2', 's3', 's6', 's7', 's8', 's9']) {
    assert.ok(order(id) < order('s4') && order(id) < order('s5'));
  }
});

test('層の境目の通路は、同じ層の折り返し行の間より広い', () => {
  const l = layoutGraph(chatLike(), { scale: 0.5, maxColumns: 3 });
  const ys = [...new Set(Object.values(l.nodes).map((n) => n.y))].sort((a, b) => a - b);
  const bottomOf = (y) => Math.max(...Object.values(l.nodes).filter((n) => n.y === y).map((n) => n.y + n.h));
  const gaps = ys.slice(1).map((y, i) => y - bottomOf(ys[i]));
  // 行: [s1] [d1 x3] [d1 x3] [d1 x2] [d2 x3] → 層境界は gaps[0] と gaps[3]
  assert.ok(gaps[0] > gaps[1] && gaps[3] > gaps[2], JSON.stringify(gaps));
});

test('文字サイズは画像の表示幅に比例する', () => {
  const l = layoutGraph(chatLike(), { scale: 0.5, maxColumns: 3 });
  assert.equal(l.fonts.screen, 29);
  assert.equal(l.fonts.edge, 21);
  assert.equal(layoutGraph(chatLike(), { scale: 0.25, maxColumns: 3 }).fonts.screen, 14);
});

test('矢印は他の画面を通過せず、ラベルも画面に重ならず、通路では重ならない', () => {
  const g = chatLike();
  checkInvariants(g, layoutGraph(g, { scale: 0.5, maxColumns: 3 }));
});

test('出る辺・入る辺は遷移先の方向で決まる', () => {
  const g = chatLike();
  const l = layoutGraph(g, { scale: 0.5, maxColumns: 3 });
  const down = l.routes.get('f'); // s1 → s7（下の行）
  assert.equal(down.exit.y, l.nodes.s1.y + l.nodes.s1.h);
  assert.equal(down.entry.y, l.nodes.s7.y);
  const up = l.routes.get('p'); // s10 → s1（上の行）
  assert.equal(up.exit.y, l.nodes.s10.y);
  assert.equal(up.entry.y, l.nodes.s1.y + l.nodes.s1.h);
});

test('同じ遷移先に入る矢印は入口の x がずれる', () => {
  const l = layoutGraph(chatLike(), { scale: 0.5, maxColumns: 3 });
  const xs = ['j', 'k', 'o', 'p', 'q', 's', 't'].map((id) => l.routes.get(id).entry.x);
  assert.equal(new Set(xs).size, xs.length);
});

test('visible を指定すると、それ以外の遷移には経路を作らない', () => {
  const g = chatLike();
  const l = layoutGraph(g, { scale: 0.5, maxColumns: 3, visible: new Set(['a', 'b']) });
  assert.deepEqual([...l.routes.keys()].sort(), ['a', 'b']);
});

// 疑似乱数グラフで性質を確認
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}
for (let seed = 1; seed <= 25; seed++) {
  test(`ランダムグラフ #${seed} でも矢印は他画面を通過しない`, () => {
    const r = rng(seed);
    const n = 3 + Math.floor(r() * 14);
    const screens = [scr('n0', 0)];
    for (let i = 1; i < n; i++) screens.push(scr(`n${i}`, 1 + Math.floor(r() * 4), { h: r() < 0.2 ? 1600 : 1080, external: r() < 0.1 }));
    const transitions = [];
    for (let i = 0; i < n * 2; i++) {
      const a = screens[Math.floor(r() * n)];
      const b = screens[Math.floor(r() * n)];
      if (a.id === b.id || a.external) continue;
      transitions.push(tr(`t${i}`, a.id, b.id, Math.floor(r() * 1900), Math.floor(r() * a.image.height)));
    }
    const g = { screens, transitions };
    checkInvariants(g, layoutGraph(g, { scale: 0.5, maxColumns: 1 + Math.floor(r() * 4) }));
  });
}

test('同じ水平レーン上のラベル同士は 30px 以上離れる', () => {
  const l = layoutGraph(chatLike(), { scale: 0.5, maxColumns: 3 });
  const labels = [...l.routes.values()].map((r) => r.label);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      const sameBand = a.y < b.y + b.h && b.y < a.y + a.h;
      if (!sameBand) continue;
      const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
      assert.ok(gap >= 30, `ラベル間隔 ${gap}`);
    }
  }
});

test('ラベル幅は表示用ラベル（省略件数の付記を含む）で計算する', () => {
  const g = chatLike();
  const labels = new Map(g.transitions.map((t) => [t.id, `${t.action.label}（他 6 画面からも）`]));
  const l = layoutGraph(g, { scale: 0.5, maxColumns: 3, labels });
  const r = l.routes.get('a');
  assert.ok(r.label.w >= 21 * 12, `幅 ${r.label.w}`);
  checkInvariants(g, l);
  const boxes = [...l.routes.values()].map((x) => x.label);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.y < b.y + b.h && b.y < a.y + a.h) assert.ok(Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w) >= 30);
  }
});
