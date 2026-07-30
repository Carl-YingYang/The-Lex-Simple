import sqlite3
from core.config import settings

def get_db_connection():
    """Ibalik ang SQLite connection para sa main metadata database."""
    conn = sqlite3.connect(settings.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_guides_db_connection():
    """Ibalik ang SQLite connection para sa Legal Guides database."""
    conn = sqlite3.connect(settings.GUIDES_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn