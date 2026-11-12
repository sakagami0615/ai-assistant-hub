// 幅優先探索（BFS）による画面遷移の探索（要件 8 章・設計 5 章）。
// ノード = 画面状態（状態キー）、エッジ = ボタン・リンク操作。各操作は初期状態から経路を再実行して検証する。
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { StgError } from './errors.mjs';
import { Graph } from './graph.mjs';
import { judgeAction } from './safety.mjs';
import { normalizeUrl } from './state-key.mjs';
import { Session, ensureReachable, isInternal } from './browser.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const describe = (t) => `${t.role === 'link' ? 'リンク' : 'ボタン'}「${t.name}」`;

/**
 * @param {object} cfg 正規化済み config
 * @param {{outDir: string, log: (e: object) => void, headed?: boolean, graph?: Graph}} opts
 *   graph を渡すと、エラー時にも途中結果がそこに残る。
 * @returns {Promise<Graph>}
 */
export async function explore(cfg, { outDir, log, headed = false, graph = new Graph() }) {
  const startedAt = Date.now();
  graph.meta = { generator: 'screen-transition-generator', startedAt: new Date(startedAt).toISOString(), startUrl: cfg.start.url, viewport: cfg.viewport };
  const hooks = { log, onWarning: (w) => graph.addWarning(w) };
  const { limits } = cfg;

  await ensureReachable(cfg.start.url, cfg.connectTimeoutSec);
  log({ event: 'reachable', url: cfg.start.url });

  const browser = await chromium.launch({ headless: !headed });
  try {
    const checkTime = () => {
      if ((Date.now() - startedAt) / 1000 > limits.maxDurationSec) {
        throw new StgError('LIMIT_REACHED', { where: '探索全体', message: `最大実行時間 ${limits.maxDurationSec} 秒に到達しました（探索は未完了です）` });
      }
    };

    /** 初期状態から経路を再実行して、状態を復元したセッションを返す */
    const replay = async (path, label) => {
      const s = await Session.open(browser, cfg, hooks);
      try {
        await s.goto(cfg.start.url, '開始画面への移動');
        for (const [i, step] of cfg.start.steps.entries()) {
          await s.runStep(step, { errorKind: 'START_SCREEN', where: `開始までの事前操作 start.steps[${i}]`, scope: 'all' });
        }
        const startKey = graph.screens[0]?.state_key;
        if (startKey) {
          const { key } = await s.snapshot();
          if (key !== startKey) {
            throw new StgError('STATE_RESTORE', { where: `${label} の再現処理（開始画面）`, message: '開始画面の状態が最初の訪問時と一致しません。' });
          }
        }
        for (const entry of path) {
          for (const [i, step] of entry.steps.entries()) {
            await s.runStep(step, { errorKind: entry.scenario ? 'SCENARIO_FAILED' : 'STATE_RESTORE', where: `${label} の再現処理（${entry.label}${entry.steps.length > 1 ? ` ステップ${i + 1}` : ''}）`, scope: entry.scenario ? 'all' : 'actions' });
          }
          const { key } = await s.snapshot();
          if (key !== entry.expectKey) {
            throw new StgError('STATE_RESTORE', { where: `${label} の再現処理（${entry.label} の後）`, message: `「${entry.label}」の操作後の画面状態が記録時と一致しません。` });
          }
        }
        return s;
      } catch (e) {
        await s.close();
        throw e;
      }
    };

    const writePng = async (screen, png) => {
      try {
        await writeFile(join(outDir, screen.screenshot), png);
      } catch (e) {
        throw new StgError('SCREENSHOT_FAILED', { where: screen.id, message: `画像を保存できませんでした: ${e.message}` });
      }
    };

    const addInternalScreen = async (session, { key, depth, path, viaLabel, scrollToChange, anchors }) => {
      if (graph.screens.length >= limits.maxScreens) {
        throw new StgError('LIMIT_REACHED', { where: `「${viaLabel}」の遷移先`, message: `最大画面数 ${limits.maxScreens} に到達しました（探索は未完了です）` });
      }
      if (depth > limits.maxDepth) {
        throw new StgError('LIMIT_REACHED', { where: `「${viaLabel}」の遷移先`, message: `最大探索深度 ${limits.maxDepth} を超える画面が見つかりました（探索は未完了です）` });
      }
      const obs = await session.observe(session.page, { scrollToChange, anchors });
      const facts = await session.facts();
      const screen = graph.addScreen({ key, url: session.page.url(), title: facts.title, heading: facts.heading, external: false, depth, path: path.map(({ label, steps, scenario }) => ({ label, steps, scenario: Boolean(scenario) })), viaLabel, image: obs.image });
      await writePng(screen, obs.png);
      log({ event: 'screen', id: screen.id, name: screen.name, url: screen.url, depth, fullPage: obs.image.fullPage });
      return { screen, candidates: obs.candidates, anchors: obs.anchors, path };
    };

    const addEdge = (from, to, action, kind) => {
      if (graph.transitions.length >= limits.maxTransitions) {
        throw new StgError('LIMIT_REACHED', { where: `${from.id} からの遷移`, message: `最大遷移数 ${limits.maxTransitions} に到達しました（探索は未完了です）` });
      }
      const t = graph.addTransition({ from: from.id, to: to.id, kind, action });
      log({ event: 'transition', id: t.id, from: from.id, to: to.id, label: action.label });
    };

    /** 操作結果を判定してグラフに反映する。新しい内部状態なら探索キュー用の項目を返す */
    const handleOutcome = async (session, from, action, entry) => {
      const { page } = session;
      if (session.downloads.length) {
        graph.addSkipped({ screen: from.screen.id, role: action.role, label: action.label, reason: `ファイルダウンロードが発生したため（${session.downloads.join(', ')}）` });
        return null;
      }
      const popup = session.popups[0];
      const target = popup ?? (isInternal(page.url(), cfg) ? null : page);
      if (target) {
        // 外部画面（終端ノード）: 最初の画面のみ撮影し、探索しない（要件 Q21）
        try {
          await target.waitForLoadState('load', { timeout: limits.actionTimeoutMs });
        } catch (e) {
          throw new StgError('EXTERNAL_CAPTURE_FAILED', { where: `${from.screen.id} の${describe({ role: action.role, name: action.label })}`, message: `外部ページの読み込みが完了しませんでした: ${e.message.split('\n')[0]}` });
        }
        if (target.url() === 'about:blank' || target.url().startsWith('chrome-error:')) {
          throw new StgError('EXTERNAL_CAPTURE_FAILED', { where: `${from.screen.id} の${describe({ role: action.role, name: action.label })}`, message: `外部ページを表示できませんでした（${target.url()}）` });
        }
        await sleep(cfg.quietMs);
        const url = target.url();
        const key = `external:${normalizeUrl(url, cfg.ignoreQueryParams)}`;
        let screen = graph.findByKey(key);
        if (!screen) {
          if (graph.screens.length >= limits.maxScreens) {
            throw new StgError('LIMIT_REACHED', { where: `「${action.label}」の遷移先`, message: `最大画面数 ${limits.maxScreens} に到達しました（探索は未完了です）` });
          }
          const obs = await session.observe(target, { scrollToChange: false, external: true });
          const title = await target.title().catch(() => '');
          screen = graph.addScreen({ key, url, title, external: true, depth: from.screen.depth + 1, path: [], image: obs.image });
          await writePng(screen, obs.png);
          log({ event: 'external-screen', id: screen.id, url });
        }
        addEdge(from.screen, screen, action, popup ? 'external-popup' : 'external');
        return null;
      }

      const { key } = await session.snapshot();
      if (key === from.screen.state_key) {
        graph.addNoChange({ screen: from.screen.id, role: action.role, label: action.label });
        log({ event: 'no-change', from: from.screen.id, label: action.label });
        return null;
      }
      const known = graph.findByKey(key);
      if (known) {
        addEdge(from.screen, known, action, entry.scenario ? 'scenario' : 'action');
        return null;
      }
      const path = [...from.path, { ...entry, expectKey: key }];
      const item = await addInternalScreen(session, { key, depth: from.screen.depth + 1, path, viaLabel: entry.label, scrollToChange: true });
      addEdge(from.screen, item.screen, action, entry.scenario ? 'scenario' : 'action');
      return item;
    };

    // 開始画面
    const first = await replay([], '開始画面');
    let root;
    try {
      const { key } = await first.snapshot();
      const anchors = cfg.scenarios.map((sc) => [...sc.steps].reverse().find((s) => s.click)?.click ?? null).map((t) => t ?? { role: '-', name: '-' });
      root = await addInternalScreen(first, { key, depth: 0, path: [], viaLabel: '', scrollToChange: false, anchors });
    } finally {
      await first.close();
    }

    const queue = [];
    // 固定テキストシナリオ（設計 Q19）
    for (const [i, sc] of cfg.scenarios.entries()) {
      checkTime();
      const anchor = root.anchors[i];
      if (!anchor) {
        const last = [...sc.steps].reverse().find((s) => s.click)?.click;
        throw new StgError('SCENARIO_FAILED', {
          where: `シナリオ「${sc.name}」`,
          message: last
            ? `開始画面にシナリオの最後のクリック対象 ${last.role}「${last.name}」が見つかりません。`
            : 'シナリオに click ステップがありません（最後の click 要素を矢印の起点にするため必須です）。',
        });
      }
      const fills = sc.steps.filter((s) => s.fill).map((s) => s.text);
      const label = fills.length ? `入力: ${fills.join(' / ')}` : sc.name;
      const entry = { label, steps: sc.steps, scenario: true };
      const s = await replay([], `シナリオ「${sc.name}」`);
      try {
        for (const [j, step] of sc.steps.entries()) {
          await s.runStep(step, { errorKind: 'SCENARIO_FAILED', where: `シナリオ「${sc.name}」のステップ${j + 1}`, scope: 'all' });
        }
        const item = await handleOutcome(s, root, { role: 'button', label, ...anchor }, entry);
        if (item) queue.push(item);
      } finally {
        await s.close();
      }
    }
    queue.unshift(root);

    while (queue.length) {
      const item = queue.shift();
      for (const cand of item.candidates) {
        checkTime();
        const verdict = judgeAction(cand, cfg.safety);
        if (!verdict.safe) {
          graph.addSkipped({ screen: item.screen.id, role: cand.role, label: cand.name, reason: verdict.reason });
          log({ event: 'skipped', screen: item.screen.id, label: cand.name, reason: verdict.reason });
          continue;
        }
        const target = { role: cand.role, name: cand.name, nth: cand.nth };
        const entry = { label: cand.name || cand.role, steps: [{ click: target }] };
        const s = await replay(item.path, item.screen.id);
        try {
          await s.runStep({ click: target }, { errorKind: 'ACTION_NOT_FOUND', where: `${item.screen.id} の${describe(target)}`, scope: 'actions' });
          const action = { role: cand.role, label: entry.label, ...cand.rect, ...(cand.href ? { href: cand.href } : {}) };
          const next = await handleOutcome(s, item, action, entry);
          if (next) queue.push(next);
        } finally {
          await s.close();
        }
      }
      log({ event: 'explored', screen: item.screen.id });
    }
    graph.meta.finishedAt = new Date().toISOString();
    graph.meta.durationSec = (Date.now() - startedAt) / 1000;
    return graph;
  } finally {
    await browser.close();
  }
}

/** probe: 開始画面（または --click で辿った先）の操作候補・状態を出力する（エージェントの調査用） */
export async function probe(cfg, { clicks = [], screenshotPath, headed = false, log = () => {} }) {
  await ensureReachable(cfg.start.url, cfg.connectTimeoutSec);
  const browser = await chromium.launch({ headless: !headed });
  const warnings = [];
  try {
    const s = await Session.open(browser, cfg, { log, onWarning: (w) => warnings.push(w) });
    await s.goto(cfg.start.url, '開始画面への移動');
    for (const [i, step] of cfg.start.steps.entries()) {
      await s.runStep(step, { errorKind: 'START_SCREEN', where: `start.steps[${i}]`, scope: 'all' });
    }
    for (const c of clicks) {
      await s.runStep({ click: c }, { errorKind: 'ACTION_NOT_FOUND', where: `--click ${c.role}:${c.name}`, scope: 'actions' });
    }
    const { key, facts } = await s.snapshot();
    const obs = await s.observe(s.page, { scrollToChange: clicks.length > 0 });
    if (screenshotPath) await writeFile(screenshotPath, obs.png);
    const { infos: all } = await s.collect('all');
    const url = s.page.url();
    await s.close();
    return {
      status: 'ok',
      url,
      title: facts.title,
      headings: facts.headings,
      dialog: facts.dialog,
      stateKey: key,
      internal: isInternal(url, cfg),
      screenshot: screenshotPath ?? null,
      candidates: obs.candidates.map((c) => ({ role: c.role, name: c.name, nth: c.nth, href: c.href, rect: c.rect, safety: judgeAction(c, cfg.safety) })),
      allInteractive: all.map((c) => ({ role: c.role, name: c.name, nth: c.nth })),
      warnings,
    };
  } finally {
    await browser.close();
  }
}
