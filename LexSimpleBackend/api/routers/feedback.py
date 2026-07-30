import sqlite3
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class FeedbackRequest(BaseModel):
    name: str
    email: str
    category: str
    feature: str
    message: str

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