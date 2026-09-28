"""Verified-law vector store, v6.3.0.

Only vectors whose SQLite row is currently active can reach an AI prompt.
Pre-existing uncited vectors stay on disk for audit but are never returned.
"""

import sqlite3
import uuid

import chromadb

from core.config import settings
from rag.embedder import get_embedding


chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PATH)
collection = chroma_client.get_or_create_collection(name="lex_collection")


def add_to_vector_db(text_chunk: str, metadata: dict) -> str:
    chunk_id = str(uuid.uuid4())
    collection.add(ids=[chunk_id], embeddings=[get_embedding(text_chunk)],
                   documents=[text_chunk], metadatas=[metadata])
    return chunk_id


def query_vector_db(query_text: str, n_results: int = 3) -> dict:
    from services.knowledge_catalog import ensure_schema

    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        active_files = [row[0] for row in db.execute(
            "SELECT id FROM knowledge_files WHERE status='active'"
        ).fetchall()]
    if not active_files:
        return {"ids": [[]], "documents": [[]], "metadatas": [[]]}
    total = collection.count()
    if not total:
        return {"ids": [[]], "documents": [[]], "metadatas": [[]]}

    # Search current files directly. Searching the first 100 of all historical
    # vectors could hide a newer law when the archive grows.
    selected_files = (active_files[0] if len(active_files) == 1
                      else {"$in": active_files})
    result = collection.query(
        query_embeddings=[get_embedding(query_text)],
        n_results=min(total, max(n_results * 6, 30)),
        where={"knowledge_file_id": selected_files},
        include=["documents", "metadatas"],
    )
    ids = (result.get("ids") or [[]])[0]
    if not ids:
        return {"ids": [[]], "documents": [[]], "metadatas": [[]]}
    marks = ",".join("?" for _ in ids)
    with sqlite3.connect(settings.DB_PATH) as db:
        active = {row[0] for row in db.execute(
            f"SELECT chunk_id FROM documents WHERE active=1 AND chunk_id IN ({marks})", ids
        ).fetchall()}

    output_ids, documents, metadatas = [], [], []
    for chunk_id, document, meta in zip(
        ids, result["documents"][0], result["metadatas"][0]
    ):
        if chunk_id not in active:
            continue
        meta = meta or {}
        citation = f"{meta.get('law_id', '')}, {meta.get('provision', '')}".strip(", ")
        enriched = (
            f"SOURCE: {citation}\nOFFICIAL URL: {meta.get('source_url', '')}\n"
            f"LEGAL TEXT: {document}"
        )
        output_ids.append(chunk_id)
        documents.append(enriched)
        metadatas.append(meta)
        if len(output_ids) >= n_results:
            break
    return {"ids": [output_ids], "documents": [documents], "metadatas": [metadatas]}