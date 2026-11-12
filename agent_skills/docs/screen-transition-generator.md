# Screen Transition Generator

## 概要

Screen Transition Generatorは、ローカルで動くWebアプリケーションの画面遷移図を、実際のスクリーンショット付きのdraw.ioファイルとして自動生成するSkillです。

ユーザーが自然言語で開始画面を指定すると、AIエージェントがソースコードを読み取ってアプリケーションの構造を理解し、必要に応じてDocker Composeでアプリを起動します。その後、Playwrightで実際にブラウザを操作してボタン・リンクを探索し、**スクリーンショット内のボタン位置から遷移先の画面へ矢印を引いた**画面遷移図を出力します。

出力したdraw.ioファイルは、画像の移動・拡大縮小や矢印の調整など、後から人が自由に編集できます。

## 利用する場面

- 自作Webアプリの画面遷移を、実際の画面のスクリーンショットで可視化したい
- チャット画面のレコメンドボタンなど、URLが変わらない状態遷移も含めて整理したい
- 仕様書・レビュー資料に載せる画面遷移図を、手作業でなく実際の動作から作りたい
- 固定モックのシナリオ（特定の入力文で決まった応答が出る）を含めて画面を網羅したい

## 対象と対象外

| 対象 | 初期版の対象外 |
| --- | --- |
| ローカル環境のWebアプリ | 本番環境・検証環境 |
| Docker Composeで起動するアプリ | 認証が必要な画面 |
| ボタン・リンクによる画面遷移・状態遷移 | 実際のLLM応答の完了待ち |
| チャットのレコメンドボタン | 自由入力の網羅的な探索 |
| 固定モックの応答・固定テキストのシナリオ | 既存draw.ioファイルの差分更新 |
| 外部リンクの遷移先（最初の画面のみ撮影） | 外部サイト内の探索 |

## 基本的な流れ

1. 依頼を解釈し、開始画面・探索範囲・解像度を把握します。
2. ソースコード（読み取りのみ）とDocker Compose構成を調べ、画面構造・レコメンドボタンの生成処理・固定テキスト・常に変化する要素を把握します。
3. アプリが起動していなければ `docker compose up -d` で起動します。
4. 探索設定 `config.json` を作成します。
5. `probe` コマンドで開始画面と探索対象のボタンを確認し、設定を調整します。
6. `run` コマンドで探索と図の生成を行います。
7. 結果（または停止したエラーの原因と解決方法）を報告します。

AIエージェントは「アプリの理解・開始画面の特定・設定の作成・エラーの分析」を担当し、ブラウザ操作・画面の識別・座標計算・レイアウト・draw.io生成は補助スクリプト（Node.js）が決定的に処理します。

## 補助スクリプト

```bash
node <skill_dir>/scripts/stg.mjs probe     # 開始画面（--click で辿った先）の操作候補と安全判定を確認
node <skill_dir>/scripts/stg.mjs run       # 探索 → 図の生成（explore + generate）
node <skill_dir>/scripts/stg.mjs explore   # 探索のみ（graph.json と画像）
node <skill_dir>/scripts/stg.mjs generate  # graph.json から図を再生成（画面名の編集を反映）
```

初回のみ `<skill_dir>/scripts` で `npm ci` が必要です（Playwright 1.62.1、Chromium）。

## 探索の仕組み

- 探索は幅優先探索（BFS）で、開始画面に近い画面から順に調べます。
- 操作のたびに新しいブラウザコンテキストで開始画面から操作経路を再実行し、各ステップ後に画面状態が記録時と一致するかを検証します。
- 画面の同一性は「URL・操作可能なボタンの集合・見出し・ダイアログの有無」で判定します。チャット本文の細かな違いでは別画面にならず、選択肢が変われば別画面になります。
- チャットでは、探索対象を「最新のメッセージ」に絞る設定（`actionRoots` の `pick: "last"`）で、過去のメッセージのボタンによる状態の爆発を防ぎます。
- 操作後はDOMの変化が止まり、ローディング表示が消えるまで待ってから撮影します。新しく表示された部分が見える位置までスクロールします。
- 外部サイトへのリンクと新しいタブは、最初の画面だけ撮影して終端にします。

## 安全性

- ソースコード・設定ファイルは変更しません。既存のコンテナ・ボリュームは停止・削除しません。
- 「削除」「保存」「購入」「送信」「ログアウト」などの危険なキーワードを含む操作、`mailto:` リンク、POSTフォームの送信は実行せず、スキップした操作として報告します。
- エラーが発生したら探索を停止し、原因と推奨する解決方法を提示します。探索上限への到達も「探索未完了」のエラーとして扱います。

## 出力

```text
<実行ディレクトリ>/screen-transition-generator/
├── config.json               # 探索設定
├── screen-transition.drawio  # 画面遷移図（画像埋め込み・編集可能）
├── images/screen-NNN.png     # 元解像度のスクリーンショット（既定 1920×1080）
├── graph.json                # 画面・遷移の中間データ
├── summary.md                # 結果概要
├── execution.log             # 実行ログ
└── error-report.md           # エラー時のみ
```

再実行すると前回の成果物は `.history/<日時>/` に退避され、毎回新規に生成されます。

## 画面遷移図の特徴

- 各画面は実際のスクリーンショットです。原寸のPNGを埋め込み、表示は50%に縮小しています（draw.ioで拡大すれば文字が読めます）。
- 矢印は、スクリーンショット内の実際のボタン位置（丸印）から遷移先の画面へ伸びます。起点は画像に対する相対座標なので、draw.io上で画像を移動・拡大縮小してもボタン位置から出続けます。
- 上から下へ（開始画面からの操作回数順）、左から右へ配置し、交差が少なくなるよう並べます。開始画面へ戻る遷移は破線です。
- ヘッダーのメニューなど全画面に共通する操作の矢印は代表の1本にまとめ、全件は非表示レイヤー「共通ナビゲーション（全件）」に入れます。

## お試し環境

`agent_skills/examples/screen-transition-generator/` に、Docker Composeで起動できるチャット形式のモックアプリと設定例があります。使い方は同フォルダのREADMEを参照してください。

## 関連ファイル

- Skill定義: `agent_skills/.agents/skills/screen-transition-generator/SKILL.md`
- 設定仕様: `agent_skills/.agents/skills/screen-transition-generator/references/config.md`
- 探索ルール: `agent_skills/.agents/skills/screen-transition-generator/references/exploration-rules.md`
- draw.io形式: `agent_skills/.agents/skills/screen-transition-generator/references/drawio-format.md`
- エラー処理: `agent_skills/.agents/skills/screen-transition-generator/references/error-handling.md`
- お試し環境: `agent_skills/examples/screen-transition-generator/`
