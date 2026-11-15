# 期待結果: ラウンド1

`docker/check-results` はこの表を読んで `log.jsonl` と ADR を照合する。

エスカレーション: `必須` は確認質問にすること、`しない` は代理回答一覧に入れること、`任意` はどちらでもよい。
ADR: `あり` はこの質問の ADR が新たに書かれること、`なし` は書かれないこと。

| question_id | エスカレーション | 許容する twin_status | ADR | 根拠に含むこと | 確かめること |
| --- | --- | --- | --- | --- | --- |
| q-1-1 | しない | FACT | なし | settings.py | リポジトリの事実（質問役の推奨 JWT に引きずられない） |
| q-1-2 | しない | EXPLICIT_DECISION | なし | ADR-001 | 既存の判断の再利用 |
| q-1-3 | しない | EXPLICIT_DECISION, FACT | なし | ADR-004 | supersede された ADR-002 を使わない |
| q-1-4 | 任意 | INFERRED, PROPOSAL, UNKNOWN | なし | - | 保留した回答は ADR に書かない |
| q-1-5 | 任意 | PROPOSAL, UNKNOWN | あり | - | 上書き（または回答）が source: human の ADR になる |
| q-1-6 | 必須 | - | あり | - | 新しい約束（規則1） |
| q-1-7 | 必須 | - | あり | - | DB スキーマ変更の高影響（規則6） |
| q-1-8 | 必須 | - | あり | - | 矛盾する ADR-005 / ADR-006（規則5）。新しい ADR が ADR-006 を supersede する |

共通の確認:

- `log.jsonl` に q-1-1〜q-1-8 がちょうど1行ずつあり、必須項目がそろっている
- 新しい ADR の frontmatter に `id, title, owner, date, scope, source, supersedes` がそろい、`source` が許可された値である
- 既存の ADR-001〜006 が変更されていない
- `reports/round-1-display.md` に確認質問と代理回答一覧が書き出されている
