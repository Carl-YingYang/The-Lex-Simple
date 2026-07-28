# rules/patterns/waiver.py
import re
from typing import Optional
from .base import RuleMatch, ClausePattern


class WaiverOfRightsPattern(ClausePattern):
    name = "waiver_of_rights"

    PATTERN = re.compile(
        r"(?i)(?:party(?:ies)?\s+(?:hereby\s+)?(?:waive[s]?|relinquish(?:es)?|"
        r"surrender[s]?)|waiver\s+of\s+(?:rights|claims|legal\s+rights)|"
        r"(?:no\s+)?further\s+(?:claims|action|recourse|demand)).{0,100}?"
        r"(?:against|to\s+sue|legal\s+action|claims?|rights?|demand)",
        re.DOTALL
    )

    EXPLANATION = (
        "May 'waiver of rights' clause ito — pinapawalang-sala o "
        "iniiwan mo yung karapatan mong magsampa ng kaso o gumawa "
        "ng claims sa future. Minsan kasama na ang karapatang "
        "mag-demand ng damages."
    )
    ADVICE = (
        "Basahin mabuti kung anong mga rights ang nawawala sa iyo. "
        "Kung may breach sila, bawal ka na ring magsampa ng kaso "
        "kahit tama ka. Consider mo kung worth it ba yung kontrata "
        "kahit may waiver na ito."
    )

    def match(self, text: str) -> Optional[RuleMatch]:
        m = self.PATTERN.search(text)
        if not m:
            return None
        start = max(0, m.start() - 50)
        end = min(len(text), m.end() + 50)
        matched = text[start:end].strip()
        conf = 0.8
        return RuleMatch(
            pattern_name=self.name,
            clause_title="Waiver of Rights Clause",
            matched_text=matched,
            risk_level="high",
            score_deduction=20,
            explanation=self.EXPLANATION,
            advice=self.ADVICE,
            confidence=conf,
        )