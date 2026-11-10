# Task P0 item 2: deterministic scoring severity tests.
# Walang tunay na LLM call — ang numeric score ay galing sa
# services/scoring.py (source of truth mula sa Task SC1) at sa
# deterministic na _combine_chunk_results / normalize_ai_keys path ng
# services/llm_service.py. Ang LLM ay hindi tinatawag kahit kailan dito.
#
# Saklaw (ayon sa Task P0):
#   (a) 1 critical + 3 high + 1 medium  -> 22
#   (b) 1 critical lang                 -> hindi lalampas sa 49
#   (c) 3 high                          -> hindi lalampas sa 59
#   (d) MONOTONICITY: pagdagdag ng anumang finding ay hindi kailanman
#       nagtataas ng score — lahat ng kumbinasyon hanggang 6 findings
#       mula sa 4 severity
#   (e) invalid o kulang na severity/category -> default (medium/other)
#   (f) walang finding -> 100 at walang cap (sa score contract; sa
#       end-to-end pipeline ang zero findings ay "unscored" o None)

import itertools
import unittest

from services import llm_service
from services.scoring import (
    CRITICAL_SCORE_CAP,
    DEFAULT_CATEGORY,
    DEFAULT_SEVERITY,
    MULTIPLE_HIGH_SCORE_CAP,
    SEVERITY_DEDUCTIONS,
    apply_compound_caps,
    compound_score_cap,
    normalize_category,
    normalize_severity,
    severity_deduction,
)

SEVERITIES = ("critical", "high", "medium", "low")

# Sinusuri ang parehong antas:
#   1) score contract — ang dokumentadong formula (100 minus deductions,
#      min-capped) na buo mula sa mga real na function sa scoring.py;
#   2) pipeline path — ang totoong deterministic na _combine_chunk_results
#      ng llm_service (dedup + deduction sum + compound caps), walang LLM.


def _contract_score(severities) -> int:
    """Score contract: 100 - min(100, sum ng deductions), may compound caps.

    Eksaktong salamin ng deterministic scoring (Task SC1): bawat finding
    ay may numeric na bawas mula sa severity, at ang kabuuan ay
    min-capped ng apply_compound_caps.
    """
    normalized = [
        normalize_severity(severity) or DEFAULT_SEVERITY
        for severity in severities
    ]
    raw = max(
        0,
        100 - min(100, sum(severity_deduction(s) for s in normalized)),
    )
    return apply_compound_caps(raw, normalized)


def _lease_finding(index: int, severity: str) -> dict:
    """Isang lease finding na may nakalaang severity."""
    valid = normalize_severity(severity) or DEFAULT_SEVERITY
    return {
        "clause_title": f"Lease Clause {index}",
        "explanation": "Test finding para sa deterministic scoring.",
        "practical_advice": "Basahin at ihambing bago pirmahan.",
        "severity": severity,
        "category": "other",
        "score_deduction": severity_deduction(valid),
        "original_text": f"Lease clause number {index} for scoring tests.",
        "confidence": "80%",
    }


_LEASE_TEXT = (
    "--- Page 1 ---\n"
    "RESIDENTIAL LEASE AGREEMENT between the Landlord and the Lessee.\n"
    "The Lessee shall pay the rent on or before the fifth day of each "
    "month.\n"
    "The Landlord may enter the unit without prior notice.\n"
)

_lease_score_cache: dict = {}


def _lease_pipeline_score(severities):
    """Totoong pipeline score (walang LLM) para sa isang lease chunk.

    Bumabalik ng None kapag walang findings — iyon ang desisyon ng design
    ("no findings is an absence of detected flags, not a perfect score").
    """
    key = tuple(sorted(severities))
    if key in _lease_score_cache:
        return _lease_score_cache[key]

    chunk = {
        "documentTitle": "Residential Lease Agreement",
        "clauses": [
            _lease_finding(index, severity)
            for index, severity in enumerate(key)
        ],
        "keyClauses": [],
        "droppedFindingCount": 0,
        "droppedKeyClauseCount": 0,
        "chunkUnusable": False,
        "ragContext": "",
    }
    result = llm_service._combine_chunk_results(
        [chunk], _LEASE_TEXT
    )["safety_score"]
    _lease_score_cache[key] = result
    return result


class ScoreContractTests(unittest.TestCase):
    """(a)-(f) sa antas ng services/scoring.py — ang source of truth."""

    def test_a_lease_one_critical_three_high_one_medium_scores_22(self):
        severities = ["critical", "high", "high", "high", "medium"]
        # 100 - 25 - (3 x 15) - 8 = 22; ang cap na 49 (critical) ay hindi
        # umaabot dito dahil mas mababa na ang raw score.
        self.assertEqual(_contract_score(severities), 22)

    def test_b_single_critical_never_exceeds_49(self):
        self.assertEqual(_contract_score(["critical"]), CRITICAL_SCORE_CAP)
        self.assertLessEqual(_contract_score(["critical"]), 49)
        self.assertEqual(_lease_pipeline_score(["critical"]), 49)
        # Kahit magdamot na critical: hindi lalampas sa 49.
        for count in (1, 2, 3):
            with self.subTest(criticals=count):
                self.assertLessEqual(
                    _contract_score(["critical"] * count),
                    CRITICAL_SCORE_CAP,
                )

    def test_c_three_high_never_exceeds_59(self):
        severities = ["high", "high", "high"]
        # 100 - (3 x 15) = 55 — mas mababa na sa 59 cap.
        self.assertLessEqual(
            _contract_score(severities), MULTIPLE_HIGH_SCORE_CAP
        )
        self.assertEqual(_contract_score(severities), 55)
        self.assertEqual(_lease_pipeline_score(severities), 55)
        # Kapag lumala (4-6 high), ang 59 cap ang nagpi-pin ng score
        # kung sakaling lumampas ang raw — hindi ito floor.
        self.assertEqual(
            _contract_score(["high"] * 4),
            min(100 - 4 * 15, MULTIPLE_HIGH_SCORE_CAP),
        )

    def test_d_monotonicity_all_combinations_up_to_six_findings(self):
        # (d) MONOTONICITY: lahat ng multiset hanggang 6 findings mula sa
        # 4 severity (1 + 4 + 10 + 20 + 35 + 56 + 84 = 210 estado), at
        # bawat posibleng pagdaragdag ng isang finding ay hindi dapat
        # nagtataas ng score. Sinusuri ang parehong contract at pipeline.
        contract_scores = {}
        for count in range(0, 7):
            for combo in itertools.combinations_with_replacement(
                SEVERITIES, count
            ):
                key = tuple(sorted(combo))
                contract_scores[key] = _contract_score(list(key))
                if not key:
                    # Walang findings: hindi nire-rate sa pipeline (None).
                    self.assertIsNone(_lease_pipeline_score(key))
                else:
                    self.assertEqual(
                        _lease_pipeline_score(key),
                        contract_scores[key],
                        msg=f"pipeline mismatch for {key}",
                    )

        for key, base_score in contract_scores.items():
            for added in SEVERITIES:
                bigger = tuple(sorted(key + (added,)))
                next_score = contract_scores.get(bigger)
                if next_score is None:
                    next_score = _contract_score(list(bigger))
                with self.subTest(findings=len(key), base=key, added=added):
                    self.assertLessEqual(
                        next_score,
                        base_score,
                        msg=(
                            f"adding a {added} finding raised the score: "
                            f"{key} ({base_score}) -> {bigger} ({next_score})"
                        ),
                    )

    def test_e_invalid_or_missing_fields_fall_back_to_defaults(self):
        # Default constants ayon sa spec.
        self.assertEqual(DEFAULT_SEVERITY, "medium")
        self.assertEqual(DEFAULT_CATEGORY, "other")

        # normalize_severity: valid lang ang apat; ang iba ay "".
        self.assertEqual(normalize_severity("CRITICAL"), "critical")
        self.assertEqual(normalize_severity("  High  "), "high")
        self.assertEqual(normalize_severity("uber"), "")
        self.assertEqual(normalize_severity(None), "")
        self.assertEqual(normalize_severity(25), "")

        # normalize_category: space/hyphen ay nagiging underscore; ang
        # hindi kilala ay "".
        self.assertEqual(
            normalize_category("Entry Without Notice"),
            "entry_without_notice",
        )
        self.assertEqual(
            normalize_category("auto-renewal"), "auto_renewal"
        )
        self.assertEqual(normalize_category("bogus"), "")
        self.assertEqual(normalize_category(None), "")

        # severity_deduction: kapag invalid o kulang, medium (8) ang bawas.
        self.assertEqual(
            severity_deduction(""),
            SEVERITY_DEDUCTIONS[DEFAULT_SEVERITY],
        )
        self.assertEqual(severity_deduction("uber"), 8)

        # compound_score_cap: walang trigger, walang cap.
        self.assertIsNone(compound_score_cap([]))
        self.assertIsNone(compound_score_cap(["medium", "low"]))

    def test_e_pipeline_normalizes_invalid_and_missing_fields(self):
        # Totoong normalization path (normalize_ai_keys, walang LLM).
        source = (
            "The Lessee shall pay any amount the Landlord demands without "
            "prior notice."
        )
        clauses = [
            # Kulang: walang severity at walang category.
            {"clause_title": "Mystery Clause", "original_text": source},
            # Invalid: hindi totoong severity at category.
            {
                "clause_title": "Loud Clause",
                "original_text": source,
                "severity": "UBER",
                "category": "hindi totoo",
            },
            # Legacy: walang severity pero may bilang na bawas.
            {
                "clause_title": "Legacy Clause",
                "original_text": source,
                "score_deduction": 30,
            },
        ]

        normalized = llm_service.normalize_ai_keys(clauses, source, 1)

        self.assertEqual(normalized[0]["severity"], DEFAULT_SEVERITY)
        self.assertEqual(normalized[0]["category"], DEFAULT_CATEGORY)
        self.assertEqual(normalized[0]["score_deduction"], 8)

        self.assertEqual(normalized[1]["severity"], DEFAULT_SEVERITY)
        self.assertEqual(normalized[1]["category"], DEFAULT_CATEGORY)
        self.assertEqual(normalized[1]["score_deduction"], 8)

        # Legacy: iginagalang ang bilang na bawas, at "medium" ang
        # naka-store na severity para sa caps (hindi critical/high).
        self.assertEqual(normalized[2]["score_deduction"], 30)
        self.assertEqual(normalized[2]["severity"], DEFAULT_SEVERITY)

    def test_f_no_findings_score_100_no_cap(self):
        # Score contract: walang findings, walang bawas, walang cap —
        # mananatili ang 100.
        self.assertEqual(apply_compound_caps(100, []), 100)
        self.assertEqual(_contract_score([]), 100)
        # Pipeline: ang zero findings ay inuugnay sa "unscored" (None) —
        # dokumentadong desisyon ng design, hindi isang perpektong 100.
        self.assertIsNone(_lease_pipeline_score(()))


if __name__ == "__main__":
    unittest.main()