#!/usr/bin/env python3
"""decision-twin の log.jsonl を集計し、shadow mode の精度指標を Markdown で出力する。

使い方: python3 report.py <スキルフォルダ>/memory/log.jsonl
"""
import json
import sys
from collections import OrderedDict

CLASSES = ["REPO_FACT", "EXISTING_DECISION", "USER_PREFERENCE", "NOVEL_COMMITMENT"]
ASSERTIVE = {"FACT", "EXPLICIT_DECISION", "INFERRED"}


def load(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _rate(num, den):
    return num / den if den else None


def _agreed(r):
    return r.get("human_answer") == "同意" or r.get("human_answer") == r.get("twin_answer")


def _needs_human(r):
    """人間の判断が実際に必要だったか（保留は呼び出し側で除外する）。"""
    if r.get("escalated"):
        return r.get("twin_status") == "UNKNOWN" or not _agreed(r)
    return bool(r.get("overridden"))


def compute(rows):
    # type 付きの行（学習フロー、自動確定の後からの上書き、原則の却下）は代理回答の質問ではない
    qs = [r for r in rows if "question_id" in r and "type" not in r]
    # 後から答えた質問（late_answer）は、元の行と結合した写しで集計する。元の行がなければ無視する
    late = {r["question_id"]: r for r in rows if r.get("type") == "late_answer" and "question_id" in r}
    merged = []
    for r in qs:
        l = late.get(r["question_id"])
        if l is not None and r.get("human_answer") is None:
            r = dict(r, human_answer=l.get("human_answer"))
            r["overridden"] = (not r.get("escalated") and r["human_answer"] not in (None, "同意", r.get("twin_answer")))
        merged.append(r)
    qs = merged
    auto = [r for r in qs if r.get("auto_accepted")]
    auto_ids = {r["question_id"] for r in auto}
    auto_overridden = {
        r.get("question_id") for r in rows
        if r.get("type") == "auto_override" and r.get("question_id") in auto_ids
    }
    answered = [r for r in qs if r.get("human_answer") is not None]

    by_class = OrderedDict()
    extra = sorted({r.get("class") for r in qs} - set(CLASSES) - {None})
    for cls in CLASSES + extra + [None]:
        items = [r for r in qs if r.get("class") == cls]
        if not items:
            continue
        reviewed = [r for r in items if not r.get("escalated") and r.get("human_answer") is not None]
        by_class[cls or "(未分類)"] = {
            "count": len(items),
            "escalated": sum(1 for r in items if r.get("escalated")),
            "override_rate": _rate(sum(1 for r in reviewed if r.get("overridden")), len(reviewed)),
        }

    twin_answers = [r for r in qs if r.get("twin_status") != "UNKNOWN"]
    unsupported = [
        r for r in twin_answers
        if r.get("twin_status") in ASSERTIVE and (not r.get("evidence") or r.get("verifier") != "PASS")
    ]
    supported = [r for r in twin_answers if r.get("evidence") and r.get("verifier") == "PASS"]

    tp = sum(1 for r in answered if r.get("escalated") and _needs_human(r))
    fp = sum(1 for r in answered if r.get("escalated") and not _needs_human(r))
    fn = sum(1 for r in answered if not r.get("escalated") and _needs_human(r))
    # 自動確定した後に上書きされた質問も、確認すべきだった見逃しとして数える
    fn += len(auto_overridden)

    non_escalated = [r for r in answered if not r.get("escalated")]
    return {
        "total": len(qs),
        "escalation_rate": _rate(sum(1 for r in qs if r.get("escalated")), len(qs)),
        "override_rate": _rate(sum(1 for r in non_escalated if r.get("overridden")), len(non_escalated)),
        "unsupported_decision_rate": _rate(len(unsupported), len(twin_answers)),
        "evidence_support_rate": _rate(len(supported), len(twin_answers)),
        "escalation_recall": _rate(tp, tp + fn),
        "escalation_precision": _rate(tp, tp + fp),
        "by_class": by_class,
        "auto_accepted": len(auto),
        "auto_overridden": len(auto_overridden),
        "auto_override_rate": _rate(len(auto_overridden), len(auto)),
        "learning": sum(1 for r in rows if r.get("type") == "learning"),
    }


def _fmt(v):
    return "該当なし" if v is None else f"{v:.1%}"


def render(m):
    lines = [
        "# decision-twin 集計",
        "",
        f"質問数: {m['total']}",
        "",
        "| 指標 | 値 |",
        "| --- | --- |",
        f"| Human Override Rate | {_fmt(m['override_rate'])} |",
        f"| Unsupported Decision Rate | {_fmt(m['unsupported_decision_rate'])} |",
        f"| Escalation Recall | {_fmt(m['escalation_recall'])} |",
        f"| Escalation Precision | {_fmt(m['escalation_precision'])} |",
        f"| Evidence Support Rate | {_fmt(m['evidence_support_rate'])} |",
        f"| エスカレーション率 | {_fmt(m['escalation_rate'])} |",
        f"| 自動確定 | {m['auto_accepted']}件（後から上書き {m['auto_overridden']}件、{_fmt(m['auto_override_rate'])}） |",
        f"| 学習フローの回答 | {m['learning']}件 |",
        "",
        "| 分類 | 件数 | エスカレーション | Override Rate |",
        "| --- | --- | --- | --- |",
    ]
    for cls, c in m["by_class"].items():
        lines.append(f"| {cls} | {c['count']} | {c['escalated']} | {_fmt(c['override_rate'])} |")
    lines += [
        "",
        "Escalation Recall / Precision は近似値です。上書きされた非エスカレーション問（自動確定した後に上書きされたものを含む）を見逃し、"
        "twin の回答に同意したエスカレーション問を質問しすぎとして数えています。保留した質問は除外し、承認モード auto で自動確定した質問は、後から上書きされた場合だけ見逃しとして数えています。",
    ]
    return "\n".join(lines) + "\n"


def main(argv):
    if len(argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    sys.stdout.write(render(compute(load(argv[1]))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
