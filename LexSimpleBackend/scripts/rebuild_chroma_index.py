#!/usr/bin/env python3
"""REBUILD CHROMA INDEX — Task R1 (Chat Phase).

Muling binubuo ang Chroma collection na "lex_collection" mula sa SQLite
NANG HINDI binabago ang SQLite. Ginagaya ang eksaktong paraan ng
services/knowledge_catalog.py (index_draft) sa pagbuo ng vector text at
metadata.

KAILAN GAGAMITIN:
  - Kapag nawala o nasira ang chroma_db folder (may laman ang SQLite pero
    0 vectors sa Chroma, kaya walang makuhang batas ang /chat).
  - Bagong deploy o bagong machine na walang kopya ng chroma_db.

PAALALA: I-backup muna ang chroma_db folder bago patakbuhin ang --apply:
  (PowerShell)  Copy-Item -Recurse chroma_db chroma_db_backup

PAGGAMIT (mula sa LexSimpleBackend/):
  python scripts/rebuild_chroma_index.py               # DRY-RUN: bilang lang, walang isinusulat
  python scripts/rebuild_chroma_index.py --apply       # magsusulat sa Chroma (ilang minuto sa CPU)
  python scripts/rebuild_chroma_index.py --apply --batch 64
  python scripts/rebuild_chroma_index.py --law "RA 386"   # isang batas lang

WALANG isinusulat sa SQLite. WALANG ini-print na chunk_text o laman ng
dokumento — bilang (counts) lang ang ipinapakita.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path

# Para gumana ang "python scripts/rebuild_chroma_index.py" mula sa LexSimpleBackend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Tinatanggal ang nangungunang "[label] " ng chunk_text, para ang naiwang
# text ay kapareho ng part["text"] na ini-embed ng knowledge_catalog.index_draft.
CHUNK_LABEL_RE = re.compile(r"^\[[^\]]+\]\s*")

# Ang eksaktong row selection mula sa task spec.
SELECT_SQL = """
    SELECT d.chunk_id            AS chunk_id,
           d.chunk_text          AS chunk_text,
           d.provision_label     AS provision_label,
           k.id                  AS knowledge_file_id,
           k.title               AS title,
           k.law_id              AS law_id,
           k.source_url          AS source_url
    FROM documents d
    JOIN knowledge_files k ON d.knowledge_file_id = k.id
    WHERE d.active = 1
      AND k.status = 'active'
      AND d.chunk_id NOT LIKE 'pending-%'
"""


def _as_text(value) -> str:
    """Ang Chroma metadata ay hindi tumatanggap ng None — gawing empty string."""
    return "" if value is None else str(value)


def build_entry(row: sqlite3.Row) -> dict:
    """Buo ang (id, vec_text, metadata) na kapareho ng index_draft format."""
    text = CHUNK_LABEL_RE.sub("", row["chunk_text"] or "", count=1)
    vec_text = f"{_as_text(row['law_id'])} {_as_text(row['provision_label'])}\n{text}"
    metadata = {
        "source": _as_text(row["title"]),
        "law_id": _as_text(row["law_id"]),
        "source_url": _as_text(row["source_url"]),
        "provision": _as_text(row["provision_label"]),
        "knowledge_file_id": _as_text(row["knowledge_file_id"]),
        "verified": True,
    }
    return {"id": _as_text(row["chunk_id"]), "vec_text": vec_text, "metadata": metadata}


def fetch_target_rows(db_path: str, law_id: str | None) -> list:
    """SELECT lang — kahit kailan, walang write sa SQLite."""
    sql = SELECT_SQL
    params: list = []
    if law_id:
        sql += "  AND k.law_id = ?"
        params.append(law_id)
    with sqlite3.connect(db_path) as db:
        db.row_factory = sqlite3.Row
        return db.execute(sql, params).fetchall()


def dedupe_rows(rows: list) -> tuple[list, int]:
    """Prine-protektahan ang collection.add laban sa dobleng chunk_id."""
    seen: set = set()
    unique: list = []
    duplicates = 0
    for row in rows:
        chunk_id = str(row["chunk_id"])
        if chunk_id in seen:
            duplicates += 1
            continue
        seen.add(chunk_id)
        unique.append(row)
    return unique, duplicates


def get_existing_ids(collection, ids: list, batch_size: int) -> set:
    """Kunin ang mga id na nasa Chroma na, batch by batch (idempotency)."""
    existing: set = set()
    size = max(1, batch_size)
    for start in range(0, len(ids), size):
        batch = ids[start:start + size]
        try:
            found = collection.get(ids=batch, include=[])["ids"] or []
        except Exception:
            # Lumang chromadb version: kinukuha ang buong row (mahal pero bihira).
            found = collection.get(ids=batch)["ids"] or []
        existing.update(found)
    return existing


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild ang Chroma lex_collection mula sa SQLite (read-only sa SQLite)."
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Isulat sa Chroma. Kapag wala ito, DRY-RUN lang (bilang lang).",
    )
    parser.add_argument("--batch", type=int, default=32, help="Batch size (default 32)")
    parser.add_argument(
        "--law", type=str, default=None,
        help="Isang batas lang, hal. \"RA 386\" (eksaktong law_id sa knowledge_files).",
    )
    args = parser.parse_args()

    from core.config import settings  # lazy import: para mabilis ang --help

    db_path = settings.DB_PATH
    if not Path(db_path).exists():
        print(f"[ERROR] Hindi nahanap ang SQLite sa '{db_path}' (DB_PATH). "
              f"Patakbuhin mula sa LexSimpleBackend/ folder.")
        return 1

    # ---------- SQLite side (read-only) ----------
    rows = fetch_target_rows(db_path, args.law)
    unique_rows, duplicates = dedupe_rows(rows)
    entries = [build_entry(row) for row in unique_rows]

    print(f"[INFO] Target rows sa SQLite: {len(entries)} (dobleng chunk_id na laktawan: {duplicates})")
    if args.law:
        print(f"[INFO] Filter na batas: '{args.law}'")
    per_law = Counter(entry["metadata"]["law_id"] for entry in entries)
    for law, count in sorted(per_law.items()):
        print(f"[INFO]   {law or '(walang law_id)'}: {count} chunks")

    if not entries:
        print("[ERROR] Walang nahanap na active rows. Tignan ang documents.active, "
              "knowledge_files.status, at ang mga chunk_id na 'pending-'.")
        return 1

    # ---------- Chroma side ----------
    import chromadb  # lazy import

    chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PATH)
    collection = chroma_client.get_or_create_collection(name="lex_collection")

    ids = [entry["id"] for entry in entries]
    existing = get_existing_ids(collection, ids, args.batch)
    to_add = [entry for entry in entries if entry["id"] not in existing]

    print(f"[INFO] Nasa Chroma na: {len(existing)}")
    print(f"[INFO] Idadagdag ngayon: {len(to_add)}")
    print(f"[INFO] Chroma collection count bago: {collection.count()}")

    if not args.apply:
        print("[DRY-RUN] Walang isinulat sa Chroma. "
              "Backup muna (Copy-Item -Recurse chroma_db chroma_db_backup) "
              "tapos patakbuhin muli gamit ang --apply.")
        return 0

    if to_add:
        from rag.embedder import model  # lazy import: hindi kailangan sa dry-run

        total = len(to_add)
        size = max(1, args.batch)
        done = 0
        for start in range(0, total, size):
            batch = to_add[start:start + size]
            embeddings = model.encode(
                [entry["vec_text"] for entry in batch], batch_size=32
            ).tolist()
            collection.add(
                ids=[entry["id"] for entry in batch],
                embeddings=embeddings,
                documents=[entry["vec_text"] for entry in batch],
                metadatas=[entry["metadata"] for entry in batch],
            )
            done += len(batch)
            print(f"[PROGRESS] {done}/{total} vectors naidagdag")

    # ---------- Panghuling pagtutugma ----------
    final_existing = get_existing_ids(collection, ids, args.batch)
    missing = [chunk_id for chunk_id in ids if chunk_id not in final_existing]

    print(f"[RESULT] Chroma collection count: {collection.count()}")
    print(f"[RESULT] Target rows sa SQLite: {len(ids)}")
    print(f"[RESULT] SQLite ids na wala pa rin sa Chroma: {len(missing)}")
    if missing:
        print("[ERROR] May kulang pa rin. Idempotent ang script — "
              "patakbuhin muli ang --apply para dagdagan ang kulang.")
        return 1
    print("[OK] Kumpleto ang rebuild: lahat ng active SQLite chunks ay nasa Chroma na.")
    return 0


if __name__ == "__main__":
    sys.exit(main())