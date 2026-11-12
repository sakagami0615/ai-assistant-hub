// draw.io（mxGraph XML）生成。矢印はボタン位置（画像に対する相対座標 exitX/exitY）から出す。
// 相対座標なので、draw.io 上で画像を移動・拡大縮小しても接続位置が維持される。

export function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const round4 = (v) => Math.round(v * 10000) / 10000;

/** ボタン中心の、画像に対する相対座標（0..1） */
export function exitPoint(action, image) {
  const cx = action.x + (action.width ?? 0) / 2;
  const cy = action.y + (action.height ?? 0) / 2;
  return { x: round4(clamp01(cx / image.width)), y: round4(clamp01(cy / image.height)) };
}

const SCREEN_STYLE = 'shape=image;imageAspect=0;aspect=fixed;verticalLabelPosition=bottom;verticalAlign=top;labelBackgroundColor=#ffffff;fontSize=16;fontStyle=1;imageBorder=#666666;strokeWidth=2;';
const EXTERNAL_STYLE = 'imageBorder=#999999;dashed=1;fontColor=#666666;';
const EDGE_STYLE = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;html=1;strokeWidth=2;strokeColor=#d6336c;fontSize=14;labelBackgroundColor=#ffffff;startArrow=oval;startFill=1;startSize=10;endArrow=block;endFill=1;';

/**
 * 共通ナビゲーションの集約（設計 Q31）。同じ (role, label, 遷移先) の矢印が複数の画面から出ている場合、
 * 遷移元の深さが最小（同じなら画面 ID が小さい）の 1 本を代表にし、残りを省略対象にする。
 * @returns {{collapsed: Set<string>, representatives: Map<string, number>}} representatives: 代表の遷移ID → 省略した本数
 */
export function collapseCommonActions(graph) {
  const depth = new Map(graph.screens.map((s) => [s.id, s.depth ?? 0]));
  const groups = new Map();
  for (const t of graph.transitions) {
    const k = JSON.stringify([t.action.role ?? '', t.action.label ?? '', t.to]);
    (groups.get(k) ?? groups.set(k, []).get(k)).push(t);
  }
  const collapsed = new Set();
  const representatives = new Map();
  for (const ts of groups.values()) {
    if (new Set(ts.map((t) => t.from)).size < 2) continue;
    const [rep, ...rest] = [...ts].sort((a, b) => depth.get(a.from) - depth.get(b.from) || a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
    representatives.set(rep.id, rest.length);
    for (const t of rest) collapsed.add(t.id);
  }
  return { collapsed, representatives };
}

const COMMON_LAYER = 'layer-common';

/**
 * @param {{screens: any[], transitions: any[]}} graph
 * @param {{nodes: Record<string, {x:number,y:number,w:number,h:number}>, backEdges: Set<string>}} layout
 * @param {Record<string, string>} images 画面ID → PNG の base64
 * @param {{collapsed?: Set<string>, representatives?: Map<string, number>}} [common] collapseCommonActions の結果
 */
export function buildDrawio(graph, layout, images, common = {}) {
  const collapsed = common.collapsed ?? new Set();
  const representatives = common.representatives ?? new Map();
  const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
  for (const s of graph.screens) {
    const b64 = images[s.id];
    if (!b64) throw new Error(`画像データがありません: ${s.id}`);
    const n = layout.nodes[s.id];
    const style = `${SCREEN_STYLE}${s.external ? EXTERNAL_STYLE : ''}image=data:image/png,${b64};`;
    cells.push(
      `<mxCell id="${escapeXml(s.id)}" value="${escapeXml(s.name)}" style="${style}" vertex="1" parent="1">` +
        `<mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`,
    );
  }
  const byId = new Map(graph.screens.map((s) => [s.id, s]));
  const hidden = [];
  for (const t of graph.transitions) {
    const src = byId.get(t.from);
    if (!src || !byId.get(t.to)) throw new Error(`遷移の画面が存在しません: ${t.id}`);
    const p = exitPoint(t.action, src.image);
    const style = `${EDGE_STYLE}exitX=${p.x};exitY=${p.y};exitDx=0;exitDy=0;exitPerimeter=0;${layout.backEdges.has(t.id) ? 'dashed=1;' : ''}`;
    const others = representatives.get(t.id);
    const label = `${t.action.label ?? ''}${others ? `（他 ${others} 画面からも）` : ''}`;
    const parent = collapsed.has(t.id) ? COMMON_LAYER : '1';
    (collapsed.has(t.id) ? hidden : cells).push(
      `<mxCell id="${escapeXml(t.id)}" value="${escapeXml(label)}" style="${style}" edge="1" parent="${parent}" source="${escapeXml(t.from)}" target="${escapeXml(t.to)}">` +
        '<mxGeometry relative="1" as="geometry"/></mxCell>',
    );
  }
  // レイヤーは参照する edge より前に置く（既定レイヤー "1" の直後）
  if (hidden.length) cells.splice(2, 0, `<mxCell id="${COMMON_LAYER}" value="共通ナビゲーション（全件）" parent="0" visible="0"/>`), cells.push(...hidden);
  return [
    '<mxfile host="screen-transition-generator" type="device">',
    '  <diagram id="screen-transition" name="画面遷移図">',
    '    <mxGraphModel dx="1600" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" math="0" shadow="0">',
    '      <root>',
    ...cells.map((c) => `        ${c}`),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
    '',
  ].join('\n');
}
