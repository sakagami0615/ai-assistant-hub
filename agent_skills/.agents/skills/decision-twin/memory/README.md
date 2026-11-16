# decision-twin の記憶

decision-twin が判断を蓄積するフォルダ。記憶を共有する範囲は、このスキルを置いた場所で決まる。

- プロジェクトの `.claude/skills/`（Codex は `.agents/skills/`）に置く → そのプロジェクト専用の記憶
- ユーザー直下の `~/.claude/skills/`（Codex は `~/.agents/skills/`）に置く → 全プロジェクト共通の記憶

| パス | 内容 |
| --- | --- |
| `decisions/<topic>.md` | 判断ノート（題材ごとに今有効な判断を1行ずつ） |
| `principles.md` | ユーザーが承認した原則 |
| `log.jsonl` | 全質問の記録（追記のみ） |
| `config.json` | 任意の設定（`approval`、`confidence_threshold`） |

中身を消せば記憶はリセットされる。このファイルは消さない。
