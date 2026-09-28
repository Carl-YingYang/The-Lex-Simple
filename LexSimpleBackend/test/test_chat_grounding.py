"""Run: python -m unittest discover -s test -p 'test_chat_grounding_v6_3_4.py'"""

import unittest

from services.chat_grounding import (
    append_verified_sources, prepare_chat_evidence, remove_unsupported_examples,
)


EXACT = (
    "SOURCE: RA 3765, SECTION 4\n"
    "OFFICIAL URL: https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/24096\n"
    "LEGAL TEXT: SEC. 4. The finance charge in pesos and centavos."
)


class ChatGroundingTests(unittest.TestCase):
    def test_exact_reference_excludes_neighboring_vector_matches(self):
        calls = []

        def exact(kind, number, law_id=None, limit=5):
            self.assertEqual((kind, number, law_id), ("SECTION", "4", "RA 3765"))
            return [EXACT]

        def vector(*args, **kwargs):
            calls.append("vector")
            return {}

        evidence = prepare_chat_evidence(
            "Ano ang Section 4 ng RA 3765?", "Section 4 RA 3765", exact, vector
        )
        self.assertEqual(calls, [])
        self.assertIn("finance charge", evidence.context)
        self.assertEqual(len(evidence.sources), 1)
        reply = append_verified_sources("Ibigay ang nakasulat na detalye.", evidence.sources)
        self.assertIn("RA 3765 · SECTION 4: https://elibrary", reply)

    def test_missing_exact_reference_does_not_fall_back_to_similar_section(self):
        evidence = prepare_chat_evidence(
            "Ano ang RA 3765 Section 99?", "irrelevant", lambda *a, **k: [],
            lambda *a, **k: self.fail("Do not run vector fallback"),
        )
        self.assertFalse(evidence.context)
        self.assertIn("SECTION 99", evidence.missing_reply)

    def test_generic_vector_requires_approved_provenance(self):
        vector = lambda *a, **k: {
            "documents": [["BAD", "GOOD"]],
            "metadatas": [[
                {"law_id": "RA 3765", "provision": "SECTION 4", "source_url": "https://evil.test", "verified": True, "knowledge_file_id": "x"},
                {"law_id": "RA 3765", "provision": "SECTION 4", "source_url": "https://elibrary.judiciary.gov.ph/example", "verified": True, "knowledge_file_id": "x"},
            ]],
        }
        evidence = prepare_chat_evidence("Ano ang disclosure?", "disclosure", lambda *a, **k: [], vector)
        self.assertEqual(evidence.context, "GOOD")
        self.assertEqual(len(evidence.sources), 1)

    def test_explicit_law_filters_other_laws(self):
        evidence = prepare_chat_evidence(
            "Ano ang RA 9999?", "RA 9999", lambda *a, **k: [],
            lambda *a, **k: {
                "documents": [["RA 3765 excerpt"]],
                "metadatas": [[{"law_id": "RA 3765", "provision": "SECTION 4",
                                "source_url": "https://elibrary.judiciary.gov.ph/example",
                                "verified": True, "knowledge_file_id": "x"}]],
            },
        )
        self.assertFalse(evidence.context)

    def test_ambiguous_section_asks_for_law(self):
        evidence = prepare_chat_evidence(
            "Ano ang Section 4?", "Section 4", lambda *a, **k: [],
            lambda *a, **k: {
                "documents": [["one", "two"]],
                "metadatas": [[
                    {"law_id": law, "provision": "SECTION 4", "verified": True,
                     "knowledge_file_id": law, "source_url": "https://elibrary.judiciary.gov.ph/a"}
                    for law in ("RA 3765", "RA 7394")
                ]],
            },
        )
        self.assertFalse(evidence.context)
        self.assertIn("Aling batas", evidence.missing_reply)

    def test_actual_ra3765_reply_drops_unsupported_examples_not_disclosure(self):
        source = (
            "SOURCE: RA 3765, SECTION 4\nOFFICIAL URL: https://elibrary.judiciary.gov.ph/x\n"
            "LEGAL TEXT: (1) the cash price or delivered price; "
            "(4) the charges, individually itemized, which are paid or to be paid "
            "in connection with the transaction but which are not incident to "
            "the extension of credit; (5) the total amount to be financed."
        )
        answer = (
            "Bago tapusin ang credit transaction, may disclosure.\n"
            "1. **Cash price o delivered price** ng property.\n"
            "4. **Individually itemized charges** na hindi kasama sa extension "
            "ng credit (hal. processing fees, insurance, etc.).\n"
            "5. **Total amount to be financed**."
        )
        checked = remove_unsupported_examples(answer, source)
        self.assertNotIn("processing fees", checked)
        self.assertNotIn("insurance", checked)
        self.assertIn("4. **Individually itemized charges**", checked)
        self.assertIn("5. **Total amount to be financed**", checked)

    def test_actual_source_example_may_be_kept(self):
        answer = "Ang halaga ay (hal. cash price, delivered price)."
        source = "LEGAL TEXT: the cash price or delivered price of the property"
        self.assertEqual(remove_unsupported_examples(answer, source), answer)

    def test_generated_url_is_not_used_as_legal_text(self):
        answer = "Mga singil (hal. insurance)."
        source = "SOURCE: RA 1, SECTION 1\nOFFICIAL URL: https://insurance.gov.ph/x\nLEGAL TEXT: charges"
        self.assertEqual(remove_unsupported_examples(answer, source), "Mga singil.")


if __name__ == "__main__":
    unittest.main()