---
name: screen-transition-generator
description: ローカルで動く Web アプリケーションの画面遷移図を、実際のスクリーンショット付きの draw.io ファイルとして自動生成するときに使用する。自然言語で指定された開始画面から Playwright でボタン・リンクを探索し、ボタン位置から遷移先画面へ矢印を引いた編集可能な図と PNG を出力する。
---

# Screen Transition Generator

## 配置

AI エージェント共通の一次配置:

```text
.agents/skills/screen-transition-generator/
```

Claude Code のプロジェクト用配置（一次配置へのシンボリックリンクを推奨）:

```text
.claude/skills/screen-transition-generator/
```

GitHub Copilot CLI のプロジェクト用配置（同上）:

```text
.github/skills/screen-transition-generator/
```

コピーではなくシンボリックリンクを使う。コピーすると `scripts/node_modules` やバージョンが二重管理になる。

以下、この SKILL.md があるディレクトリを `<skill_dir>`、エージェントを実行しているディレクトリを `<run_dir>` と書く。

## 絶対に守る制約

- 対象アプリのソースコード・設定ファイル・環境変数・モックデータは **読み取りのみ**。変更しない。
- `docker compose down` / `rm` / `-v` など、既存コンテナ・ボリュームを停止・削除する操作はしない。起動済みのアプリは再起動しない。
- データの削除・保存・更新・購入・送信などにつながる操作はしない（スクリプトが危険操作を自動でスキップする）。
- エラーが発生したら **停止** する。自動回避や推測による補完で探索を続けない。
- コードから推測しただけの遷移を、検証済みの遷移として扱わない（図に載るのはブラウザで実際に操作した結果だけ）。
- 対象はローカル環境のみ。本番環境・認証が必要な画面は対象外。

## 成果物

`<run_dir>/screen-transition-generator/` に出力する。

```text
screen-transition-generator/
├── config.json               # 探索設定（エージェントが作成）
├── screen-transition.drawio  # 画面遷移図（画像埋め込み・編集可能）
├── images/screen-NNN.png     # 元解像度のスクリーンショット
├── graph.json                # 中間データ（画面・遷移・スキップした操作）
├── summary.md                # 結果概要（正常終了時）
├── execution.log             # 実行ログ（JSON Lines）
├── error-report.md           # エラー時のみ
└── .history/<日時>/           # 再実行時に退避された前回の成果物
```

## ワークフロー

### ⓪ 前提確認（初回のみ）

```bash
cd <skill_dir>/scripts && npm ci
npx playwright install chromium   # Chromium が未導入の場合のみ
```

Node.js 20 以上が必要。

### ① 依頼の解釈

- 開始画面（例:「チャットの初期画面」）、探索してほしい範囲（例:「レコメンドボタン」）、解像度の指定（既定 1920×1080）を把握する。

### ② アプリケーション構成の調査（読み取りのみ）

次を確認する。詳細は `references/exploration-rules.md`。

- Docker Compose 構成（サービス名・公開ポート・healthcheck）
- ルーティング定義、画面コンポーネント
- ボタン・リンクのイベントハンドラー、レコメンドボタンの生成処理
- 固定モックデータ・シナリオ定義（特定の入力文で固定応答が出る条件）
- 常に変化する要素（時計・タイムスタンプ）、ローディング表示
- フロントエンドとバックエンドが別ポートかどうか（`internalOrigins` に使う）

コード解析が難しい場合は、ブラウザ操作（⑤の `probe`）中心に切り替えてよい。ただし必要な固定テキストや開始画面が特定できない場合は、ユーザーに確認する。

### ③ アプリケーションの起動（必要な場合のみ）

```bash
docker compose ps                 # 既に起動していれば何もしない
docker compose up -d --wait       # 未起動の場合（healthcheck が無ければ --wait なし）
```

起動に失敗したらエラーとして停止し、原因と解決策を提示する。

### ④ config.json の作成

`<run_dir>/screen-transition-generator/config.json` を作成する。仕様は `references/config.md`、例は `examples/sample-config.json`。

- `baseUrl` / `start`（開始 URL と、開始画面に到達するための事前操作）
- `actionRoots`: 探索対象の領域。チャットでは「最新のボットメッセージ」を `{ "selector": "...", "pick": "last" }` で指定し、過去メッセージのボタンを対象外にする
- `ignoreSelectors`: 時計・タイムスタンプなど常に変化する要素
- `loadingSelectors`: ローディング表示
- `scenarios`: ソースコードで見つけた固定テキストシナリオ（入力欄・入力値・送信ボタン）
- `internalOrigins`: アプリ内とみなす origin（別ポートの API など）
- `viewport`: ユーザーが解像度を指定した場合

### ⑤ probe で確認・調整

```bash
node <skill_dir>/scripts/stg.mjs probe
node <skill_dir>/scripts/stg.mjs probe --click "button:料金を知りたい"   # 1 段進めた状態を確認
```

stdout の JSON（`candidates` = 探索対象の操作と安全判定、`allInteractive` = 入力欄を含む全操作要素、`headings`）と、`screen-transition-generator/probe.png` を確認する。開始画面が意図どおりか、探索対象のボタンが `candidates` に入っているか、不要な要素が入っていないかを見て、config を調整する。開始画面が一意に特定できない場合はユーザーに確認する。

### ⑥ 実行

```bash
cd <run_dir> && node <skill_dir>/scripts/stg.mjs run
```

- 既存の成果物は `.history/<日時>/` へ退避されてから新規生成される（config.json はそのまま残る）。
- デバッグ時は `--headed` でブラウザを表示できる。

### ⑦ 失敗した場合（終了コード 1）

1. stdout の JSON と `error-report.md` を読む。
2. 必要に応じて `execution.log`、途中までの `graph.json` と `images/` を確認する。
3. 次の形式でユーザーに報告し、**停止する**（自動で回避策を試さない）。エラー種別ごとの解決策は `references/error-handling.md`。

```text
エラー種別： / 発生箇所： / エラー内容： / 想定原因： / 推奨する解決方法： / 処理結果：探索を停止しました。
```

探索上限到達（`LIMIT_REACHED`）も正常終了ではない。「探索未完了」として報告する。

### ⑧ 成功した場合

`summary.md` を基に次を報告する。

- 成果物の絶対パス（`.drawio`・`images/`）
- 画面数・遷移数・外部画面
- スキップした操作（危険操作として実行しなかったもの）
- 警告（画像外のボタン、アプリの JavaScript エラーなど）

画面名を整えたい場合は `graph.json` の `screens[].name` を編集し、次を実行する（再探索しない）。

```bash
node <skill_dir>/scripts/stg.mjs generate
```

## 参照資料

| ファイル | 内容 |
|---|---|
| `references/config.md` | config.json の全項目・ステップ記法 |
| `references/exploration-rules.md` | 探索アルゴリズム・状態の識別・安全判定・外部リンク・上限 |
| `references/drawio-format.md` | draw.io 出力形式・矢印の接続方式・レイアウト・制限事項 |
| `references/error-handling.md` | エラー種別と推奨する解決方法 |
| `examples/sample-config.json` | チャットアプリ向けの config 例 |
