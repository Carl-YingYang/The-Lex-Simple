# KNOWLEDGE ROUTER VERSION: 6.2.7
import os
import chromadb
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
            entries = list_dictionary_entries(conn)
        finally:
            conn.close()
        return {"status": "success", "data": entries}
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "dictionary_unavailable", "message": "Hindi mabuksan ang legal dictionary ngayon."},
        )


@router.get("/dictionary/search")
def search_dictionary(query: str):
    if not query or len(query.strip()) < 2:
        raise HTTPException(
            status_code=400,
            detail={"code": "query_too_short", "message": "Mag-type ng kahit dalawang letra."},
        )
    try:
        conn = get_db_connection()
        try:
            entries = search_dictionary_entries(conn, query)
        finally:
            conn.close()
        return {"status": "success", "data": {"results": entries}}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={"code": "dictionary_unavailable", "message": "Hindi mabuksan ang legal dictionary ngayon."},
        )


@router.get("/guides/sync")
def sync_legal_guides():
    try:
        # 🆕 GUMAMIT NG SETTINGS PATH
        if not os.path.exists(settings.GUIDES_DB_PATH):
            return {"status": "success", "data": []}
            
        conn = get_guides_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM guides ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()
        
        guide_data = []
        for row in rows:
            row_dict = dict(row)
            raw_text = row_dict.get("chunk_text", "")
            title = row_dict.get("title", "Legal Guide")
            clean_def = raw_text.replace(f"[{title}]", "").strip()
            guide_data.append({"title": title, "content": clean_def})
            
        return {"status": "success", "data": guide_data}
    except Exception as e: return {"status": "error", "message": str(e)}

@router.delete("/guides/delete")
def delete_legal_guide(title: str):
    try:
        # 🆕 GUMAMIT NG SETTINGS PATH
        if not os.path.exists(settings.GUIDES_DB_PATH):
            return {"status": "error", "message": "Database does not exist yet."}

        conn = get_guides_db_connection()
        c = conn.cursor()
        c.execute("SELECT id FROM guides WHERE title = ?", (title,))
        existing = c.fetchone()
        
        if not existing:
            conn.close()
            return {"status": "error", "message": f"Guide '{title}' not found in database."}

        guide_id = existing[0]
        c.execute("DELETE FROM guides WHERE id = ?", (guide_id,))
        conn.commit()
        conn.close()

        # 🆕 GUMAMIT NG SETTINGS PATH
        chroma_client = chromadb.PersistentClient(path=settings.CHROMA_GUIDES_PATH)
        try:
            collection = chroma_client.get_collection(name="legal_guides")
            collection.delete(ids=[guide_id])
        except Exception as e:
            print(f"ChromaDB Delete Warning: {e}")

        return {"status": "success", "message": f"Ang guide na '{title}' ay matagumpay na nabura!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}