import sqlite3

# Gagawa siya ng file na 'lex_metadata.db' sa main folder natin
DB_PATH = "./lex_metadata.db"

def init_db():
    """Gagawa ng tables para sa offline logs at metadata kung wala pa."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Table 1: Para sa mga in-upload na PDF contracts (Offline Dictionary)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            chunk_id TEXT,
            chunk_text TEXT,
            upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table 2: Audit Logs (Pang-depensa sa liabilities)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ocr_input TEXT,
            ai_response TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def log_document_chunk(filename: str, chunk_id: str, chunk_text: str):
    """Ise-save ang impormasyon ng PDF kapag nag-upload ang admin/librarian."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO documents (filename, chunk_id, chunk_text) VALUES (?, ?, ?)",
        (filename, chunk_id, chunk_text)
    )
    conn.commit()
    conn.close()

def log_ai_transaction(ocr_input: str, ai_response: str):
    """Ire-record ang naging usapan ng Scanner App at ng AI."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO audit_logs (ocr_input, ai_response) VALUES (?, ?)",
        (ocr_input, ai_response)
    )
    conn.commit()
    conn.close()

# I-run agad ito pagka-import para sure na may database file na handa
init_db()