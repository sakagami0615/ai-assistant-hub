// Playwright によるページ操作。1 回の経路再実行ごとに新しい BrowserContext を使う（設計 Q13）。
import { StgError } from './errors.mjs';
import { stateKey } from './state-key.mjs';
import {
  collectInPage,
  pageFactsInPage,
  installTrackerInPage,
  quietStateInPage,
  scrollToChangeInPage,
  pageMetricsInPage,
} from './page-probe.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** baseUrl に到達できるまで最大 timeoutSec 秒ポーリングする（設計 Q23） */
export async function ensureReachable(url, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
      await res.body?.cancel();
      return;
    } catch (e) {
      lastErr = e;
      await sleep(1000);
    }
  }
  throw new StgError('CONNECTION', { where: url, message: `${timeoutSec} 秒以内にアプリケーションへ接続できませんでした（${lastErr?.cause?.code ?? lastErr?.message ?? '不明'}）` });
}

export function isInternal(url, cfg) {
  try {
    return cfg.internalOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

/** 1 つの BrowserContext 上のページ操作をまとめたセッション */
export class Session {
  /**
   * @param {import('playwright').Browser} browser
   * @param {object} cfg 正規化済み config
   * @param {{log: (e: object) => void, onWarning: (w: string) => void}} hooks
   */
  static async open(browser, cfg, hooks) {
    const context = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: 1, locale: 'ja-JP', acceptDownloads: true });
    const page = await context.newPage();
    return new Session(context, page, cfg, hooks);
  }

  constructor(context, page, cfg, hooks) {
    this.context = context;
    this.page = page;
    this.cfg = cfg;
    this.hooks = hooks;
    this.popups = [];
    this.downloads = [];
    this.nav = { pending: false, status: null, failed: null, url: null };
    this.#wire(page);
    context.on('page', (p) => {
      if (p !== this.page) this.popups.push(p);
    });
  }

  #wire(page) {
    page.on('dialog', (d) => {
      this.hooks.log({ event: 'native-dialog-dismissed', type: d.type(), message: d.message() });
      d.dismiss().catch(() => {});
    });
    page.on('pageerror', (e) => this.hooks.onWarning(`アプリの JavaScript エラー（${page.url()}）: ${e.message}`));
    page.on('download', (d) => {
      this.downloads.push(d.suggestedFilename());
      d.cancel().catch(() => {});
    });
    page.on('request', (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) this.nav.pending = true;
    });
    page.on('response', (r) => {
      if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) this.nav.status = r.status();
    });
    page.on('requestfailed', (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) {
        this.nav.pending = false;
        this.nav.failed = r.failure()?.errorText ?? 'failed';
      }
    });
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) {
        this.nav.pending = false;
        this.nav.url = f.url();
      }
    });
  }

  resetNav() {
    this.nav = { pending: false, status: null, failed: null, url: null };
  }

  async close() {
    await this.context.close().catch(() => {});
  }

  async goto(url, where) {
    this.resetNav();
    let res;
    try {
      res = await this.page.goto(url, { waitUntil: 'load', timeout: this.cfg.limits.actionTimeoutMs * 3 });
    } catch (e) {
      throw new StgError('CONNECTION', { where, message: `ページを開けませんでした: ${url}（${e.message.split('\n')[0]}）` });
    }
    if (res && res.status() >= 400) throw new StgError('HTTP_ERROR', { where, message: `${url} が HTTP ${res.status()} を返しました` });
    await this.settle({ where });
  }

  async installTracker() {
    await this.page.evaluate(installTrackerInPage, { ignoreSelectors: this.cfg.ignoreSelectors });
  }

  /**
   * 表示が安定するまで待つ（設計 Q15）。strict=false の場合はタイムアウトしてもエラーにしない（外部サイト用）。
   */
  async settle({ where, strict = true } = {}) {
    const { quietMs, loadingSelectors } = this.cfg;
    const deadline = Date.now() + this.cfg.limits.actionTimeoutMs;
    while (Date.now() < deadline) {
      if (this.nav.pending) {
        await sleep(50);
        continue;
      }
      let st;
      try {
        await this.page.waitForLoadState('load', { timeout: Math.max(1, deadline - Date.now()) });
        st = await this.page.evaluate(quietStateInPage, { loadingSelectors });
      } catch {
        await sleep(50); // ナビゲーション中で実行コンテキストが破棄された
        continue;
      }
      if (!st.installed) {
        await this.installTracker().catch(() => {});
        continue;
      }
      if (st.ready && !st.loading && st.since >= quietMs) return;
      await sleep(Math.min(100, Math.max(10, quietMs - st.since)));
    }
    if (!strict) return;
    throw new StgError('TRANSITION_UNSTABLE', { where, message: `${this.cfg.limits.actionTimeoutMs}ms 以内に画面表示が安定しませんでした（${this.page.url()}）` });
  }

  /** @returns {Promise<{infos: object[], handle: import('playwright').JSHandle}>} */
  async collect(scope = 'actions') {
    const handle = await this.page.evaluateHandle(collectInPage, { roots: this.cfg.actionRoots, ignoreSelectors: this.cfg.ignoreSelectors, scope });
    const infos = await (await handle.getProperty('infos')).jsonValue();
    return { infos, handle };
  }

  async elementAt(handle, index) {
    const els = await handle.getProperty('elements');
    return (await els.getProperty(String(index))).asElement();
  }

  async facts() {
    return this.page.evaluate(pageFactsInPage, { ignoreSelectors: this.cfg.ignoreSelectors });
  }

  /** 現在の状態キーと素材 */
  async snapshot() {
    const { infos, handle } = await this.collect('actions');
    await handle.dispose();
    const facts = await this.facts();
    const snap = { url: this.page.url(), actions: infos.map((i) => ({ role: i.role, name: i.name })), headings: facts.headings, dialog: facts.dialog };
    return { key: stateKey(snap, this.cfg), snap, facts, infos };
  }

  /**
   * 記述子 {role, name, nth} で要素を探す。scope='actions' は actionRoots 内、'all' は文書全体。
   * @returns {Promise<import('playwright').ElementHandle|null>}
   */
  async resolve(target, scope) {
    const { infos, handle } = await this.collect(scope);
    const nth = target.nth ?? 0;
    const idx = infos.findIndex((i) => i.role === target.role && i.name === target.name && i.nth === nth);
    const el = idx >= 0 ? await this.elementAt(handle, idx) : null;
    return { el, info: idx >= 0 ? infos[idx] : null, available: infos.map((i) => `${i.role}:${i.name}${i.nth ? `#${i.nth}` : ''}`) };
  }

  /**
   * 1 ステップ実行し、表示安定まで待つ。
   * @param {object} step config 形式のステップ、または {click: target, scope}
   * @param {{errorKind: string, where: string, scope: 'actions'|'all'}} ctx
   */
  async runStep(step, { errorKind, where, scope }) {
    this.resetNav();
    this.popups = [];
    this.downloads = [];
    await this.installTracker();
    if (step.goto) {
      await this.goto(new URL(step.goto, this.cfg.baseUrl).href, where);
      return;
    }
    const target = step.click ?? step.fill ?? step.press;
    const { el, available } = await this.resolve(target, scope);
    if (!el) {
      throw new StgError(errorKind, {
        where,
        message: `操作対象 ${target.role}「${target.name}」${target.nth ? `（${target.nth + 1} 番目）` : ''}が見つかりません。現在の候補: ${available.join(', ') || 'なし'}`,
      });
    }
    const timeout = this.cfg.limits.actionTimeoutMs;
    try {
      if (step.click) await el.click({ timeout });
      else if (step.fill) await el.fill(step.text, { timeout });
      else await el.press(step.key, { timeout });
    } catch (e) {
      throw new StgError('CLICK_FAILED', { where, message: `${target.role}「${target.name}」を操作できませんでした: ${e.message.split('\n')[0]}` });
    }
    await sleep(30);
    if (this.nav.failed) await this.#navFailed(where);
    await this.settle({ where, strict: isInternal(this.page.url(), this.cfg) });
    if (this.nav.failed) await this.#navFailed(where);
    if (this.nav.status !== null && this.nav.status >= 400) {
      const kind = 'HTTP_ERROR';
      throw new StgError(kind, { where, message: `遷移先 ${this.page.url()} が HTTP ${this.nav.status} を返しました` });
    }
  }

  async #navFailed(where) {
    const url = this.nav.url ?? this.page.url();
    const kind = isInternal(url, this.cfg) ? 'CONNECTION' : 'EXTERNAL_CAPTURE_FAILED';
    throw new StgError(kind, { where, message: `遷移先を表示できませんでした（${this.nav.failed}）` });
  }

  /**
   * 状態に初めて到達した瞬間の観測（設計 Q16）: スクロール調整 → 操作候補の座標取得 → 撮影 を同時に行う。
   * @param {{scrollToChange: boolean, anchors?: object[], external?: boolean}} opts
   */
  async observe(page, { scrollToChange, anchors = [], external = false }) {
    const vp = this.cfg.viewport;
    if (scrollToChange) {
      await page.evaluate(scrollToChangeInPage, { ignoreSelectors: this.cfg.ignoreSelectors });
      await sleep(50);
    }
    const shoot = async (fullHeight) => {
      const infos = external ? [] : (await this.#collectOn(page, 'actions')).infos;
      const all = anchors.length ? (await this.#collectOn(page, 'all')).infos : [];
      const metrics = await page.evaluate(pageMetricsInPage);
      const buf = await page.screenshot({ animations: 'disabled', caret: 'hide', timeout: this.cfg.limits.actionTimeoutMs });
      return { infos, all, metrics, buf, height: fullHeight ?? vp.height };
    };
    let shot;
    try {
      shot = await shoot();
      const outside = shot.infos.some((i) => !i.clipped && (i.rect.y < 0 || i.rect.y + i.rect.height > vp.height));
      if (outside && shot.metrics.scrollHeight > vp.height) {
        // window スクロールで viewport 外に操作要素がある → ページ全体を撮影（viewport を一時的に縦に拡張）
        await page.evaluate(() => window.scrollTo(0, 0));
        const full = (await page.evaluate(pageMetricsInPage)).scrollHeight;
        await page.setViewportSize({ width: vp.width, height: full });
        await sleep(100);
        const h = (await page.evaluate(pageMetricsInPage)).scrollHeight;
        if (h !== full) await page.setViewportSize({ width: vp.width, height: h });
        shot = await shoot(h);
        shot.fullPage = true;
        await page.setViewportSize(vp);
      }
    } catch (e) {
      if (e instanceof StgError) throw e;
      throw new StgError('SCREENSHOT_FAILED', { where: page.url(), message: e.message.split('\n')[0] });
    }
    const image = { width: vp.width, height: shot.height, fullPage: Boolean(shot.fullPage) };
    const toAction = (i) => toActionRect(i, image);
    return {
      png: shot.buf,
      image,
      candidates: shot.infos.map((i) => ({ ...i, rect: toAction(i) })),
      anchors: anchors.map((t) => {
        const hit = shot.all.find((i) => i.role === t.role && i.name === t.name && i.nth === (t.nth ?? 0));
        return hit ? toAction(hit) : null;
      }),
    };
  }

  async #collectOn(page, scope) {
    const handle = await page.evaluateHandle(collectInPage, { roots: this.cfg.actionRoots, ignoreSelectors: this.cfg.ignoreSelectors, scope });
    const infos = await (await handle.getProperty('infos')).jsonValue();
    await handle.dispose();
    return { infos };
  }
}

/** 要素の矩形を撮影画像の座標に変換する。画像外は端にクランプし offscreen を立てる */
export function toActionRect(info, image) {
  const r = info.rect;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const offscreen = cx < 0 || cy < 0 || cx > image.width || cy > image.height;
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  return {
    x: Math.round(clamp(r.x, image.width)),
    y: Math.round(clamp(r.y, image.height)),
    width: Math.round(Math.min(r.width, image.width)),
    height: Math.round(Math.min(r.height, image.height)),
    ...(offscreen ? { offscreen: true, x: Math.round(clamp(cx, image.width)), y: Math.round(clamp(cy, image.height)), width: 0, height: 0 } : {}),
  };
}
