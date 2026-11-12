// config.json の読込・既定値付与・検証。不正な場合は CONFIG_INVALID で即停止する。
import { readFile } from 'node:fs/promises';
import { StgError } from './errors.mjs';

export const DEFAULTS = Object.freeze({
  viewport: { width: 1920, height: 1080 },
  limits: { maxScreens: 50, maxTransitions: 200, maxDepth: 10, maxDurationSec: 1800, actionTimeoutMs: 10000 },
  display: { scale: 0.5, maxColumns: 3, collapseCommonActions: true },
  quietMs: 400,
  connectTimeoutSec: 30,
});

const TOP_KEYS = new Set([
  '$schema', 'baseUrl', 'start', 'viewport', 'internalOrigins', 'actionRoots', 'ignoreSelectors', 'ignoreQueryParams',
  'loadingSelectors', 'scenarios', 'safety', 'limits', 'display', 'quietMs', 'connectTimeoutSec',
]);
const ROLES = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'searchbox']);

function fail(where, message) {
  throw new StgError('CONFIG_INVALID', { where: `config.${where}`, message });
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toUrl(value, where, base) {
  try {
    return new URL(value, base);
  } catch {
    fail(where, `URL として解釈できません: ${JSON.stringify(value)}`);
  }
}

function positiveNumber(v, where) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(where, `正の数値を指定してください: ${JSON.stringify(v)}`);
  return v;
}

function stringArray(v, where) {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) fail(where, '文字列の配列を指定してください');
  return [...v];
}

function normalizeTarget(t, where) {
  if (!isPlainObject(t)) fail(where, '{ role, name } 形式で指定してください');
  if (!ROLES.has(t.role)) fail(`${where}.role`, `未対応の role です: ${JSON.stringify(t.role)}`);
  if (typeof t.name !== 'string') fail(`${where}.name`, 'name（アクセシブルネーム）を文字列で指定してください');
  const out = { role: t.role, name: t.name };
  if (t.nth !== undefined) {
    if (!Number.isInteger(t.nth) || t.nth < 0) fail(`${where}.nth`, '0 以上の整数を指定してください');
    out.nth = t.nth;
  }
  return out;
}

/** ステップ記法: {click:T} | {fill:T, text} | {press:T, key} | {goto:url} */
export function normalizeStep(s, where) {
  if (!isPlainObject(s)) fail(where, 'ステップはオブジェクトで指定してください');
  if (s.click) return { click: normalizeTarget(s.click, `${where}.click`) };
  if (s.fill) {
    if (typeof s.text !== 'string') fail(`${where}.text`, 'fill には text が必要です');
    return { fill: normalizeTarget(s.fill, `${where}.fill`), text: s.text };
  }
  if (s.press) {
    if (typeof s.key !== 'string') fail(`${where}.key`, 'press には key が必要です');
    return { press: normalizeTarget(s.press, `${where}.press`), key: s.key };
  }
  if (typeof s.goto === 'string') return { goto: s.goto };
  fail(where, `未対応のステップです: ${JSON.stringify(s)}（click / fill / press / goto のいずれか）`);
}

function normalizeSteps(v, where) {
  if (v === undefined) return [];
  if (!Array.isArray(v)) fail(where, '配列を指定してください');
  return v.map((s, i) => normalizeStep(s, `${where}[${i}]`));
}

/**
 * @param {any} raw
 * @returns {object} 正規化済み config
 */
export function normalizeConfig(raw) {
  if (!isPlainObject(raw)) fail('', 'JSON オブジェクトを指定してください');
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) fail(k, `未知のキーです: ${k}`);
  if (typeof raw.baseUrl !== 'string' || !/^https?:\/\//.test(raw.baseUrl)) fail('baseUrl', 'http(s):// で始まる baseUrl が必要です');
  const baseUrl = toUrl(raw.baseUrl, 'baseUrl').href;

  const start = raw.start ?? {};
  if (!isPlainObject(start)) fail('start', 'オブジェクトを指定してください');
  const startUrl = toUrl(start.url ?? '', 'start.url', baseUrl).href;

  const viewportRaw = raw.viewport ?? {};
  if (!isPlainObject(viewportRaw)) fail('viewport', 'オブジェクトを指定してください');
  const viewport = { ...DEFAULTS.viewport, ...viewportRaw };
  positiveNumber(viewport.width, 'viewport.width');
  positiveNumber(viewport.height, 'viewport.height');

  const limitsRaw = raw.limits ?? {};
  if (!isPlainObject(limitsRaw)) fail('limits', 'オブジェクトを指定してください');
  const limits = { ...DEFAULTS.limits, ...limitsRaw };
  for (const [k, v] of Object.entries(limits)) {
    if (!(k in DEFAULTS.limits)) fail(`limits.${k}`, `未知のキーです: ${k}`);
    positiveNumber(v, `limits.${k}`);
  }

  const displayRaw = raw.display ?? {};
  const display = { ...DEFAULTS.display, ...displayRaw };
  if (!isPlainObject(displayRaw)) fail('display', 'オブジェクトを指定してください');
  for (const k of Object.keys(displayRaw)) if (!(k in DEFAULTS.display)) fail(`display.${k}`, `未知のキーです: ${k}`);
  if (typeof display.scale !== 'number' || display.scale <= 0 || display.scale > 1) fail('display.scale', '0 より大きく 1 以下の数値を指定してください');
  if (!Number.isInteger(display.maxColumns) || display.maxColumns < 1) fail('display.maxColumns', '1 以上の整数を指定してください');
  if (typeof display.collapseCommonActions !== 'boolean') fail('display.collapseCommonActions', 'true / false を指定してください');

  const origins = new Set([new URL(startUrl).origin, new URL(baseUrl).origin]);
  for (const [i, o] of stringArray(raw.internalOrigins, 'internalOrigins').entries()) origins.add(toUrl(o, `internalOrigins[${i}]`).origin);

  const actionRootsRaw = raw.actionRoots ?? ['body'];
  if (!Array.isArray(actionRootsRaw) || actionRootsRaw.length === 0) fail('actionRoots', '1 件以上の配列を指定してください');
  const actionRoots = actionRootsRaw.map((r, i) => {
    if (typeof r === 'string') return { selector: r, pick: 'all' };
    if (!isPlainObject(r) || typeof r.selector !== 'string') fail(`actionRoots[${i}]`, '文字列または { selector, pick } を指定してください');
    const pick = r.pick ?? 'all';
    if (pick !== 'all' && pick !== 'last') fail(`actionRoots[${i}].pick`, '"all" または "last" を指定してください');
    return { selector: r.selector, pick };
  });

  const scenariosRaw = raw.scenarios ?? [];
  if (!Array.isArray(scenariosRaw)) fail('scenarios', '配列を指定してください');
  const scenarios = scenariosRaw.map((s, i) => {
    if (!isPlainObject(s) || typeof s.name !== 'string' || !s.name) fail(`scenarios[${i}].name`, 'name を指定してください');
    const from = s.from ?? 'start';
    if (from !== 'start') fail(`scenarios[${i}].from`, '初期版では "start" のみ対応しています');
    const steps = normalizeSteps(s.steps, `scenarios[${i}].steps`);
    if (steps.length === 0) fail(`scenarios[${i}].steps`, '1 件以上のステップが必要です');
    return { name: s.name, from, steps };
  });

  const safetyRaw = raw.safety ?? {};
  if (!isPlainObject(safetyRaw)) fail('safety', 'オブジェクトを指定してください');

  const quietMs = raw.quietMs ?? DEFAULTS.quietMs;
  positiveNumber(quietMs, 'quietMs');
  const connectTimeoutSec = raw.connectTimeoutSec ?? DEFAULTS.connectTimeoutSec;
  positiveNumber(connectTimeoutSec, 'connectTimeoutSec');

  return {
    baseUrl,
    start: { url: startUrl, steps: normalizeSteps(start.steps, 'start.steps') },
    viewport,
    internalOrigins: [...origins].sort(),
    actionRoots,
    ignoreSelectors: stringArray(raw.ignoreSelectors, 'ignoreSelectors'),
    ignoreQueryParams: stringArray(raw.ignoreQueryParams, 'ignoreQueryParams'),
    loadingSelectors: stringArray(raw.loadingSelectors, 'loadingSelectors'),
    scenarios,
    safety: { allow: stringArray(safetyRaw.allow, 'safety.allow'), deny: stringArray(safetyRaw.deny, 'safety.deny') },
    limits,
    display,
    quietMs,
    connectTimeoutSec,
  };
}

export async function loadConfig(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    throw new StgError('CONFIG_INVALID', { where: path, message: `config ファイルを読み込めません: ${e.message}`, fixes: ['エージェント手順④に従い config.json を作成してください。'] });
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new StgError('CONFIG_INVALID', { where: path, message: `JSON として解釈できません: ${e.message}` });
  }
  return normalizeConfig(raw);
}
