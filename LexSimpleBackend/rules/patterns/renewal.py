# rules/patterns/renewal.py
import re
from typing import Optional
from .base import RuleMatch, ClausePattern


class AutoRenewalPattern(ClausePattern):
    name = "auto_renewal"

    PATTERN = re.compile(
        r"(?i)(?:this\s+agreement|contract|lease|this\s+contract).{0,150}?"
        r"(?:shall\s+)?(?:automatically|auto)[- ]?renew"
        r"(?:ed|s|al)?(?:.{0,100}?(?:unless|otherwise|provided).{0,80}?"
        r"(?:notice|written\s+notice|notification).{0,50}?\d+\s*(?:days|day))?",
        re.DOTALL
    )

    EXPLANATION = (
        "May 'automatic renewal' clause ito — ibig sabihin, "
        "kapag tapos na yung kontrata, awtomatikong i-e-extend pa "
        "ito unless nagbigay ka ng written notice na ayaw mo na."
    )
    ADVICE = (
        "Kung ayaw mong ma-extend, tandaan mo yung deadline ng notice "
        "(usually 30-60 days before expiry). I-set mo sa calendar. "
        "Kung hindi ka nagbigay ng notice, binded ka na for another term."
    )

    def match(self, text: str) -> Optional[RuleMatch]:
        m = self.PATTERN.search(text)
        if not m:
            return None
        start = max(0, m.start() - 50)
        end = min(len(text), m.end() + 50)
        matched = text[start:end].strip()
        conf = 0.9 if "notice" in m.group(0).lower() else 0.7
        return RuleMatch(
            pattern_name=self.name,
            clause_title="Automatic Renewal Clause",
            matched_text=matched,
            risk_level="medium",
            score_deduction=10,
            explanation=self.EXPLANATION,
            advice=self.ADVICE,
            confidence=conf,
        )