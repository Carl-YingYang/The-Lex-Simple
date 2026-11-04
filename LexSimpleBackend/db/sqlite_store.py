import os
import sqlite3
from datetime import datetime, timedelta, timezone

# 🆕 IMPORT NG CENTRALIZED CONFIG
from core.config import settings

# 🆕 KUNIN ANG PATH MULA SA SETTINGS
DB_PATH = settings.DB_PATH

# Task B1 (L1): ilang araw itatabi ang audit rows (metadata lang ito).
try:
    AUDIT_RETENTION_DAYS = int(os.getenv("AUDIT_RETENTION_DAYS", "7"))
except ValueError:
    print("[sqlite_store] WARNING: invalid AUDIT_RETENTION_DAYS; using 7.")
    AUDIT_RETENTION_DAYS = 7


def init_db():
    """Gagawa ng tables kung wala pa.

    Task B1 (L1): audit_logs ay metadata-only na (document hash, pages,
    chunks, status, score) — WALANG OCR text at WALANG AI response.
    Kapag lumang schema (ocr_input/ai_response) ang naka-install, buburahin
    ito kasama ang mga lumang nilalaman nito at gagawa ng bago.
    """
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

    # Table 2: Audit Logs (metadata lang — walang laman ng dokumento)
    cursor.execute("PRAGMA table_info(audit_logs)")
    audit_columns = {row[1] for row in cursor.fetchall()}
    if audit_columns and "ocr_input" in audit_columns:
        # Lumang content-bearing schema — hindi na naaayon sa privacy
        # contract, kaya burahin ang table kasama ang lumang rows.
        cursor.execute("DROP TABLE audit_logs")

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_hash TEXT,
            page_count INTEGER,
            chunk_count INTEGER,
            status TEXT,
            score INTEGER,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()

    purge_expired_audit_logs()


def purge_expired_audit_logs():
    """Task B1 (L1): burahin ang audit rows na mas matanda sa
    AUDIT_RETENTION_DAYS (default 7 araw). Tumatakbo sa startup."""
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=AUDIT_RETENTION_DAYS)
    ).strftime("%Y-%m-%d %H:%M:%S")
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM audit_logs WHERE timestamp < ?", (cutoff,))
        conn.commit()
    finally:
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


def log_ai_transaction(
    document_hash: str,
    page_count: int,
    chunk_count: int,
    status: str,
    score,
):
    """Task B1 (L1): metadata lang ang naka-log — document hash, bilang ng
    pages at chunks, status, at safety score. Walang text ng dokumento at
    walang sagot ng AI."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO audit_logs (document_hash, page_count, chunk_count, status, score) "
        "VALUES (?, ?, ?, ?, ?)",
        (document_hash, page_count, chunk_count, status, score)
    )
    conn.commit()
    conn.close()


# I-run agad ito pagka-import para sure na may database file na handa
init_db()