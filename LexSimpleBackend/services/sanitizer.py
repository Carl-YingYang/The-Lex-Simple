import os
import re
import unicodedata

# Optional override for local Windows development.
# Example in .env or the operating-system environment:
# TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
#
# Do not force a Windows path in production/Linux. When this variable is not
# set, pytesseract uses the Tesseract executable available on the system PATH.
TESSERACT_CMD = os.getenv("TESSERACT_CMD", "").strip()


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
    """
    if not isinstance(text, str) or not text:
        return ""

    normalized = _normalize_text_without_destroying_pages(text)
    sanitized = _redact_sensitive_patterns(normalized)

    # Re-normalize only horizontal spacing introduced by replacements while
    # retaining all page and paragraph boundaries.
    return _normalize_text_without_destroying_pages(sanitized)


def clean_and_extract_image(
    image_bytes: bytes,
    filter_type: str,
) -> str:
    """
    Legacy/local utility for OpenCV preprocessing and Tesseract OCR.

    The privacy-safe mobile scan pipeline does not call this function because
    raw scan images are no longer accepted by `/simplify_batch`.
    """
    if not image_bytes:
        return ""

    try:
        import cv2
        import numpy as np
        import pytesseract
    except ImportError as error:
        raise RuntimeError(
            "Legacy image OCR dependencies are not installed."
        ) from error

    if TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

    image_array = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    if image is None:
        return ""

    height, width = image.shape[:2]
    maximum_dimension = 1_500

    if max(height, width) > maximum_dimension:
        scale = maximum_dimension / float(max(height, width))
        image = cv2.resize(
            image,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA,
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    if filter_type == "grayscale":
        processed_image = gray
    elif filter_type == "bw":
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, processed_image = cv2.threshold(
            blurred,
            0,
            255,
            cv2.THRESH_BINARY + cv2.THRESH_OTSU,
        )
    elif filter_type == "magic":
        dilated_image = cv2.dilate(
            gray,
            np.ones((7, 7), np.uint8),
        )
        background_image = cv2.medianBlur(dilated_image, 21)
        difference_image = 255 - cv2.absdiff(
            gray,
            background_image,
        )
        normalized_image = cv2.normalize(
            difference_image,
            None,
            alpha=0,
            beta=255,
            norm_type=cv2.NORM_MINMAX,
            dtype=cv2.CV_8UC1,
        )
        processed_image = cv2.adaptiveThreshold(
            normalized_image,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            51,
            15,
        )
    else:
        processed_image = gray

    extracted_text = pytesseract.image_to_string(
        processed_image,
        config=r"--oem 3 --psm 6",
    )

    return extracted_text.strip()
