// 出力ディレクトリの準備（既存成果物の退避）と summary の生成。
import { mkdir, readdir, rename, copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const HISTORY = '.history';
const CONFIG = 'config.json';

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 既存成果物があれば .history/<ts>/ へ移動する（自動削除はしない）。config.json はコピーして残す。
 * @returns {Promise<{archivedTo: string|null}>}
 */
export async function prepareOutputDir(outDir, now = new Date()) {
  await mkdir(outDir, { recursive: true });
  const entries = (await readdir(outDir)).filter((e) => e !== HISTORY);
  const artifacts = entries.filter((e) => e !== CONFIG);
  const hasArtifacts = (
    await Promise.all(artifacts.map(async (e) => (e === 'images' ? (await readdir(join(outDir, e))).length > 0 : true)))
  ).some(Boolean);

  let archivedTo = null;
  if (hasArtifacts) {
    let dest = join(outDir, HISTORY, timestamp(now));
    for (let i = 2; await exists(dest); i++) dest = join(outDir, HISTORY, `${timestamp(now)}-${i}`);
    await mkdir(dest, { recursive: true });
    for (const e of artifacts) await rename(join(outDir, e), join(dest, e));
    if (entries.includes(CONFIG)) await copyFile(join(outDir, CONFIG), join(dest, CONFIG));
    archivedTo = dest;
  }
  await mkdir(join(outDir, 'images'), { recursive: true });
  return { archivedTo };
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/**
 * @param {{graph: any, outDir: string, drawioBytes: number, durationSec?: number, archivedTo?: string|null}} p
 */
export function renderSummary({ graph, outDir, drawioBytes, durationSec, archivedTo }) {
  const name = new Map(graph.screens.map((s) => [s.id, s.name]));
  const external = graph.screens.filter((s) => s.external);
  const offscreen = graph.transitions.filter((t) => t.action?.offscreen);
  const lines = [
    '# 画面遷移図 生成結果',
    '',
    '## 成果物',
    '',
    `- draw.io: \`${join(outDir, 'screen-transition.drawio')}\`（${formatBytes(drawioBytes)}）`,
    `- スクリーンショット: \`${join(outDir, 'images')}/\``,
    `- 中間データ: \`${join(outDir, 'graph.json')}\``,
    `- 実行ログ: \`${join(outDir, 'execution.log')}\``,
    ...(archivedTo ? [`- 前回の成果物の退避先: \`${archivedTo}\``] : []),
    '',
    '## 概要',
    '',
    '| 項目 | 値 |',
    '|---|---|',
    `| 画面数 | ${graph.screens.length} |`,
    `| 遷移数 | ${graph.transitions.length} |`,
    `| 外部画面数 | ${external.length} |`,
    `| スキップした操作数 | ${graph.skippedActions.length} |`,
    `| 変化なしの操作数 | ${graph.noChangeActions.length} |`,
    `| 共通ナビゲーションとして省略した矢印数 | ${graph.transitions.filter((t) => t.collapsed).length} |`,
    ...(durationSec !== undefined ? [`| 所要時間 | ${durationSec.toFixed(1)} 秒 |`] : []),
    '',
    '## 画面一覧',
    '',
    '| ID | 画面名 | URL |',
    '|---|---|---|',
    ...graph.screens.map((s) => `| ${s.id} | ${s.name} | ${s.url} |`),
    '',
    '## 遷移一覧',
    '',
    '共通ナビゲーションとして省略した矢印は、draw.io のレイヤー「共通ナビゲーション（全件）」を表示すると確認できます。',
    '',
    '| ID | 遷移元 | 操作 | 遷移先 | 図 |',
    '|---|---|---|---|---|',
    ...graph.transitions.map((t) => `| ${t.id} | ${name.get(t.from)} | ${t.action?.label ?? ''} | ${name.get(t.to)} | ${t.collapsed ? '省略（非表示レイヤー）' : '表示'} |`),
    '',
  ];
  if (external.length) {
    lines.push('## 外部画面（探索の終端）', '', ...external.map((s) => `- ${s.name}（${s.url}）`), '');
  }
  if (graph.skippedActions.length) {
    lines.push('## スキップした操作（安全上の理由で未実行）', '', ...graph.skippedActions.map((x) => `- ${name.get(x.screen) ?? x.screen}: 「${x.label}」 — ${x.reason}`), '');
  }
  const warnings = [
    ...offscreen.map((t) => `「${t.action.label}」（${t.from}）は撮影画像外にあるため、矢印の起点を画像の端に寄せています。`),
    ...graph.warnings,
  ];
  if (warnings.length) lines.push('## 警告', '', ...warnings.map((w) => `- ${w}`), '');
  return lines.join('\n');
}
