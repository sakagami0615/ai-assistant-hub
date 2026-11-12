// 操作候補の安全判定（要件 Q13 / 15.2）。データ変更につながりうる操作は実行しない。

// 日本語は部分一致、英語は単語境界で判定する。
const JA_KEYWORDS = ['削除', '消去', '保存', '更新', '購入', '注文', '決済', '支払', '送信', '登録', '退会', 'ログアウト', 'サインアウト', '破棄', '初期化', 'リセット', '確定', '申込', '申し込'];
const EN_KEYWORDS = ['delete', 'remove', 'erase', 'destroy', 'save', 'update', 'buy', 'purchase', 'order', 'checkout', 'pay', 'payment', 'submit', 'send', 'register', 'signup', 'sign up', 'unsubscribe', 'logout', 'log out', 'sign out', 'signout', 'reset', 'discard', 'confirm'];

const EN_RE = new RegExp(`(^|[^a-z])(${EN_KEYWORDS.map((k) => k.replace(/ /g, '[ _-]?')).join('|')})(?=$|[^a-z])`, 'i');

function texts(c) {
  const attrs = c.attrs ?? {};
  return [c.name, attrs['aria-label'], attrs.title, attrs.value, ...Object.entries(attrs).filter(([k]) => k.startsWith('data-')).map(([, v]) => v)]
    .filter((v) => typeof v === 'string' && v.length > 0);
}

function matchesPattern(c, patterns) {
  return patterns.some((p) => texts(c).some((t) => t.includes(p)));
}

/**
 * @param {{role: string, name: string, href?: string, type?: string, formMethod?: string, attrs?: Record<string,string>}} c
 * @param {{allow?: string[], deny?: string[]}} [safety]
 * @returns {{safe: boolean, reason?: string}}
 */
export function judgeAction(c, safety = {}) {
  const allow = safety.allow ?? [];
  const deny = safety.deny ?? [];
  if (matchesPattern(c, deny)) return { safe: false, reason: '危険操作（safety.deny に一致）' };
  if (matchesPattern(c, allow)) return { safe: true };

  const href = c.href ?? '';
  if (/^mailto:/i.test(href)) return { safe: false, reason: '危険操作（メール送信リンク）' };
  if (/^tel:/i.test(href)) return { safe: false, reason: '危険操作（電話発信リンク）' };
  if (c.attrs && 'download' in c.attrs) return { safe: false, reason: '危険操作（ファイルダウンロード）' };
  if (c.type === 'submit' && (c.formMethod ?? '').toLowerCase() === 'post') return { safe: false, reason: '危険操作（POST フォーム送信）' };

  for (const t of texts(c)) {
    const ja = JA_KEYWORDS.find((k) => t.includes(k));
    if (ja) return { safe: false, reason: `危険操作（キーワード「${ja}」）` };
    const en = t.match(EN_RE);
    if (en) return { safe: false, reason: `危険操作（キーワード「${en[2]}」）` };
  }
  return { safe: true };
}
