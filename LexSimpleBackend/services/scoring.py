# services/scoring.py
# SCORING VERSION: 2.0.0
# Task SC1: single source of truth para sa severity-based deductions at
# compound score caps. Deterministic ito — ang LLM ay nagbibigay lang ng
# severity/category per clause; ang numeric na bawas at ang final score
# caps ay kinakalkula dito sa backend, hindi sa modelo.

from typing import Iterable, List, Optional

# ------------------------------------------------------------
# DEDUCTIONS (isang dict lang — dito lang baguhin kung i-tune)
# ------------------------------------------------------------
SEVERITY_DEDUCTIONS = {
    "critical": 25,
    "high": 15,
    "medium": 8,
    "low": 3,
}

RISK_CATEGORIES = (
    "excessive_penalty",
    "automatic_termination",
    "unilateral_change",
    "entry_without_notice",
    "one_sided_liability",
    "waiver_of_rights",
    "hidden_or_open_ended_fees",
    "auto_renewal",
    "indefinite_obligation",
    "other",
)

# ------------------------------------------------------------
# COMPOUND RULE (constants)
#   >=1 critical  -> hindi tataas ang final score sa 49
#   >=3 high      -> hindi tataas ang final score sa 59
# ------------------------------------------------------------
CRITICAL_SCORE_CAP = 49
MULTIPLE_HIGH_THRESHOLD = 3
MULTIPLE_HIGH_SCORE_CAP = 59

# Fallbacks kapag invalid o kulang ang field mula sa modelo.
DEFAULT_SEVERITY = "medium"
DEFAULT_CATEGORY = "other"


def normalize_severity(value) -> str:
    """Ibalik ang valid severity, o "" kapag wala o invalid."""
    if not isinstance(value, str):
        return ""
    severity = value.strip().casefold()
    return severity if severity in SEVERITY_DEDUCTIONS else ""


def normalize_category(value) -> str:
    """Ibalik ang valid category, o "" kapag wala o invalid."""
    if not isinstance(value, str):
        return ""
    category = value.strip().casefold().replace(" ", "_").replace("-", "_")
    return category if category in RISK_CATEGORIES else ""


def severity_deduction(severity: str) -> int:
    """Numeric na bawas para sa isang severity (may safe default)."""
    return SEVERITY_DEDUCTIONS.get(
        severity,
        SEVERITY_DEDUCTIONS[DEFAULT_SEVERITY],
    )


def compound_score_cap(severities: Iterable[str]) -> Optional[int]:
    """
    Ibalik ang pinakamahirap na cap na naaayon sa compound rule, o None.

    Kung parehong naka-trigger (critical + >=3 high), ang mas mababang
    cap (49) ang nananalo.
    """
    counts = {"critical": 0, "high": 0}
    for severity in severities:
        if severity in counts:
            counts[severity] += 1

    caps: List[int] = []
    if counts["critical"] >= 1:
        caps.append(CRITICAL_SCORE_CAP)
    if counts["high"] >= MULTIPLE_HIGH_THRESHOLD:
        caps.append(MULTIPLE_HIGH_SCORE_CAP)

    return min(caps) if caps else None


def apply_compound_caps(score, severities: Iterable[str]):
    """I-apply ang compound caps sa isang computed score."""
    if score is None:
        return None

    cap = compound_score_cap(severities)
    if cap is None:
        return score

    return min(score, cap)