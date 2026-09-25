import hashlib
import importlib
import sys
import types
import unittest
from unittest.mock import Mock, patch

from test_ocr_quality import SAMPLE_MIXED_BATCH


# Import the orchestration logic without loading the Groq/Chroma dependencies.
fake_llm_module = types.ModuleType("services.llm_service")
fake_llm_module.analyze_legal_text = Mock(
    side_effect=AssertionError("LLM should be mocked in tests")
)
with patch.dict(sys.modules, {"services.llm_service": fake_llm_module}):
    pipeline = importlib.import_module("orchestrator.pipeline")


class PipelineOutcomeTests(unittest.TestCase):
    def test_mixed_batch_is_inconclusive_without_any_llm_call(self):
        engine = Mock()
        with patch.object(
            pipeline,
            "analyze_legal_text",
            side_effect=AssertionError("LLM must not receive the mixed batch"),
        ):
            result = pipeline.Orchestrator(rule_engine=engine).process(
                pipeline.ProcessRequest(text=SAMPLE_MIXED_BATCH)
            )

        self.assertEqual(result.llm_calls_made, 0)
        self.assertEqual(result.data["status"], "success")
        self.assertEqual(result.data["data"]["analysisOutcome"], "mixed_documents")
        self.assertIsNone(result.data["data"]["score"])
        self.assertEqual(result.data["data"]["findings"], [])
        engine.match_all.assert_not_called()

    def test_clean_empty_findings_get_no_numeric_score(self):
        text = (
            "--- Page 1 ---\nThis Loan Agreement is made today. "
            "The Creditor and Debtor agree on a principal amount of "
            "PHP 125,000.00. The Debtor shall pay PHP 25,000.00 monthly."
        )
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        llm_response = {
            "status": "success",
            "data": {
                "clauses": [],
                "safety_score": None,
                "documentTitle": "Loan Agreement",
                "processingMeta": {
                    "chunkCount": 1,
                    "pageCount": 1,
                    "processedCharacters": len(text),
                    "documentHash": digest,
                },
            },
        }
        engine = Mock()
        engine.match_all.return_value = []

        with patch.object(pipeline, "analyze_legal_text", return_value=llm_response):
            result = pipeline.Orchestrator(rule_engine=engine).process(
                pipeline.ProcessRequest(text=text)
            )

        data = result.data["data"]
        self.assertEqual(data["analysisOutcome"], "no_findings_detected")
        self.assertIsNone(data["score"])
        self.assertEqual(data["findings"], [])

    def test_dropped_ungrounded_candidates_are_not_zero_findings(self):
        text = (
            "--- Page 1 ---\nThis Loan Agreement is made today. "
            "The Creditor and Debtor agree on a principal amount of "
            "PHP 125,000.00. The Debtor shall pay PHP 25,000.00 monthly."
        )
        llm_response = {
            "status": "success",
            "data": {
                "clauses": [],
                "analysisIncomplete": True,
                "safety_score": None,
                "documentTitle": "Loan Agreement",
                "processingMeta": {
                    "chunkCount": 1,
                    "pageCount": 1,
                    "processedCharacters": len(text),
                    "documentHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                },
            },
        }
        engine = Mock()
        engine.match_all.return_value = []
        with patch.object(pipeline, "analyze_legal_text", return_value=llm_response):
            result = pipeline.Orchestrator(rule_engine=engine).process(
                pipeline.ProcessRequest(text=text)
            )

        data = result.data["data"]
        self.assertEqual(data["analysisOutcome"], "inconclusive_analysis")
        self.assertIsNone(data["score"])


if __name__ == "__main__":
    unittest.main()
