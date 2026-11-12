// graph.json と images/ から draw.io ファイルと summary.md を生成する。
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StgError } from './errors.mjs';
import { Graph } from './graph.mjs';
import { layoutGraph } from './layout.mjs';
import { buildDrawio, collapseCommonActions } from './drawio.mjs';
import { renderSummary } from './output.mjs';

export const DRAWIO_NAME = 'screen-transition.drawio';

/**
 * @param {string} outDir
 * @param {{scale: number, collapseCommonActions?: boolean, archivedTo?: string|null}} opts
 */
export async function generate(outDir, { scale, collapseCommonActions: collapse = true, archivedTo = null }) {
  let graph;
  try {
    graph = Graph.fromJSON(JSON.parse(await readFile(join(outDir, 'graph.json'), 'utf8')));
  } catch (e) {
    throw new StgError('DRAWIO_FAILED', { where: join(outDir, 'graph.json'), message: `graph.json を読み込めません: ${e.message}` });
  }
  if (!graph.screens.length) throw new StgError('DRAWIO_FAILED', { where: 'graph.json', message: '画面が 1 件もありません' });
  const images = {};
  for (const s of graph.screens) {
    try {
      images[s.id] = (await readFile(join(outDir, s.screenshot))).toString('base64');
    } catch (e) {
      throw new StgError('DRAWIO_FAILED', { where: s.id, message: `画像 ${s.screenshot} を読み込めません: ${e.message}` });
    }
  }
  const common = collapse ? collapseCommonActions(graph) : { collapsed: new Set(), representatives: new Map() };
  for (const t of graph.transitions) {
    if (common.collapsed.has(t.id)) t.collapsed = true;
    else delete t.collapsed;
  }
  await writeFile(join(outDir, 'graph.json'), `${JSON.stringify(graph.toJSON(), null, 2)}\n`);
  let xml;
  try {
    xml = buildDrawio(graph, layoutGraph(graph, { scale }), images, common);
  } catch (e) {
    throw new StgError('DRAWIO_FAILED', { where: 'draw.io XML 生成', message: e.message });
  }
  const drawioPath = join(outDir, DRAWIO_NAME);
  await writeFile(drawioPath, xml);
  const summaryPath = join(outDir, 'summary.md');
  await writeFile(summaryPath, renderSummary({ graph, outDir, drawioBytes: Buffer.byteLength(xml), durationSec: graph.meta.durationSec, archivedTo }));
  return { drawioPath, summaryPath, screens: graph.screens.length, transitions: graph.transitions.length, collapsed: common.collapsed.size, skipped: graph.skippedActions.length, warnings: graph.warnings.length };
}
