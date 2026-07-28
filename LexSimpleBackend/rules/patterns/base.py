# rules/patterns/base.py
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass
class RuleMatch:
    """Result kapag nag-match ang isang clause pattern."""
    pattern_name: str          # "auto_renewal"
    clause_title: str          # "Automatic Renewal Clause"
    matched_text: str          # yung exact snippet na na-match
    risk_level: str            # "high" | "medium" | "low"
    score_deduction: int       # 5-20
    explanation: str           # Taglish explanation — pre-written, walang LLM
    advice: str                # Taglish advice — pre-written
    confidence: float          # 0.0-1.0, gaano ka-confident ang regex match


class ClausePattern(Protocol):
    """Interface na susundin ng lahat ng patterns."""
    name: str

    def match(self, text: str) -> Optional[RuleMatch]:
        """Tignan kung may pattern sa text. Ibalik ang RuleMatch o None."""
        ...