import hmac
import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from core.rate_limit import LIMIT_FEEDBACK, LIMIT_IP_CEILING, client_ip_key, limiter

router = APIRouter()

class FeedbackRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    email: Optional[str] = Field(default=None, max_length=200)
    category: str = Field(max_length=50)
    feature: str = Field(max_length=100)
    message: str = Field(max_length=2000)

def _clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned if cleaned else None

def _clean_email(value: Optional[str]) -> Optional[str]:
    cleaned = _clean_optional(value)
    if cleaned is None:
        return None
    if "@" not in cleaned or any(char.isspace() for char in cleaned):
        return None
    return cleaned

def require_admin(x_admin_key: str | None = Header(
    default=None, description="Private admin key mula sa backend .env. Huwag ilagay sa mobile app."
)) -> None:
    expected = os.getenv("ADMIN_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Set ADMIN_API_KEY in the backend .env first.")
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected):
        raise HTTPException(status_code=401, detail="Invalid admin key.")

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
@limiter.limit(LIMIT_FEEDBACK)
@limiter.limit(LIMIT_IP_CEILING, key_func=client_ip_key)
def submit_feedback(request: Request, req: FeedbackRequest):
    setup_feedback_db()
    if not req.message or len(req.message.strip()) < 5:
        return {"status": "error", "message": "Feedback message is too short."}

    name = _clean_optional(req.name)
    email = _clean_email(req.email)

    try:
        conn = sqlite3.connect("./lex_metadata.db")
        c = conn.cursor()
        c.execute("INSERT INTO user_feedback (name, email, category, feature, message) VALUES (?, ?, ?, ?, ?)", 
                  (name, email, req.category, req.feature, req.message))
        conn.commit()
        conn.close()
        
        print(f"📩 NEW FEEDBACK ({req.category} - {req.feature}), message length: {len(req.message)}")
        
        return {"status": "success", "message": "Salamat! Natanggap na namin ang iyong feedback."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/dev/feedbacks", dependencies=[Depends(require_admin)])
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