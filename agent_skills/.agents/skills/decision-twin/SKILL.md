---
name: decision-twin
description: grilling や brainstorming などの明確化質問のラウンドに、ユーザーの代わりに判断記録（判断ノート・原則）を根拠として代理回答するとき、またはユーザーに質問して判断記録を蓄積するときに使用する。ユーザーが「decision-twin で答えて」「grilling を decision-twin で回して」「decision-twin で学習したい」のように明示したときだけ使う。
---

# decision-twin

明確化質問のラウンドを受け取り、ユーザーが過去に残した判断（`docs/decisions/` の判断ノートと既存 ADR、`docs/principles.md`）とリポジトリの事実だけを根拠に代理回答する。根拠で決まらない判断と高影響な判断はユーザーに確認し、ユーザーの回答を判断ノートに蓄積する。

入口は2つある。

- **代理回答**: 質問のラウンドを受け取ったとき。下の手順1〜9に従う。
- **学習**: ユーザーが学習を明示したとき（「decision-twin で学習したい」など）。手順は [learning.md](learning.md)。

代理回答の確定のさせ方は承認モードで決まる。既定の `require`（shadow mode）では、代理回答は参考表示であり、ユーザーが承認するまで何も確定しない。`auto` では代理回答一覧を自動で確定する。どちらのモードでもエスカレーション質問は必ずユーザーに聞く。メインエージェントは質問役でもあるので、質問への回答は必ずこの手順の twin-answerer を通して作る。自分の意見で埋めた回答はユーザーの決定ではない。

## 手順

### 1. 準備（セッションで最初の1回）

1. `.claude/agents/twin-answerer.md` と `.claude/agents/twin-verifier.md` があるか確認する。Claude Code で、ないときは `assets/templates/agents/` の2ファイルを `.claude/agents/` にコピーし、コピーしたことをユーザーに伝える（反映にはセッション再起動が必要な場合がある）。
2. 使う経路を決め、`isolation` として記録する。
   - 設置したサブエージェントを起動できる: `agent`
   - 起動できない（未反映、Codex など）: テンプレート本文を汎用サブエージェントへのプロンプトとして渡す。サブエージェント自体がない環境では、answerer の作業を終えて回答 JSON をファイルに書き出してから、verifier の作業を別の手順として行う。どちらも `prompt-only`
3. `.decision-twin/config.json` を読む。`confidence_threshold` があればその値、なければ `0.80` をしきい値にする。`approval` が `"auto"` なら承認モード auto、それ以外（未設定を含む）は `require`。
4. `.decision-twin/` がなければ作る。`.gitignore` に入っていなければ、追加するかをユーザーに一度だけ提案する。

**完了条件:** isolation、しきい値、承認モードが決まっている。

### 2. ラウンドを受け取る

1. ラウンドの各質問に `q-<ラウンド番号>-<連番>` の ID を振る。ラウンド番号は `.decision-twin/log.jsonl` の最大値 + 1。
2. 各質問を「質問文」と「質問役の推奨」に分ける。推奨（grilling の ➡️、選択肢に付いた「推奨」の印）は表示用のメモとしてだけ持ち、twin-answerer と twin-verifier には渡さない。

### 3. 分類する

各質問に class・impact・reversibility を付ける。

| class | 意味 |
| --- | --- |
| `REPO_FACT` | リポジトリや文書を調べれば分かる事実 |
| `EXISTING_DECISION` | 過去の判断記録で決まっているはずの判断 |
| `USER_PREFERENCE` | 優先順位や好みの判断。原則があれば答えられる |
| `NOVEL_COMMITMENT` | 将来に向けた新しい約束（互換維持期間、SLA、外部への公約など） |

- impact は `LOW` / `MEDIUM` / `HIGH`、reversibility は `EASY` / `COSTLY` / `IRREVERSIBLE`。
- DB スキーマ、公開 API の互換性、課金、セキュリティに関わる質問は impact を `HIGH` に固定する。
- 迷ったら厳しい側に倒す。impact は高い方、reversibility は戻しにくい方、`USER_PREFERENCE` と `NOVEL_COMMITMENT` で迷ったら `NOVEL_COMMITMENT`。

### 4. twin-answerer で代理回答を作る

twin-answerer を1回起動し、ラウンドの全質問をまとめて渡す。渡すのは次だけにする。

- 質問 ID と質問文の一覧
- リポジトリのルートパス
- 判断記録の場所: `docs/decisions/`（判断ノートと既存 ADR）、`docs/principles.md`、`~/.decision-twin/principles.md`（あれば。読み取り専用）

会話の流れ、質問役の推奨、分類結果は渡さない。前のラウンドで確定した回答は判断ノートに書かれているので、answerer が自分で読む。返り値は回答オブジェクトの JSON 配列（形式は [formats.md](formats.md)）。

### 5. twin-verifier で検査する

twin-verifier を起動し、各質問について「質問文・回答オブジェクト（evidence を含む）」を渡す。判定は `PASS` / `RETRY_RETRIEVAL` / `REASK` / `HUMAN_REQUIRED`。

- `RETRY_RETRIEVAL`（根拠が足りない・ずれている）: verifier の指摘だけを付けて、その質問を answerer に再度渡す。
- `REASK`（answerer が質問を取り違えた）: 誘導や推奨を含めずに質問を言い換え、answerer に再度渡す。
- 再試行は各質問1回まで。再試行後も `PASS` でなければ `HUMAN_REQUIRED` として扱う。

**完了条件:** 全質問に最終の verifier 判定と retries（0 か 1）がある。

### 6. エスカレーションを判定する

各質問を上から順に照らし、最初に当てはまった規則で「ユーザーに確認する」と確定する。どれにも当てはまらなければ代理回答一覧に入れる。

| # | 条件 |
| --- | --- |
| 1 | class が `NOVEL_COMMITMENT` |
| 2 | reversibility が `IRREVERSIBLE` |
| 3 | status が `UNKNOWN` |
| 4 | verifier の最終判定が `HUMAN_REQUIRED` |
| 5 | `conflicts` が空でない |
| 6 | impact が `HIGH` で、status が `FACT` / `EXPLICIT_DECISION` 以外 |
| 7 | status が `INFERRED` で、confidence がしきい値未満 |

**完了条件:** 全質問が「確認する（規則番号付き）」か「代理回答一覧」のどちらかに入っている。

### 7. ユーザーに表示する

[formats.md](formats.md) の「表示形式」に沿って、次の3部を1つのメッセージで出す。AskUserQuestion が使えるなら①に使ってよい。

1. エスカレーション質問
2. 代理回答一覧
3. 一覧をまとめて承認するか、上書き・保留する番号を指定してもらう依頼

承認モード auto では、②を「自動で確定した回答」として出し、③は上書きしたい番号だけを聞く。エスカレーション質問がなければ、①を省いてユーザーの返事を待たずに手順8へ進む。

### 8. 回答を記録する

ユーザーの回答を受けたら、[recording.md](recording.md) に沿って記録する。

1. 全質問について `.decision-twin/log.jsonl` に1行ずつ追記する。auto で自動確定した質問は `auto_accepted: true`、`human_answer: null`。
2. エスカレーション質問への回答、上書き、承認された `INFERRED` / `PROPOSAL`（auto では自動確定した `INFERRED` / `PROPOSAL`）を判断ノートに書く。
3. ユーザーが理由を述べていれば、原則の追記案をまとめて提示し、承認された文言だけを `docs/principles.md` に書く。
4. auto で自動確定した回答を、後のどの時点でもユーザーが上書きしたら、判断ノートを書き換え、log に `auto_override` 行を追記する。質問役に返し済みなら、上書き後の回答を質問役にも伝える。

**完了条件:** ラウンドの全質問の行が log にあり、記録対象の全回答が判断ノートにある。

### 9. 質問役に返す

確定した回答（ユーザーの回答、上書き後の回答、承認または自動確定した代理回答）を、そのラウンドへのユーザーの回答として元のワークフロー（grilling など）に戻す。保留された質問は未決として返す。次のラウンドが来たら手順2に戻る。

## 集計

代理回答の精度は `python3 scripts/report.py .decision-twin/log.jsonl` で集計する。分類ごとの Override Rate、Escalation Recall / Precision、自動確定の件数と後からの上書き率などを Markdown で出す。承認モードを auto にしてよいかの判断材料に使う。
