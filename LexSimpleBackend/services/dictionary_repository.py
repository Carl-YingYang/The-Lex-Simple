"""Exact source records for the offline and online legal dictionary.

DICTIONARY REPOSITORY VERSION: 6.2.7
The document row ID identifies a particular chunk of a particular source.
No AI response or fuzzy match is ever presented as the source text.
"""

import os
import re
import sqlite3
from typing import Optional

TITLE_PREFIX = re.compile(r"^\s*\[([^\]\n]{1,120})\]\s*", re.DOTALL)
ARTICLE_QUERY = re.compile(r"^(?:art\.?|article)\s+(\d+[a-z]?)$", re.IGNORECASE)
SECTION_QUERY = re.compile(r"^(?:sec\.?|section)\s+(\d+[a-z]?)$", re.IGNORECASE)


def normalize_query(value: str) -> str:
    query = " ".join(value.strip().split())
    article = ARTICLE_QUERY.fullmatch(query)
    if article:
        return f"ARTICLE {article.group(1).upper()}"
    section = SECTION_QUERY.fullmatch(query)
    if section:
        return f"SECTION {section.group(1).upper()}"
    return query


def _entry_from_row(row: sqlite3.Row) -> Optional[dict]:
    record = dict(row)
    raw = str(record.get("chunk_text") or "").strip()
    if not raw:
        return None

    match = TITLE_PREFIX.match(raw)
    source = str(record.get("filename") or "").strip()
    title = match.group(1).strip() if match else (
        os.path.splitext(os.path.basename(source))[0].replace("_", " ").strip()
        or "Legal provision"
    )
    text = raw[match.end():].strip() if match else raw
    if not text:
        return None

    return {
        "id": int(record["id"]),
        "term": title,
        "definition": text,
        "raw_text": text,
        "legal_basis": source or "Source not specified in database",
    }


def list_dictionary_entries(connection: sqlite3.Connection) -> list[dict]:
    rows = connection.execute(
        "SELECT id, filename, chunk_text FROM documents ORDER BY id ASC"
    ).fetchall()
    return [entry for row in rows if (entry := _entry_from_row(row))]


def get_dictionary_entry(
    connection: sqlite3.Connection,
    entry_id: int,
) -> Optional[dict]:
    row = connection.execute(
        "SELECT id, filename, chunk_text FROM documents WHERE id = ?",
        (entry_id,),
    ).fetchone()
    return _entry_from_row(row) if row else None


def search_dictionary_entries(
    connection: sqlite3.Connection,
    query: str,
    limit: int = 10,
) -> list[dict]:
    needle = normalize_query(query).casefold()
    if len(needle) < 2:
        return []

    # Parameterized SQL and escaped LIKE wildcards; a user's % is literal.
    escaped = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = connection.execute(
        "SELECT id, filename, chunk_text FROM documents "
        "WHERE lower(chunk_text) LIKE ? ESCAPE '\\' "
        "OR lower(filename) LIKE ? ESCAPE '\\'",
        (f"%{escaped}%", f"%{escaped}%"),
    ).fetchall()
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