import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrawio, exitPoint, escapeXml, collapseCommonActions } from '../lib/drawio.mjs';

const graph = {
  screens: [
    { id: 'screen-001', name: 'チャット <初期>', external: false, image: { width: 1920, height: 1080 } },
    { id: 'screen-002', name: '外部: example ─ "x"', external: true, image: { width: 1920, height: 1080 } },
  ],
  transitions: [
    { id: 'transition-001', from: 'screen-001', to: 'screen-002', action: { label: 'ヘルプ & 案内', x: 950, y: 520, width: 20, height: 40 } },
    { id: 'transition-002', from: 'screen-002', to: 'screen-001', action: { label: '戻る', x: 0, y: 0, width: 10, height: 10 } },
  ],
};
const layout = {
  nodes: { 'screen-001': { x: 0, y: 0, w: 960, h: 540 }, 'screen-002': { x: 0, y: 800, w: 960, h: 540 } },
  backEdges: new Set(['transition-002']),
};
const images = { 'screen-001': 'QUJD', 'screen-002': 'REVG' };

test('escapeXml', () => {
  assert.equal(escapeXml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
});

test('exitPoint はボタン中心の相対座標（0..1 にクランプ）', () => {
  assert.deepEqual(exitPoint({ x: 950, y: 520, width: 20, height: 40 }, { width: 1920, height: 1080 }), { x: 0.5, y: 0.5 });
  assert.deepEqual(exitPoint({ x: 5000, y: -50, width: 0, height: 0 }, { width: 1920, height: 1080 }), { x: 1, y: 0 });
});

test('mxfile 構造・画像埋め込み・ボタン位置からの矢印', () => {
  const xml = buildDrawio(graph, layout, images);
  assert.match(xml, /^<mxfile [^>]*>\s*<diagram [^>]*>\s*<mxGraphModel[^>]*>\s*<root>/);
  assert.match(xml, /<mxCell id="0"\/>/);
  assert.match(xml, /<mxCell id="1" parent="0"\/>/);
  assert.match(xml, /image=data:image\/png,QUJD;/);
  assert.doesNotMatch(xml, /data:image\/png;base64/);
  assert.match(xml, /value="チャット &lt;初期&gt;"/);
  assert.match(xml, /value="ヘルプ &amp; 案内"/);
  assert.match(xml, /exitX=0\.5;exitY=0\.5;exitDx=0;exitDy=0;exitPerimeter=0;/);
  assert.match(xml, /startArrow=oval;startFill=1;/);
  assert.match(xml, /<mxCell id="transition-001"[^>]*edge="1"[^>]*source="screen-001"[^>]*target="screen-002"/);
  assert.match(xml, /<mxGeometry x="0" y="800" width="960" height="540" as="geometry"\/>/);
});

test('後方エッジは破線、外部ノードは点線枠', () => {
  const xml = buildDrawio(graph, layout, images);
  const back = xml.match(/<mxCell id="transition-002"[^>]*>/)[0];
  assert.match(back, /dashed=1/);
  const fwd = xml.match(/<mxCell id="transition-001"[^>]*>/)[0];
  assert.doesNotMatch(fwd, /dashed=1/);
  const ext = xml.match(/<mxCell id="screen-002"[^>]*>/)[0];
  assert.match(ext, /dashed=1/);
});

test('cell id は一意で、edge の source/target は存在する', () => {
  const xml = buildDrawio(graph, layout, images);
  const ids = [...xml.matchAll(/<mxCell id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of xml.matchAll(/source="([^"]+)" target="([^"]+)"/g)) {
    assert.ok(ids.includes(m[1]) && ids.includes(m[2]));
  }
});

test('画像データが無い画面はエラー', () => {
  assert.throws(() => buildDrawio(graph, layout, { 'screen-001': 'QUJD' }), /screen-002/);
});

test('collapseCommonActions: 同じ (role, label, 遷移先) が複数画面から出ていれば最も浅い 1 本を代表にする', () => {
  const screens = ['s1', 's2', 's3', 's4'].map((id, i) => ({ id, depth: i === 0 ? 0 : 1 }));
  const transitions = [
    { id: 't1', from: 's3', to: 's4', action: { role: 'link', label: '設定' } },
    { id: 't2', from: 's1', to: 's4', action: { role: 'link', label: '設定' } },
    { id: 't3', from: 's2', to: 's4', action: { role: 'link', label: '設定' } },
    { id: 't4', from: 's1', to: 's2', action: { role: 'button', label: 'A' } },
    { id: 't5', from: 's2', to: 's4', action: { role: 'button', label: '設定' } },
  ];
  const r = collapseCommonActions({ screens, transitions });
  assert.deepEqual([...r.collapsed].sort(), ['t1', 't3']);
  assert.deepEqual(Object.fromEntries(r.representatives), { t2: 2 });
});

test('省略された矢印は非表示レイヤーに置き、代表矢印のラベルに件数を付ける', () => {
  const g = {
    screens: [...graph.screens, { id: 'screen-003', name: 'C', external: false, image: { width: 1920, height: 1080 } }],
    transitions: [
      ...graph.transitions,
      { id: 'transition-003', from: 'screen-003', to: 'screen-002', action: { label: 'ヘルプ & 案内', x: 1, y: 1, width: 1, height: 1 } },
    ],
  };
  const l = { nodes: { ...layout.nodes, 'screen-003': { x: 1000, y: 0, w: 960, h: 540 } }, backEdges: new Set() };
  const xml = buildDrawio(g, l, { ...images, 'screen-003': 'R0hJ' }, { collapsed: new Set(['transition-003']), representatives: new Map([['transition-001', 1]]) });
  assert.match(xml, /<mxCell id="layer-common" value="共通ナビゲーション（全件）" parent="0" visible="0"\/>/);
  assert.match(xml, /<mxCell id="transition-003"[^>]*parent="layer-common"/);
  assert.match(xml, /<mxCell id="transition-001" value="ヘルプ &amp; 案内（他 1 画面からも）"[^>]*parent="1"/);
});

test('省略が無ければレイヤーを作らない', () => {
  assert.doesNotMatch(buildDrawio(graph, layout, images), /layer-common/);
});
