# screen-transition-generator お試し環境

`screen-transition-generator` スキルを試すための、チャット形式のモック Web アプリです。Docker Compose で起動します。応答はすべて固定のモックデータで、データの保存・送信は行いません。

## 構成

| サービス | URL | 役割 |
|---|---|---|
| `app` | http://localhost:18080 | チャット SPA（nginx で静的配信） |
| `external` | http://localhost:18081 | 「外部サイト」役（ヘルプセンター・利用規約） |

ポートは環境変数 `STG_APP_PORT` / `STG_EXTERNAL_PORT` で変更できます。`STG_EXTERNAL_PORT` を変える場合は `app/config.js` の `externalUrl` も合わせて変更してください。

## スキルの確認ポイント

| アプリの要素 | 確認できるスキルの挙動 |
|---|---|
| レコメンドボタン（料金・使い方・担当者 → 下位の選択肢） | URL が変わらない状態遷移の探索、最新メッセージだけを対象にする `actionRoots`（`pick: "last"`） |
| 「無料プランの詳細」「有料プランの詳細」→ 同じ選択肢 | 同じ状態の画面の統合 |
| 「他の質問をする」「最初に戻る」「新しいチャット」 | 開始画面への合流（破線の矢印）、変化なし操作の記録 |
| 「使い方を知りたい」の長い回答 | 変化部分へのスクロールと撮影 |
| 300ms の遅延応答とローディング表示 | 表示安定待ち（`loadingSelectors`） |
| ヘッダーの時計・メッセージのタイムスタンプ | 常に変化する要素の除外（`ignoreSelectors`） |
| 「設定」「詳しい手順を見る」 | URL 遷移（別ページ） |
| 「このアプリについて」 | モーダルダイアログ（`role=dialog`） |
| 「ヘルプ」/「利用規約」（新しいタブ） | 外部リンク（最初の画面だけ撮影して終端） |
| 「履歴を削除」「保存」「お問い合わせ」（mailto） | 危険操作のスキップ |
| 入力欄に「デモ開始」と入力して送信 | 固定テキストシナリオ（`scenarios`） |
| ヘッダーのメニュー（全画面に共通） | 共通ナビゲーションの矢印の集約（非表示レイヤー） |

## 使い方

```bash
# 1. 起動
cd agent_skills/examples/screen-transition-generator
docker compose up -d --wait

# 2. 初回のみ: スクリプトの依存をインストール
(cd ../../.agents/skills/screen-transition-generator/scripts && npm ci && npx playwright install chromium)

# 3. 作業ディレクトリに config.json を置いて実行
mkdir -p /tmp/stg-demo/screen-transition-generator
cp config.json /tmp/stg-demo/screen-transition-generator/
cd /tmp/stg-demo
node <リポジトリ>/agent_skills/.agents/skills/screen-transition-generator/scripts/stg.mjs run

# 4. 結果
#   /tmp/stg-demo/screen-transition-generator/screen-transition.drawio を draw.io で開く
#   /tmp/stg-demo/screen-transition-generator/summary.md に概要

# 5. 停止（このお試し環境のみ）
docker compose down
```

エージェントから試す場合は、例えば次のように依頼します。

> agent_skills/examples/screen-transition-generator のチャットアプリについて、初期画面から画面遷移図を生成してください。レコメンドボタンを操作して到達できる画面を探索してください。

## 想定される結果

12 画面（うち外部 2）、約 50 遷移（表示されるのは共通ナビゲーションを集約した約 20 本）。危険操作「履歴を削除」「保存」「お問い合わせ」はスキップされます。所要時間は 2 分程度です。
