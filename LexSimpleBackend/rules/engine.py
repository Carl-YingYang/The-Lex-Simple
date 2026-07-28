# rules/engine.py
from typing import List, Optional
from .patterns.base import RuleMatch, ClausePattern
from .patterns.renewal import AutoRenewalPattern
from .patterns.liquidated import LiquidatedDamagesPattern
from .patterns.waiver import WaiverOfRightsPattern


class RuleEngine:
    """Nagfa-fold sa lahat ng clause patterns at nag-a-run ng matches."""

    def __init__(self, patterns: Optional[List[ClausePattern]] = None):
        self.patterns = patterns or [
            AutoRenewalPattern(),
            LiquidatedDamagesPattern(),
            WaiverOfRightsPattern(),
        ]

    def match_all(self, text: str) -> List[RuleMatch]:
        """I-run lahat ng patterns, ibalik lahat ng matches.
        Useful para sa /simplify na tumitingin sa buong document."""
        return [m for p in self.patterns if (m := p.match(text))]

    def match_first(self, text: str) -> Optional[RuleMatch]:
        """Ibalik lang ang unang match. Useful para sa quick routing."""
        for p in self.patterns:
            if m := p.match(text):
                return m
        return None