import hashlib
import importlib
import sys
import types
import unittest
from unittest.mock import Mock, patch


# Import the orchestration logic without loading the Groq/Chroma dependencies.
fake_llm_module = types.ModuleType("services.llm_service")
fake_llm_module.analyze_legal_text = Mock(
    side_effect=AssertionError("LLM should be mocked in tests")
)
with patch.dict(sys.modules, {"services.llm_service": fake_llm_module}):
    pipeline = importlib.import_module("orchestrator.pipeline")


def _loan_document(amount: int) -> str:
    """Valid document that passes the quality gate; unique per amount."""
    return (
        "--- Page 1 ---\nThis Loan Agreement is made today. "
        "The Creditor and Debtor agree on a principal amount of "
        f"PHP {amount},000.00. The Debtor shall pay PHP 25,000.00 monthly."
    )


def _llm_response(text: str) -> dict:
    return {
        "status": "success",
        "data": {
            "clauses": [],
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


class AnalysisCacheLruTests(unittest.TestCase):
    def setUp(self):
        self._original_max = pipeline.ANALYSIS_CACHE_MAX

    def tearDown(self):
        pipeline.ANALYSIS_CACHE_MAX = self._original_max

    def _make_orchestrator(self):
        engine = Mock()
        engine.match_all.return_value = []
        return pipeline.Orchestrator(rule_engine=engine)

    def _analyze(self, orchestrator, text: str):
        with patch.object(
            pipeline,
            "analyze_legal_text",
            side_effect=lambda sanitized_text: _llm_response(text),
        ):
            return orchestrator.process(pipeline.ProcessRequest(text=text))

    def test_second_identical_request_is_cache_hit(self):
        orch = self._make_orchestrator()
        text = _loan_document(100)

        first = self._analyze(orch, text)
        second = self._analyze(orch, text)

        self.assertIn(first.status, ("llm", "hybrid"))
        self.assertEqual(first.llm_calls_made, 1)
        self.assertEqual(second.status, "cache_hit")
        self.assertEqual(second.llm_calls_made, 0)
        self.assertEqual(first.data, second.data)
        self.assertIsNot(first.data, second.data)

        # Tampering with the returned payload must never leak into the cache.
        first.data["status"] = "TAMPERED"
        third = self._analyze(orch, text)
        self.assertEqual(third.status, "cache_hit")
        self.assertEqual(third.data["status"], "success")

    def test_cache_is_bounded_and_evicts_oldest(self):
        pipeline.ANALYSIS_CACHE_MAX = 3
        orch = self._make_orchestrator()
        texts = {amount: _loan_document(amount) for amount in (101, 102, 103, 104)}

        for text in texts.values():
            self.assertIn(self._analyze(orch, text).status, ("llm", "hybrid"))

        self.assertEqual(len(orch._cache), 3)

        # The first document (101) was evicted; it must be analyzed again.
        again_101 = self._analyze(orch, texts[101])
        self.assertIn(again_101.status, ("llm", "hybrid"))
        self.assertEqual(again_101.llm_calls_made, 1)

        # The newest document (104) is still cached.
        hit_104 = self._analyze(orch, texts[104])
        self.assertEqual(hit_104.status, "cache_hit")
        self.assertEqual(hit_104.llm_calls_made, 0)

    def test_cache_hit_refreshes_recency(self):
        pipeline.ANALYSIS_CACHE_MAX = 2
        orch = self._make_orchestrator()
        text_a = _loan_document(201)
        text_b = _loan_document(202)
        text_c = _loan_document(203)

        self._analyze(orch, text_a)  # cache: A
        self._analyze(orch, text_b)  # cache: A, B
        self.assertEqual(self._analyze(orch, text_a).status, "cache_hit")  # B, A
        self._analyze(orch, text_c)  # evicts B (least recently used): A, C

        self.assertEqual(self._analyze(orch, text_a).status, "cache_hit")
        self.assertIn(self._analyze(orch, text_b).status, ("llm", "hybrid"))


if __name__ == "__main__":
    unittest.main()