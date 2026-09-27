"""Regression tests for OCR grounding; no live Groq calls."""

import unittest
from unittest.mock import patch

from services import llm_service


class GroundingTests(unittest.TestCase):
    SOURCE = """--- Page 1 ---
This Service Agreement is entered into by [REDACTED_ENTITY] (Provider)
and [REDACTED_ENTITY] (Client).
The Client shall pay PHP 18.500.00 upon approval of the design.
The Provider will correct reproduciblle defects reported within thirty days.
"""

    def _chunk(self, **overrides):
        result = {
            "documentTitle": "Service Agreement",
            "clauses": [],
            "keyClauses": [{
                "title": "Fees",
                "explanation": "Bayad ayon sa nabasang kasunduan.",
                "foundText": "The Client shall pay PHP 18.500.00 upon approval of the design.",
            }],
            "droppedFindingCount": 0,
            "droppedKeyClauseCount": 1,
            "chunkUnusable": False,
            "ragContext": "",
        }
        result.update(overrides)
        return result

    def test_dropped_neutral_term_does_not_void_grounded_result(self):
        result = llm_service._combine_chunk_results(
            [self._chunk()], self.SOURCE
        )
        self.assertFalse(result["analysisIncomplete"])
        self.assertEqual(len(result["keyClauses"]), 1)
        self.assertIsNone(result["safety_score"])

    def test_dropped_risk_or_empty_chunk_remains_incomplete(self):
        for incomplete_chunk in (
            self._chunk(droppedFindingCount=1),
            self._chunk(keyClauses=[], chunkUnusable=True),
        ):
            with self.subTest(incomplete_chunk=incomplete_chunk):
                result = llm_service._combine_chunk_results(
                    [incomplete_chunk], self.SOURCE
                )
                self.assertTrue(result["analysisIncomplete"])

    def test_retry_uses_literal_ocr_quote(self):
        corrected_quote = "The Client shall pay PHP 18,500.00 upon approval of the design."
        literal_quote = "The Client shall pay PHP 18.500.00 upon approval of the design."
        responses = [
            {"documentTitle": "Service Agreement", "clauses": [], "keyClauses": [
                {"title": "Fees", "explanation": "Bayad", "original_text": corrected_quote}
            ]},
            {"documentTitle": "Service Agreement", "clauses": [], "keyClauses": [
                {"title": "Fees", "explanation": "Bayad", "original_text": literal_quote}
            ]},
        ]
        with patch.object(llm_service, "_get_rag_context", return_value=""), \
             patch.object(llm_service, "get_analyze_legal_text_prompt", return_value="prompt"), \
             patch.object(llm_service, "_request_chunk_json", side_effect=responses) as request:
            chunk = llm_service._analyze_chunk(None, self.SOURCE, 1, 1)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(chunk["keyClauses"][0]["foundText"], literal_quote)
        self.assertFalse(chunk["chunkUnusable"])

    def test_retry_cannot_erase_ungrounded_risk(self):
        proposed_risk = {
            "clause_title": "Payment",
            "explanation": "May dapat suriin.",
            "practical_advice": "Ihambing sa orihinal.",
            "score_deduction": 5,
            "original_text": "The Client shall pay PHP 18,500.00 upon approval of the design.",
            "confidence": "70%",
        }
        neutral = {
            "title": "Fees",
            "explanation": "Bayad",
            "original_text": "The Client shall pay PHP 18.500.00 upon approval of the design.",
        }
        responses = [
            {"documentTitle": "Service Agreement", "clauses": [proposed_risk], "keyClauses": [neutral]},
            {"documentTitle": "Service Agreement", "clauses": [], "keyClauses": [neutral]},
        ]
        with patch.object(llm_service, "_get_rag_context", return_value=""), \
             patch.object(llm_service, "get_analyze_legal_text_prompt", return_value="prompt"), \
             patch.object(llm_service, "_request_chunk_json", side_effect=responses) as request:
            chunk = llm_service._analyze_chunk(None, self.SOURCE, 1, 1)
        self.assertEqual(request.call_count, 2)
        self.assertEqual(chunk["droppedFindingCount"], 1)
        self.assertTrue(llm_service._combine_chunk_results(
            [chunk], self.SOURCE
        )["analysisIncomplete"])


if __name__ == "__main__":
    unittest.main()