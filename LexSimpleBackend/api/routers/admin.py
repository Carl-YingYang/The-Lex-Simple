import os
import shutil
import sqlite3
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form
from rag.ingestor import process_pdf, process_guide_pdf

router = APIRouter()

def run_ingestion_in_background(file_path: str, filename: str):
    try:
        print(f"⏳ BACKGROUND TASK: Ingesting Dictionary {filename}...")
        chunks_saved = process_pdf(file_path, filename)
        print(f"✅ DICTIONARY COMPLETE: Saved {chunks_saved} chunks!")
    except Exception as e: print(f"❌ ERROR: {str(e)}")
    finally:
        if os.path.exists(file_path): os.remove(file_path)

def run_guide_ingestion_in_background(file_path: str, filename: str):
    try:
        print(f"⏳ BACKGROUND TASK: Ingesting Guide {filename}...")
        chunks_saved = process_guide_pdf(file_path, filename)
        print(f"✅ GUIDE COMPLETE: Saved {chunks_saved} chunks!")
    except Exception as e: print(f"❌ ERROR: {str(e)}")
    finally:
        if os.path.exists(file_path): os.remove(file_path)

@router.post("/ingest")
async def ingest_document(background_tasks: BackgroundTasks, file: UploadFile = File(...), custom_title: str = Form(None)):
    if not file.filename.endswith(".pdf"): raise HTTPException(status_code=400, detail="PDF only.")
    temp_dir = "./temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    final_title = custom_title.strip() if custom_title and custom_title.strip() else file.filename
    try:
        with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        background_tasks.add_task(run_ingestion_in_background, file_path, final_title)
        return {"status": "success", "message": f"Processing Dictionary: {final_title}"}
    except Exception as e:
        if os.path.exists(file_path): os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ingest_guide")
async def ingest_guide_document(background_tasks: BackgroundTasks, file: UploadFile = File(...), custom_title: str = Form(None)):
    if not file.filename.endswith(".pdf"): raise HTTPException(status_code=400, detail="PDF only.")
    temp_dir = "./temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_path = os.path.join(temp_dir, file.filename)
    final_title = custom_title.strip() if custom_title and custom_title.strip() else file.filename
    try:
        with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        background_tasks.add_task(run_guide_ingestion_in_background, file_path, final_title)
        return {"status": "success", "message": f"Processing Legal Guide: {final_title}"}
    except Exception as e:
        if os.path.exists(file_path): os.remove(file_path)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dev/logs")
def view_audit_logs():
    try:
        conn = sqlite3.connect("./lex_metadata.db")
        conn.row_factory = sqlite3.Row 
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10")
        logs = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return {"status": "success", "total_logs_fetched": len(logs), "logs": logs}
    except Exception as e: return {"status": "error", "message": str(e)}

@router.get("/dev/db-status")
def check_db_status():
    try:
        conn = sqlite3.connect("./lex_metadata.db")
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM documents")
        total_chunks = cursor.fetchone()[0]
        conn.close()
        return {"status": "success", "total_knowledge_chunks": total_chunks}
    except Exception as e: return {"status": "error", "message": str(e)}