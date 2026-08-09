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

from services.prompts import get_chat_reply_prompt
from db.chroma_store import query_vector_db

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

# ============================================================================
# 🧠 HELPER FUNCTIONS FOR CONTEXT-AWARE CHAT
# ============================================================================

def normalize_chat_history(history: list, limit: int = 15) -> list:
    """Cleans and formats history for the LLM messages array."""
    if not history: return []
    clean = []
    for msg in history[-limit:]:
        role = str(msg.get("role", "")).lower()
        content = str(msg.get("content", "")).strip()
        if not content: continue
        if role in ["user", "human"]: clean.append({"role": "user", "content": content})
        elif role in ["assistant", "ai", "model"]: clean.append({"role": "assistant", "content": content})
    return clean

def is_follow_up(message: str) -> bool:
    """Determines if a message is a conversational follow-up."""
    msg_lower = message.lower()
    indicators = ["bakit", "paano", "ano", "yun", "ganon", "ganyan", "exception", "applicable", "meaning", "ibig sabihin", "example", "bawal", "what if", "so", "eh", "meron", "mayroon", "kapag", "kung"]
    if len(message.split()) <= 4: return True
    return any(ind in msg_lower for ind in indicators)

def build_contextual_query(message: str, history: list) -> str:
    """Builds a retrieval query using previous context if it's a follow-up."""
    
    # 🚀 HANDLE DIRECT REPLY CONTEXT FROM FRONTEND
    # If the user replied to a specific message, use that message's text for RAG
    if "[DIRECT REPLY CONTEXT]" in message:
        match = re.search(r'SELECTED MESSAGE:\s*(.*?)(?:\n\n|\n\[)', message, re.DOTALL)
        if match:
            selected_text = match.group(1).strip()
            current_q_match = re.search(r'\[CURRENT USER QUESTION\]\s*(.*)', message, re.DOTALL)
            current_q = current_q_match.group(1).strip() if current_q_match else ""
            # Combine the selected message and current question for a rich RAG query
            return f"{selected_text} {current_q}"
    
    # If user introduces a new specific Article, treat as new topic
    current_article = re.search(r'(article|section)\s*\d+', message, re.IGNORECASE)
    if current_article:
        return message 
        
    if is_follow_up(message):
        last_user_msgs = [m["content"] for m in history if m["role"] == "user"]
        if last_user_msgs:
            # Combine last user question with current to preserve semantic meaning
            return f"{last_user_msgs[-1]} {message}"
            
    return message

# ============================================================================
# 🤖 CHAT ENDPOINT
# ============================================================================

@router.post("/chat")
def chat_with_ai(request: ChatRequest):
    """
    Context-aware legal chat endpoint.
    Implements Contextual RAG and Article Resolution.
    """
    try:
        if not request.message or not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty.")

        # 1. Normalize History (Keep last 15 messages)
        history = normalize_chat_history(request.history)

        # 2. Build Contextual Query for RAG
        # This converts short follow-ups like "Bakit ganon?" into rich queries
        contextual_query = build_contextual_query(request.message.strip(), history)
        print(f"[DEBUG] RAG Query: {contextual_query}")

        # 3. RAG Search (ChromaDB) using the contextual query
        context_data = ""
        try:
            search_results = query_vector_db(contextual_query, n_results=3)
            if search_results and search_results.get('documents'):
                for doc_list in search_results['documents']:
                    if doc_list:
                        context_data += "\n".join(doc_list) + "\n---\n"
        except Exception as e:
            print(f"RAG Search Error: {e}")

        # 4. SQLite Exact Article Lookup
        # Still check for exact Article in the current message for fast exact matches
        msg_lower = request.message.lower()
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
                    sqlite_context = "\n\n".join([dict(row)["chunk_text"] for row in rows])
                    # Prepend SQLite context as it's more authoritative
                    context_data = sqlite_context + "\n---\n" + context_data
            except Exception as e:
                print(f"SQLite Article Lookup Error: {e}")

        # 5. Call LLM Service
        # Pass the retrieved context and history to the chat service
        ai_response = generate_chat_reply(
            user_msg=request.message.strip(),
            retrieved_context=context_data.strip(),
            history=history
        )

        return {
            "status": "success",
            "reply": ai_response
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[CHAT ROUTER ERROR] {type(e).__name__}: {e}")
        return {
            "status": "error",
            "message": "Chat service error."
        }

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