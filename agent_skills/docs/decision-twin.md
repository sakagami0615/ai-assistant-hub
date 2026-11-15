# Decision Twin

## 概要

Decision Twinは、grillingやbrainstormingなどの「実装前に質問を重ねる」ワークフローで、あなたの代わりに質問へ答えるSkillです。答えの根拠にするのは、あなたが過去に下した判断（ADR）、明示した原則、リポジトリの事実だけです。

根拠で決まらない判断や、影響が大きい判断だけをあなたに確認し、その回答を判断記録として蓄積します。蓄積した記録は、次回以降の代理回答の根拠になります。AIの提案があなたの決定にすり替わらないことを最優先にしています。

## 利用する場面

- grillingの質問が多く、過去に決めたことを何度も答えるのが負担になっている
- リポジトリやADRを調べれば分かる質問を、AIに処理させたい
- 自分が答えた判断を、ADRとして自動で残していきたい
- 代理回答がどの程度あなたの判断と一致するかを測りたい

## 導入

Claude Codeでは、初回の実行時にSkillが回答役（`twin-answerer`）と検証役（`twin-verifier`）のサブエージェント定義を`.claude/agents/`にコピーします。サブエージェントを使うと、回答役は読み取り専用のツールだけで動き、質問役の推奨や会話を見ずに答えます。コピーした直後は、Claude Codeを再起動すると確実に反映されます。

判断記録がまだない場合は、空のまま始めて問題ありません。最初は多くの質問があなたに確認され、答えるたびに記録が増えていきます。

## 作成・更新されるファイル

| ファイル | 内容 |
| --- | --- |
| `docs/decisions/ADR-*.md` | あなたの回答、上書き、承認した代理回答 |
| `docs/principles.md` | あなたが承認した原則（判断の背景にある優先順位） |
| `.decision-twin/log.jsonl` | 全質問の代理回答とあなたの回答の記録（追記のみ） |
| `.decision-twin/config.json` | 任意。`confidence_threshold`で確認の基準を変えられます（既定は0.80） |
| `.claude/agents/twin-*.md` | 回答役・検証役の定義（初回のみ） |

`.decision-twin/`をgit管理するかはお任せします。初回に`.gitignore`への追加を提案します。

## 基本的な流れ

1. grillingなどを「decision-twinで回して」と依頼します。
2. 質問のラウンドごとに、Skillが各質問を分類し、回答役が判断記録から代理回答を作ります。
3. 検証役が、回答が根拠で支持されるかを確認します。
4. 固定のルールで、あなたに確認する質問を選びます（新しい約束、元に戻せない判断、根拠がない、記録が矛盾している、高影響なのに推論しかない、など）。
5. 「確認する質問」と「代理回答の一覧」が表示されます。あなたは確認する質問に答え、一覧はまとめて承認するか、変えたい番号だけ指定します。
6. あなたの回答がADRとログに記録され、確定した回答がgrillingに戻ります。

## 依頼例

```text
この機能の設計をgrillingで詰めたいです。質問にはdecision-twinで答えて、必要なものだけ私に聞いてください。
```

```text
brainstormingの質問ラウンドをdecision-twinで処理してください。判断記録はdocs/decisionsにあります。
```

```text
decision-twinのログを集計して、分類ごとのOverride Rateを見せてください。
```

## 注意事項

- 代理回答はあなたの決定ではありません。今回は段階1（shadow mode）の実装で、一覧の代理回答はあなたが承認するまで確定しません。
- ADRと原則には、あなたが言ったことと承認したことだけが書かれます。AIの推測だけで原則が増えることはありません。
- サブエージェントを設置していない環境やCodexでは、回答役・検証役が別のツール制限で動かないため、独立性が弱まります。その場合はログに`isolation: "prompt-only"`と記録されます。
- 状況が変わって古い判断が合わなくなったら、一覧で上書きしてください。新しいADRが古いADRを置き換えます。
- 集計結果（`scripts/report.py`）は、段階2（確認の自動化）に進むかを判断する材料です。Escalation Recall / Precisionは近似値です。

## 関連ファイル

- Skill本体: [../.agents/skills/decision-twin/SKILL.md](../.agents/skills/decision-twin/SKILL.md)
- データ形式と表示形式: [../.agents/skills/decision-twin/formats.md](../.agents/skills/decision-twin/formats.md)
- 記録ルール: [../.agents/skills/decision-twin/recording.md](../.agents/skills/decision-twin/recording.md)
- サブエージェント定義: [../.agents/skills/decision-twin/assets/templates/agents/](../.agents/skills/decision-twin/assets/templates/agents/)
- 集計スクリプト: [../.agents/skills/decision-twin/scripts/report.py](../.agents/skills/decision-twin/scripts/report.py)
- 利用例: [../examples/decision-twin-skill/](../examples/decision-twin-skill/)
