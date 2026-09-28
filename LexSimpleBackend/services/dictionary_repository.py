"""Source-aware dictionary records, v6.3.0.

The in-memory fallback keeps the repository's existing unit tests useful;
the application database exposes only approved, active knowledge files.
"""

import os
import re
import sqlite3
from typing import Optional


TITLE_PREFIX = re.compile(r"^\s*\[([^\]\n]{1,120})\]\s*", re.DOTALL)
ARTICLE_QUERY = re.compile(r"^(?:art\.?|article)\s+(\d+[a-z]?)$", re.I)
SECTION_QUERY = re.compile(r"^(?:sec\.?|section)\s+(\d+[a-z]?)$", re.I)


def normalize_query(value: str) -> str:
    query = " ".join(value.strip().split())
    for regex, label in ((ARTICLE_QUERY, "ARTICLE"), (SECTION_QUERY, "SECTION")):
        match = regex.fullmatch(query)
        if match:
            return f"{label} {match.group(1).upper()}"
    return query


def _catalog_ready(connection: sqlite3.Connection) -> bool:
    columns = {item[1] for item in connection.execute("PRAGMA table_info(documents)")}
    return {"active", "knowledge_file_id", "provision_label"}.issubset(columns)


def _ensure_production_schema(connection: sqlite3.Connection) -> None:
    # Existing test connections are in-memory. Do not migrate their fixture.
    path = connection.execute("PRAGMA database_list").fetchone()[2]
    if path and not _catalog_ready(connection):
        from services.knowledge_catalog import ensure_schema
        ensure_schema()


def _select(connection: sqlite3.Connection, where: str = "", params: tuple = ()) -> list[sqlite3.Row]:
    _ensure_production_schema(connection)
    if _catalog_ready(connection):
        sql = """SELECT d.id, d.filename, d.chunk_text,
                        d.provision_label, k.law_id, k.source_url
                 FROM documents d JOIN knowledge_files k ON d.knowledge_file_id=k.id
                 WHERE d.active=1 AND k.status='active'"""
        if where:
            sql += " AND (" + where + ")"
        return connection.execute(sql + " ORDER BY d.id", params).fetchall()
    # In-memory fixtures for legacy behavior only.
    sql = "SELECT id, filename, chunk_text FROM documents"
    if where:
        sql += " WHERE " + where.replace("d.", "")
    return connection.execute(sql + " ORDER BY id", params).fetchall()


def _entry_from_row(row: sqlite3.Row) -> Optional[dict]:
    record = dict(row)
    raw = str(record.get("chunk_text") or "").strip()
    if not raw:
        return None
    match = TITLE_PREFIX.match(raw)
    filename = str(record.get("filename") or "").strip()
    title = match.group(1).strip() if match else (
        os.path.splitext(os.path.basename(filename))[0].replace("_", " ").strip()
        or "Legal provision"
    )
    content = raw[match.end():].strip() if match else raw
    if not content:
        return None
    law_id = record.get("law_id")
    label = record.get("provision_label") or title
    legal_basis = f"{law_id}, {label}" if law_id else filename or "Source not specified in database"
    return {
        "id": int(record["id"]), "term": title, "definition": content,
        "raw_text": content, "legal_basis": legal_basis,
        "source_url": record.get("source_url"),
    }


def list_dictionary_entries(connection: sqlite3.Connection) -> list[dict]:
    return [entry for row in _select(connection) if (entry := _entry_from_row(row))]


def get_dictionary_entry(connection: sqlite3.Connection, entry_id: int) -> Optional[dict]:
    rows = _select(connection, "d.id = ?", (entry_id,))
    return _entry_from_row(rows[0]) if rows else None


def search_dictionary_entries(connection: sqlite3.Connection, query: str,
                              limit: int = 10) -> list[dict]:
    needle = normalize_query(query).casefold()
    if len(needle) < 2:
        return []
    escaped = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = _select(connection,
        "lower(d.chunk_text) LIKE ? ESCAPE '\\' OR lower(d.filename) LIKE ? ESCAPE '\\' "
        "OR lower(d.provision_label) LIKE ? ESCAPE '\\' OR lower(k.law_id) LIKE ? ESCAPE '\\'"
        if _catalog_ready(connection) else
        "lower(d.chunk_text) LIKE ? ESCAPE '\\' OR lower(d.filename) LIKE ? ESCAPE '\\'",
        (f"%{escaped}%",) * (4 if _catalog_ready(connection) else 2))
    entries = [entry for row in rows if (entry := _entry_from_row(row))]

    def rank(entry: dict) -> tuple[int, int]:
        title = entry["term"].casefold()
        source = entry["legal_basis"].casefold()
        if title == needle:
            return (0, entry["id"])
        if title.startswith(needle):
            return (1, entry["id"])
        if needle in title:
            return (2, entry["id"])
        if needle in source:
            return (3, entry["id"])
        return (4, entry["id"])

    return sorted(entries, key=rank)[:limit]