import re
from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple

# OCR QUALITY VERSION: 2.0.0
# Questionable numbers and detached tables remain visible as warnings;
# they cannot be silently corrected by the model. Mixed documents still
# require separate requests to avoid combining unrelated contracts.

PAGE_MARKER_PATTERN = re.compile(r"(?m)^--- Page (\d+) ---\s*$")

VALID_MONEY_PATTERN = re.compile(
    r"^(?:PHP|₱)[ \t]*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$",
    re.I,
)
MONEY_CANDIDATE_PATTERN = re.compile(
    r"(?<![A-Za-z])(?:PHP|₱)[ \t]*"
    r"[0-9OoIlCc.,]{2,20}"
    r"(?:[ \t]+(?=[0-9OoIlCc.,]*[0-9])[0-9OoIlCc.,]+)*",
    re.I,
)

DOCUMENT_SIGNATURES: Dict[str, Tuple[re.Pattern, ...]] = {
    "loan": (
        re.compile(r"\bloan agreement\b", re.I),
        re.compile(r"\b(?:creditor|lender)\b.{0,180}\b(?:debtor|borrower)\b", re.I | re.S),
        re.compile(r"\bprincipal amount\b", re.I),
    ),
    "service": (
        re.compile(r"\bservice agreement\b", re.I),
        re.compile(r"\bprovider\b.{0,180}\bclient\b", re.I | re.S),
    ),
    "purchase": (
        re.compile(r"\bpurchase price\b", re.I),
        re.compile(r"\bbuyer\b.{0,180}\b(?:seller|office equipment)\b", re.I | re.S),
    ),
    "lease": (
        re.compile(r"\blease (?:agreement|excerpt)\b", re.I),
        re.compile(r"\blessor\b.{0,180}\blessee\b", re.I | re.S),
        re.compile(r"\bmonthly rent\b", re.I),
    ),
    "supply": (
        re.compile(r"\bsupply agreement\b", re.I),
        re.compile(r"\bdelivery schedule\b", re.I),
        re.compile(r"\bbatch\s+[A-Z]-?\d+\b", re.I),
    ),
    "court": (
        re.compile(r"\brepublic of the philippines\b", re.I),
        re.compile(r"\b(?:complainant|petitioner)\b.{0,180}\brespondent\b", re.I | re.S),
    ),
}


@dataclass(frozen=True)
class OcrQualityIssue:
    code: str
    message: str
    severity: str
    page_number: Optional[int] = None
    sample: Optional[str] = None


def _page_blocks(text: str) -> List[Tuple[int, str]]:
    matches = list(PAGE_MARKER_PATTERN.finditer(text))
    if not matches:
        return [(1, text.strip())]

    blocks: List[Tuple[int, str]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        blocks.append((int(match.group(1)), text[match.end():end].strip()))
    return blocks


def _document_kind(page_text: str) -> Optional[str]:
    header = page_text[:700]
    scores = {
        kind: sum(bool(pattern.search(header)) for pattern in patterns)
        for kind, patterns in DOCUMENT_SIGNATURES.items()
    }
    best_kind, best_score = max(scores.items(), key=lambda item: item[1])
    return best_kind if best_score >= 2 else None


def _money_issues(page_number: int, page_text: str) -> List[OcrQualityIssue]:
    issues: List[OcrQualityIssue] = []
    for match in MONEY_CANDIDATE_PATTERN.finditer(page_text):
        candidate = match.group(0).strip().rstrip(" ,.;")
        if VALID_MONEY_PATTERN.fullmatch(candidate):
            continue

        issues.append(
            OcrQualityIssue(
                code="ambiguous_amount",
                severity="warning",
                page_number=page_number,
                sample=candidate[:40],
                message=(
                    f"Posibleng mali ang nabasang halaga sa pahina {page_number}: "
                    f"{candidate}. Ihambing sa larawan bago umasa sa numero."
                ),
            )
        )
    return issues


def assess_ocr_quality(text: str) -> dict:
    pages = _page_blocks(text)
    issues: List[OcrQualityIssue] = []
    page_kinds: List[Tuple[int, str]] = []

    for page_number, page_text in pages:
        issues.extend(_money_issues(page_number, page_text))
        kind = _document_kind(page_text)
        if kind:
            page_kinds.append((page_number, kind))

        if re.search(r"\b(?:TOTAL|Amount due|Reference)\b", page_text, re.I):
            amount_lines = re.findall(
                r"(?im)^\s*(?:PHP|₱)[^\n]{0,24}$",
                page_text,
            )
            if len(amount_lines) >= 2:
                isolated_dates = len(re.findall(
                    r"(?im)^\s*\d{1,2}\s+"
                    r"(?:January|February|March|April|May|June|July|August|"
                    r"September|October|November|December)\s+20\d{2}\s*$",
                    page_text,
                ))
                isolated_refs = len(re.findall(
                    r"(?im)^\s*[A-Z]{2,6}-\d{2,}\s*$",
                    page_text,
                ))
                broken_columns = isolated_dates >= 2 and isolated_refs >= 2
                issues.append(
                    OcrQualityIssue(
                        code=(
                            "table_columns_detached"
                            if broken_columns else "table_layout_requires_review"
                        ),
                severity="warning",
                        page_number=page_number,
                        message=(
                            f"{('Magkakahiwalay ang mga hanay ng talaan' if broken_columns else 'May talaan ng halaga')} "
                            f"sa pahina {page_number}. Ihambing sa larawan bago umasa sa numero."
                        ),
                    )
                )

    distinct_kinds = list(dict.fromkeys(kind for _, kind in page_kinds))
    if len(distinct_kinds) >= 2:
        summary = ", ".join(
            f"Page {page}: {kind}" for page, kind in page_kinds
        )
        issues.insert(
            0,
            OcrQualityIssue(
                code="mixed_documents",
                severity="blocking",
                message=(
                    "Mukhang magkakaibang dokumento ang pinagsama sa isang batch "
                    f"({summary}). Hatiin muna ang batch bago ipa-analyze."
                ),
            ),
        )

    blocking = [issue for issue in issues if issue.severity == "blocking"]
    status = (
        "analysis_blocked"
        if blocking
        else "review_recommended"
        if issues
        else "good"
    )

    return {
        "status": status,
        "issues": [asdict(issue) for issue in issues],
        "pageKinds": [
            {"pageNumber": page, "kind": kind}
            for page, kind in page_kinds
        ],
    }