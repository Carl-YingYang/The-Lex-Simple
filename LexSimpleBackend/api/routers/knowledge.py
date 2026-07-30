import re
import os
import chromadb
from fastapi import APIRouter, HTTPException
from services.llm_service import explain_raw_statutory_text, search_legal_dictionary

# 🆕 IMPORT NG CENTRALIZED CONFIG AT DB HELPERS
from core.config import settings
from core.database import get_db_connection, get_guides_db_connection

router = APIRouter()

@router.get("/dictionary/sync")
def sync_offline_dictionary():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents ORDER BY id ASC")
        rows = cursor.fetchall()
        conn.close()
        
        offline_data = []
        for row in rows:
            row_dict = dict(row)
            raw_text = row_dict.get("chunk_text", "")
            actual_source = "Philippine Law Database"
            for col in ["source_file", "filename", "source", "title", "document_title"]:
                if col in row_dict and row_dict[col] and str(row_dict[col]).strip() != "":
                    actual_source = str(row_dict[col]).strip()
                    break

            title_match = re.match(r'^\[(.*?)\]\s*(.*)', raw_text, re.DOTALL)
            if title_match:
                clean_title = title_match.group(1) 
                clean_def = title_match.group(2)   
            else:
                clean_title = "LEGAL PROVISION"
                clean_def = raw_text
                
            offline_data.append({
                "term": clean_title, 
                "definition": clean_def.strip(),        
                "legal_basis": actual_source,
                "example": "Source: Lex-Simple Offline Knowledge Base"
            })
            
        return {"status": "success", "data": offline_data}
    except Exception as e: return {"status": "error", "message": str(e)}

@router.get("/dictionary/search")
def search_dictionary(query: str):
    if not query or len(query.strip()) < 2: raise HTTPException(status_code=400, detail="Query too short.")
    match = re.match(r'^(article|art\.?|section|sec\.?)\s+(\d+[a-z]?)$', query.strip(), re.IGNORECASE)
    if match:
        prefix = "SECTION" if match.group(1).lower().startswith("sec") else "ARTICLE"
        number = match.group(2)
        exact_title = f"{prefix} {number}"
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM documents WHERE chunk_text LIKE ?", (f"[{exact_title}]%",))
            row = cursor.fetchone()
            conn.close()
            if row:
                row_dict = dict(row)
                raw_text = row_dict.get("chunk_text", "")
                actual_source = "Philippine Law Database"
                for col in ["source_file", "filename", "source", "title", "document_title"]:
                    if col in row_dict and row_dict[col] and str(row_dict[col]).strip() != "":
                        actual_source = str(row_dict[col]).strip()
                        break
                title_match = re.match(r'^\[(.*?)\]\s*(.*)', raw_text, re.DOTALL)
                clean_raw_text = title_match.group(2) if title_match else raw_text
                ai_result = explain_raw_statutory_text(exact_title, clean_raw_text)
                if isinstance(ai_result, dict) and "data" in ai_result:
                    ai_result["data"]["legal_basis"] = actual_source
                return ai_result
        except Exception: pass

    try:
        result = search_legal_dictionary(query)
        return result
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

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