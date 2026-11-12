// エラー種別と報告形式（要件 14 章）。エラー時は探索を停止し、原因と解決策を提示する。

/** @type {Record<string, {title: string, causes: string[], fixes: string[]}>} */
export const ERROR_KINDS = {
  CONFIG_INVALID: {
    title: '設定ファイル不正',
    causes: ['config.json の形式・値が仕様と一致していません。'],
    fixes: ['references/config.md のスキーマを確認し、指摘された項目を修正してください。'],
  },
  CONNECTION: {
    title: '接続失敗',
    causes: ['アプリケーションが起動していない可能性があります。', 'baseUrl のポート設定が誤っている可能性があります。'],
    fixes: ['`docker compose ps` でコンテナの状態を確認してください。', 'config.json の baseUrl とアプリの公開ポートが一致しているか確認してください。'],
  },
  START_SCREEN: {
    title: '開始画面特定失敗',
    causes: ['開始URLまたは開始までの事前操作（start.steps）が実際の画面と一致していません。'],
    fixes: ['`stg probe` で開始画面の操作要素を確認し、start.url / start.steps を修正してください。', '開始画面の指定が曖昧な場合は、どの画面から始めるかを明確にしてください。'],
  },
  ACTION_NOT_FOUND: {
    title: 'ボタン検出失敗',
    causes: ['DOM構造やラベルが記録時と異なっています。', '要素の表示条件を満たしていない可能性があります。'],
    fixes: ['`stg probe` で現在の操作要素一覧を確認してください。', 'actionRoots の指定が正しいか確認してください。'],
  },
  CLICK_FAILED: {
    title: 'クリック失敗',
    causes: ['要素が非表示・無効化・他要素と重なっている可能性があります。'],
    fixes: ['`--headed` で実行し、対象要素の状態を目視確認してください。', 'オーバーレイやアニメーションが残っていないか確認してください。'],
  },
  TRANSITION_UNSTABLE: {
    title: '画面遷移判定失敗',
    causes: ['操作後に画面描画が安定しませんでした（常に変化する要素がある、ローディングが終わらない等）。'],
    fixes: ['時刻表示などの常時変化する要素を ignoreSelectors に追加してください。', 'ローディング表示を loadingSelectors に追加するか、limits.actionTimeoutMs を延ばしてください。'],
  },
  STATE_RESTORE: {
    title: '画面状態復元エラー',
    causes: ['画面状態が初期化されていない可能性があります。', 'サーバー側に状態が残っている、または操作結果が実行ごとに変わる可能性があります。'],
    fixes: ['初期画面へ戻る処理（新しいブラウザコンテキストでの再訪問）で同じ状態になるか確認してください。', 'モックの状態管理を確認してください。', '対象ボタンの表示条件を確認してください。'],
  },
  SCENARIO_FAILED: {
    title: 'シナリオ再現エラー',
    causes: ['固定テキストシナリオの入力欄・ボタン・入力値が実際のアプリと一致していません。'],
    fixes: ['ソースコードの固定テキスト定義を再確認し、config.json の scenarios を修正してください。'],
  },
  HTTP_ERROR: {
    title: '遷移先エラー',
    causes: ['遷移先のページが HTTP エラー（400以上）を返しました。'],
    fixes: ['遷移先URLが存在するか、アプリのルーティング・サーバーログを確認してください。'],
  },
  SCREENSHOT_FAILED: {
    title: 'スクリーンショット失敗',
    causes: ['ブラウザの描画またはファイル保存に失敗しました。'],
    fixes: ['出力先ディレクトリの書き込み権限と空き容量を確認してください。'],
  },
  EXTERNAL_CAPTURE_FAILED: {
    title: '外部リンク撮影失敗',
    causes: ['外部サイトへの接続制限、またはサイト側の制約により表示できませんでした。'],
    fixes: ['ネットワーク接続を確認してください。', '撮影が不要な外部リンクであれば safety.deny に追加してください。'],
  },
  LIMIT_REACHED: {
    title: '探索上限到達',
    causes: ['画面状態が過剰に増えている（ループ・状態識別の粒度が細かすぎる）可能性があります。', 'アプリの規模に対して上限値が小さい可能性があります。'],
    fixes: ['graph.json と images を確認し、同一とみなすべき画面が別画面になっていないか確認してください。', 'actionRoots / ignoreSelectors で状態識別の対象を絞ってください。', '必要であれば config.json の limits を引き上げてください。'],
  },
  DRAWIO_FAILED: {
    title: 'draw.io生成失敗',
    causes: ['graph.json の内容が不正、または画像ファイルが見つかりません。'],
    fixes: ['graph.json と images/ の対応を確認してください。'],
  },
  INTERNAL: {
    title: '内部エラー',
    causes: ['スクリプトの想定外のエラーです。'],
    fixes: ['execution.log とエラー内容を確認してください。'],
  },
};

export class StgError extends Error {
  /**
   * @param {keyof typeof ERROR_KINDS} kind
   * @param {{where: string, message: string, causes?: string[], fixes?: string[], detail?: unknown}} info
   */
  constructor(kind, { where, message, causes, fixes, detail }) {
    const def = ERROR_KINDS[kind];
    if (!def) throw new Error(`未知のエラー種別: ${kind}`);
    super(message);
    this.name = 'StgError';
    this.kind = kind;
    this.title = def.title;
    this.where = where;
    this.causes = causes ?? def.causes;
    this.fixes = fixes ?? def.fixes;
    this.detail = detail;
  }
}

/** 任意の例外を StgError に包む */
export function asStgError(err, where = '不明') {
  if (err instanceof StgError) return err;
  return new StgError('INTERNAL', { where, message: err?.message ?? String(err), detail: err?.stack });
}

/** @param {StgError} e */
export function formatErrorReport(e) {
  const list = (xs) => xs.map((x, i) => `${i + 1}. ${x}`).join('\n');
  return [
    '# 画面遷移図生成 エラーレポート',
    '',
    '```text',
    'エラー種別：',
    e.title,
    '',
    '発生箇所：',
    e.where,
    '',
    'エラー内容：',
    e.message,
    '',
    '想定原因：',
    list(e.causes),
    '',
    '推奨する解決方法：',
    list(e.fixes),
    '',
    '処理結果：',
    '探索を停止しました。',
    '```',
    '',
  ].join('\n');
}

/** @param {StgError} e */
export function toErrorJson(e) {
  return { status: 'error', kind: e.kind, title: e.title, where: e.where, message: e.message, causes: e.causes, fixes: e.fixes };
}
