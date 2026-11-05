"""Lex-Simple: knowledge base health check.

Ilagay sa LexSimpleBackend/ at patakbuhin (naka-activate ang venv):
    python check_knowledge_health.py
    python check_knowledge_health.py --ask "Ano ang Lessee?"     # sumusubok din sa tumatakbong server

Walang binabago sa database. Read-only ito.
Sinasagot nito: bakit "Wala pa akong sapat na impormasyon..." ang sagot ni Lexie?
"""
import argparse
import json
import os
import sqlite3
import sys
import urllib.request

DB_PATH = os.environ.get("DB_PATH", "./lex_metadata.db")
CHROMA_PATH = os.environ.get("CHROMA_PATH", "./chroma_db")


def table_exists(db, name):
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ask", help="Magpadala ng test na tanong sa http://127.0.0.1:8000/chat")
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    print("=== LEX-SIMPLE KNOWLEDGE HEALTH ===")
    print(f"DB_PATH     = {os.path.abspath(DB_PATH)}  (exists: {os.path.exists(DB_PATH)})")
    print(f"CHROMA_PATH = {os.path.abspath(CHROMA_PATH)}  (exists: {os.path.exists(CHROMA_PATH)})\n")

    active_files = 0
    if not os.path.exists(DB_PATH):
        print("[X] Walang lex_metadata.db sa folder na ito. Patakbuhin ang script sa LexSimpleBackend/.")
    else:
        with sqlite3.connect(DB_PATH) as db:
            db.row_factory = sqlite3.Row
            if table_exists(db, "knowledge_files"):
                rows = db.execute(
                    "SELECT law_id, status, COUNT(*) AS n FROM knowledge_files GROUP BY law_id, status ORDER BY law_id"
                ).fetchall()
                total = sum(r["n"] for r in rows)
                active_files = sum(r["n"] for r in rows if r["status"] == "active")
                print(f"knowledge_files: {total} total, {active_files} ACTIVE")
                for r in rows:
                    print(f"   - {r['law_id']:<18} {r['status']:<10} x{r['n']}")
            else:
                print("[X] Walang knowledge_files table.")
            if table_exists(db, "documents"):
                a = db.execute("SELECT COUNT(*) FROM documents WHERE active=1").fetchone()[0]
                t = db.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
                print(f"documents (chunks): {a} active / {t} total")
            if table_exists(db, "audit_logs"):
                print(f"audit_logs: {db.execute('SELECT COUNT(*) FROM audit_logs').fetchone()[0]} rows")

    print()
    chroma_count = None
    try:
        import chromadb  # noqa
        client = chromadb.PersistentClient(path=CHROMA_PATH)
        chroma_count = client.get_or_create_collection("lex_collection").count()
        print(f"chroma 'lex_collection': {chroma_count} vectors")
    except Exception as error:  # noqa
        print(f"(Hindi nabasa ang chroma: {type(error).__name__}: {error})")

    print("\n=== DIAGNOSIS ===")
    if active_files == 0 or chroma_count == 0:
        print("[X] WALANG ACTIVE na batas sa database ng backend na ito.")
        print("    Ang /chat ay sumasagot LANG kapag may active at verified na batas, kaya ang bawat tanong")
        print("    (kahit 'Ano ang Lessee?') ay sinasagot ng 'Wala pa akong sapat na impormasyon...'.")
        print("    Ayusin: i-upload at i-approve ang PDF ng batas sa admin endpoints (/docs), o gamitin ang tamang DB.")
    else:
        print("[OK] May active na batas. Kung nagre-refuse pa rin si Lexie sa mga simpleng tanong,")
        print("     ang dahilan ay ang disenyo: ang 'Ano ang Lessee?' ay hindi tanong tungkol sa isang artikulo")
        print("     ng batas, at walang glossary ng mga termino sa kontrata. Gagawin natin ito sa Chat Phase C.")

    if args.ask:
        print(f"\n=== LIVE TEST: {args.ask!r} ===")
        body = json.dumps({"message": args.ask, "history": []}).encode()
        req = urllib.request.Request(args.url.rstrip("/") + "/chat", data=body,
                                    headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                print(resp.read().decode()[:800])
        except Exception as error:  # noqa
            print(f"Hindi nakakonekta sa server: {error}")


if __name__ == "__main__":
    sys.exit(main())