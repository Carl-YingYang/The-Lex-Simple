import re
import unicodedata


REDACTION_EMAIL = "[REDACTED_EMAIL]"
REDACTION_PHONE = "[REDACTED_PHONE]"
REDACTION_URL = "[REDACTED_URL]"
REDACTION_ID = "[REDACTED_ID]"
REDACTION_ACCOUNT = "[REDACTED_ACCOUNT]"
REDACTION_ADDRESS = "[REDACTED_ADDRESS]"
REDACTION_NAME = "[REDACTED_NAME]"
REDACTION_SENSITIVE = "[REDACTED_SENSITIVE_DATA]"

PAGE_MARKER_PATTERN = re.compile(
    r"^\s*---\s*Page\s+(\d+)\s*---\s*$",
    flags=re.IGNORECASE,
)


def _normalize_text_without_destroying_pages(text: str) -> str:
    """Normalize OCR text while preserving page and paragraph boundaries."""
    normalized = unicodedata.normalize("NFKC", text)
    normalized = (
        normalized.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\u00a0", " ")
        .replace("\x00", "")
    )

    clean_lines = []

    for line in normalized.split("\n"):
        marker_match = PAGE_MARKER_PATTERN.match(line)

        if marker_match:
            # Canonical format expected by the page-aware chunker.
            clean_lines.append(
                f"--- Page {int(marker_match.group(1))} ---"
            )
            continue

        # Collapse horizontal whitespace only. Do not replace newlines.
        clean_lines.append(re.sub(r"[\t ]+", " ", line).strip())

    return re.sub(r"\n{3,}", "\n\n", "\n".join(clean_lines)).strip()


def _redact_sensitive_patterns(text: str) -> str:
    """
    Defense-in-depth masking for text that should already be sanitized by
    the mobile app. Existing [REDACTED_*] tokens remain intact.

    This is not a replacement for the on-device privacy sanitizer.
    """
    sanitized = text

    # Email addresses.
    sanitized = re.sub(
        r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
        r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
        r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
        REDACTION_EMAIL,
        sanitized,
        flags=re.IGNORECASE,
    )

    # Philippine mobile numbers and common OCR spacing/hyphen variations.
    sanitized = re.sub(
        r"(?<!\w)(?:\+?63[\s.-]*|0)9\d{2}"
        r"[\s.-]*\d{3}[\s.-]*\d{4}(?!\w)",
        REDACTION_PHONE,
        sanitized,
        flags=re.IGNORECASE,
    )

    # Common Philippine landline formats.
    sanitized = re.sub(
        r"(?<!\w)(?:\+?63[\s.-]*)?"
        r"\(?0?[2-9]\d{1,2}\)?[\s.-]*"
        r"\d{3,4}[\s.-]*\d{4}(?!\w)",
        REDACTION_PHONE,
        sanitized,
        flags=re.IGNORECASE,
    )

    # URLs. Stop at whitespace so following legal text is preserved.
    sanitized = re.sub(
        r"(?:https?://|www\.)[^\s<>\"']+",
        REDACTION_URL,
        sanitized,
        flags=re.IGNORECASE,
    )

    # Government IDs with an explicit label.
    sanitized = re.sub(
        r"\b(?:sss|gsis|philhealth|pag[\s-]?ibig|hdmf|tin|"
        r"passport|national\s+id|philid|philsys|umid|"
        r"driver'?s?\s+license|prc)"
        r"(?:\s+(?:id|no|number|license))?"
        r"\s*[:#.-]?\s*[A-Z0-9][A-Z0-9 .-]{4,30}\b",
        REDACTION_ID,
        sanitized,
        flags=re.IGNORECASE,
    )

    # Bank/account identifiers with an explicit label.
    sanitized = re.sub(
        r"\b(?:bank\s+account|account\s+(?:no|number)|"
        r"acct\.?\s*(?:no|number)?)"
        r"\s*[:#.-]?\s*[A-Z0-9][A-Z0-9 .-]{5,30}\b",
        REDACTION_ACCOUNT,
        sanitized,
        flags=re.IGNORECASE,
    )

    # Explicit address fields. The match ends at the current line so page
    # markers and following clauses cannot be swallowed.
    sanitized = re.sub(
        r"(?im)\b(?:home\s+address|residential\s+address|"
        r"present\s+address|permanent\s+address|mailing\s+address|"
        r"address|tirahan)\s*[:#-]?\s*[^\n]{5,160}$",
        REDACTION_ADDRESS,
        sanitized,
    )

    # Explicitly labelled party names. Do not redact every capitalized phrase
    # because that would destroy legal meaning and document titles.
    sanitized = re.sub(
        r"(?im)\b(?:full\s+name|complete\s+name|legal\s+name|"
        r"name\s+of\s+(?:plaintiff|defendant|accused|petitioner|"
        r"respondent|tenant|landlord|lessor|lessee|buyer|seller|"
        r"borrower|lender)|pangalan)"
        r"\s*[:#-]\s*[^\n,;]{2,100}",
        lambda match: (
            match.group(0).split(":", 1)[0] + ": " + REDACTION_NAME
            if ":" in match.group(0)
            else REDACTION_NAME
        ),
        sanitized,
    )

    # Final safety net for unusually long raw number sequences. Ordinary
    # years, article numbers, case numbers with short digits, and amounts are
    # intentionally not removed by this rule.
    sanitized = re.sub(
        r"(?<!\d)(?:\d[\s.-]?){10,20}(?!\d)",
        REDACTION_SENSITIVE,
        sanitized,
    )

    return sanitized


def sanitize_legal_text(text: str) -> str:
    """
    Normalize and defensively sanitize OCR text before orchestration.

    Important behavior:
    - preserves `--- Page N ---` boundaries;
    - preserves paragraph/newline structure;
    - preserves existing frontend [REDACTED_*] tokens;
    - applies a second conservative PII masking pass;
    - never performs OCR or uploads an image.

    Task B1 (L3): the legacy image-OCR helper (clean_and_extract_image)
    and its OpenCV/Tesseract wiring were removed — the mobile app runs
    OCR on-device and raw images are no longer accepted by the API.
    """
    if not isinstance(text, str) or not text:
        return ""

    normalized = _normalize_text_without_destroying_pages(text)
    sanitized = _redact_sensitive_patterns(normalized)

    # Re-normalize only horizontal spacing introduced by replacements while
    # retaining all page and paragraph boundaries.
    return _normalize_text_without_destroying_pages(sanitized)