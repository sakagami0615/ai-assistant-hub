import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(__file__))

import report  # noqa: E402


def row(**kw):
    base = {
        "question_id": "q-1-1",
        "class": "REPO_FACT",
        "twin_status": "FACT",
        "twin_answer": "a",
        "evidence": ["x"],
        "verifier": "PASS",
        "escalated": False,
        "human_answer": "同意",
        "overridden": False,
    }
    base.update(kw)
    return base


class MetricsTest(unittest.TestCase):
    def test_override_rate_per_class_counts_only_answered_non_escalated(self):
        rows = [
            row(question_id="a", **{"class": "USER_PREFERENCE"}, overridden=True, human_answer="50"),
            row(question_id="b", **{"class": "USER_PREFERENCE"}),
            row(question_id="c", **{"class": "USER_PREFERENCE"}, escalated=True, human_answer="x"),
            row(question_id="d", **{"class": "USER_PREFERENCE"}, human_answer=None),
        ]
        m = report.compute(rows)
        pref = m["by_class"]["USER_PREFERENCE"]
        self.assertEqual(pref["count"], 4)
        self.assertEqual(pref["escalated"], 1)
        self.assertAlmostEqual(pref["override_rate"], 0.5)

    def test_unsupported_decision_rate(self):
        rows = [
            row(question_id="a", twin_status="INFERRED", evidence=[]),
            row(question_id="b", twin_status="FACT", verifier="RETRY_RETRIEVAL"),
            row(question_id="c", twin_status="PROPOSAL", evidence=[]),
            row(question_id="d", twin_status="EXPLICIT_DECISION"),
            row(question_id="e", twin_status="UNKNOWN", evidence=[], twin_answer=""),
        ]
        m = report.compute(rows)
        # 分母は UNKNOWN 以外の4件、根拠なしで断定したのは a, b
        self.assertAlmostEqual(m["unsupported_decision_rate"], 2 / 4)
        # 根拠があって PASS は d だけ（a, c は根拠なし）
        self.assertAlmostEqual(m["evidence_support_rate"], 1 / 4)

    def test_escalation_recall_and_precision(self):
        rows = [
            # TP: エスカレーションし、twin と違う回答
            row(question_id="a", escalated=True, human_answer="別案"),
            # TP: UNKNOWN は人間が必要
            row(question_id="b", escalated=True, twin_status="UNKNOWN", twin_answer="", human_answer="x"),
            # FP: エスカレーションしたが twin に同意
            row(question_id="c", escalated=True, human_answer="同意"),
            row(question_id="d", escalated=True, twin_answer="20", human_answer="20"),
            # FN: エスカレーションしなかったが上書き
            row(question_id="e", overridden=True, human_answer="50"),
            # TN
            row(question_id="f"),
            # 保留は除外
            row(question_id="g", escalated=True, human_answer=None),
        ]
        m = report.compute(rows)
        self.assertAlmostEqual(m["escalation_recall"], 2 / 3)
        self.assertAlmostEqual(m["escalation_precision"], 2 / 4)

    def test_auto_override_counts_as_escalation_miss(self):
        rows = [
            row(question_id="a", escalated=True, human_answer="別案"),
            row(question_id="b", human_answer=None, auto_accepted=True),
            row(question_id="c", human_answer=None, auto_accepted=True),
            {"type": "auto_override", "question_id": "c", "human_answer": "50"},
        ]
        m = report.compute(rows)
        # TP=1（a）、FN=1（自動確定後に上書きされた c）。precision は変わらない
        self.assertAlmostEqual(m["escalation_recall"], 1 / 2)
        self.assertAlmostEqual(m["escalation_precision"], 1.0)

    def test_unclassified_and_unknown_classes_do_not_break_sorting(self):
        rows = [row(question_id="a", **{"class": None}), row(question_id="b", **{"class": "ODD"}), row(question_id="c")]
        m = report.compute(rows)
        self.assertEqual(set(m["by_class"]), {"REPO_FACT", "ODD", "(未分類)"})

    def test_late_answer_is_not_a_question(self):
        rows = [row(question_id="a"), {"type": "late_answer", "question_id": "a", "human_answer": "同意"}]
        self.assertEqual(report.compute(rows)["total"], 1)

    def test_typed_rows_are_not_questions_and_auto_metrics(self):
        rows = [
            row(question_id="a"),
            row(question_id="b", human_answer=None, auto_accepted=True),
            row(question_id="c", human_answer=None, auto_accepted=True),
            {"type": "auto_override", "question_id": "c", "human_answer": "50"},
            {"type": "learning", "question_id": "l-1-1", "question": "x", "human_answer": "y", "note": "api#x"},
        ]
        m = report.compute(rows)
        self.assertEqual(m["total"], 3)
        self.assertEqual(m["auto_accepted"], 2)
        self.assertEqual(m["auto_overridden"], 1)
        self.assertAlmostEqual(m["auto_override_rate"], 0.5)
        self.assertEqual(m["learning"], 1)
        # 自動確定は Override Rate の分母に入らない
        self.assertAlmostEqual(m["override_rate"], 0.0)
        out = report.render(m)
        self.assertIn("自動確定", out)
        self.assertIn("学習フロー", out)

    def test_ignores_non_question_rows_and_handles_empty(self):
        m = report.compute([{"type": "principle_rejected", "text": "x"}])
        self.assertEqual(m["total"], 0)
        self.assertIsNone(m["escalation_recall"])
        self.assertIn("該当なし", report.render(m))


class CliTest(unittest.TestCase):
    def test_cli_prints_markdown(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "log.jsonl")
            with open(path, "w", encoding="utf-8") as f:
                f.write(json.dumps(row(), ensure_ascii=False) + "\n\n")
            out = subprocess.run(
                [sys.executable, os.path.join(os.path.dirname(__file__), "report.py"), path],
                capture_output=True, text=True, check=True,
            ).stdout
        self.assertIn("| REPO_FACT |", out)
        self.assertIn("Override Rate", out)


if __name__ == "__main__":
    unittest.main()
