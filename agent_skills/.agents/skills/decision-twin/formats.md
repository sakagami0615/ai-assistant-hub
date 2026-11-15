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
    {"source": "docs/decisions/ADR-001-use-postgresql.md", "id": "ADR-001", "date": "2026-06-01", "claim": "DB は PostgreSQL を使う"}
  ],
  "conflicts": [],
  "alternatives": ["SQLite"]
}
```

| status | 条件 |
| --- | --- |
| `FACT` | リポジトリや文書に直接書いてある |
| `EXPLICIT_DECISION` | 有効な（supersede されていない）ADR にそのまま書いてある |
| `INFERRED` | 有効な ADR や原則から導ける |
| `PROPOSAL` | 根拠はないが、answerer として案を出せる |
| `UNKNOWN` | 根拠で決まらない。`answer` は空文字 |

- `evidence` の各要素は、実在するファイルと、そのファイルに書かれている主張。ADR なら `id` と frontmatter の `date` を入れる。リポジトリのファイルなら `id` はパス、`date` は省略してよい。
- `conflicts` には、互いに矛盾していて片方に決められない根拠の `id` を入れる。
- `requires_human` は answerer が書かない。スキル本体がエスカレーション規則で決める。

## verifier の出力

```json
{"question_id": "q-1-2", "verdict": "PASS", "issues": []}
```

`issues` は、`PASS` 以外のときに理由を1文ずつ入れる。

## log.jsonl の1行

`.decision-twin/log.jsonl` に、1問1行で追記する。

```json
{"ts": "2026-11-15T10:00:00+09:00", "round": 1, "question_id": "q-1-5", "question": "一覧 API の既定ページサイズは 20 か 50 か", "class": "USER_PREFERENCE", "impact": "LOW", "reversibility": "EASY", "twin_status": "PROPOSAL", "twin_answer": "20", "confidence": 0.6, "evidence": [], "conflicts": [], "verifier": "PASS", "retries": 0, "threshold": 0.8, "isolation": "agent", "escalated": false, "escalation_rule": null, "shown_recommendation": "twin", "human_answer": "50", "overridden": true, "adr": "ADR-008"}
```

| 項目 | 値 |
| --- | --- |
| `evidence` | 根拠の `id` の配列 |
| `verifier` | 最終の判定 |
| `escalation_rule` | 当てはまった規則番号。一覧に入れたなら `null` |
| `shown_recommendation` | エスカレーション質問で表示した推奨の出所: `twin` / `questioner` / `none`。一覧に入れた質問は `twin` |
| `human_answer` | ユーザーの回答。一括承認なら `"同意"`、保留なら `null` |
| `overridden` | 代理回答一覧に入れた質問を、ユーザーが別の回答に変えたら `true` |
| `adr` | この質問で書いた ADR の id。書かなければ `null` |

承認しなかった原則の追記案は、次の行で残す。

```json
{"ts": "...", "round": 1, "type": "principle_rejected", "text": "...", "source_adr": "ADR-007"}
```

## 表示形式

### ① エスカレーション質問

grilling と同じ形式で書く。各質問に、確認する理由（規則番号と内容）を付ける。

```
❓ **q-1-6** - **公開 API の互換維持期間**（規則1: 新しい約束）: <質問文>

➡️ <推奨> — 出所: twin PROPOSAL（根拠なし・可逆）／質問役の推奨（判断記録に根拠なし）／なし
```

- 規則5で上げた質問には、矛盾している ADR の id と、それぞれの主張を並べる。
- twin の回答がある（`UNKNOWN` 以外）なら、➡️ は twin の回答にして根拠 id を添える。ないときは、質問役の推奨を出所付きで出す。

### ② 代理回答一覧

| ID | 分類 | impact | status | 回答 | 根拠（日付） |
| --- | --- | --- | --- | --- | --- |
| q-1-1 | REPO_FACT | LOW | FACT | session 認証 | `todo_project/settings.py` |
| q-1-4 | USER_PREFERENCE | MEDIUM | ⚠ INFERRED | cron で済ませる | principles.md L3（2026-06-12） |

- `INFERRED` と `PROPOSAL` には ⚠ を付け、決定ではないと分かるようにする。
- 根拠の日付が他の根拠より古い、または 180 日以上前なら「（古い）」と書き添える。

### ③ 依頼

```
一覧はまとめて承認してよいですか。変えたい番号は「q-1-5: 50 にする」、今は決めない番号は「q-1-4: 保留」のように書いてください。分類の誤りも指摘できます。
```
