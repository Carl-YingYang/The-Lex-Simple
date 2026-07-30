import re
import os
import shutil
import sqlite3
import pdfplumber
import docx
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Optional
import fitz

from services.llm_service import analyze_legal_text, search_legal_dictionary, explain_raw_statutory_text
from services.chat_service import generate_chat_reply
from services.sanitizer import sanitize_legal_text 
from orchestrator.pipeline import Orchestrator, ProcessRequest

router = APIRouter()
_orchestrator = Orchestrator()

class LegalRequest(BaseModel): 
    text: str

class ChatRequest(BaseModel): 
    message: str
    history: Optional[List[Dict[str, str]]]

class ExplainRequest(BaseModel):
    title: str
    raw_text: str

@router.post("/simplify")
def simplify_text(request: LegalRequest):
    if not request.text or len(request.text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Text is too short.")
    
    result = _orchestrator.process(ProcessRequest(text=request.text))
    print(f"[ORCHESTRATOR] /simplify routed to {result.source_layer}, llm_calls={result.llm_calls_made}")
    return result.data

@router.post("/simplify_file")
async def simplify_uploaded_file(file: UploadFile = File(...)):
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    file_location = f"{temp_dir}/{file.filename}"
    
    try:
        with open(file_location, "wb") as buffer: 
            shutil.copyfileobj(file.file, buffer)
        
        extracted_text = ""
        
        if file.filename.endswith(".pdf"):
            # 🚀 TRY 1: GAMIT ANG PDFPLUMBER
            try:
                with pdfplumber.open(file_location) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            extracted_text += text + "\n"
            except Exception as e:
                print(f"⚠️ PDFPlumber Error: {e}")
                
            # 🚀 TRY 2: KUNG WALANG NAKUHA, GAMITIN ANG PYMUPDF (fitz)
            if not extracted_text.strip():
                try:
                    doc = fitz.open(file_location)
                    for page in doc:
                        extracted_text += page.get_text()
                    doc.close()
                except Exception as e:
                    print(f"⚠️ PyMuPDF Error: {e}")
                    
        elif file.filename.endswith(".docx"):
            doc = docx.Document(file_location)
            for para in doc.paragraphs: extracted_text += para.text + "\n"
            
        elif file.filename.endswith(".txt"):
            with open(file_location, "r", encoding="utf-8") as f: extracted_text = f.read()
            
        else: 
            return {"status": "error", "message": "Unsupported file type."}

        # 🛡️ KUNG WALANG TALAGANG TEXT (Scanned image PDF)
        if not extracted_text or len(extracted_text.strip()) < 20:
             return {"status": "error", "message": "Hindi mabasa ang PDF. Siguraduhing may text ang PDF at hindi ito scanned image."}

        result = _orchestrator.process(ProcessRequest(text=extracted_text))
        
        if os.path.exists(file_location): os.remove(file_location)
        print(f"[ORCHESTRATOR] /simplify_file routed to {result.source_layer}, llm_calls={result.llm_calls_made}")
        return result.data
        
    except Exception as e:
        if os.path.exists(file_location): os.remove(file_location)
        print(f"🔥 /simplify_file Error: {str(e)}")
        return {"status": "error", "message": "Server error processing file."}
    
@router.post("/chat")
def chat_with_ai(request: ChatRequest):
    try:
        msg_lower = request.message.lower()
        context_data = ""
        context_source = ""
        
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
        result = explain_raw_statutory_text(request.title, request.raw_text)
        if isinstance(result, dict):
            if "status" not in result:
                result["status"] = "success"
            return result
        else:
            print(f"Unexpected AI Output: {result}")
            return {"status": "error", "message": "Failed to parse AI response."}
    except Exception as e:
        print(f"Explain Route Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))