import re
import os
import shutil
import sqlite3
import pdfplumber
import docx
import json
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form
from pydantic import BaseModel

# I-import yung mga makina na ginawa natin
from services.llm_service import analyze_legal_text, search_legal_dictionary
from services.chat_service import generate_chat_reply
from rag.ingestor import process_pdf, process_guide_pdf

from typing import List, Dict, Optional

# 💡 NA-IMPORT NA ANG SANITIZER MULA SA SERVICES!
from services.sanitizer import sanitize_legal_text 

router = APIRouter()

# ============================================================================
# 📌 1. DATA MODELS (Pydantic Structures)
# ============================================================================
class LegalRequest(BaseModel): 
    text: str

class ChatRequest(BaseModel): 
    message: str
    history: Optional[List[Dict[str, str]]]

class FeedbackRequest(BaseModel):
    name: str
    email: str
    category: str
    feature: str
    message: str

class ExplainRequest(BaseModel):
    title: str
    raw_text: str

# ============================================================================
# 🧠 2. AI SIMPLIFICATION (Text & Document)
# ============================================================================

@router.post("/simplify")
def simplify_text(request: LegalRequest):
    if not request.text or len(request.text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Text is too short.")
    
    # 💡 DOUBLE PROTECTION: Kahit nalinis na sa phone, dadaan pa rin sa backend sanitizer just in case!
    safe_text = sanitize_legal_text(request.text)
    result = analyze_legal_text(safe_text)
    
    if isinstance(result, dict): 
        result["sanitizedText"] = safe_text
    return result

@router.post("/simplify_file")
async def simplify_uploaded_file(file: UploadFile = File(...)):
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_location = f"{temp_dir}/{file.filename}"
    try:
        with open(file_location, "wb") as buffer: 
            shutil.copyfileobj(file.file, buffer)
        
        extracted_text = ""
        # 💡 DITO MAG-EEXTRACT ANG SERVER NG TEXT KAYA KAILANGAN NG BACKEND SANITIZER
        if file.filename.endswith(".pdf"):
            with pdfplumber.open(file_location) as pdf:
                for page in pdf.pages: extracted_text += page.extract_text() + "\n"
        elif file.filename.endswith(".docx"):
            doc = docx.Document(file_location)
            for para in doc.paragraphs: extracted_text += para.text + "\n"
        elif file.filename.endswith(".txt"):
            with open(file_location, "r", encoding="utf-8") as f: extracted_text = f.read()
        else: return {"status": "error", "message": "Unsupported file type."}

        if not extracted_text or len(extracted_text.strip()) < 20:
             return {"status": "error", "message": "File is empty or unreadable."}

        # 💡 LILINISIN ANG TEXT MULA SA PDF/DOCX BAGO IPASA SA AI
        safe_text = sanitize_legal_text(extracted_text)
        result = analyze_legal_text(safe_text)
        
        if os.path.exists(file_location): os.remove(file_location)
        if isinstance(result, dict):
            result["sanitizedText"] = safe_text
            result["extractedText"] = safe_text 
        return result
    except Exception as e:
        if os.path.exists(file_location): os.remove(file_location)
        return {"status": "error", "message": str(e)}


# ============================================================================
# 🤖 3. AI CHAT ASSISTANT (SMART ROUTING & ANTI-HALLUCINATION)
# ============================================================================
@router.post("/chat")
def chat_with_ai(request: ChatRequest):
    try:
        msg_lower = request.message.lower()
        context_data = ""
        context_source = ""
        
        import sqlite3
        import re
        from services.chat_service import generate_chat_reply

        # 🔍 1. DICTIONARY DB SEARCH
        match = re.search(r'\b(article|art\.?|section|sec\.?)\s+([0-9ivxlc]+[a-z]?)\b', msg_lower)
        if match:
            prefix = "SECTION" if match.group(1).startswith("sec") else "ARTICLE"
            number = match.group(2)
            
            try:
                conn = sqlite3.connect("./lex_metadata.db")
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                
                exact_title1 = f"[{prefix} {number}]"
                exact_title2 = f"{prefix} {number}"
                
                cursor.execute("SELECT chunk_text FROM documents WHERE chunk_text LIKE ? OR chunk_text LIKE ? LIMIT 2", (f"%{exact_title1}%", f"%{exact_title2}%"))
                rows = cursor.fetchall()
                conn.close()
                
                if rows:
                    context_data = "\n\n".join([dict(row)["chunk_text"] for row in rows])
                    context_source = "PHILIPPINE LAW DICTIONARY"
            except Exception as e:
                print(f"Dictionary DB Error: {e}")

        # 🔍 2. GUIDES DB SEARCH
        if not context_data:
            guide_keywords = ["pao", "ibp", "lawyer", "abogado", "free", "attorney", "ulas", "magkano", "tulong", "legal aid", "merit"]
            active_kws = [kw for kw in guide_keywords if kw in msg_lower]
            
            if active_kws:
                try:
                    conn = sqlite3.connect("./lex_guides.db")
                    conn.row_factory = sqlite3.Row
                    cursor = conn.cursor()
                    
                    kw = active_kws[0]
                    cursor.execute("SELECT chunk_text FROM guides WHERE chunk_text LIKE ? OR title LIKE ? LIMIT 2", (f"%{kw}%", f"%{kw}%"))
                    rows = cursor.fetchall()
                    conn.close()
                    
                    if rows:
                        context_data = "\n\n".join([dict(row)["chunk_text"] for row in rows])
                        context_source = "LEGAL ASSISTANCE GUIDES"
                except Exception as e:
                    print(f"Guides SQLite Error: {e}")

        # 🚀 3. BUILD FINAL PROMPT
        final_prompt = request.message
        
        if context_data:
            final_prompt = f"USER QUESTION: {request.message}\n\nCONTEXT FROM {context_source}:\n{context_data}\n\nCRITICAL INSTRUCTION: Sagutin ang tanong gamit LAMANG ang context sa itaas. I-explain in conversational Taglish. Bawal mag-imbento."
        elif "[ATTACHED DOCUMENT CONTEXT:" in request.message:
            final_prompt = request.message
        else:
            final_prompt = f"USER QUESTION: {request.message}\n\nCRITICAL INSTRUCTION: Wala kang nakitang eksaktong context sa database para dito. Sabihin AGAD na: 'Pasensya na, wala sa database ko ang eksaktong batas o guide tungkol diyan.' Bawal kang mag-imbento ng Article number o mag-assume na tungkol ito sa PAO kung hindi binanggit."

        ai_response = generate_chat_reply(final_prompt, request.history)
        return {"status": "success", "reply": ai_response}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.post("/explain")
def explain_statutory_text(request: ExplainRequest):
    if not request.raw_text or len(request.raw_text.strip()) < 5:
        raise HTTPException(status_code=400, detail="Text is too short to explain.")
    
    try:
        from services.llm_service import explain_raw_statutory_text
        
        # 🤖 DIRECT CALL: Hindi na natin ipa-parse kasi Dictionary na agad ang binabalik nito!
        result = explain_raw_statutory_text(request.title, request.raw_text)
        
        # 🤖 PROTECTION CHECK
        if isinstance(result, dict):
            # Make sure may status: "success" para basahin ng frontend
            if "status" not in result:
                result["status"] = "success"
            return result
        else:
            print(f"Unexpected AI Output: {result}")
            return {"status": "error", "message": "Failed to parse AI response."}
            
    except Exception as e:
        print(f"Explain Route Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 📚 4. LEX-LIBRARY (Dictionary & Legal Provisions)
# ============================================================================
@router.get("/dictionary/sync")
def sync_offline_dictionary():
    try:
        conn = sqlite3.connect("./lex_metadata.db")
        conn.row_factory = sqlite3.Row
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
            conn = sqlite3.connect("./lex_metadata.db")
            conn.row_factory = sqlite3.Row
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
                from services.llm_service import explain_raw_statutory_text
                ai_result = explain_raw_statutory_text(exact_title, clean_raw_text)
                if isinstance(ai_result, dict) and "data" in ai_result:
                    ai_result["data"]["legal_basis"] = actual_source
                return ai_result
        except Exception: pass

    try:
        result = search_legal_dictionary(query)
        return result
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 💼 5. LEGAL ASSISTANCE GUIDES (PAO/IBP)
# ============================================================================
@router.get("/guides/sync")
def sync_legal_guides():
    try:
        if not os.path.exists("./lex_guides.db"):
            return {"status": "success", "data": []}
            
        conn = sqlite3.connect("./lex_guides.db")
        conn.row_factory = sqlite3.Row
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
                
            guide_data.append({
                "title": title, 
                "content": clean_def
            })
            
        return {"status": "success", "data": guide_data}
    except Exception as e: return {"status": "error", "message": str(e)}


# ============================================================================
# 💬 6. USER FEEDBACK SYSTEM
# ============================================================================
def setup_feedback_db():
    conn = sqlite3.connect("./lex_metadata.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS user_feedback 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  name TEXT, 
                  email TEXT, 
                  category TEXT, 
                  feature TEXT, 
                  message TEXT, 
                  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    try:
        c.execute("ALTER TABLE user_feedback ADD COLUMN feature TEXT DEFAULT 'General'")
    except Exception:
        pass 
    conn.commit()
    conn.close()

@router.post("/submit_feedback")
def submit_feedback(req: FeedbackRequest):
    setup_feedback_db()
    if not req.message or len(req.message.strip()) < 5:
        return {"status": "error", "message": "Feedback message is too short."}
        
    try:
        conn = sqlite3.connect("./lex_metadata.db")
        c = conn.cursor()
        c.execute("INSERT INTO user_feedback (name, email, category, feature, message) VALUES (?, ?, ?, ?, ?)", 
                  (req.name, req.email, req.category, req.feature, req.message))
        conn.commit()
        conn.close()
        
        print(f"📩 NEW FEEDBACK from {req.name} ({req.category} - {req.feature}): {req.message}")
        
        return {"status": "success", "message": "Salamat! Natanggap na namin ang iyong feedback."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ============================================================================
# 🛠️ 7. ADMIN TOOLS & DATA INGESTION
# ============================================================================
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

@router.delete("/guides/delete")
def delete_legal_guide(title: str):
    try:
        if not os.path.exists("./lex_guides.db"):
            return {"status": "error", "message": "Database does not exist yet."}

        conn = sqlite3.connect("./lex_guides.db")
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

        import chromadb
        chroma_client = chromadb.PersistentClient(path="./chroma_guides_db")
        try:
            collection = chroma_client.get_collection(name="legal_guides")
            collection.delete(ids=[guide_id])
        except Exception as e:
            print(f"ChromaDB Delete Warning: {e}")

        return {"status": "success", "message": f"Ang guide na '{title}' ay matagumpay na nabura!"}

    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/dev/feedbacks")
def get_all_feedbacks():
    try:
        if not os.path.exists("./lex_metadata.db"):
            return {"status": "success", "total": 0, "data": []}

        conn = sqlite3.connect("./lex_metadata.db")
        conn.row_factory = sqlite3.Row  
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT * FROM user_feedback ORDER BY timestamp DESC")
            rows = cursor.fetchall()
            feedbacks = [dict(row) for row in rows]
        except sqlite3.OperationalError:
            feedbacks = [] 
            
        conn.close()
        
        return {"status": "success", "total": len(feedbacks), "data": feedbacks}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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