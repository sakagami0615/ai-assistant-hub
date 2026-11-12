// レイアウトと矢印経路（設計 Q35〜Q38）。
//
// 配置: BFS 深さで層を作り、上から下へ並べる（優先度 1）。層内は重心法で左から右へ並べ（優先度 2）、
//       1 行あたり maxColumns 枚を超える層は次の行へ折り返す。列は全行で揃え、行間・列間を「通路」にする。
// 経路: 矢印は通路だけを通る直交経路。他の画面の上は通らない（自画面の起点区間・遷移先の終点区間のみ重なる）。
//       同じ通路を通る矢印はレーンをずらして重ならないようにする。

export const DEFAULT_MAX_COLUMNS = 3;

const PAD = 40; // 通路の端からレーンまでの余白
const ROW_GAP_MIN = 120; // 同じ層の折り返し行の間（ラベル帯を除く）
const LAYER_GAP_RATIO = 1.5; // 層の境目の通路は折り返し行の間の 1.5 倍
const COL_GAP_MIN = 160;
const LANE_V = 18; // 垂直通路のレーン間隔
const SWEEPS = 4;
const LANE_SEPARATION = 40; // 同じレーンに載せる区間（ラベルを含む）どうしの最小間隔

/** 文字幅の概算（全角 1.0、半角 0.6） */
export function textWidth(s, font) {
  let w = 0;
  for (const ch of String(s)) w += ch.charCodeAt(0) > 0xff ? font : font * 0.6;
  return w;
}

/** 層の割り当てと層内順序（重心法、外部画面は層の最後） */
function orderLayers(graph) {
  const external = new Set(graph.screens.filter((s) => s.external).map((s) => s.id));
  const layers = [];
  for (const s of graph.screens) (layers[s.depth] ??= []).push(s.id);
  const dense = layers.filter(Boolean);
  const preds = new Map();
  const succs = new Map();
  for (const t of graph.transitions) {
    if (t.from === t.to) continue;
    (succs.get(t.from) ?? succs.set(t.from, []).get(t.from)).push(t.to);
    (preds.get(t.to) ?? preds.set(t.to, []).get(t.to)).push(t.from);
  }
  const pos = new Map();
  const reindex = (layer) => layer.forEach((id, i) => pos.set(id, i));
  for (const layer of dense) {
    layer.sort((a, b) => external.has(a) - external.has(b));
    reindex(layer);
  }
  const sortByBarycenter = (layer, neighborsOf, ref) => {
    const bc = new Map();
    for (const id of layer) {
      const ns = (neighborsOf.get(id) ?? []).filter((n) => ref.has(n));
      bc.set(id, ns.length ? ns.reduce((a, n) => a + pos.get(n), 0) / ns.length : pos.get(id));
    }
    layer.sort((a, b) => external.has(a) - external.has(b) || bc.get(a) - bc.get(b) || pos.get(a) - pos.get(b));
    reindex(layer);
  };
  for (let s = 0; s < SWEEPS; s++) {
    for (let i = 1; i < dense.length; i++) sortByBarycenter(dense[i], preds, new Set(dense[i - 1]));
    for (let i = dense.length - 2; i >= 0; i--) sortByBarycenter(dense[i], succs, new Set(dense[i + 1]));
  }
  return dense;
}

/** 区間彩色（貪欲）でレーンを割り当てる。items: {key, lo, hi} → Map(key → lane), lanes */
function assignLanes(items) {
  const sorted = [...items].sort((a, b) => a.lo - b.lo || a.hi - b.hi || String(a.key).localeCompare(String(b.key)));
  const laneEnd = [];
  const lane = new Map();
  for (const it of sorted) {
    let l = laneEnd.findIndex((end) => end < it.lo);
    if (l < 0) l = laneEnd.length;
    laneEnd[l] = it.hi;
    lane.set(it.key, l);
  }
  return { lane, lanes: laneEnd.length };
}

/**
 * @param {{screens: {id: string, name?: string, depth: number, external?: boolean, image: {width: number, height: number}}[],
 *          transitions: {id: string, from: string, to: string, action: {x: number, y: number, width?: number, height?: number, label?: string}}[]}} graph
 * @param {{scale: number, maxColumns?: number, visible?: Set<string>, labels?: Map<string, string>}} opts
 *   visible: 経路を計算する遷移（省略時は全件）、labels: 図に表示するラベル（省略時は action.label）
 */
export function layoutGraph(graph, { scale, maxColumns = DEFAULT_MAX_COLUMNS, visible, labels }) {
  const byId = new Map(graph.screens.map((s) => [s.id, s]));
  const depth = new Map(graph.screens.map((s) => [s.id, s.depth]));
  const size = new Map(graph.screens.map((s) => [s.id, { w: Math.round(s.image.width * scale), h: Math.round(s.image.height * scale) }]));
  const maxW = Math.max(1, ...[...size.values()].map((s) => s.w));
  const fonts = { screen: Math.round(maxW * 0.03), edge: Math.round(maxW * 0.022) };
  const laneH = Math.ceil(fonts.edge * 1.5); // ラベル同士が上下に重ならない間隔

  // ---- グリッド（行・列）----
  const layers = orderLayers(graph);
  const nCols = Math.max(1, Math.min(maxColumns, Math.max(1, ...layers.map((l) => l.length))));
  const rows = []; // {ids, layer, lastOfLayer}
  layers.forEach((layer, li) => {
    for (let i = 0; i < layer.length; i += nCols) rows.push({ ids: layer.slice(i, i + nCols), layer: li, lastOfLayer: i + nCols >= layer.length });
  });
  const cell = new Map();
  rows.forEach((row, r) => {
    const start = Math.floor((nCols - row.ids.length) / 2); // 端数の行は中央寄せ（列は揃える）
    row.ids.forEach((id, i) => cell.set(id, { row: r, col: start + i }));
  });
  const colW = Array(nCols).fill(maxW);
  const rowH = rows.map((row) => Math.max(...row.ids.map((id) => size.get(id).h)));
  const labelBand = rows.map((row) =>
    Math.max(...row.ids.map((id) => {
      const lines = Math.max(1, Math.ceil(textWidth(byId.get(id).name ?? id, fonts.screen) / size.get(id).w));
      return Math.ceil(lines * fonts.screen * 1.3) + 16;
    })),
  );

  // ---- 経路の記号的な決定 ----
  const edges = graph.transitions.filter((t) => t.from !== t.to && (!visible || visible.has(t.id)));
  const routes = edges.map((t) => {
    const s = cell.get(t.from);
    const d = cell.get(t.to);
    const src = byId.get(t.from);
    // drawio.mjs の exitPoint と同じ丸め（小数 4 桁）にして、起点と最初のウェイポイントを厳密に縦に揃える
    const round4 = (v) => Math.round(v * 10000) / 10000;
    const fx = round4(Math.min(1, Math.max(0, (t.action.x + (t.action.width ?? 0) / 2) / src.image.width)));
    const fy = round4(Math.min(1, Math.max(0, (t.action.y + (t.action.height ?? 0) / 2) / src.image.height)));
    let exitSide, entrySide, hA, hB;
    if (d.row > s.row) [exitSide, entrySide, hA, hB] = ['bottom', 'top', s.row, d.row - 1];
    else if (d.row < s.row) [exitSide, entrySide, hA, hB] = ['top', 'bottom', s.row - 1, d.row];
    else [exitSide, entrySide, hA, hB] = ['bottom', 'bottom', s.row, s.row];
    let gap = null;
    if (hA !== hB) {
      if (d.col > s.col) gap = d.col; // 遷移先の左側の列間
      else if (d.col < s.col) gap = d.col + 1; // 遷移先の右側の列間
      else gap = fx < 0.5 ? s.col : s.col + 1;
    }
    return { t, s, d, fx, fy, exitSide, entrySide, hA, hB, gap };
  });

  // ---- 座標計算（通路幅を与えて）----
  const geometry = (hGaps, vGaps) => {
    const colX = [];
    let x = vGaps[0];
    for (let c = 0; c < nCols; c++) {
      colX.push(x);
      x += colW[c] + vGaps[c + 1];
    }
    const rowY = [];
    let y = 0;
    for (let r = 0; r < rows.length; r++) {
      rowY.push(y);
      y += rowH[r] + (hGaps[r] ?? 0);
    }
    const nodes = {};
    for (const [id, c] of cell) {
      const { w, h } = size.get(id);
      nodes[id] = { x: Math.round(colX[c.col] + (colW[c.col] - w) / 2), y: rowY[c.row], w, h, layer: rows[c.row].layer, row: c.row, col: c.col };
    }
    const gapStart = (g) => (g === 0 ? 0 : colX[g - 1] + colW[g - 1]);
    const corridorTop = (r) => rowY[r] + rowH[r] + labelBand[r];
    return { nodes, colX, rowY, gapStart, corridorTop };
  };

  // 入口の x: 同じ遷移先・同じ辺に入る矢印を、到来方向の x 順に辺の 20〜80% へ等間隔に並べる
  const assignEntries = (geo) => {
    const groups = new Map();
    for (const r of routes) {
      const k = `${r.t.to}|${r.entrySide}`;
      (groups.get(k) ?? groups.set(k, []).get(k)).push(r);
    }
    for (const rs of groups.values()) {
      const approach = (r) => {
        const sn = geo.nodes[r.t.from];
        return r.gap === null ? sn.x + r.fx * sn.w : geo.gapStart(r.gap);
      };
      rs.sort((a, b) => approach(a) - approach(b) || a.t.id.localeCompare(b.t.id));
      rs.forEach((r, i) => {
        r.ex = Math.round((0.2 + (0.6 * (i + 1)) / (rs.length + 1)) * 10000) / 10000;
      });
    }
  };

  // 経路の点列（レーン指定つき）
  const buildPoints = (geo, laneOf, vLaneOf) => {
    const out = new Map();
    for (const r of routes) {
      const sn = geo.nodes[r.t.from];
      const dn = geo.nodes[r.t.to];
      const exit = { x: sn.x + r.fx * sn.w, y: r.exitSide === 'bottom' ? sn.y + sn.h : sn.y };
      const entry = { x: dn.x + r.ex * dn.w, y: r.entrySide === 'top' ? dn.y : dn.y + dn.h };
      const laneY = (h, key) => Math.round(geo.corridorTop(h) + PAD + laneOf(h, key) * laneH + laneH / 2);
      const yA = laneY(r.hA, `${r.t.id}:A`);
      const pts = [{ x: exit.x, y: yA }];
      if (r.gap !== null) {
        const gx = Math.round(geo.gapStart(r.gap) + PAD / 2 + vLaneOf(r.gap, r.t.id) * LANE_V + LANE_V / 2);
        const yB = laneY(r.hB, `${r.t.id}:B`);
        pts.push({ x: gx, y: yA }, { x: gx, y: yB }, { x: entry.x, y: yB });
      } else {
        pts.push({ x: entry.x, y: yA });
      }
      // port: draw.io 上の実際の始点（ボタン中心）。exit はその真上/真下の画像の辺
      const port = { x: exit.x, y: sn.y + r.fy * sn.h };
      out.set(r.t.id, { port, exit, entry, points: pts });
    }
    return out;
  };

  // ラベル: 最初の水平区間の起点寄りに置く
  const labelBox = (r, route) => {
    const text = labels?.get(r.t.id) ?? r.t.action.label ?? '';
    const w = Math.ceil(textWidth(text, fonts.edge)) + 12;
    const h = Math.ceil(fonts.edge * 1.3) + 4;
    const [p0, p1] = route.points;
    const dir = p1.x >= p0.x ? 1 : -1;
    const len = Math.abs(p1.x - p0.x);
    const cx = len >= w + 20 ? p0.x + dir * (w / 2 + 10) : (p0.x + p1.x) / 2;
    return { x: Math.round(cx - w / 2), y: Math.round(p0.y - h / 2), w, h };
  };

  // パス 1: 最小の通路幅で仮配置し、レーンを割り当てる
  const minH = rows.map((_, r) => labelBand[r] + ROW_GAP_MIN);
  const minV = Array.from({ length: nCols + 1 }, (_, g) => (g === 0 || g === nCols ? PAD : COL_GAP_MIN));
  let geo = geometry(minH, minV);
  assignEntries(geo);
  const provisional = buildPoints(geo, () => 0, () => 0);

  const hItems = new Map(); // corridor → items
  const vItems = new Map();
  const push = (m, k, it) => (m.get(k) ?? m.set(k, []).get(k)).push(it);
  for (const r of routes) {
    const p = provisional.get(r.t.id);
    const gapSpan = (g) => [geo.gapStart(g), geo.gapStart(g) + minV[g]];
    const [a0, a1] = p.points;
    let lo = Math.min(a0.x, a1.x);
    let hi = Math.max(a0.x, a1.x);
    if (r.gap !== null) [lo, hi] = [Math.min(lo, gapSpan(r.gap)[0]), Math.max(hi, gapSpan(r.gap)[1])];
    const lb = labelBox(r, p);
    push(hItems, r.hA, { key: `${r.t.id}:A`, lo: Math.min(lo, lb.x) - LANE_SEPARATION / 2, hi: Math.max(hi, lb.x + lb.w) + LANE_SEPARATION / 2 });
    if (r.gap !== null) {
      const last = p.points[p.points.length - 1];
      const [g0, g1] = gapSpan(r.gap);
      push(hItems, r.hB, { key: `${r.t.id}:B`, lo: Math.min(last.x, g0) - LANE_SEPARATION / 2, hi: Math.max(last.x, g1) + LANE_SEPARATION / 2 });
      const ys = [geo.corridorTop(r.hA), geo.corridorTop(r.hB)];
      push(vItems, r.gap, { key: r.t.id, lo: Math.min(...ys) - 1, hi: Math.max(...ys) + 1 });
    }
  }
  const hLanes = new Map([...hItems].map(([k, items]) => [k, assignLanes(items)]));
  const vLanes = new Map([...vItems].map(([k, items]) => [k, assignLanes(items)]));
  const laneOf = (h, key) => hLanes.get(h)?.lane.get(key) ?? 0;
  const vLaneOf = (g, key) => vLanes.get(g)?.lane.get(key) ?? 0;

  // パス 2: 必要なレーン数から通路幅を確定（行間は全通路で揃え、層の境目は 1.5 倍）
  const maxHLanes = Math.max(0, ...[...hLanes.values()].map((x) => x.lanes));
  const base = Math.max(ROW_GAP_MIN, 2 * PAD + maxHLanes * laneH);
  const hGaps = rows.map((row, r) => labelBand[r] + (row.lastOfLayer ? Math.round(base * LAYER_GAP_RATIO) : base));
  const maxVLanes = Math.max(0, ...[...vLanes.values()].map((x) => x.lanes));
  const inner = Math.max(COL_GAP_MIN, PAD + maxVLanes * LANE_V + PAD);
  const outer = (g) => (vLanes.get(g)?.lanes ? PAD + vLanes.get(g).lanes * LANE_V + PAD : PAD);
  const vGaps = Array.from({ length: nCols + 1 }, (_, g) => (g === 0 || g === nCols ? outer(g) : inner));
  geo = geometry(hGaps, vGaps);
  const final = buildPoints(geo, laneOf, vLaneOf);

  const result = new Map();
  for (const r of routes) {
    const route = final.get(r.t.id);
    const label = labelBox(r, route);
    // ラベル中心の、折れ線全長に対する位置（draw.io の edge ラベル x は -1〜1）
    const pts = [route.port, ...route.points, route.entry]; // draw.io はボタン中心から長さを測る
    const segLen = pts.slice(1).map((p, i) => Math.abs(p.x - pts[i].x) + Math.abs(p.y - pts[i].y));
    const total = segLen.reduce((a, b) => a + b, 0) || 1;
    const along = segLen[0] + Math.abs(label.x + label.w / 2 - route.points[0].x);
    result.set(r.t.id, { ...route, entryX: r.ex, entryY: r.entrySide === 'top' ? 0 : 1, label, labelRel: Math.round(((2 * along) / total - 1) * 10000) / 10000 });
  }

  const backEdges = new Set(graph.transitions.filter((t) => depth.get(t.to) < depth.get(t.from)).map((t) => t.id));
  return { nodes: geo.nodes, backEdges, routes: result, fonts };
}
