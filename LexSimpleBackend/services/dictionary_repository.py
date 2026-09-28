"""Offline cards for every active law excerpt, v6.3.12.

This read-only view splits long passages for the phone. It never changes the
stored RAG chunks. The original legal wording stays available offline;
``/explain`` remains an online, user-triggered request.
"""

import os
import re
import sqlite3
from typing import Optional


TITLE_PREFIX = re.compile(r"^\s*\[([^\]\n]{1,120})\]\s*", re.DOTALL)
ARTICLE_QUERY = re.compile(r"^(?:art\.?|article)\s+(\d+[a-z]?)$", re.I)
SECTION_QUERY = re.compile(r"^(?:sec\.?|section)\s+(\d+[a-z]?)$", re.I)
DEFINITION = re.compile(
    r'\(([a-z]|\d{1,2})\)\s*["“]?'
    r'([A-Za-z][A-Za-z /-]{1,75}?)["”]?\s+'
    r'(?:means|refers?\s+to|includes?|are)\b', re.I,
)
DEFINITION_HEADING = re.compile(
    r'\b(?:as used in this (?:act|law|code)|definition of terms|definitions of terms)\b', re.I,
)
SINGLE_DEFINITION = re.compile(
    r'^\s*(?:ART(?:ICLE)?\.?\s+\d+[A-Z]?[.:-]?\s*)?'
    r'(?:A|An)\s+([A-Za-z][A-Za-z-]{1,30}(?:\s+[A-Za-z][A-Za-z-]{1,30})?)'
    r'\s+(?:is|means|refers\s+to)\b', re.I,
)
MAX_CARD_CHARS = 460
ENTRY_FACTOR = 65536  # IDs remain compatible with the mobile /explain call.


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
    path = connection.execute("PRAGMA database_list").fetchone()[2]
    if path and not _catalog_ready(connection):
        from services.knowledge_catalog import ensure_schema
        ensure_schema()


def _select(connection: sqlite3.Connection, where: str = "", params: tuple = ()) -> list[sqlite3.Row]:
    _ensure_production_schema(connection)
    if _catalog_ready(connection):
        sql = """SELECT d.id, d.filename, d.chunk_text, d.knowledge_file_id,
                        d.provision_label, k.law_id, k.source_url
                 FROM documents d JOIN knowledge_files k ON d.knowledge_file_id=k.id
                 WHERE d.active=1 AND k.status='active'"""
        if where:
            sql += " AND (" + where + ")"
        return connection.execute(sql + " ORDER BY d.id", params).fetchall()
    sql = "SELECT id, filename, chunk_text FROM documents"
    if where:
        sql += " WHERE " + where.replace("d.", "")
    return connection.execute(sql + " ORDER BY id", params).fetchall()


def _legacy_entry(row: sqlite3.Row) -> Optional[dict]:
    """Compatibility with older, uncatalogued rows and their existing tests."""
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


def _short_pieces(value: str) -> list[str]:
    """Cut at nearby sentence boundaries, keeping every character in order."""
    text = " ".join(value.split())
    pieces = []
    while len(text) > MAX_CARD_CHARS:
        window = text[:MAX_CARD_CHARS + 1]
        boundaries = [match.end() for match in re.finditer(r"[.;!?]\s+", window)]
        preferred = [point for point in boundaries if point >= MAX_CARD_CHARS // 2]
        cut = preferred[-1] if preferred else window.rfind(" ")
        if cut <= 0:
            cut = MAX_CARD_CHARS
        pieces.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        pieces.append(text)
    return pieces


def _split_provision(content: str, label: str) -> list[tuple[str, str]]:
    """Use named definitions when present; keep all other statutory text too."""
    matches = list(DEFINITION.finditer(content)) if DEFINITION_HEADING.search(content[:350]) else []
    spans: list[tuple[str, str]] = []
    if matches:
        introduction = content[:matches[0].start()].strip()
        if introduction:
            spans.append((label, introduction))
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
            term = " ".join(match.group(2).split()).strip(" -")
            spans.append((term if len(term.split()) <= 10 else label,
                          content[match.start():end].strip()))
    else:
        term = label
        if label.upper().startswith("ARTICLE"):
            match = SINGLE_DEFINITION.search(content[:300])
            if match:
                candidate = match.group(1).strip()
                if not set(candidate.casefold().split()) & {"who", "which", "that", "whose"}:
                    term = candidate[0].upper() + candidate[1:]
        spans.append((term, content))

    cards = []
    for title, span in spans:
        parts = _short_pieces(span)
        for index, part in enumerate(parts, 1):
            display_title = title if len(parts) == 1 else f"{title} ({index}/{len(parts)})"
            cards.append((display_title, part))
    return cards


def _production_entries(connection: sqlite3.Connection,
                        source_doc_id: int | None = None) -> list[dict]:
    sql = """SELECT d.id, d.chunk_text, d.knowledge_file_id,
                    d.provision_label, k.law_id, k.source_url
             FROM documents d JOIN knowledge_files k ON d.knowledge_file_id=k.id
             WHERE d.active=1 AND k.status='active'"""
    params: tuple = ()
    if source_doc_id is not None:
        source = connection.execute(sql + " AND d.id=?", (source_doc_id,)).fetchone()
        if not source:
            return []
        sql += " AND d.knowledge_file_id=? AND d.provision_label=?"
        params = (source["knowledge_file_id"], source["provision_label"])
    rows = connection.execute(sql + " ORDER BY d.id", params).fetchall()
    groups: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in rows:
        label = str(row["provision_label"] or "").strip()
        if not label:
            label = f'SOURCE {row["id"]}'
        groups.setdefault((row["knowledge_file_id"], label), []).append(row)

    entries = []
    for (_, label), group in groups.items():
        content = " ".join(
            TITLE_PREFIX.sub("", str(row["chunk_text"] or "").strip(), count=1).strip()
            for row in group
        ).strip()
        if not content:
            continue
        first = group[0]
        for ordinal, (title, excerpt) in enumerate(_split_provision(content, label), 1):
            if ordinal >= ENTRY_FACTOR:
                raise ValueError(f"Too many offline excerpts in {label}")
            entries.append({
                "id": int(first["id"]) * ENTRY_FACTOR + ordinal,
                "term": title,
                "definition": excerpt,
                "raw_text": excerpt,
                "legal_basis": f'{first["law_id"]}, {label}',
                "source_url": first["source_url"],
            })
    return entries


def list_dictionary_entries(connection: sqlite3.Connection) -> list[dict]:
    _ensure_production_schema(connection)
    if _catalog_ready(connection):
        return _production_entries(connection)
    return [entry for row in _select(connection) if (entry := _legacy_entry(row))]


def get_dictionary_entry(connection: sqlite3.Connection, entry_id: int) -> Optional[dict]:
    _ensure_production_schema(connection)
    if _catalog_ready(connection):
        source_doc_id, ordinal = divmod(entry_id, ENTRY_FACTOR)
        if not source_doc_id or not ordinal:
            return None
        return next((entry for entry in _production_entries(connection, source_doc_id)
                     if entry["id"] == entry_id), None)
    rows = _select(connection, "d.id = ?", (entry_id,))
    return _legacy_entry(rows[0]) if rows else None


def search_dictionary_entries(connection: sqlite3.Connection, query: str,
                              limit: int = 10) -> list[dict]:
    needle = normalize_query(query).casefold()
    if len(needle) < 2:
        return []
    _ensure_production_schema(connection)
    if _catalog_ready(connection):
        entries = _production_entries(connection)
    else:
        escaped = needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        rows = _select(connection,
            "lower(d.chunk_text) LIKE ? ESCAPE '\\' OR lower(d.filename) LIKE ? ESCAPE '\\'",
            (f"%{escaped}%",) * 2)
        entries = [entry for row in rows if (entry := _legacy_entry(row))]
    entries = [entry for entry in entries if any(needle in str(entry[key]).casefold()
               for key in ("term", "definition", "legal_basis"))]

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