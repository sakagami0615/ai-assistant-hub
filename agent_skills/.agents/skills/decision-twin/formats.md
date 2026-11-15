# decision-twin のデータ形式と表示形式

## 回答オブジェクト（twin-answerer の出力）

ラウンドの全質問について、次のオブジェクトの JSON 配列を返す。

```json
{
  "question_id": "q-1-2",
  "question": "DB は既存の PostgreSQL を維持するか",
  "answer": "PostgreSQL を維持する",
  "status": "EXPLICIT_DECISION",
  "confidence": 0.95,
  "evidence": [
    {"source": "memory/decisions/db.md", "id": "db#使う DB", "date": "2026-06-01", "claim": "本番・開発とも PostgreSQL を使い、今後も維持する"}
  ],
  "conflicts": [],
  "alternatives": ["SQLite"]
}
```

| status | 条件 |
| --- | --- |
| `FACT` | リポジトリや文書に直接書いてある |
| `EXPLICIT_DECISION` | 判断ノートの項目にそのまま書いてある |
| `INFERRED` | 有効な判断や原則から導ける |
| `PROPOSAL` | 根拠はないが、answerer として案を出せる |
| `UNKNOWN` | 根拠で決まらない。`answer` は空文字 |

- `evidence` の各要素は、実在するファイルと、そのファイルに書かれている主張。`id` と `date` は根拠の種類で決まる。

  | 根拠 | `id` | `date` |
  | --- | --- | --- |
  | 判断ノートの項目 | `<topic>#<見出し>`（例 `api#一覧のページング方式`） | 項目の日付 |
  | 原則 | `principles#<行番号>` | 出典の日付 |
  | リポジトリのファイル | パス | 省略してよい |

- `conflicts` には、互いに矛盾していて片方に決められない根拠の `id` を入れる。
- `requires_human` は answerer が書かない。スキル本体がエスカレーション規則で決める。

## verifier の出力

```json
{"question_id": "q-1-2", "verdict": "PASS", "issues": []}
```

`issues` は、`PASS` 以外のときに理由を1文ずつ入れる。

## log.jsonl の1行

`memory/log.jsonl`（スキルフォルダ内）に、1問1行で追記する。

```json
{"ts": "2026-11-15T10:00:00+09:00", "round": 1, "question_id": "q-1-5", "question": "一覧 API の既定ページサイズは 20 か 50 か", "class": "USER_PREFERENCE", "impact": "LOW", "reversibility": "EASY", "twin_status": "PROPOSAL", "twin_answer": "20", "confidence": 0.6, "evidence": [], "conflicts": [], "verifier": "PASS", "retries": 0, "threshold": 0.8, "isolation": "agent", "escalated": false, "escalation_rule": null, "shown_recommendation": "twin", "human_answer": "50", "overridden": true, "auto_accepted": false, "note": "api#一覧の既定ページサイズ", "replaces": []}
```

| 項目 | 値 |
| --- | --- |
| `evidence` | 根拠の `id` の配列 |
| `verifier` | 最終の判定 |
| `escalation_rule` | 当てはまった規則番号。一覧に入れたなら `null` |
| `shown_recommendation` | エスカレーション質問で表示した推奨の出所: `twin` / `questioner` / `none`。一覧に入れた質問は `twin` |
| `human_answer` | ユーザーの回答。一括承認なら `"同意"`、保留と自動確定なら `null` |
| `overridden` | 代理回答一覧に入れた質問を、ユーザーが別の回答に変えたら `true` |
| `auto_accepted` | 承認モード auto で、一覧の回答が自動確定したら `true` |
| `note` | この質問で書いた（書き換えた）判断ノートの id。書かなければ `null` |
| `replaces` | この質問で書き換え・削除した判断ノートの項目の id の配列 |

`type` 付きの行は、代理回答の質問とは別に数える。

```json
{"ts": "...", "type": "learning", "session": 1, "question_id": "l-1-3", "topic": "api", "question": "...", "choices": ["offset", "cursor"], "human_answer": "cursor", "note": "api#一覧のページング方式", "replaces": []}
{"ts": "...", "type": "auto_override", "round": 2, "question_id": "q-2-4", "human_answer": "50", "note": "api#一覧の既定ページサイズ", "replaces": ["api#一覧の既定ページサイズ"]}
{"ts": "...", "type": "principle_rejected", "round": 1, "text": "...", "source_note": "api#公開 API の互換維持期間"}
```

- `learning`: 学習フローの1問。`session` は log の learning 行の最大値 + 1、`question_id` は `l-<session>-<連番>`。記録しなかった回答（「わからない」など）は `note: null`。
- `auto_override`: auto で自動確定した回答を、後からユーザーが上書きした。

## 表示形式

### ① エスカレーション質問

grilling と同じ形式で書く。各質問に、確認する理由（規則番号と内容）を付ける。

```
❓ **q-1-6** - **公開 API の互換維持期間**（規則1: 新しい約束）: <質問文>

➡️ <推奨> — 出所: twin PROPOSAL（根拠なし・可逆）／質問役の推奨（判断記録に根拠なし）／なし
```

- 規則5で上げた質問には、矛盾している判断の id と、それぞれの主張を並べる。
- twin の回答がある（`UNKNOWN` 以外）なら、➡️ は twin の回答にして根拠 id を添える。ないときは、質問役の推奨を出所付きで出す。

### ② 代理回答一覧

| ID | 分類 | impact | status | 回答 | 根拠（日付） |
| --- | --- | --- | --- | --- | --- |
| q-1-1 | REPO_FACT | LOW | FACT | session 認証 | `todo_project/settings.py` |
| q-1-4 | USER_PREFERENCE | MEDIUM | ⚠ INFERRED | cron で済ませる | principles.md L3（2026-06-12） |

- `INFERRED` と `PROPOSAL` には ⚠ を付け、決定ではないと分かるようにする。
- 根拠の日付が他の根拠より古い、または 180 日以上前なら「（古い）」と書き添える。

承認モード auto では、見出しを「② 自動で確定した回答」にする。

### ③ 依頼

承認モード require:

```
一覧はまとめて承認してよいですか。変えたい番号は「q-1-5: 50 にする」、今は決めない番号は「q-1-4: 保留」のように書いてください。分類の誤りも指摘できます。
```

承認モード auto:

```
②の回答は確定して進めました。変えたい番号があれば「q-1-5: 50 にする」のように書いてください。いつでも上書きできます。
```
