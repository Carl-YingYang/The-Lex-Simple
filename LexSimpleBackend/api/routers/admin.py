"""Private knowledge-file review endpoints, v6.3.10.

Set ADMIN_API_KEY in LexSimpleBackend/.env. Existing unreviewed upload endpoints
are deliberately retired so PDFs cannot bypass preview and approval.
"""

import hmac
import os
import sqlite3

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, Header,
    HTTPException, Query, UploadFile,
)
from pydantic import BaseModel, Field

from core.config import settings
from services.knowledge_catalog import (
    MAX_BYTES, activate_approved_file, activation_preview, create_draft,
    disable_file, discard_draft, ensure_schema,
    file_details, index_draft, list_civil_code_reviews, list_files,
    mark_activation, mark_indexing, preview_draft, review_civil_code_article,
    revoke_civil_code_article, update_draft_exclusions, update_draft_pages,
)


def require_admin(x_admin_key: str | None = Header(
    default=None, description="Private admin key mula sa backend .env. Huwag ilagay sa mobile app."
)) -> None:
    expected = os.getenv("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Set ADMIN_API_KEY in the backend .env first.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Invalid admin key.")


router = APIRouter(dependencies=[Depends(require_admin)])

IMPORT = "1 · Batas: I-upload at I-approve"
FILES = "2 · Batas: Listahan ng Files"
ADVANCED = "3 · Batas: Ibang Gawain"


class PageSelection(BaseModel):
    first_page: int = Field(ge=1, description="Unang PDF page na isasama.")
    last_page: int = Field(ge=1, description="Huling PDF page na isasama.")
    excluded_pages: list[int] = Field(default_factory=list, description="Mga page sa loob ng range na hindi isasama.")


class ApprovalConfirmation(BaseModel):
    source_matches_pdf: bool = Field(description="Na-check na tumutugma ang official source URL sa PDF.")
    extracted_text_reviewed: bool = Field(description="Na-review na ang sections sa preview bago i-index.")


class ExclusionSelection(BaseModel):
    excluded_provisions: str = Field(default="", description="Hal. ARTICLE 39, ARTICLE 131-147, SECTION 5. Blank kung wala.")


class ActivationConfirmation(ExclusionSelection):
    confirmed_scope: bool = Field(description="Nakita ang activation preview at sinuri ang isasama at ie-exclude.")
    included_provisions: str = Field(default="", description="Optional: ARTICLE 1305-1430. Blank para lahat maliban sa exclusions.")


class ArticleReview(BaseModel):
    checked_later_laws: bool = Field(description="Nasuri ang mas bagong batas na maaaring bumago sa Article.")
    basis_url: str = Field(description="Official government URL na ginamit sa applicability review; hiwalay sa original RA 386 URL.")
    review_note: str = Field(description="Maikling paliwanag ng review at konklusyon; 20–1000 characters.")


def _bad_request(exc: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


def _run_index(file_id: str) -> None:
    try:
        index_draft(file_id)
    except Exception as exc:
        # index_draft already writes status='failed'; keep the response stable.
        print(f"[KNOWLEDGE INDEX ERROR] {file_id}: {type(exc).__name__}: {exc}")


def _run_activation(file_id: str) -> None:
    try:
        activate_approved_file(file_id)
    except Exception as exc:
        print(f"[KNOWLEDGE ACTIVATE ERROR] {file_id}: {type(exc).__name__}: {exc}")


@router.post("/ingest/preview", tags=[IMPORT],
             summary="1. I-upload ang PDF at tingnan ang nakuha",
             description="Gumawa ng draft. Basahin ang warnings at sections bago mag-approve.")
async def preview_knowledge_pdf(
    file: UploadFile = File(..., description="Original PDF copy ng batas."),
    title: str = Form(..., description="Pamagat, hal. Truth in Lending Act."),
    law_id: str = Form(..., description="Law ID, hal. RA 3765 o PD 442."),
    source_url: str = Form(..., description="HTTPS link sa official government source."),
    first_page: int = Form(1, description="Unang PDF page na isasama; 1 ang default."),
    last_page: int | None = Form(None, description="Huling PDF page; blanko para lahat."),
    excluded_pages: str = Form("", description="Optional, comma-separated page numbers; blanko kung wala."),
    excluded_provisions: str = Form("", description="Optional: ARTICLE 39, ARTICLE 131-147, SECTION 5."),
):
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF only.")
    try:
        excludes = [int(value.strip()) for value in excluded_pages.split(",") if value.strip()]
        if len(excludes) > 100 or len(excludes) != len(set(excludes)):
            raise ValueError("Excluded pages must be unique; maximum 100.")
        content = await file.read(MAX_BYTES + 1)
        return create_draft(content, file.filename or "upload.pdf", title,
                            law_id, source_url, first_page, last_page, excludes,
                            excluded_provisions=excluded_provisions)
    except (ValueError, RuntimeError) as exc:
        raise _bad_request(exc)
    finally:
        await file.close()


@router.get("/knowledge/files", tags=[FILES],
            summary="Tingnan ang files at status ng bawat isa")
def knowledge_files():
    return {"status": "success", "data": list_files()}


@router.get("/knowledge/files/legacy", tags=[ADVANCED],
            summary="Tingnan ang lumang entries na walang source")
def legacy_files():
    """Old PDF chunks remain stored but are quarantined until sourced again."""
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        rows = db.execute("""SELECT filename, COUNT(*) AS chunks
                           FROM documents WHERE knowledge_file_id IS NULL
                           GROUP BY filename ORDER BY filename""").fetchall()
    return {"status": "success", "data": [
        {"filename": name, "chunks": count, "status": "unverified"}
        for name, count in rows
    ]}


@router.get("/knowledge/files/{file_id}/preview", tags=[IMPORT],
            summary="2. Balikan ang preview ng draft",
            description="Gamitin ang id mula sa upload. Dito makikita ang current sections at warnings.")
def knowledge_preview(file_id: str, offset: int = Query(0, ge=0),
                      limit: int = Query(20, ge=1, le=50)):
    try:
        return preview_draft(file_id, offset, limit)
    except (ValueError, FileNotFoundError) as exc:
        raise _bad_request(exc)


@router.get("/knowledge/files/{file_id}", tags=[FILES],
            summary="Tingnan ang detalye ng isang file")
def knowledge_file_detail(file_id: str, offset: int = Query(0, ge=0),
                          limit: int = Query(20, ge=1, le=50)):
    try:
        return file_details(file_id, offset, limit)
    except (ValueError, FileNotFoundError) as exc:
        raise _bad_request(exc)


@router.put("/knowledge/files/{file_id}/pages", tags=[ADVANCED],
            summary="Baguhin ang PDF pages ng draft")
def revise_selected_pages(file_id: str, selection: PageSelection):
    try:
        return update_draft_pages(file_id, selection.first_page,
                                  selection.last_page, selection.excluded_pages)
    except (ValueError, FileNotFoundError) as exc:
        raise _bad_request(exc)


@router.put("/knowledge/files/{file_id}/provisions", tags=[IMPORT],
            summary="Optional: piliin ang provisions na ie-exclude bago i-approve")
def revise_draft_scope(file_id: str, selection: ExclusionSelection):
    try:
        return update_draft_exclusions(file_id, selection.excluded_provisions)
    except (ValueError, FileNotFoundError) as exc:
        raise _bad_request(exc)


@router.post("/knowledge/files/{file_id}/approve", tags=[IMPORT],
             summary="3. I-approve pagkatapos i-review",
             description="Ang napiling provisions ang magiging active; ang exclusions ay archived lang. Maaaring may mas bagong amendments sa original PDF.")
def approve_knowledge_file(file_id: str, confirmation: ApprovalConfirmation,
                           background_tasks: BackgroundTasks):
    if not confirmation.source_matches_pdf or not confirmation.extracted_text_reviewed:
        raise HTTPException(status_code=400, detail="Confirm the official source and extracted text before approval.")
    try:
        mark_indexing(file_id)
    except ValueError as exc:
        raise _bad_request(exc)
    background_tasks.add_task(_run_index, file_id)
    return {"id": file_id, "status": "indexing",
            "message": "Check GET /knowledge/files for active or failed status."}


@router.get("/knowledge/files/{file_id}/activation-preview", tags=[IMPORT],
            summary="Tingnan ang isasama bago i-activate ang dating approved file")
def preview_approved_scope(file_id: str, excluded_provisions: str = Query(""),
                           included_provisions: str = Query("")):
    try:
        return activation_preview(file_id, excluded_provisions, included_provisions)
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/knowledge/files/{file_id}/activate", tags=[IMPORT],
             summary="I-activate ang selected scope ng existing approved file")
def activate_existing_file(file_id: str, selection: ActivationConfirmation,
                           background_tasks: BackgroundTasks):
    try:
        result = mark_activation(file_id, selection.excluded_provisions,
                                 selection.confirmed_scope, selection.included_provisions)
    except ValueError as exc:
        raise _bad_request(exc)
    background_tasks.add_task(_run_activation, file_id)
    return {**result, "message": "Check GET /knowledge/files for progress, then active status."}


@router.get("/knowledge/files/{file_id}/article-reviews", tags=[ADVANCED],
            summary="Tingnan ang reviewed RA 386 Articles")
def civil_code_reviews(file_id: str):
    try:
        return {"status": "success", "data": list_civil_code_reviews(file_id)}
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/knowledge/files/{file_id}/articles/{article_number}/review", include_in_schema=False,
             summary="Payagan ang isang reviewed RA 386 Article sa AI",
             description="Editorial review ito, hindi awtomatikong legal verification. I-record ang official updated source at paliwanag.")
def activate_civil_code_article(file_id: str, article_number: int, review: ArticleReview):
    try:
        return review_civil_code_article(file_id, article_number, review.basis_url,
                                         review.review_note, review.checked_later_laws)
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/knowledge/files/{file_id}/articles/{article_number}/revoke", include_in_schema=False,
             summary="Alisin ang isang Article sa AI habang nire-review muli")
def revoke_reviewed_article(file_id: str, article_number: int):
    try:
        return revoke_civil_code_article(file_id, article_number)
    except ValueError as exc:
        raise _bad_request(exc)


@router.post("/knowledge/files/{file_id}/disable", tags=[ADVANCED],
             summary="Alisin ang active file sa search")
def disable_knowledge_file(file_id: str):
    try:
        disable_file(file_id)
    except ValueError as exc:
        raise _bad_request(exc)
    return {"id": file_id, "status": "disabled"}


@router.delete("/knowledge/files/{file_id}/draft", tags=[ADVANCED],
               summary="Burahin ang unapproved draft")
def delete_unapproved_draft(file_id: str):
    try:
        discard_draft(file_id)
    except ValueError as exc:
        raise _bad_request(exc)
    return {"id": file_id, "status": "discarded"}


@router.post("/ingest", status_code=410, include_in_schema=False)
def retired_ingest():
    raise HTTPException(status_code=410, detail="Use /ingest/preview and /knowledge/files/{id}/approve.")


@router.post("/ingest_guide", status_code=410, include_in_schema=False)
def retired_guide_ingest():
    raise HTTPException(status_code=410, detail="Guide import is paused until source review is added.")


@router.get("/dev/db-status", include_in_schema=False)
def db_status():
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        active = db.execute("SELECT COUNT(*) FROM documents WHERE active=1").fetchone()[0]
        legacy = db.execute("SELECT COUNT(*) FROM documents WHERE knowledge_file_id IS NULL").fetchone()[0]
    return {"status": "success", "active_knowledge_chunks": active,
            "quarantined_legacy_chunks": legacy}


@router.get("/dev/logs", include_in_schema=False)
def audit_log_status():
    # Avoid returning raw OCR text and AI replies through an admin status route.
    with sqlite3.connect(settings.DB_PATH) as db:
        count = db.execute("SELECT COUNT(*) FROM audit_logs").fetchone()[0]
    return {"status": "success", "audit_log_count": count}