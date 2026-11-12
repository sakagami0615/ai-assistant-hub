# 探索ルール

## アプリケーション構成の調査観点（エージェント）

| 観点 | 目的 | config への反映 |
|---|---|---|
| Docker Compose（サービス・ポート・healthcheck） | 起動と接続先 | `baseUrl` |
| ルーティング定義・画面コンポーネント | 画面一覧・開始画面の特定 | `start` |
| ボタン・リンクのハンドラー、レコメンド生成処理 | 探索対象領域 | `actionRoots` |
| 固定モック・シナリオ定義 | 固定テキストの発見 | `scenarios` |
| 時計・タイムスタンプ・アニメーション | 誤検出防止 | `ignoreSelectors` |
| ローディング表示 | 撮影タイミング | `loadingSelectors` |
| API の別ポート・別ホスト | 内部/外部の境界 | `internalOrigins` |

ソースコードは読み取りのみ。コードから推測した遷移は図に載せない（ブラウザで実際に操作した結果だけを記録する）。

## 探索アルゴリズム（BFS）

1. `baseUrl` に接続できるまで最大 `connectTimeoutSec` 秒待つ。
2. 新しいブラウザコンテキストで `start.url` を開き、`start.steps` を実行して開始画面を観測する。
3. `scenarios` を実行し、到達画面をキューに入れる。
4. キューから画面を取り出し、その画面の操作候補（`actionRoots` 内のボタン・リンク、DOM 順）を 1 つずつ試す。
   - 試すたびに **新しいブラウザコンテキスト** で開始画面から経路を再実行して状態を復元する（cookie・localStorage は空から開始）。
   - 経路の各ステップの後で状態キーを照合し、記録時と異なれば「状態復元エラー」で停止する。
5. 操作結果を判定する。
   - 状態が変わらない → 図に描かず `noChangeActions` に記録
   - 既知の状態 → 矢印だけ追加（画面は統合）
   - 新しい状態 → 観測（撮影）して画面を追加し、キューに入れる
   - 外部 origin への遷移・新しいタブ → 最初の画面だけ撮影して終端ノードにする
6. キューが空になれば完了。画面 ID は発見順、操作は DOM 順なので、同じ入力なら同じ結果になる。

サーバー側の状態はリセットしない。サーバー側に状態が残るアプリでは、照合で不一致が検出されて停止する。

## 操作候補

- 対象要素: `button`, `a[href]`, `[role=button]`, `[role=link]`, `input[type=button|submit|reset]`
- 除外: 非表示（サイズ 0・`display:none`・`visibility:hidden`・`opacity:0`）、無効（`disabled`・`aria-disabled=true`・`inert`）、`ignoreSelectors` 配下、モーダル（`aria-modal=true` / `dialog[open]`）表示中のモーダル外要素
- 要素の識別: role ＋ アクセシブルネーム（`aria-label` > `aria-labelledby` > テキスト > `alt` > `title`）＋ 同名内の順番

## 画面状態の識別（状態キー）

次を SHA-1 でハッシュ化する。チャット本文・タイムスタンプは含めない。

- URL（origin + path + query + hash。query は順序を正規化、`ignoreQueryParams` は除外）
- `actionRoots` 内の操作可能要素の「role:ラベル」の **集合**（順序・重複は無視、空白は正規化）
- 表示中の h1〜h3 見出し
- ダイアログ（`role=dialog` 等）表示の有無

これにより、同じ選択肢が表示されている画面は統合され、文字列の細かな違いで画面が無限に増えることを防ぐ。見た目が似ていても選択肢や見出しが違えば別画面になる。

## 表示安定の判定

操作後、次をすべて満たしたら撮影する。`limits.actionTimeoutMs` 以内に満たさなければ「画面遷移判定失敗」。

1. ナビゲーションが発生した場合は `load` 完了
2. DOM 変化（`ignoreSelectors` 配下を除く）が `quietMs` 間ない
3. `loadingSelectors` の要素が表示されていない

固定時間の待機には頼らない。撮影時はアニメーション停止・キャレット非表示。

## 撮影とボタン座標

状態に **初めて到達した瞬間** に、スクロール調整・操作候補の座標取得・撮影をまとめて行う（座標と画像が必ず一致する）。

- スクロール: 直前の操作で追加された要素群が viewport に収まれば中央へ、収まらなければ上端を viewport 上端から 15% の位置へ。内部スクロールコンテナ内の追加は、コンテナ側をスクロールする。
- 操作候補が viewport 外にある（ページ全体のスクロールで届く）場合は、viewport を縦に拡張してページ全体を撮影する。
- 内部スクロールコンテナ内で見えないボタンは、座標を画像の端に寄せて `offscreen` として警告する。

## 安全判定（危険操作のスキップ）

次に該当する操作は実行せず、`skippedActions` と summary に記録する（エラーにはしない）。

- ラベル・`aria-label`・`title`・`value`・`data-*` に危険キーワードを含む
  - 日本語（部分一致）: 削除, 消去, 保存, 更新, 購入, 注文, 決済, 支払, 送信, 登録, 退会, ログアウト, サインアウト, 破棄, 初期化, リセット, 確定, 申込, 申し込
  - 英語（単語単位）: delete, remove, erase, destroy, save, update, buy, purchase, order, checkout, pay, payment, submit, send, register, sign up, unsubscribe, logout, log out, sign out, reset, discard, confirm
- `mailto:` / `tel:` リンク、`download` 属性付きリンク
- POST フォームの submit
- `safety.deny` に一致

`safety.allow` に一致するものは安全とみなす。`scenarios` の操作は判定の対象外。操作の結果ダウンロードが発生した場合もスキップとして記録する。

## 外部リンク

- `internalOrigins` 以外への遷移、または新しいタブ（popup）は外部画面。
- 外部画面は `load` 後に撮影するだけで、中の操作は探索しない（終端ノード）。同じ URL は 1 ノードに統合。
- 外部画面を表示できない（オフライン等）・HTTP 400 以上は停止。

## その他の挙動

| 事象 | 扱い |
|---|---|
| `alert` / `confirm` / `prompt` | 常にキャンセルして記録し、探索は続ける |
| アプリの JavaScript エラー | 停止しない。summary の警告に一覧表示 |
| 内部遷移先が HTTP 400 以上 | 「遷移先エラー」で停止 |
| 上限到達 | 「探索上限到達」で停止（探索未完了） |
