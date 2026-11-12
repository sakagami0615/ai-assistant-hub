// ブラウザ内で評価する関数群。page.evaluate に渡すため、各関数は外部変数を参照しない自己完結の関数にする。
// DOM は読み取りのみ（属性付与などの変更はしない）。

/**
 * 操作候補（scope='actions': actionRoots 内のボタン・リンク）または
 * 全操作要素（scope='all': 文書全体、入力欄を含む）を DOM 順で列挙する。
 * 戻り値: { elements: Element[], infos: object[] }（evaluateHandle で受け取る）
 */
export function collectInPage({ roots, ignoreSelectors, scope }) {
  const ACTION_SEL = 'button, a[href], [role=button], [role=link], input[type=button], input[type=submit], input[type=reset]';
  const INPUT_SEL = 'input:not([type]), input[type=text], input[type=search], input[type=email], input[type=number], input[type=password], input[type=tel], input[type=url], textarea, select, [role=textbox], [role=combobox], [role=searchbox], [contenteditable=""], [contenteditable=true]';
  const SEL = scope === 'all' ? `${ACTION_SEL}, ${INPUT_SEL}` : ACTION_SEL;
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const ignored = (el) => ignoreSelectors.some((s) => el.closest(s));
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    if (el.checkVisibility) return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const disabled = (el) => el.disabled === true || el.getAttribute('aria-disabled') === 'true' || !!el.closest('[inert]') || !!el.closest('fieldset[disabled]');
  const modals = [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter(visible);
  const modal = modals[modals.length - 1];

  const roleOf = (el) => {
    const r = el.getAttribute('role');
    if (r) return r;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      if (['button', 'submit', 'reset'].includes(t)) return 'button';
      if (t === 'search') return 'searchbox';
      return 'textbox';
    }
    if (el.isContentEditable) return 'textbox';
    return tag;
  };
  const byIds = (ids) => ids.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' ');
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')) return norm(el.getAttribute('aria-label'));
    if (el.getAttribute('aria-labelledby')) return norm(byIds(el.getAttribute('aria-labelledby')));
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const t = (el.getAttribute('type') || '').toLowerCase();
      if (['button', 'submit', 'reset'].includes(t)) return norm(el.value || (t === 'submit' ? '送信' : ''));
      const label = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
      if (label) return norm(label.innerText);
      return norm(el.getAttribute('placeholder') || el.getAttribute('title') || '');
    }
    const text = norm(el.innerText);
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img) return norm(img.getAttribute('alt'));
    return norm(el.getAttribute('title') || '');
  };
  const clippedByAncestor = (el) => {
    const r = el.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) {
        const ar = a.getBoundingClientRect();
        if (r.bottom > ar.bottom + 1 || r.top < ar.top - 1 || r.right > ar.right + 1 || r.left < ar.left - 1) return true;
      }
    }
    return false;
  };

  let rootEls;
  if (scope === 'all') rootEls = [document.body];
  else
    rootEls = roots.flatMap((r) => {
      const els = [...document.querySelectorAll(r.selector)];
      return r.pick === 'last' ? els.slice(-1) : els;
    });

  const seen = new Set();
  const elements = [];
  for (const root of rootEls) {
    for (const el of [root, ...root.querySelectorAll(SEL)]) {
      if (seen.has(el) || !el.matches(SEL)) continue;
      seen.add(el);
      if (ignored(el) || !visible(el) || disabled(el)) continue;
      if (modal && !modal.contains(el)) continue;
      elements.push(el);
    }
  }
  elements.sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  const counts = new Map();
  const infos = elements.map((el) => {
    const role = roleOf(el);
    const name = nameOf(el);
    const k = `${role}\u0000${name}`;
    const nth = counts.get(k) ?? 0;
    counts.set(k, nth + 1);
    const attrs = {};
    for (const a of el.attributes) if (a.name === 'aria-label' || a.name === 'title' || a.name === 'download' || a.name === 'value' || a.name.startsWith('data-')) attrs[a.name] = a.value;
    const r = el.getBoundingClientRect();
    const form = el.form ?? el.closest('form');
    return {
      role,
      name,
      nth,
      href: el.tagName.toLowerCase() === 'a' ? el.href : undefined,
      target: el.getAttribute('target') || undefined,
      type: (el.getAttribute('type') || (el.tagName.toLowerCase() === 'button' && form ? 'submit' : '')).toLowerCase() || undefined,
      formMethod: form ? (form.getAttribute('method') || 'get').toLowerCase() : undefined,
      attrs,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      clipped: clippedByAncestor(el),
    };
  });
  return { elements, infos };
}

/** 状態キー用の見出しと dialog の有無 */
export function pageFactsInPage({ ignoreSelectors }) {
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    return el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  };
  const ignored = (el) => ignoreSelectors.some((s) => el.closest(s));
  const headings = [...document.querySelectorAll('h1, h2, h3')].filter((h) => visible(h) && !ignored(h)).map((h) => norm(h.innerText)).filter(Boolean);
  const dialog = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]')].some(visible);
  // 画面名の基本名: 表示中の dialog の見出し > main 内の最初の見出し > h1 > title（設計 Q32）
  const firstHeading = (root) => {
    if (!root) return '';
    const labelled = root.getAttribute?.('aria-labelledby');
    if (labelled) {
      const t = labelled.split(/\s+/).map((id) => document.getElementById(id)?.innerText ?? '').join(' ');
      if (norm(t)) return norm(t);
    }
    const h = [...root.querySelectorAll('h1, h2, h3, h4')].find((x) => visible(x) && !ignored(x));
    return h ? norm(h.innerText) : '';
  };
  const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open], [aria-modal="true"]')].filter(visible);
  const mains = [...document.querySelectorAll('main, [role="main"]')].filter(visible);
  const h1 = [...document.querySelectorAll('h1')].find(visible);
  const heading = firstHeading(dialogs[dialogs.length - 1]) || mains.map(firstHeading).find(Boolean) || (h1 ? norm(h1.innerText) : '');
  return { headings, dialog, title: document.title, heading };
}

/** 操作前に呼ぶ。DOM 変化（ignoreSelectors 配下を除く）の最終時刻と追加要素を記録する */
export function installTrackerInPage({ ignoreSelectors }) {
  if (window.__stgObserver) window.__stgObserver.disconnect();
  const st = { last: performance.now(), added: [] };
  window.__stg = st;
  const ign = (n) => {
    const el = n.nodeType === 1 ? n : n.parentElement;
    return !el || ignoreSelectors.some((s) => el.closest(s));
  };
  const obs = new MutationObserver((ms) => {
    let relevant = false;
    for (const m of ms) {
      if (ign(m.target)) continue;
      relevant = true;
      for (const n of m.addedNodes) if (n.nodeType === 1 && !ign(n)) st.added.push(n);
    }
    if (relevant) st.last = performance.now();
  });
  obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__stgObserver = obs;
}

/** 静止判定用の状態 */
export function quietStateInPage({ loadingSelectors }) {
  const st = window.__stg;
  const loading = loadingSelectors.some((s) =>
    [...document.querySelectorAll(s)].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true);
    }),
  );
  return { installed: Boolean(st), since: st ? performance.now() - st.last : 0, loading, ready: document.readyState === 'complete' };
}

/**
 * 直前の操作で追加された要素が見える位置へスクロールする（設計 Q16）。
 * 追加要素群が viewport に収まれば中央へ、収まらなければ上端を viewport 上端から 15% の位置へ。
 */
export function scrollToChangeInPage({ ignoreSelectors }) {
  const st = window.__stg;
  if (!st) return { scrolled: false };
  const ign = (el) => ignoreSelectors.some((s) => el.closest(s));
  const els = st.added.filter((e) => e.isConnected && !ign(e) && e.getBoundingClientRect().height > 0);
  if (!els.length) return { scrolled: false };
  const last = els[els.length - 1];
  // 内部スクロールコンテナ内の追加であれば、コンテナ側をスクロールする
  for (let a = last.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight) {
      last.scrollIntoView({ block: 'nearest' });
      break;
    }
  }
  const rects = els.map((e) => e.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top)) + window.scrollY;
  const bottom = Math.max(...rects.map((r) => r.bottom)) + window.scrollY;
  const vh = window.innerHeight;
  const h = bottom - top;
  const y = h <= vh ? top + h / 2 - vh / 2 : top - vh * 0.15;
  window.scrollTo(0, Math.max(0, y));
  return { scrolled: true, top, bottom };
}

export function pageMetricsInPage() {
  const se = document.scrollingElement || document.documentElement;
  return { scrollY: window.scrollY, innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollHeight: Math.ceil(se.scrollHeight) };
}
