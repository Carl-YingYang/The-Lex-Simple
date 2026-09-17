import logging
import re
from typing import List, Optional, Tuple


logger = logging.getLogger("lex.validator")

MAX_TITLE_CHARACTERS = 120
MAX_DESCRIPTION_CHARACTERS = 2_000
MAX_ADVICE_CHARACTERS = 2_000
MAX_FOUND_TEXT_CHARACTERS = 4_000

INVALID_FOUND_TEXT_VALUES = {
    "refer to document",
    "refer to document.",
    "not provided",
    "not available",
    "n/a",
    "none",
    "unknown",
}


def _validation_error(code: str, message: str) -> dict:
    return {
        "status": "error",
        "code": code,
        "message": message,
        "documentStatus": "processing_error",
    }


def _risk_level_from_score(score: int) -> str:
    if score >= 90:
        return "Very Safe"
    if score >= 70:
        return "Acceptable"
    if score >= 50:
        return "Risky"
    return "High Risk"


def _parse_integer(
    value,
    minimum: int,
    maximum: int,
) -> Optional[int]:
    if isinstance(value, bool):
        return None

    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None

    if parsed < minimum or parsed > maximum:
        return None

    return parsed


def _parse_confidence(value) -> Optional[int]:
    if isinstance(value, str):
        match = re.search(r"\d{1,3}", value)
        if not match:
            return None
        value = match.group(0)

    return _parse_integer(value, minimum=0, maximum=100)


def _required_text(
    value,
    field_name: str,
    maximum_characters: int,
) -> Tuple[Optional[str], Optional[str]]:
    if not isinstance(value, str):
        return None, f"{field_name} must be text."

    cleaned = value.strip()

    if not cleaned:
        return None, f"{field_name} cannot be empty."

    if len(cleaned) > maximum_characters:
        return (
            None,
            f"{field_name} exceeds {maximum_characters} characters.",
        )

    return cleaned, None


def _normalize_finding_key(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _validate_finding(
    item: dict,
    index: int,
) -> Tuple[Optional[dict], Optional[str]]:
    title, title_error = _required_text(
        item.get("clause_title", item.get("title")),
        field_name=f"findings[{index}].title",
        maximum_characters=MAX_TITLE_CHARACTERS,
    )
    if title_error:
        return None, title_error

    description, description_error = _required_text(
        item.get("explanation", item.get("description")),
        field_name=f"findings[{index}].description",
        maximum_characters=MAX_DESCRIPTION_CHARACTERS,
    )
    if description_error:
        return None, description_error

    advice, advice_error = _required_text(
        item.get("practical_advice", item.get("advice")),
        field_name=f"findings[{index}].advice",
        maximum_characters=MAX_ADVICE_CHARACTERS,
    )
    if advice_error:
        return None, advice_error

    found_text, found_text_error = _required_text(
        item.get("original_text", item.get("foundText")),
        field_name=f"findings[{index}].foundText",
        maximum_characters=MAX_FOUND_TEXT_CHARACTERS,
    )
    if found_text_error:
        return None, found_text_error

    if found_text.casefold() in INVALID_FOUND_TEXT_VALUES:
        return (
            None,
            f"findings[{index}].foundText is only a placeholder.",
        )

    score_deduction = _parse_integer(
        item.get(
            "score_deduction",
            item.get(
                "scoreDeduction",
                item.get("deduction"),
            ),
        ),
        minimum=1,
        maximum=100,
    )
    if score_deduction is None:
        return (
            None,
            f"findings[{index}].scoreDeduction must be from 1 to 100.",
        )

    confidence = _parse_confidence(item.get("confidence"))
    if confidence is None:
        return (
            None,
            f"findings[{index}].confidence must be from 0% to 100%.",
        )

    clean_finding = {
        "title": title,
        "description": description,
        "advice": advice,
        "foundText": found_text,
        "confidence": f"{confidence}%",
        "scoreDeduction": score_deduction,
        "source": item.get("source", "llm"),
    }

    source_chunk = _parse_integer(
        item.get("source_chunk", item.get("sourceChunk")),
        minimum=1,
        maximum=10_000,
    )
    if source_chunk is not None:
        clean_finding["sourceChunk"] = source_chunk

    return clean_finding, None


def _validate_processing_meta(value) -> Optional[dict]:
    if not isinstance(value, dict):
        return None

    chunk_count = _parse_integer(
        value.get("chunkCount"),
        minimum=1,
        maximum=10_000,
    )
    page_count = _parse_integer(
        value.get("pageCount"),
        minimum=1,
        maximum=10_000,
    )
    processed_characters = _parse_integer(
        value.get("processedCharacters"),
        minimum=1,
        maximum=100_000_000,
    )
    document_hash = value.get("documentHash")

    if (
        chunk_count is None
        or page_count is None
        or processed_characters is None
        or not isinstance(document_hash, str)
        or not re.fullmatch(r"[a-fA-F0-9]{64}", document_hash)
    ):
        return None

    return {
        "chunkCount": chunk_count,
        "pageCount": page_count,
        "processedCharacters": processed_characters,
        "documentHash": document_hash.casefold(),
    }


def validate_llm_response(llm_data: dict) -> dict:
    """
    Strictly validate the complete chunked LLM analysis.

    Missing or malformed values are errors. They must never be converted to
    a 100 / Very Safe result merely because a field was absent.
    """
    if not isinstance(llm_data, dict):
        return _validation_error(
            "invalid_ai_response_type",
            "Invalid AI response format.",
        )

    if llm_data.get("status") == "error":
        return _validation_error(
            str(llm_data.get("code") or "upstream_ai_error"),
            str(
                llm_data.get("message")
                or "The AI analysis did not complete."
            ),
        )

    data = llm_data.get("data", llm_data)
    if not isinstance(data, dict):
        return _validation_error(
            "invalid_ai_data",
            "The AI response does not contain a valid data object.",
        )

    raw_findings = data.get("clauses", data.get("findings"))
    if not isinstance(raw_findings, list):
        return _validation_error(
            "missing_findings_array",
            "The AI response is missing its findings array.",
        )

    clean_findings: List[dict] = []
    finding_keys = set()

    for index, item in enumerate(raw_findings):
        if not isinstance(item, dict):
            return _validation_error(
                "invalid_finding_type",
                f"findings[{index}] must be an object.",
            )

        clean_finding, finding_error = _validate_finding(item, index)
        if finding_error or clean_finding is None:
            return _validation_error(
                "malformed_finding",
                finding_error or f"findings[{index}] is malformed.",
            )

        finding_key = _normalize_finding_key(
            clean_finding["foundText"]
        )
        if finding_key in finding_keys:
            continue

        finding_keys.add(finding_key)
        clean_findings.append(clean_finding)

    explicit_score = _parse_integer(
        data.get("safety_score", data.get("score")),
        minimum=0,
        maximum=100,
    )
    if explicit_score is None:
        return _validation_error(
            "missing_or_invalid_score",
            "The AI response does not contain a valid score from 0 to 100.",
        )

    calculated_score = max(
        0,
        100
        - sum(
            finding["scoreDeduction"]
            for finding in clean_findings
        ),
    )

    if not clean_findings and explicit_score != 100:
        return _validation_error(
            "score_without_findings",
            (
                "The AI reduced the score but did not provide any grounded "
                "finding."
            ),
        )

    # The deductions are the deterministic source of truth.
    final_score = calculated_score
    score_adjusted = final_score != explicit_score

    document_title = data.get("documentTitle", "Legal Document")
    if not isinstance(document_title, str) or not document_title.strip():
        document_title = "Legal Document"
    document_title = document_title.strip()[:MAX_TITLE_CHARACTERS]

    processing_meta = _validate_processing_meta(
        data.get("processingMeta")
    )
    if processing_meta is None:
        return _validation_error(
            "invalid_processing_metadata",
            (
                "The AI response is missing valid page/chunk processing "
                "metadata."
            ),
        )

    document_status = (
        "analyzed" if clean_findings else "analyzed_no_flags"
    )

    validated_data = {
        "score": final_score,
        "riskLevel": _risk_level_from_score(final_score),
        "documentTitle": document_title,
        "documentStatus": document_status,
        "findings": clean_findings,
        "processingMeta": processing_meta,
        "scoreAdjusted": score_adjusted,
    }

    rag_context = data.get("rag_context_used")
    if isinstance(rag_context, str):
        validated_data["rag_context_used"] = rag_context

    logger.info(
        "Validated AI response: pages=%s chunks=%s findings=%s "
        "score=%s adjusted=%s",
        processing_meta["pageCount"],
        processing_meta["chunkCount"],
        len(clean_findings),
        final_score,
        score_adjusted,
    )

    return {
        "status": "success",
        "data": validated_data,
    }
