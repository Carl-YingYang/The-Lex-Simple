# rules/patterns/liquidated.py
import re
from typing import Optional
from .base import RuleMatch, ClausePattern


class LiquidatedDamagesPattern(ClausePattern):
    name = "liquidated_damages"

    PATTERN = re.compile(
        r"(?i)(?:liquidated\s+damages|penalty(?:\s+clause)?|penalty\s+of|"
        r"shall\s+pay\s+(?:as\s+)?penalty).{0,100}?"
        r"(?:shall\s+pay|to\s+pay|agrees?\s+to\s+pay|pays?).{0,80}?"
        r"(?:₱|php|peso|pesos|\$)?\s*[\d,]+(?:\.\d+)?"
        r"(?:\s*(?:per|each|every)\s+(?:day|week|month|year))?",
        re.DOTALL
    )

    EXPLANATION = (
        "May 'liquidated damages' o penalty clause ito — kung magkaroon "
        "ng breach o pagkasira ng kontrata, may specific na halaga na "
        "babayaran ang nag-violate, usually per day o per incident."
    )
    ADVICE = (
        "Check mo kung reasonable yung halaga. Kung sobrang laki, pwede "
        "itong i-question sa court bilang 'unconscionable'. Dapat lang "
        "na tama ang computation at hindi sobrang parusa."
    )

    def match(self, text: str) -> Optional[RuleMatch]:
        m = self.PATTERN.search(text)
        if not m:
            return None
        start = max(0, m.start() - 50)
        end = min(len(text), m.end() + 50)
        matched = text[start:end].strip()
        conf = 0.85
        return RuleMatch(
            pattern_name=self.name,
            clause_title="Liquidated Damages / Penalty Clause",
            matched_text=matched,
            risk_level="high",
            score_deduction=15,
            explanation=self.EXPLANATION,
            advice=self.ADVICE,
            confidence=conf,
        )