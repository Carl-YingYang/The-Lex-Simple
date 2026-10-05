# LLM SERVICE VERSION: 6.3.25
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from db.chroma_store import query_vector_db
from db.sqlite_store import log_ai_transaction
from services.llm_config import (
    CHAT_MODEL,
    EXTRACT_MODEL,
    EXPLAIN_MODEL,
    get_ai_client,
)
from services.prompts import (
    get_analyze_legal_text_prompt,
    get_explain_statutory_text_prompt,
)
from services.sanitizer import sanitize_legal_text


_cost_logger = logging.getLogger("lex.cost")
_service_logger = logging.getLogger("lex.llm_service")

MAX_CHUNK_CHARACTERS = 10_000
CHUNK_OVERLAP_CHARACTERS = 400
MAX_ANALYSIS_CHUNKS = 30
RAG_QUERY_CHARACTERS = 2_500
MAX_CHUNK_RESPONSE_TOKENS = 3_000
MAX_CHUNK_JSON_ATTEMPTS = 3

STRICT_JSON_MODELS = {
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
}

LEGAL_CHUNK_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "documentTitle": {"type": "string"},
        "chunkSummary": {"type": "string"},
        "clauses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "clause_title": {"type": "string"},
                    "explanation": {"type": "string"},
                    "practical_advice": {"type": "string"},
                    "score_deduction": {"type": "integer"},
                    "original_text": {"type": "string"},
                    "confidence": {"type": "string"},
                },
                "required": [
                    "clause_title",
                    "explanation",
                    "practical_advice",
                    "score_deduction",
                    "original_text",
                    "confidence",
                ],
                "additionalProperties": False,
            },
        },
        "keyClauses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "explanation": {"type": "string"},
                    "original_text": {"type": "string"},
                },
                "required": ["title", "explanation", "original_text"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["documentTitle", "chunkSummary", "clauses", "keyClauses"],
    "additionalProperties": False,
}

PAGE_MARKER_PATTERN = re.compile(
    r"(?m)^--- Page (\d+) ---\s*$"
)


def extract_and_clean_json(raw_response: str) -> str:
    if not isinstance(raw_response, str):
        raise ValueError("The AI returned an empty response.")

    cleaned = re.sub(
        r"```(?:json)?\s*|```",
        "",
        raw_response,
        flags=re.IGNORECASE,
    ).strip()

    object_start = cleaned.find("{")
    object_end = cleaned.rfind("}")

    if object_start == -1 or object_end <= object_start:
        raise ValueError("The AI response did not contain a JSON object.")

    return cleaned[object_start : object_end + 1]


def _safe_integer(
    value,
    default: int = 0,
    minimum: int = 0,
    maximum: int = 100,
) -> int:
    if isinstance(value, bool):
        return default

    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    return max(minimum, min(maximum, parsed))


def _parse_confidence(value) -> str:
    if isinstance(value, str):
        match = re.search(r"\d{1,3}", value)
        if match:
            return f"{_safe_integer(match.group(0), default=0)}%"

    return f"{_safe_integer(value, default=0)}%"


def _normalize_comparison_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _recover_exact_source_text(
    candidate: str,
    source_chunk: str,
) -> Optional[str]:
    """Return the exact OCR substring or None when the model invented it."""
    if not candidate or not isinstance(candidate, str):
        return None

    candidate = candidate.strip().strip('"').strip()

    if not candidate or candidate.casefold() == "refer to document.":
        return None

    direct_index = source_chunk.casefold().find(candidate.casefold())
    if direct_index >= 0:
        return source_chunk[
            direct_index : direct_index + len(candidate)
        ]

    candidate_words = re.findall(r"\S+", candidate)
    if len(candidate_words) < 3:
        return None

    flexible_pattern = r"\s+".join(
        re.escape(word) for word in candidate_words
    )
    match = re.search(
        flexible_pattern,
        source_chunk,
        flags=re.IGNORECASE,
    )

    return match.group(0) if match else None


def normalize_ai_keys(
    clauses_list,
    source_chunk: str,
    chunk_number: int,
) -> List[dict]:
    if not isinstance(clauses_list, list):
        return []

    normalized = []

    for clause in clauses_list:
        if not isinstance(clause, dict):
            continue

        candidate_text = clause.get(
            "original_text",
            clause.get("foundText", clause.get("text", "")),
        )
        exact_source_text = _recover_exact_source_text(
            str(candidate_text or ""),
            source_chunk,
        )

        # Do not keep a finding that cannot be grounded in the OCR chunk.
        if not exact_source_text:
            _service_logger.warning(
                "Dropped ungrounded clause from chunk %s.",
                chunk_number,
            )
            continue

        deduction = _safe_integer(
            clause.get(
                "score_deduction",
                clause.get(
                    "deduction",
                    clause.get("points_deducted", 0),
                ),
            ),
            default=0,
        )

        normalized.append(
            {
                "clause_title": str(
                    clause.get(
                        "clause_title",
                        clause.get("title", "Legal Clause"),
                    )
                ).strip()
                or "Legal Clause",
                "explanation": str(
                    clause.get(
                        "explanation",
                        clause.get("description", ""),
                    )
                ).strip(),
                "practical_advice": str(
                    clause.get(
                        "practical_advice",
                        clause.get("advice", ""),
                    )
                ).strip(),
                "score_deduction": deduction,
                "original_text": exact_source_text,
                "confidence": _parse_confidence(
                    clause.get("confidence", 0)
                ),
                "source_chunk": chunk_number,
            }
        )

    return normalized


def normalize_key_clauses(
    clauses_list: list,
    source_chunk: str,
) -> List[dict]:
    normalized: List[dict] = []
    for item in clauses_list:
        if not isinstance(item, dict):
            continue
        exact_text = _recover_exact_source_text(
            str(item.get("original_text") or ""),
            source_chunk,
        )
        title = str(item.get("title") or "").strip()
        explanation = str(item.get("explanation") or "").strip()
        if (
            not exact_text
            or len(exact_text) < 20
            or len(exact_text.split()) < 4
            or not title
            or not explanation
        ):
            continue
        normalized.append({
            "title": title,
            "explanation": explanation,
            "foundText": exact_text,
        })
    return normalized


def normalize_chunk_summary(value) -> str:
    """Keep the overview short and sanitize the generated text again."""
    if not isinstance(value, str):
        return ""
    summary = re.sub(r"\s+", " ", sanitize_legal_text(value)).strip()
    return summary if 20 <= len(summary) <= 900 else ""


def normalize_document_summary(value) -> str:
    """Keep readable paragraphs in the final overview shown in the app."""
    if not isinstance(value, str):
        return ""
    summary = sanitize_legal_text(value).strip()
    summary = re.sub(r"[ \t]+", " ", summary)
    summary = re.sub(r"\n{3,}", "\n\n", summary)
    return summary if 30 <= len(summary) <= 1_800 else ""


def _request_summary(client, prompt: str) -> str:
    for attempt in range(2):
        options = {
            "model": CHAT_MODEL,
            "messages": [
                {"role": "system", "content": "Return exactly one JSON object."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.0,
            "max_tokens": 1_000,
        }
        if CHAT_MODEL.startswith("openai/gpt-oss-"):
            options["extra_body"] = {
                "reasoning_effort": "low",
                "include_reasoning": False,
            }
        if attempt == 0:
            options["response_format"] = {"type": "json_object"}
        try:
            completion = client.chat.completions.create(**options)
            _log_completion_cost(completion, endpoint="/simplify")
            raw = completion.choices[0].message.content or ""
            parsed = json.loads(extract_and_clean_json(raw))
            summary = normalize_document_summary(parsed.get("documentSummary"))
            if summary:
                return summary
        except Exception as error:
            _service_logger.warning("Summary attempt %s failed: %s", attempt + 1, error)
    return ""


def _summarize_document(
    client, summaries: List[str], source_chunks: List[str], original_ocr_text: str = ""
) -> str:
    """Summarize every chunk, then combine its overview for the whole document."""
    instructions = (
        "Return ONLY JSON with a string field named documentSummary. "
        "Write a plain Filipino overview of this WHOLE document, within "
        "1800 characters. Start with one sentence about its purpose. "
        "Then use separate numbered lines (1., 2., ...) for EACH major "
        "distinct condition or topic, up to six. Explain who does what, "
        "when, and the stated consequence when present. For a four-clause "
        "lease, cover all four clauses instead of squeezing them into one "
        "sentence. Use short, everyday words and no Markdown formatting. "
        "Do not repeat the same points in a second recap. Do not invent "
        "details, assert a legal right beyond the wording, or copy personal "
        "names, contact details, or redacted values. The text may be a form, "
        "certificate, letter, or agreement; do not call it a contract unless "
        "the text says so. Describe 'grounds for eviction' as wording of the "
        "document, not as an eviction that has already happened.\n\n"
    )

    # For ordinary scans, use the full sanitized OCR. The first chunk's
    # one-sentence overview is too short to represent the whole document.
    if original_ocr_text and len(original_ocr_text) <= 12_000:
        prompt = instructions + "SANITIZED OCR:\n" + original_ocr_text
        summary = _request_summary(client, prompt)
        numbered_clauses = len(re.findall(
            r"(?m)^\s*\d{1,2}[.)]\s+", original_ocr_text
        ))
        numbered_points = len(re.findall(r"(?m)^\d+[.)]\s+", summary))
        if numbered_clauses >= 3 and numbered_points < min(6, numbered_clauses):
            retry = _request_summary(
                client,
                prompt + "\nRETRY: Cover each of the "
                f"{min(6, numbered_clauses)} numbered clauses in a separate "
                "numbered line. Do not collapse them into one sentence.",
            )
            if retry and len(re.findall(r"(?m)^\d+[.)]\s+", retry)) >= min(6, numbered_clauses):
                summary = retry
        if summary:
            return summary

    summaries = list(summaries)
    for index, summary in enumerate(summaries):
        if summary:
            continue
        summaries[index] = normalize_chunk_summary(_request_summary(
            client,
            "Summarize this one scanned document part in 2 to 5 short Filipino "
            "sentences (max 900 characters). Return ONLY JSON with field "
            "documentSummary. Describe its purpose and important conditions. "
            "It may be a form, certificate, letter, or agreement. Do not "
            "invent anything or copy personal names, contact details, or "
            "redacted values. If unreadable, use an empty string.\n\n"
            + source_chunks[index],
        ))
    if not all(summaries):
        return ""
    if not summaries:
        return ""
    if len(summaries) == 1:
        return summaries[0]

    if sum(map(len, summaries)) > 18_000:
        partials = [
            _summarize_document(client, summaries[index:index + 10], [])
            for index in range(0, len(summaries), 10)
        ]
        return (
            _summarize_document(client, partials, [])
            if all(partials) else ""
        )
    prompt = (
        instructions + "Ordered summaries of this document. If they refer "
        "to different documents, return an empty string.\n\n" + "\n".join(
            f"Part {index}: {value}"
            for index, value in enumerate(summaries, start=1)
        )
    )
    return _request_summary(client, prompt)


def _split_long_text(
    text: str,
    maximum_characters: int,
    overlap_characters: int,
) -> List[str]:
    text = text.strip()
    if not text:
        return []

    if len(text) <= maximum_characters:
        return [text]

    chunks: List[str] = []
    start = 0

    while start < len(text):
        hard_end = min(start + maximum_characters, len(text))
        end = hard_end

        if hard_end < len(text):
            paragraph_break = text.rfind("\n\n", start, hard_end)
            line_break = text.rfind("\n", start, hard_end)
            sentence_break = text.rfind(". ", start, hard_end)
            best_break = max(
                paragraph_break,
                line_break,
                sentence_break,
            )

            if best_break > start + (maximum_characters // 2):
                end = best_break + 1

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        next_start = max(0, end - overlap_characters)
        if next_start <= start:
            next_start = end
        start = next_start

    return chunks


def _extract_page_blocks(ocr_text: str) -> List[Tuple[int, str]]:
    matches = list(PAGE_MARKER_PATTERN.finditer(ocr_text))

    if not matches:
        return [(1, ocr_text.strip())]

    page_blocks: List[Tuple[int, str]] = []

    for index, match in enumerate(matches):
        page_number = int(match.group(1))
        content_start = match.end()
        content_end = (
            matches[index + 1].start()
            if index + 1 < len(matches)
            else len(ocr_text)
        )
        page_text = ocr_text[content_start:content_end].strip()

        if page_text:
            page_blocks.append((page_number, page_text))

    return page_blocks


def build_document_chunks(ocr_text: str) -> List[str]:
    """Create ordered chunks without silently discarding later pages."""
    page_blocks = _extract_page_blocks(ocr_text)
    chunks: List[str] = []
    current_parts: List[str] = []
    current_length = 0

    def flush_current() -> None:
        nonlocal current_parts, current_length
        if current_parts:
            chunks.append("\n\n".join(current_parts).strip())
        current_parts = []
        current_length = 0

    for page_number, page_text in page_blocks:
        page_header = f"--- Page {page_number} ---"
        complete_page = f"{page_header}\n{page_text}"

        if len(complete_page) > MAX_CHUNK_CHARACTERS:
            flush_current()
            available_length = (
                MAX_CHUNK_CHARACTERS - len(page_header) - 1
            )
            page_segments = _split_long_text(
                page_text,
                maximum_characters=available_length,
                overlap_characters=CHUNK_OVERLAP_CHARACTERS,
            )

            for segment_index, segment in enumerate(
                page_segments,
                start=1,
            ):
                chunks.append(
                    f"{page_header} "
                    f"(Part {segment_index}/{len(page_segments)})\n"
                    f"{segment}"
                )
            continue

        added_length = len(complete_page) + (
            2 if current_parts else 0
        )

        if (
            current_parts
            and current_length + added_length > MAX_CHUNK_CHARACTERS
        ):
            flush_current()

        current_parts.append(complete_page)
        current_length += added_length

    flush_current()

    if len(chunks) > MAX_ANALYSIS_CHUNKS:
        raise ValueError(
            "The document is too large for one complete analysis. "
            "Please divide it into smaller document batches."
        )

    return chunks


def _get_rag_context(source_chunk: str) -> str:
    query_text = source_chunk[:RAG_QUERY_CHARACTERS]

    try:
        search_results = query_vector_db(query_text, n_results=2)
    except Exception as error:
        _service_logger.warning("RAG lookup failed: %s", error)
        return "NO VERIFIED LEGAL CONTEXT FOUND."

    context_texts: List[str] = []

    if isinstance(search_results, dict):
        document_groups = search_results.get("documents") or []

        for document_group in document_groups:
            if isinstance(document_group, list):
                context_texts.extend(
                    str(document)
                    for document in document_group
                    if document
                )

    return (
        "\n---\n".join(context_texts)
        if context_texts
        else "NO VERIFIED LEGAL CONTEXT FOUND."
    )


def _log_completion_cost(
    completion,
    endpoint: str,
    chunk_number: Optional[int] = None,
) -> None:
    try:
        usage = completion.usage
        _cost_logger.info(
            "llm_call | endpoint=%s | model=%s | chunk=%s | "
            "prompt_tokens=%s | completion_tokens=%s | "
            "total_tokens=%s | timestamp=%s",
            endpoint,
            CHAT_MODEL if endpoint == "/simplify" else EXPLAIN_MODEL if endpoint == "/explain" else EXTRACT_MODEL,
            chunk_number if chunk_number is not None else "n/a",
            usage.prompt_tokens,
            usage.completion_tokens,
            usage.total_tokens,
            datetime.now(timezone.utc).isoformat(),
        )
    except Exception as error:
        _service_logger.warning("Cost logging failed: %s", error)


def _analyze_chunk(
    client,
    source_chunk: str,
    chunk_number: int,
    total_chunks: int,
) -> dict:
    retrieved_context = _get_rag_context(source_chunk)
    chunk_input = (
        f"DOCUMENT CHUNK {chunk_number} OF {total_chunks}\n"
        f"Analyze only the OCR text inside this chunk.\n\n"
        f"{source_chunk}"
    )
    prompt = get_analyze_legal_text_prompt(
        retrieved_context,
        chunk_input,
    )
    strict_schema = """

Return ONLY one valid JSON object with this exact shape:
{
  "documentTitle": "Visible document heading if readable; otherwise a short descriptive title",
  "chunkSummary": "2 to 5 short Filipino sentences summarizing this OCR chunk",
  "clauses": [
    {
      "clause_title": "Short clause label",
      "explanation": "Clear Taglish explanation",
      "practical_advice": "Specific non-legal practical guidance",
      "score_deduction": 1,
      "original_text": "Exact verbatim text copied from this OCR chunk",
      "confidence": "0-100%"
    }
  ],
  "keyClauses": [
    {
      "title": "Short title for an important term",
      "explanation": "Neutral Taglish explanation of what it says, without a risk claim",
      "original_text": "Exact verbatim sentence or clause copied from this OCR chunk"
    }
  ]
}

"clauses" is ONLY for possible risks. Do not invent a risk just to fill it.
Summarize each chunk, including certificates and forms. Describe the purpose,
important details and conditions across the whole chunk. Do not copy personal
names, contact details or redacted text. Never invent dates, amounts, safety
claims, or legal conclusions. For unreadable text return an empty string.
For an ordinary readable agreement, return 1-5 important terms in
"keyClauses" even when "clauses" is empty. Explain payment, dates,
obligations, or notice without claiming they are unfair. Keep the two arrays
separate. Never invent original_text or copy RAG context into it.
"""
    parsed_response = _request_chunk_json(
        client=client,
        prompt=prompt + strict_schema,
        chunk_number=chunk_number,
    )

    if not isinstance(parsed_response, dict):
        raise ValueError(
            f"Chunk {chunk_number} returned a non-object response."
        )

    payload = parsed_response.get("data", parsed_response)
    if not isinstance(payload, dict):
        raise ValueError(
            f"Chunk {chunk_number} returned malformed analysis data."
        )

    if not any(
        key in payload
        for key in ("clauses", "findings", "results")
    ):
        raise ValueError(
            f"Chunk {chunk_number} did not return a clauses array."
        )
    raw_clauses = payload.get(
        "clauses",
        payload.get("findings", payload.get("results", [])),
    )
    if not isinstance(raw_clauses, list):
        raise ValueError(
            f"Chunk {chunk_number} returned a malformed clauses array."
        )
    raw_key_clauses = payload.get("keyClauses")
    if not isinstance(raw_key_clauses, list):
        raise ValueError(
            f"Chunk {chunk_number} did not return a keyClauses array."
        )

    def grounded_parts(items: dict) -> tuple[list, list, int, int]:
        risks = normalize_ai_keys(items["clauses"], source_chunk, chunk_number)
        details = normalize_key_clauses(items["keyClauses"], source_chunk)
        return (risks, details,
                len(items["clauses"]) - len(risks),
                len(items["keyClauses"]) - len(details))

    first = {"clauses": raw_clauses, "keyClauses": raw_key_clauses}
    normalized_clauses, key_clauses, dropped_risks, dropped_details = grounded_parts(first)
    chunk_summary = normalize_chunk_summary(payload.get("chunkSummary"))

    if dropped_risks or dropped_details:
        # A second attempt can quote the actual OCR spelling. Never accept a
        # risk candidate that still cannot be matched to the scanned text.
        try:
            retry = _request_chunk_json(
                client=client,
                prompt=prompt + strict_schema + "\nRETRY: Some original_text values did not "
                "match the OCR. Copy each original_text literally from the OCR "
                "above, including typos. Preserve the risk clauses you identified.",
                chunk_number=chunk_number,
            )
        except Exception as error:
            _service_logger.warning("OCR quote retry failed for chunk %s: %s", chunk_number, error)
            retry = {}
        retry_payload = retry.get("data", retry) if isinstance(retry, dict) else {}
        retry_risks = retry_payload.get("clauses", retry_payload.get("findings", []))
        retry_details = retry_payload.get("keyClauses", [])
        if isinstance(retry_risks, list) and isinstance(retry_details, list):
            risks2, details2, dropped_risks2, _ = grounded_parts(
                {"clauses": retry_risks, "keyClauses": retry_details}
            )
            known_risk_texts = {
                item["original_text"] for item in normalized_clauses
            }
            for risk in risks2:
                # Risk findings retain the internal `original_text` key;
                # neutral key clauses below use `foundText` instead.
                if risk["original_text"] not in known_risk_texts:
                    normalized_clauses.append(risk)
                    known_risk_texts.add(risk["original_text"])
            for detail in details2:
                if detail["foundText"] not in {item["foundText"] for item in key_clauses}:
                    key_clauses.append(detail)
            recovered_titles = {
                str(item.get("clause_title", "")).casefold()
                for item in risks2
            }
            unresolved_first = sum(
                str(item.get("clause_title", "")).casefold() not in recovered_titles
                for item in raw_clauses if isinstance(item, dict)
                and not _recover_exact_source_text(
                    str(item.get("original_text", item.get("foundText", ""))), source_chunk
                )
            )
            dropped_risks = max(unresolved_first, dropped_risks2)
            chunk_summary = chunk_summary or normalize_chunk_summary(
                retry_payload.get("chunkSummary")
            )

    return {
        "documentTitle": str(
            payload.get("documentTitle", "")
        ).strip(),
        "clauses": normalized_clauses,
        "keyClauses": key_clauses,
        "chunkSummary": chunk_summary,
        "droppedFindingCount": dropped_risks,
        "droppedKeyClauseCount": dropped_details,
        "chunkUnusable": not (normalized_clauses or key_clauses or chunk_summary),
        "ragContext": retrieved_context,
    }


def _request_chunk_json(
    client,
    prompt: str,
    chunk_number: int,
) -> dict:
    """
    Request one JSON object from Groq with a single bounded retry.

    Start with Groq structured output. If Groq rejects its own generated JSON,
    retry without provider-side JSON validation and validate locally instead.
    """
    last_error = "unknown completion error"

    if CHAT_MODEL in STRICT_JSON_MODELS:
        structured_response_format = {
            "type": "json_schema",
            "json_schema": {
                "name": "legal_chunk_analysis",
                "strict": True,
                "schema": LEGAL_CHUNK_JSON_SCHEMA,
            },
        }
    else:
        structured_response_format = {"type": "json_object"}

    use_local_json_fallback = False

    for attempt in range(1, MAX_CHUNK_JSON_ATTEMPTS + 1):
        retry_instruction = ""
        if attempt > 1:
            retry_instruction = (
                "\n\nRETRY REQUIREMENT: The previous completion was empty, "
                "truncated, or invalid. Return one complete JSON object now. "
                "Do not include markdown, commentary, or reasoning outside "
                "the JSON object."
            )

        request_options = {
            "model": CHAT_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a legal-text analysis component. "
                        "Return exactly one complete JSON object and no "
                        "text outside that object."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt + retry_instruction,
                },
            ],
            "temperature": 0.0,
            "max_tokens": MAX_CHUNK_RESPONSE_TOKENS,
        }

        response_mode = "local_json_fallback"
        if not use_local_json_fallback:
            request_options["response_format"] = (
                structured_response_format
            )
            response_mode = structured_response_format["type"]

        if CHAT_MODEL.startswith("openai/gpt-oss-"):
            request_options["extra_body"] = {
                "reasoning_effort": "low",
                "include_reasoning": False,
            }

        try:
            completion = client.chat.completions.create(
                **request_options
            )
        except Exception as error:
            status_code = getattr(error, "status_code", None)
            error_code = getattr(error, "code", None)
            last_error = (
                "the provider rejected the completion "
                f"({type(error).__name__}, status={status_code}, "
                f"code={error_code})"
            )

            # Groq can occasionally reject a generation produced by its own
            # JSON validator. The next attempt removes response_format, while
            # our parser and downstream validator remain strict.
            if error_code == "json_validate_failed":
                use_local_json_fallback = True

            if attempt < MAX_CHUNK_JSON_ATTEMPTS:
                _service_logger.warning(
                    "Retrying Groq request for chunk %s with local JSON "
                    "validation: %s.",
                    chunk_number,
                    last_error,
                )
                continue

            break

        _log_completion_cost(
            completion,
            endpoint="/simplify",
            chunk_number=chunk_number,
        )

        if not getattr(completion, "choices", None):
            last_error = "the provider returned no completion choice"
            raw_response = ""
            finish_reason = "missing_choice"
        else:
            choice = completion.choices[0]
            finish_reason = str(
                getattr(choice, "finish_reason", "unknown")
            )
            message = getattr(choice, "message", None)
            raw_response = (
                getattr(message, "content", "") or ""
            )

        _service_logger.info(
            "Groq chunk completion: chunk=%s attempt=%s "
            "mode=%s finish_reason=%s response_characters=%s",
            chunk_number,
            attempt,
            response_mode,
            finish_reason,
            len(raw_response),
        )

        if finish_reason == "length":
            last_error = (
                "the completion reached its output-token limit"
            )
        elif not raw_response.strip():
            last_error = "the provider returned empty message content"
        else:
            try:
                parsed_response = json.loads(
                    extract_and_clean_json(raw_response)
                )
            except (ValueError, json.JSONDecodeError) as error:
                last_error = (
                    "the completion was not valid JSON "
                    f"({type(error).__name__})"
                )
            else:
                if isinstance(parsed_response, dict):
                    return parsed_response
                last_error = "the JSON root was not an object"

        if attempt < MAX_CHUNK_JSON_ATTEMPTS:
            _service_logger.warning(
                "Retrying Groq JSON completion for chunk %s: %s.",
                chunk_number,
                last_error,
            )

    raise ValueError(
        f"Chunk {chunk_number} failed JSON generation after "
        f"{MAX_CHUNK_JSON_ATTEMPTS} attempts: {last_error}."
    )


def _deduplicate_clauses(clauses: List[dict]) -> List[dict]:
    deduplicated: Dict[str, dict] = {}

    for clause in clauses:
        source_text = _normalize_comparison_text(
            str(clause.get("original_text", ""))
        )
        title = _normalize_comparison_text(
            str(clause.get("clause_title", ""))
        )
        key = source_text or f"title:{title}"

        if not key:
            continue

        existing = deduplicated.get(key)
        if not existing:
            deduplicated[key] = clause
            continue

        if clause.get("score_deduction", 0) > existing.get(
            "score_deduction",
            0,
        ):
            deduplicated[key] = clause

    return list(deduplicated.values())


def _combine_chunk_results(
    chunk_results: List[dict],
    original_ocr_text: str,
    document_summary: str = "",
) -> dict:
    document_title = next(
        (
            result["documentTitle"]
            for result in chunk_results
            if result.get("documentTitle")
        ),
        "Legal Document",
    )
    all_clauses = [
        clause
        for result in chunk_results
        for clause in result.get("clauses", [])
    ]
    unique_clauses = _deduplicate_clauses(all_clauses)
    all_key_clauses = [
        clause
        for result in chunk_results
        for clause in result.get("keyClauses", [])
    ]
    key_clauses: List[dict] = []
    seen_key_sources = set()
    for clause in all_key_clauses:
        source_key = _normalize_comparison_text(clause["foundText"])
        if source_key in seen_key_sources:
            continue
        seen_key_sources.add(source_key)
        key_clauses.append(clause)
        if len(key_clauses) >= 10:
            break
    dropped_risk_count = sum(
        result.get("droppedFindingCount", result.get("droppedUngroundedCount", 0))
        for result in chunk_results
    )
    total_deduction = min(
        100,
        sum(
            _safe_integer(
                clause.get("score_deduction"),
                default=0,
            )
            for clause in unique_clauses
        ),
    )
    page_numbers = {
        int(number)
        for number in PAGE_MARKER_PATTERN.findall(original_ocr_text)
    }

    return {
        "documentTitle": document_title,
        "documentSummary": document_summary or None,
        # No findings is an absence of detected flags, not a perfect safety score.
        "safety_score": max(0, 100 - total_deduction) if unique_clauses else None,
        "clauses": unique_clauses,
        "keyClauses": key_clauses,
        "analysisIncomplete": (
            dropped_risk_count > 0
            or any(result.get("chunkUnusable", False) for result in chunk_results)
            # A readable certificate/form can have a useful summary without
            # a risk finding or a neutral contract clause.
            or (not unique_clauses and not key_clauses and not document_summary)
        ),
        "processingMeta": {
            "chunkCount": len(chunk_results),
            "pageCount": len(page_numbers) or 1,
            "processedCharacters": len(original_ocr_text),
            "documentHash": hashlib.sha256(
                original_ocr_text.encode("utf-8")
            ).hexdigest(),
        },
        "rag_context_used": "\n---\n".join(
            dict.fromkeys(
                result.get("ragContext", "")
                for result in chunk_results
                if result.get("ragContext")
            )
        ),
    }


def analyze_legal_text(ocr_text: str):
    if not isinstance(ocr_text, str) or not ocr_text.strip():
        return {
            "status": "error",
            "code": "empty_ocr_text",
            "message": "No OCR text was provided for analysis.",
        }

    normalized_ocr = ocr_text.strip()

    try:
        chunks = build_document_chunks(normalized_ocr)

        if not chunks:
            return {
                "status": "error",
                "code": "empty_ocr_chunks",
                "message": "No readable OCR chunks were created.",
            }

        client = get_ai_client()
        chunk_results = []

        # Sequential calls avoid sudden rate-limit bursts on Groq.
        for chunk_number, source_chunk in enumerate(chunks, start=1):
            chunk_result = _analyze_chunk(
                client=client,
                source_chunk=source_chunk,
                chunk_number=chunk_number,
                total_chunks=len(chunks),
            )
            chunk_results.append(chunk_result)

        summaries = [result.get("chunkSummary", "") for result in chunk_results]
        document_summary = _summarize_document(
            client, summaries, chunks, normalized_ocr
        )
        combined_result = _combine_chunk_results(
            chunk_results,
            original_ocr_text=normalized_ocr,
            document_summary=document_summary,
        )

        # Store only a non-sensitive trace instead of duplicating the full
        # sanitized document in the AI transaction log.
        trace = (
            f"sha256={combined_result['processingMeta']['documentHash']};"
            f"characters={len(normalized_ocr)};"
            f"pages={combined_result['processingMeta']['pageCount']};"
            f"chunks={len(chunks)}"
        )
        log_ai_transaction(trace, json.dumps(combined_result))

        return {
            "status": "success",
            "data": combined_result,
        }
    except Exception as error:
        _service_logger.exception("Legal document analysis failed.")
        return {
            "status": "error",
            "code": "chunked_analysis_failed",
            "message": (
                "Hindi nakumpleto ang pagsusuri ng lahat ng document "
                "pages. Walang partial result na ibinalik."
            ),
            "debugType": type(error).__name__,
        }


def explain_raw_statutory_text(title: str, raw_text: str):
    """Explain the selected legal excerpt using the active Groq dictionary model."""
    try:
        prompt = get_explain_statutory_text_prompt(title, raw_text)
        client = get_ai_client()
        completion = client.chat.completions.create(
            model=EXPLAIN_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=900,
            extra_body={"reasoning_effort": "low", "include_reasoning": False}
            if EXPLAIN_MODEL.startswith("openai/gpt-oss-") else {},
        )
        _log_completion_cost(completion, endpoint="/explain")
        content = (completion.choices[0].message.content or "").strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        if content.startswith("{"):
            parsed = json.loads(content)
            if not isinstance(parsed, dict):
                raise ValueError("Invalid explanation object")
            nested = parsed.get("data")
            content = str(parsed.get("definition") or (
                nested.get("definition") if isinstance(nested, dict) else ""
            ) or "").strip()
        if len(content) < 15 or len(content) > 2400:
            raise ValueError("Invalid explanation length")
        return {"status": "success", "data": {"definition": content, "term": title}}
    except Exception as error:
        status_code = getattr(error, "status_code", None)
        _service_logger.exception(
            "Statutory explanation failed: model=%s status=%s type=%s",
            EXPLAIN_MODEL, status_code, type(error).__name__,
        )
        name = type(error).__name__.lower()
        if status_code == 429:
            code = "rate_limited"
            message = "Busy ang AI ngayon. Subukan ulit mamaya."
        elif status_code in (401, 403) or "missing groq_api_key" in str(error).lower():
            code = "ai_configuration"
            message = "Hindi nakaayos ang Groq API key sa server."
        elif status_code == 400:
            code = "ai_model_rejected"
            message = "Tinanggihan ng Groq ang AI request. Suriin ang GROQ_EXPLAIN_MODEL sa backend."
        elif "timeout" in name:
            code = "ai_timeout"
            message = "Matagal sumagot ang AI. Subukan ulit."
        elif isinstance(error, (ValueError, IndexError, KeyError, TypeError, json.JSONDecodeError)):
            code = "invalid_ai_response"
            message = "Hindi mabasa ang sagot ng AI. Subukan ulit."
        else:
            code = "ai_unavailable"
            message = "Hindi makakonekta sa AI ngayon. Subukan ulit mamaya."
        return {"status": "error", "error_code": code, "message": message}