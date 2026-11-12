# config.json 仕様

`<run_dir>/screen-transition-generator/config.json` に置く（`--config` で変更可）。不正な値があると実行前に `CONFIG_INVALID` で停止する。未知のキーもエラーになる。

## 全項目

| キー | 型 | 既定値 | 説明 |
|---|---|---|---|
| `baseUrl` | string | （必須） | アプリの URL（`http://` / `https://`） |
| `start.url` | string | `baseUrl` | 開始 URL。絶対 URL または `baseUrl` からの相対パス |
| `start.steps` | Step[] | `[]` | 開始画面に到達するための事前操作。図には載らない |
| `viewport` | `{width, height}` | `1920×1080` | 撮影解像度。部分指定可 |
| `internalOrigins` | string[] | 開始URLと baseUrl の origin | アプリ内とみなす origin。これ以外への遷移・新しいタブは外部画面（終端） |
| `actionRoots` | (string \| `{selector, pick}`)[] | `["body"]` | 探索対象の領域（CSS セレクタ）。`pick: "last"` は一致した最後の要素だけを対象にする（チャットの最新メッセージなど）。状態の識別にも同じ範囲を使う |
| `ignoreSelectors` | string[] | `[]` | 常に変化する要素（時計・タイムスタンプ等）。状態識別・表示安定判定の対象外 |
| `ignoreQueryParams` | string[] | `[]` | 状態識別で無視するクエリパラメータ |
| `loadingSelectors` | string[] | `[]` | ローディング表示。表示中は撮影しない |
| `scenarios` | Scenario[] | `[]` | 固定テキストによるシナリオ再現 |
| `safety.allow` | string[] | `[]` | 危険キーワード判定より優先して「安全」とみなすラベル（部分一致） |
| `safety.deny` | string[] | `[]` | 追加で「危険」とみなすラベル（部分一致） |
| `limits.maxScreens` | number | 50 | 最大画面数 |
| `limits.maxTransitions` | number | 200 | 最大遷移数 |
| `limits.maxDepth` | number | 10 | 最大探索深度（開始画面からの操作回数） |
| `limits.maxDurationSec` | number | 1800 | 最大実行時間（秒） |
| `limits.actionTimeoutMs` | number | 10000 | 1 操作あたりのタイムアウト（クリック・表示安定待ち） |
| `display.scale` | number | 0.5 | draw.io 上の表示倍率（0〜1）。画像は原寸で埋め込むため拡大すれば読める |
| `display.collapseCommonActions` | boolean | true | 共通ナビゲーションの矢印を代表 1 本に集約し、残りを非表示レイヤーへ |
| `quietMs` | number | 400 | DOM が何ミリ秒変化しなければ「表示が安定した」とみなすか |
| `connectTimeoutSec` | number | 30 | `baseUrl` への接続待ち（秒） |

上限に到達した場合はエラー（探索未完了）として停止する。

## Step（操作）記法

要素は「role ＋ アクセシブルネーム（＋同名内の順番 `nth`、0 始まり）」で指定する。`probe` の `allInteractive` に出る `role` / `name` をそのまま使う。

```json
{ "click": { "role": "button", "name": "送信" } }
{ "click": { "role": "link", "name": "詳細", "nth": 1 } }
{ "fill":  { "role": "textbox", "name": "メッセージ" }, "text": "デモ開始" }
{ "press": { "role": "textbox", "name": "メッセージ" }, "key": "Enter" }
{ "goto": "/chat" }
```

対応 role: `button`, `link`, `textbox`, `combobox`, `checkbox`, `radio`, `tab`, `menuitem`, `option`, `searchbox`

## Scenario（固定テキストシナリオ）

```json
{
  "name": "固定テキスト「デモ開始」",
  "from": "start",
  "steps": [
    { "fill": { "role": "textbox", "name": "メッセージ" }, "text": "デモ開始" },
    { "click": { "role": "button", "name": "送信" } }
  ]
}
```

- `from` は初期版では `"start"` のみ。
- 開始画面からステップを実行し、到達した画面をノードとして追加する（既存の画面と同じ状態なら統合）。到達先からは通常どおり探索を続ける。
- 矢印の起点は最後の `click` ステップの要素（click が 1 つ以上必要）。
- シナリオに書いた操作は危険キーワード判定の対象外（エージェントがソースを読んで安全と判断した明示操作として扱う）。
- 入力値はソースコードから見つけた固定テキストに限る。自由入力の網羅的な探索はしない。

## 例（チャットアプリ）

`examples/sample-config.json` を参照。
