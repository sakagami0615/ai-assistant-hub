// 階層レイアウト（簡易 Sugiyama）。BFS 深さで層を作り（上→下）、重心法で層内順序（左→右）を決める。

export const LAYER_GAP = 200; // 層間の余白（矢印ラベルと画面名ラベルが入る）
export const NODE_GAP = 160; // 同層ノード間の余白
const SWEEPS = 4;

/**
 * @param {{screens: {id: string, depth: number, external?: boolean, image: {width: number, height: number}}[], transitions: {id: string, from: string, to: string}[]}} graph
 * @param {{scale: number}} opts
 * @returns {{nodes: Record<string, {x: number, y: number, w: number, h: number, layer: number}>, backEdges: Set<string>}}
 */
export function layoutGraph(graph, { scale }) {
  const depth = new Map(graph.screens.map((s) => [s.id, s.depth]));
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

  const sortByBarycenter = (layer, neighborsOf, refLayerSet) => {
    const bc = new Map();
    for (const id of layer) {
      const ns = (neighborsOf.get(id) ?? []).filter((n) => refLayerSet.has(n));
      bc.set(id, ns.length ? ns.reduce((a, n) => a + pos.get(n), 0) / ns.length : pos.get(id));
    }
    layer.sort((a, b) => external.has(a) - external.has(b) || bc.get(a) - bc.get(b) || pos.get(a) - pos.get(b));
    reindex(layer);
  };

  for (let s = 0; s < SWEEPS; s++) {
    for (let i = 1; i < dense.length; i++) sortByBarycenter(dense[i], preds, new Set(dense[i - 1]));
    for (let i = dense.length - 2; i >= 0; i--) sortByBarycenter(dense[i], succs, new Set(dense[i + 1]));
  }

  const size = new Map(graph.screens.map((s) => [s.id, { w: Math.round(s.image.width * scale), h: Math.round(s.image.height * scale) }]));
  const layerWidth = (layer) => layer.reduce((a, id) => a + size.get(id).w, 0) + NODE_GAP * (layer.length - 1);
  const maxWidth = Math.max(0, ...dense.map(layerWidth));

  const nodes = {};
  let y = 0;
  dense.forEach((layer, li) => {
    let x = Math.round((maxWidth - layerWidth(layer)) / 2);
    let h = 0;
    for (const id of layer) {
      const { w, h: nh } = size.get(id);
      nodes[id] = { x, y, w, h: nh, layer: li };
      x += w + NODE_GAP;
      h = Math.max(h, nh);
    }
    y += h + LAYER_GAP;
  });

  const backEdges = new Set(graph.transitions.filter((t) => depth.get(t.to) < depth.get(t.from)).map((t) => t.id));
  return { nodes, backEdges };
}
