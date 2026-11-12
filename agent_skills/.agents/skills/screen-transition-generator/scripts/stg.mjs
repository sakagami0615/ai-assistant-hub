#!/usr/bin/env node
// screen-transition-generator CLI
//   node stg.mjs probe    [--config <path>] [--out <dir>] [--click <role:name>]... [--headed]
//   node stg.mjs explore  [--config <path>] [--out <dir>] [--headed]
//   node stg.mjs generate [--config <path>] [--out <dir>]
//   node stg.mjs run      [--config <path>] [--out <dir>] [--headed]
// 既定の出力先: <カレントディレクトリ>/screen-transition-generator、既定の config: <出力先>/config.json
// 結果は stdout に JSON で出力する。エラー時は error-report.md を書き、終了コード 1。
import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './lib/config.mjs';
import { StgError, asStgError, formatErrorReport, toErrorJson } from './lib/errors.mjs';
import { Graph } from './lib/graph.mjs';
import { explore, probe } from './lib/explorer.mjs';
import { generate } from './lib/generate.mjs';
import { prepareOutputDir } from './lib/output.mjs';

export const SKILL_NAME = 'screen-transition-generator';

function usage() {
  return [
    '使い方: node stg.mjs <probe|explore|generate|run> [options]',
    '  --config <path>   config.json のパス（既定: <out>/config.json）',
    '  --out <dir>       出力先（既定: ./screen-transition-generator）',
    '  --click <r:name>  probe で開始画面から辿る操作（例: button:料金を知りたい）。複数指定可',
    '  --headed          ブラウザを表示して実行（デバッグ用）',
  ].join('\n');
}

function parseClick(s) {
  const m = /^(button|link)(?:#(\d+))?:(.*)$/.exec(s);
  if (!m) throw new StgError('CONFIG_INVALID', { where: '--click', message: `"role:name" 形式で指定してください（role は button / link）: ${s}` });
  return { role: m[1], name: m[3], nth: m[2] ? Number(m[2]) : 0 };
}

function makeLogger(outDir) {
  const file = join(outDir, 'execution.log');
  return (e) => {
    try {
      appendFileSync(file, `${JSON.stringify({ time: new Date().toISOString(), ...e })}\n`);
    } catch {
      /* ログ出力の失敗で探索を止めない */
    }
  };
}

async function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      out: { type: 'string' },
      click: { type: 'string', multiple: true },
      headed: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const cmd = positionals[0];
  if (values.help || !['probe', 'explore', 'generate', 'run'].includes(cmd)) {
    process.stderr.write(`${usage()}\n`);
    return values.help ? 0 : 2;
  }
  const outDir = resolve(values.out ?? SKILL_NAME);
  const configPath = resolve(values.config ?? join(outDir, 'config.json'));
  let graph = null;
  let started = false;

  try {
    const cfg = await loadConfig(configPath);

    if (cmd === 'probe') {
      mkdirSync(outDir, { recursive: true });
      const result = await probe(cfg, { clicks: (values.click ?? []).map(parseClick), screenshotPath: join(outDir, 'probe.png'), headed: values.headed });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    let archivedTo = null;
    if (cmd === 'explore' || cmd === 'run') {
      ({ archivedTo } = await prepareOutputDir(outDir));
      started = true;
      const log = makeLogger(outDir);
      log({ event: 'start', command: cmd, config: configPath, archivedTo });
      graph = new Graph();
      try {
        await explore(cfg, { outDir, log, headed: values.headed, graph });
      } finally {
        writeFileSync(join(outDir, 'graph.json'), `${JSON.stringify(graph.toJSON(), null, 2)}\n`);
      }
      log({ event: 'explore-finished', screens: graph.screens.length, transitions: graph.transitions.length });
    }

    if (cmd === 'generate' || cmd === 'run') {
      const r = await generate(outDir, { scale: cfg.display.scale, collapseCommonActions: cfg.display.collapseCommonActions, archivedTo });
      process.stdout.write(`${JSON.stringify({ status: 'ok', outDir, ...r }, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ status: 'ok', outDir, graph: join(outDir, 'graph.json'), screens: graph.screens.length, transitions: graph.transitions.length }, null, 2)}\n`);
    }
    return 0;
  } catch (err) {
    const e = asStgError(err, cmd);
    mkdirSync(outDir, { recursive: true });
    const reportPath = join(outDir, 'error-report.md');
    const partial = graph && started ? `\n途中成果物（診断用・探索は未完了）: ${join(outDir, 'graph.json')}, ${join(outDir, 'images')}/（画面 ${graph.screens.length} 件）\n` : '';
    writeFileSync(reportPath, `${formatErrorReport(e)}${partial}`);
    if (started) makeLogger(outDir)({ event: 'error', ...toErrorJson(e) });
    process.stdout.write(`${JSON.stringify({ ...toErrorJson(e), errorReport: reportPath }, null, 2)}\n`);
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
