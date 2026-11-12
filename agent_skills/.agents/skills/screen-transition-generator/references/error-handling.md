# エラー処理

エラーが発生したら探索を停止する。自動の回避策で探索を続けない。スクリプトは次を行う。

- stdout に JSON（`status: "error"`, `kind`, `title`, `where`, `message`, `causes`, `fixes`, `errorReport`）
- `error-report.md` を出力（要件の報告形式）
- 終了コード 1
- 途中までの `graph.json`・`images/`・`execution.log` は診断用に残す（探索は未完了として扱う。draw.io は生成しない）

エージェントは error-report.md を読み、必要に応じて execution.log・途中画像・ソースコードを確認して、より具体的な原因と解決策をユーザーに提示して停止する。

## エラー種別

| kind | 種別 | 主な原因 | 推奨する解決方法 |
|---|---|---|---|
| `CONFIG_INVALID` | 設定ファイル不正 | config.json の形式・値の誤り | `references/config.md` を参照して修正 |
| `CONNECTION` | 接続失敗 | アプリ未起動、ポート違い | `docker compose ps` で状態確認、`baseUrl` と公開ポートを確認 |
| `START_SCREEN` | 開始画面特定失敗 | `start.url` / `start.steps` が実画面と不一致、指示が曖昧 | `probe` で確認して修正。曖昧ならユーザーに確認 |
| `ACTION_NOT_FOUND` | ボタン検出失敗 | DOM 構造・ラベルが記録時と異なる | `probe` で候補を確認、`actionRoots` を見直す |
| `CLICK_FAILED` | クリック失敗 | 非表示・無効化・他要素との重なり | `--headed` で目視確認、オーバーレイの有無を確認 |
| `TRANSITION_UNSTABLE` | 画面遷移判定失敗 | 常に変化する要素、終わらないローディング | `ignoreSelectors` / `loadingSelectors` に追加、`actionTimeoutMs` を延長 |
| `STATE_RESTORE` | 画面状態復元エラー | 初期化されない状態、サーバー側の状態、毎回変わる応答 | 新しいコンテキストで同じ状態になるか、モックの状態管理、ボタンの表示条件を確認 |
| `SCENARIO_FAILED` | シナリオ再現エラー | 入力欄・ボタン・固定テキストの不一致 | ソースの固定テキスト定義を再確認し `scenarios` を修正 |
| `HTTP_ERROR` | 遷移先エラー | 遷移先が HTTP 400 以上 | ルーティング・サーバーログを確認 |
| `SCREENSHOT_FAILED` | スクリーンショット失敗 | 描画・保存の失敗 | 出力先の権限・空き容量を確認 |
| `EXTERNAL_CAPTURE_FAILED` | 外部リンク撮影失敗 | 外部サイトへの接続制限 | ネットワークを確認、不要なら `safety.deny` に追加 |
| `LIMIT_REACHED` | 探索上限到達 | 状態の増えすぎ（ループ・識別が細かすぎる）、上限が小さい | graph.json と画像で同一とみなすべき画面を確認、`actionRoots` / `ignoreSelectors` で絞る、必要なら `limits` を引き上げる |
| `DRAWIO_FAILED` | draw.io生成失敗 | graph.json の不正、画像の欠落 | graph.json と images/ の対応を確認 |
| `INTERNAL` | 内部エラー | スクリプトの想定外のエラー | execution.log とエラー内容を確認 |

## 報告形式

```text
エラー種別：
画面状態復元エラー

発生箇所：
screen-005 の再現処理（「料金を知りたい」の後）

エラー内容：
「料金を知りたい」の操作後の画面状態が記録時と一致しません。

想定原因：
1. 画面状態が初期化されていない可能性があります。
2. ...

推奨する解決方法：
1. 初期画面へ戻る処理を確認してください。
2. ...

処理結果：
探索を停止しました。
```
