# AI ROUTER VERSION: 6.3.4
import copy
import hashlib
import hmac
import os
import re
import shutil
from typing import Dict, List, Optional, Tuple

import docx
import fitz
import pdfplumber
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from db.chroma_store import query_vector_db
from orchestrator.pipeline import Orchestrator, ProcessRequest
from services.chat_service import generate_chat_reply
from services.llm_service import explain_raw_statutory_text
from core.database import get_db_connection
from services.dictionary_repository import get_dictionary_entry
from services.knowledge_catalog import find_verified_reference_context
from services.chat_grounding import (
    prepare_chat_evidence, append_verified_sources, remove_unsupported_examples,
    sources_mentioned_in_reply, clean_chat_reply,
)


router = APIRouter()
_orchestrator = Orchestrator()

MAX_DOCUMENT_PAGES = 50
MAX_PAGE_CHARACTERS = 50_000
MAX_DOCUMENT_CHARACTERS = 500_000
MIN_DOCUMENT_CHARACTERS = 20


class SanitizedPageRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page_number: int = Field(..., alias="pageNumber", ge=1)
    sanitized_text: str = Field(..., alias="sanitizedText")
    text_hash: Optional[str] = Field(default=None, alias="textHash")

class LegalRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    # Temporary backward compatibility for the existing mobile payload:
    # {"text": "..."}
    text: Optional[str] = None

    # Preferred privacy-safe multi-page payload.
    document_id: Optional[str] = Field(default=None, alias="documentId")
    page_count: Optional[int] = Field(default=None, alias="pageCount", ge=1)
    pages: Optional[List[SanitizedPageRequest]] = None

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None


class ExplainRequest(BaseModel):
    title: str
    raw_text: str
    source_id: Optional[int] = Field(default=None, ge=1)


def _normalize_document_text(value: str) -> str:
    return (
        value.replace("\r\n", "\n")
        .replace("\r", "\n")
        .replace("\u00a0", " ")
        .replace("\x00", "")
        .strip()
    )


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _looks_like_browser_or_app_ui(text: str) -> bool:
    """Reject obvious browser/search UI OCR instead of grading it as a contract."""
    lowered = text.casefold()
    strong_markers = (
        "client=firefox",
        "client=chrome",
        "all images",
        "short videos",
        "ask anything",
        "search results",
        "people also ask",
        "related searches",
        "images videos more",
    )
    marker_count = sum(marker in lowered for marker in strong_markers)

    query_fragment_count = len(
        re.findall(r"(?:[?&][a-z0-9_]+=[^\s]+|\+[a-z0-9]+)", lowered)
    )

    return marker_count >= 2 or (
        marker_count >= 1 and query_fragment_count >= 2
    )


def _prepare_legal_input(
    request: LegalRequest,
) -> Tuple[str, dict]:
    has_legacy_text = bool(request.text and request.text.strip())
    has_pages = bool(request.pages)

    if has_legacy_text and has_pages:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "ambiguous_document_payload",
                "message": (
                    "Send either 'text' or 'pages', not both. "
                    "Use 'pages' for multi-page OCR."
                ),
            },
        )

    if not has_legacy_text and not has_pages:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "missing_document_text",
                "message": "No sanitized OCR text was received.",
            },
        )

    if has_pages:
        pages = request.pages or []

        if len(pages) > MAX_DOCUMENT_PAGES:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "too_many_pages",
                    "message": (
                        f"A document can contain at most "
                        f"{MAX_DOCUMENT_PAGES} pages."
                    ),
                },
            )

        if request.page_count is None:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "missing_page_count",
                    "message": "pageCount is required when pages are sent.",
                },
            )

        if request.page_count != len(pages):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "page_count_mismatch",
                    "message": (
                        f"Expected {request.page_count} pages but received "
                        f"{len(pages)}."
                    ),
                },
            )

        received_numbers = [page.page_number for page in pages]
        expected_numbers = list(range(1, len(pages) + 1))

        if received_numbers != expected_numbers:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "invalid_page_order",
                    "message": (
                        "Pages must be ordered and continuous starting at 1. "
                        f"Received: {received_numbers}."
                    ),
                },
            )

        normalized_pages: List[Tuple[int, str, str]] = []

        for page in pages:
            page_text = _normalize_document_text(page.sanitized_text)

            if len(page_text) < MIN_DOCUMENT_CHARACTERS:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "insufficient_page_text",
                        "pageNumber": page.page_number,
                        "message": (
                            f"Page {page.page_number} does not contain enough "
                            "readable text."
                        ),
                    },
                )

            if len(page_text) > MAX_PAGE_CHARACTERS:
                raise HTTPException(
                    status_code=413,
                    detail={
                        "code": "page_text_too_large",
                        "pageNumber": page.page_number,
                        "message": (
                            f"Page {page.page_number} exceeds the supported "
                            "text size."
                        ),
                    },
                )

            calculated_hash = _sha256_text(page_text)

            if page.text_hash and not hmac.compare_digest(
                page.text_hash.casefold(), calculated_hash
            ):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "code": "page_hash_mismatch",
                        "pageNumber": page.page_number,
                        "message": (
                            f"Page {page.page_number} changed before it reached "
                            "the server. Please run OCR again."
                        ),
                    },
                )

            normalized_pages.append(
                (page.page_number, page_text, calculated_hash)
            )

        combined_text = "\n\n".join(
            f"--- Page {page_number} ---\n{page_text}"
            for page_number, page_text, _ in normalized_pages
        )

        input_meta = {
            "documentId": request.document_id,
            "inputMode": "sanitized_pages",
            "pageCount": len(normalized_pages),
            "receivedCharacters": len(combined_text),
            "documentHash": _sha256_text(combined_text),
            "pages": [
                {
                    "pageNumber": page_number,
                    "characters": len(page_text),
                    "textHash": page_hash,
                }
                for page_number, page_text, page_hash in normalized_pages
            ],
        }
    else:
        combined_text = _normalize_document_text(request.text or "")
        input_meta = {
            "documentId": request.document_id,
            "inputMode": "legacy_text",
            "pageCount": 1,
            "receivedCharacters": len(combined_text),
            "documentHash": _sha256_text(combined_text),
        }

    if len(combined_text) < MIN_DOCUMENT_CHARACTERS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "text_too_short",
                "message": "The OCR text is too short to analyze reliably.",
            },
        )

    if len(combined_text) > MAX_DOCUMENT_CHARACTERS:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "document_text_too_large",
                "message": "The merged OCR text exceeds the supported size.",
            },
        )

    if _looks_like_browser_or_app_ui(combined_text):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_ocr_source",
                "documentStatus": "unreadable",
                "message": (
                    "The OCR appears to contain browser or app interface text "
                    "instead of the scanned document. Please review the pages "
                    "and scan them again."
                ),
            },
        )

    return combined_text, input_meta


def _analyze_and_attach_input_meta(text: str, input_meta: dict) -> dict:
    result = _orchestrator.process(
        ProcessRequest(text=text, source="text")
    )

    print(
        "[ORCHESTRATOR] /simplify "
        f"source={result.source_layer}, "
        f"llm_calls={result.llm_calls_made}, "
        f"pages={input_meta.get('pageCount')}, "
        f"characters={input_meta.get('receivedCharacters')}, "
        f"hash={input_meta.get('documentHash')}"
    )

    response = copy.deepcopy(result.data)

    if not isinstance(response, dict):
        raise HTTPException(
            status_code=502,
            detail={
                "code": "invalid_pipeline_response",
                "message": "The analysis pipeline returned an invalid response.",
            },
        )

    if response.get("status") == "error":
        raise HTTPException(
            status_code=502,
            detail={
                "code": str(response.get("code") or "analysis_failed"),
                "message": str(
                    response.get("message")
                    or "The document analysis did not complete."
                ),
                "documentStatus": str(
                    response.get("documentStatus") or "processing_error"
                ),
            },
        )

    response["inputMeta"] = input_meta
    return response


@router.post("/simplify")
def simplify_text(request: LegalRequest):
    combined_text, input_meta = _prepare_legal_input(request)
    return _analyze_and_attach_input_meta(combined_text, input_meta)


@router.post("/simplify_file")
async def simplify_uploaded_file(file: UploadFile = File(...)):
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)

    safe_filename = os.path.basename(file.filename or "uploaded_file")
    file_location = os.path.join(temp_dir, safe_filename)

    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        extracted_text = ""
        filename_lower = safe_filename.casefold()

        if filename_lower.endswith(".pdf"):
            try:
                with pdfplumber.open(file_location) as pdf:
                    page_texts = []

                    for page_number, page in enumerate(pdf.pages, start=1):
                        page_text = _normalize_document_text(
                            page.extract_text() or ""
                        )
                        if page_text:
                            page_texts.append(
                                f"--- Page {page_number} ---\n{page_text}"
                            )

                    extracted_text = "\n\n".join(page_texts)
            except Exception as error:
                print(f"PDFPlumber Error: {error}")

            if not extracted_text.strip():
                try:
                    document = fitz.open(file_location)
                    page_texts = []

                    for page_number, page in enumerate(document, start=1):
                        page_text = _normalize_document_text(page.get_text())
                        if page_text:
                            page_texts.append(
                                f"--- Page {page_number} ---\n{page_text}"
                            )

                    document.close()
                    extracted_text = "\n\n".join(page_texts)
                except Exception as error:
                    print(f"PyMuPDF Error: {error}")

        elif filename_lower.endswith(".docx"):
            document = docx.Document(file_location)
            extracted_text = "\n".join(
                paragraph.text
                for paragraph in document.paragraphs
                if paragraph.text.strip()
            )

        elif filename_lower.endswith(".txt"):
            with open(file_location, "r", encoding="utf-8") as text_file:
                extracted_text = text_file.read()
        else:
            raise HTTPException(
                status_code=415,
                detail="Unsupported file type.",
            )

        extracted_text = _normalize_document_text(extracted_text)

        if len(extracted_text) < MIN_DOCUMENT_CHARACTERS:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Hindi mabasa ang file. Siguraduhing mayroon itong "
                    "selectable text at hindi lamang scanned images."
                ),
            )

        input_meta = {
            "documentId": None,
            "inputMode": "uploaded_file_text",
            "pageCount": extracted_text.count("--- Page ") or 1,
            "receivedCharacters": len(extracted_text),
            "documentHash": _sha256_text(extracted_text),
        }

        return _analyze_and_attach_input_meta(
            extracted_text,
            input_meta,
        )
    except HTTPException:
        raise
    except Exception as error:
        print(f"/simplify_file Error: {error}")
        raise HTTPException(
            status_code=500,
            detail="Server error processing file.",
        ) from error
    finally:
        if os.path.exists(file_location):
            os.remove(file_location)


@router.post("/simplify_batch")
async def simplify_batch_files():
    """
    Raw scan images are intentionally no longer accepted.

    The mobile app must run OCR and privacy sanitization locally, then send
    the sanitized page array to /simplify.
    """
    raise HTTPException(
        status_code=410,
        detail={
            "code": "raw_image_batch_disabled",
            "message": (
                "Raw image batch upload is disabled. Run OCR and redaction "
                "on the device, then send sanitized pages to /simplify."
            ),
        },
    )


def normalize_chat_history(history: list, limit: int = 15) -> list:
    """Clean and format recent messages for the LLM messages array."""
    if not history:
        return []

    clean = []

    for message in history[-limit:]:
        role = str(message.get("role", "")).lower()
        content = str(message.get("content", "")).strip()

        if not content:
            continue

        if role in ("user", "human"):
            clean.append({"role": "user", "content": content})
        elif role in ("assistant", "ai", "model"):
            clean.append({"role": "assistant", "content": content})

    return clean


def is_follow_up(message: str) -> bool:
    message_lower = message.lower()
    indicators = (
        "bakit",
        "paano",
        "ano",
        "yun",
        "ganon",
        "ganyan",
        "exception",
        "applicable",
        "meaning",
        "ibig sabihin",
        "example",
        "bawal",
        "what if",
        "so",
        "eh",
        "meron",
        "mayroon",
        "kapag",
        "kung",
    )

    if len(message.split()) <= 4:
        return True

    return any(indicator in message_lower for indicator in indicators)


def build_contextual_query(message: str, history: list) -> str:
    if "[DIRECT REPLY CONTEXT]" in message:
        selected_match = re.search(
            r"SELECTED MESSAGE:\s*(.*?)(?:\n\n|\n\[)",
            message,
            re.DOTALL,
        )

        if selected_match:
            selected_text = selected_match.group(1).strip()
            question_match = re.search(
                r"\[CURRENT USER QUESTION\]\s*(.*)",
                message,
                re.DOTALL,
            )
            current_question = (
                question_match.group(1).strip()
                if question_match
                else ""
            )
            return f"{selected_text} {current_question}".strip()

    if re.search(r"(article|section)\s*\d+", message, re.IGNORECASE):
        return message

    if is_follow_up(message):
        last_user_messages = [
            item["content"]
            for item in history
            if item["role"] == "user"
        ]

        if last_user_messages:
            return f"{last_user_messages[-1]} {message}"

    return message


@router.post("/chat")
def chat_with_ai(request: ChatRequest):
    try:
        if not request.message or not request.message.strip():
            raise HTTPException(
                status_code=400,
                detail="Message cannot be empty.",
            )

        history = normalize_chat_history(request.history or [])
        # The app owns its scoring state. A question about the missing score
        # needs that state, not a vector search for unrelated legal articles.
        question = request.message.rsplit("[CURRENT USER QUESTION]", 1)[-1].strip()
        if re.search(r"\bscore\b", question, re.I) and re.search(
            r"bakit|walang|wala|hindi\s+ibinigay|why|no\s+score",
            question, re.I,
        ):
            score_context = "\n".join(
                [request.message] + [item["content"] for item in reversed(history)]
            )
            match = re.search(r"(?m)^SCORE STATUS REASON:\s*([^\n]+)", score_context)
            if match:
                return {"status": "success", "reply": match.group(1).strip()}
            return {
                "status": "success",
                "reply": "Hindi ko makita ang dahilan sa kasalukuyang chat. Buksan ang Resulta at i-tap ang ‘Bakit walang score?’ para makita ang status ng scan.",
            }

        has_document = (
            "[ATTACHED DOCUMENT CONTEXT:" in request.message
            or any("[PREVIOUSLY ATTACHED DOCUMENT:" in item["content"]
                   for item in history)
        )
        asks_for_law = bool(re.search(
            r"\b(?:RA|PD)\s*\d+\b|\b(?:article|section|art\.|sec\.)\s*\d+\b|"
            r"\b(?:legal\s+basis|batas|law|legal|ligal|enforceable)\b",
            question, re.I,
        ))
        if has_document and not asks_for_law:
            reply = generate_chat_reply(
                user_msg=request.message.strip(),
                retrieved_context="Attached sanitized document only; no legal provisions selected.",
                history=history,
                document_only=True,
            )
            return {"status": "success", "reply": clean_chat_reply(reply)}

        contextual_query = build_contextual_query(
            request.message.strip(),
            history,
        )

        try:
            evidence = prepare_chat_evidence(
                request.message.strip(), contextual_query,
                find_verified_reference_context, query_vector_db,
            )
        except Exception as error:
            print(f"[CHAT RETRIEVAL ERROR] {type(error).__name__}: {error}")
            return {
                "status": "success",
                "reply": "Hindi ko mabuksan ang legal database ngayon. Pakisubukan ulit.",
            }

        if not evidence.context:
            return {"status": "success", "reply": evidence.missing_reply}

        ai_response = generate_chat_reply(
            user_msg=request.message.strip(),
            retrieved_context=evidence.context,
            history=history,
        )
        checked_response = clean_chat_reply(
            remove_unsupported_examples(ai_response, evidence.context)
        )
        cited_sources = sources_mentioned_in_reply(
            checked_response, evidence.sources, question
        )

        return {
            "status": "success",
            "reply": append_verified_sources(checked_response, cited_sources),
        }
    except HTTPException:
        raise
    except Exception as error:
        print(
            f"[CHAT ROUTER ERROR] "
            f"{type(error).__name__}: {error}"
        )
        return {
            "status": "error",
            "message": "Chat service error.",
        }


@router.post("/explain")
def explain_statutory_text(request: ExplainRequest):
    # AI sees the exact chosen excerpt. A source ID also prevents stale offline
    # data from being silently paired with a different legal provision.
    title = request.title.strip()
    raw_text = request.raw_text.strip()
    if not title or len(raw_text) < 5 or len(raw_text) > 12000:
        raise HTTPException(status_code=400, detail={
            "code": "invalid_source", "message": "Walang sapat na legal text para ipaliwanag."
        })
    legal_basis = None
    source_url = None
    if request.source_id is not None:
        try:
            conn = get_db_connection()
            try:
                entry = get_dictionary_entry(conn, request.source_id)
            finally:
                conn.close()
        except Exception:
            raise HTTPException(status_code=503, detail={
                "code": "dictionary_unavailable", "message": "Hindi mabuksan ang legal dictionary ngayon."
            })
        if entry is None or " ".join(entry["raw_text"].split()) != " ".join(raw_text.split()):
            raise HTTPException(status_code=409, detail={
                "code": "stale_source", "message": "Nagbago ang legal text. I-update muna ang dictionary."
            })
        title, raw_text, legal_basis = entry["term"], entry["raw_text"], entry["legal_basis"]
        source_url = entry.get("source_url")

    result = explain_raw_statutory_text(title, raw_text)
    if result.get("status") != "success":
        code = result.get("error_code", "ai_unavailable")
        status = 429 if code == "rate_limited" else 503 if code == "ai_configuration" else 502
        raise HTTPException(status_code=status, detail={
            "code": code, "message": result.get("message", "Hindi makakuha ng paliwanag ngayon.")
        })
    if legal_basis:
        result["data"]["legal_basis"] = legal_basis
    if source_url:
        result["data"]["source_url"] = source_url
    return result