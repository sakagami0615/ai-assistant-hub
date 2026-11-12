// 画面状態の同一性キー（設計 Q6）。チャット本文は含めず、操作可能要素の集合・見出し・dialog・URL で識別する。
import { createHash } from 'node:crypto';

export function normalizeText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeUrl(url, ignoreQueryParams = []) {
  const u = new URL(url);
  const params = [...u.searchParams.entries()].filter(([k]) => !ignoreQueryParams.includes(k)).sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
  const q = new URLSearchParams(params).toString();
  return `${u.origin}${u.pathname}${q ? `?${q}` : ''}${u.hash}`;
}

/**
 * @param {{url: string, actions: {role: string, name: string}[], headings: string[], dialog: boolean}} snap
 * @param {{ignoreQueryParams?: string[]}} [cfg]
 */
export function normalizeSnapshot(snap, cfg = {}) {
  const actions = [...new Set(snap.actions.map((a) => `${a.role}:${normalizeText(a.name)}`))].sort();
  const headings = snap.headings.map(normalizeText).filter(Boolean);
  return { url: normalizeUrl(snap.url, cfg.ignoreQueryParams), actions, headings, dialog: Boolean(snap.dialog) };
}

export function stateKey(snap, cfg = {}) {
  const n = normalizeSnapshot(snap, cfg);
  return createHash('sha1').update(JSON.stringify(n)).digest('hex');
}
