// 画面遷移グラフ（中間データ graph.json）の管理。ID は発見順で決定的に採番する。

export const NAME_MAX = 40;

export function truncate(s, max = NAME_MAX) {
  const chars = [...s];
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join('')}…`;
}

const pad = (n) => String(n).padStart(3, '0');

export class Graph {
  constructor() {
    this.screens = [];
    this.transitions = [];
    this.skippedActions = [];
    this.noChangeActions = [];
    this.warnings = [];
    this.meta = {};
  }

  /**
   * @param {{key: string, url: string, title?: string, heading?: string, external: boolean, depth: number,
   *   path: object[], viaLabel?: string, image: {width: number, height: number, fullPage?: boolean}}} s
   */
  addScreen(s) {
    const id = `screen-${pad(this.screens.length + 1)}`;
    const screen = {
      id,
      name: this.#nameFor(s),
      url: s.url,
      title: s.title ?? '',
      screenshot: `images/${id}.png`,
      state_key: s.key,
      external: Boolean(s.external),
      depth: s.depth,
      path: s.path,
      image: s.image,
    };
    this.screens.push(screen);
    return screen;
  }

  #nameFor(s) {
    if (s.external) {
      const host = new URL(s.url).hostname;
      return truncate(`外部: ${host}${s.title ? ` ─ ${s.title}` : ''}`);
    }
    const base = truncate((s.heading || s.title || '画面').trim());
    const names = new Set(this.screens.map((x) => x.name));
    if (!names.has(base)) return base;
    if (s.viaLabel) {
      const withVia = truncate(`${base} ─「${s.viaLabel}」後`);
      if (!names.has(withVia)) return withVia;
      return `${withVia} (${this.#nextId()})`;
    }
    return `${base} (${this.#nextId()})`;
  }

  #nextId() {
    return `screen-${pad(this.screens.length + 1)}`;
  }

  findByKey(key) {
    return this.screens.find((s) => s.state_key === key);
  }

  getScreen(id) {
    return this.screens.find((s) => s.id === id);
  }

  /** @param {{from: string, to: string, kind: string, action: object}} t */
  addTransition(t) {
    if (!this.getScreen(t.from) || !this.getScreen(t.to)) throw new Error(`遷移元または遷移先が存在しません: ${t.from} → ${t.to}`);
    const tr = { id: `transition-${pad(this.transitions.length + 1)}`, from: t.from, to: t.to, kind: t.kind, action: t.action };
    this.transitions.push(tr);
    return tr;
  }

  addSkipped(x) {
    this.skippedActions.push(x);
  }

  addNoChange(x) {
    this.noChangeActions.push(x);
  }

  addWarning(w) {
    if (!this.warnings.includes(w)) this.warnings.push(w);
  }

  toJSON() {
    return {
      meta: this.meta,
      screens: this.screens,
      transitions: this.transitions,
      skippedActions: this.skippedActions,
      noChangeActions: this.noChangeActions,
      warnings: this.warnings,
    };
  }

  static fromJSON(j) {
    const g = new Graph();
    g.meta = j.meta ?? {};
    g.screens = j.screens ?? [];
    g.transitions = j.transitions ?? [];
    g.skippedActions = j.skippedActions ?? [];
    g.noChangeActions = j.noChangeActions ?? [];
    g.warnings = j.warnings ?? [];
    return g;
  }
}
