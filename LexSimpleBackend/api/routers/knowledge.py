"""Dictionary and existing legal-guide sync, v6.3.0."""

import os
from fastapi import APIRouter, HTTPException

from core.config import settings
from core.database import get_db_connection, get_guides_db_connection
from services.dictionary_repository import list_dictionary_entries, search_dictionary_entries


router = APIRouter()


@router.get("/dictionary/sync")
def sync_offline_dictionary():
    try:
        conn = get_db_connection()
        try:
            return {"status": "success", "data": list_dictionary_entries(conn)}
        finally:
            conn.close()
    except Exception:
        raise HTTPException(status_code=503, detail={
            "code": "dictionary_unavailable", "message": "Hindi mabuksan ang legal dictionary ngayon."
        })


@router.get("/dictionary/search")
def search_dictionary(query: str):
    if not query or len(query.strip()) < 2:
        raise HTTPException(status_code=400, detail={
            "code": "query_too_short", "message": "Mag-type ng kahit dalawang letra."
        })
    try:
        conn = get_db_connection()
        try:
            results = search_dictionary_entries(conn, query)
        finally:
            conn.close()
        return {"status": "success", "data": {"results": results}}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail={
            "code": "dictionary_unavailable", "message": "Hindi mabuksan ang legal dictionary ngayon."
        })


@router.get("/guides/sync")
def sync_existing_legal_guides():
    # Preserve existing guide screens. These records have no reviewed source
    # URL, so do not label them as approved law provisions.
    if not os.path.exists(settings.GUIDES_DB_PATH):
        return {"status": "success", "data": []}
    try:
        conn = get_guides_db_connection()
        try:
            rows = conn.execute("SELECT title, chunk_text FROM guides ORDER BY id ASC").fetchall()
        finally:
            conn.close()
        data = []
        for row in rows:
            title = str(row["title"] or "Legal Guide")
            content = str(row["chunk_text"] or "").replace(f"[{title}]", "").strip()
            data.append({"title": title, "content": content, "source_status": "unverified"})
        return {"status": "success", "data": data,
                "notice": "Existing guides do not yet have reviewed source URLs."}
    except Exception:
        raise HTTPException(status_code=503, detail="Hindi mabuksan ang legal guides ngayon.")


@router.delete("/guides/delete", status_code=410)
def retired_unauthenticated_guide_delete(title: str):
    raise HTTPException(status_code=410, detail="Guide deletion is disabled during source review.")