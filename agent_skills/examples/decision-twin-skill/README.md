# decision-twin 検証ハーネス

decision-twin Skill を Codex でコンテナ内実行し、代理回答・エスカレーション・判断ノートが期待どおりかを確認します。

## 実行

```bash
docker compose run --rm decision-twin-check
```

ホストの `~/.codex` を読み取り専用でマウントし、Codex の認証情報を使います。モデルは `CODEX_MODEL` で指定できます。ホストの `config.toml` がコンテナ内の Codex で読めない場合は、`CODEX_VERSION=<ホストの版> docker compose build` で版を合わせてください。ポートは使いません。

## 入力と結果

| 場所 | 内容 |
| --- | --- |
| `assets/sample-repo/` | 小さな TODO API リポジトリ |
| `assets/memory/` | 実行前にスキルの `memory/` へコピーする記憶（判断ノート4本と原則） |
| `assets/round-1.md` | grilling 形式の質問ラウンド（8問） |
| `assets/human-answers.md` | 人間役の回答。表示を書き出した後にだけ読ませます |
| `assets/expected-round.md` | 各質問の期待結果。`docker/check-results` がこれを読んで照合します |
| `reports/` | 表示、代理回答 JSON、実行後の `memory/`、集計、照合結果（git 管理外） |

`reports/round-1-check.txt` の最終行が `結果: OK` なら合格です。`WARN` は、代理回答一覧に入る想定の質問が慎重側（確認質問）に倒れた場合などで、安全側の差分として扱います。

## シナリオ

ラウンドは「リポジトリの事実」「判断ノートの判断」「質問役の推奨と食い違う判断」「原則から導ける好み」「根拠のない小さな好み（人間が上書き）」「新しい約束」「DB スキーマ変更」「矛盾する判断」を1問ずつ含みます。詳細は `assets/expected-round.md` を参照してください。
