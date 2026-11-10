"""Lex-Simple API: knowledge intake v6.3.2."""
import logging
import os
import re
import shutil
import sqlite3
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from api.routes import router as api_router
from core.config import settings
from core.rate_limit import INSTALL_ID_PATTERN, limiter, rate_limit_exceeded_handler
from db import usage_store
from db.usage_store import touch_install
from db.sqlite_store import init_db
from services.knowledge_catalog import ensure_schema, recover_interrupted_indexes

REQUIRED_ENV_VARS = ("GROQ_API_KEY", "ADMIN_API_KEY", "INSTALL_ID_SALT")

# Task P0: logger para sa startup at readiness logs (walang laman ng
# dokumento na naka-log kahit kailan — bilang at estado lang).
startup_logger = logging.getLogger("uvicorn.error")


def _env_flag(name: str, default: str = "0") -> bool:
    """Task P0: boolean env parser.

    True kapag ang value (case-insensitive) ay 1/true/yes/on.
    Kahit anong iba (o walang laman) ay False.
    """
    value = (os.getenv(name, default) or default).strip().casefold()
    return value in {"1", "true", "yes", "on"}


def _cors_origins() -> list:
    """Task P0: listahan ng CORS origins mula sa CORS_ORIGINS env.

    Comma-separated (hal.: "https://lexsimple.vercel.app,http://localhost:3000").
    Default kapag walang laman o hindi nakaset: [] — walang CORS header ang
    ire-respond ang server, at sapat na iyon para sa mobile app (hindi
    nangangailangan ng CORS ang native HTTP clients). Ibubukas lang ito
    kapag may totoong web client na.
    """
    raw = (os.getenv("CORS_ORIGINS") or "").strip()
    if not raw:
        return []
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _sqlite_write_ok(db_path) -> bool:
    """Task P0 /ready: totoong write probe sa isang SQLite database.

    Gumagawa ng maliit na readiness_probe table, nag-iinsert at nagbubura
    ng isang row — para masabi na talagang nasusulat ang DB (halimbawang
    dahilan ng kabiguan: puno ang disk o read-only ang mount).
    Best-effort: kahit anong error, False lang ang ibabalik.
    """
    try:
        conn = sqlite3.connect(str(db_path), timeout=3)
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS readiness_probe "
                "(probe_id TEXT PRIMARY KEY)"
            )
            conn.execute(
                "INSERT OR REPLACE INTO readiness_probe (probe_id) VALUES (?)",
                (uuid.uuid4().hex,),
            )
            conn.execute("DELETE FROM readiness_probe")
            conn.commit()
        finally:
            conn.close()
        return True
    except Exception:
        return False


def _chroma_document_count():
    """Task P0 /ready at startup: bilang ng vectors sa lex_collection.

    Lazy import para hindi bigatin ang pag-import ng main.py. Bumabalik ng
    None kapag hindi mabasa ang Chroma (hindi isinisivat ang dahilan).
    """
    try:
        from db.chroma_store import collection

        return int(collection.count())
    except Exception:
        return None


def _llm_breaker_state() -> str:
    """Task P0 /ready: estado ng LLM circuit breaker.

    Wala pang circuit breaker sa kasalukuyang bersyon, kaya "unknown" ang
    ibinabalik at hindi ito nagpapa-fail ng /ready. Kapag nagkaroon na
    (hal. sa services/llm_service.py), i-update dito:
      "closed" = okay na ang LLM, "open" = may sira (i-fa-fail ang /ready).
    """
    return "unknown"


def _ready_checks() -> dict:
    """Task P0 /ready: isang tawag, lahat ng check tatakbo.

    Ang mga pangalan ng check ay hindi naglalaman ng sensitibong detalye
    (paths, model names, o laman ng knowledge base).
    """
    usage_ok = _sqlite_write_ok(usage_store.USAGE_DB_PATH)
    metadata_ok = _sqlite_write_ok(settings.DB_PATH)

    vector_count = _chroma_document_count()
    if vector_count is None:
        chroma_ok = False
        chroma_check = {"ok": False, "detail": "unavailable"}
    elif vector_count <= 0:
        chroma_ok = False
        chroma_check = {"ok": False, "detail": "empty"}
    else:
        chroma_ok = True
        chroma_check = {"ok": True, "count": vector_count}

    llm_state = _llm_breaker_state()

    return {
        "usage_db": {"ok": usage_ok},
        "metadata_db": {"ok": metadata_ok},
        "chroma_collection": chroma_check,
        "llm": {"ok": llm_state != "open", "state": llm_state},
    }


def _cleanup_temp_uploads(directory: str = "temp_uploads") -> int:
    """Task P0 startup: burahin ang mga natirang file sa temp_uploads/.

    Ang /extract_text ay sumusulat ng pansamantalang file dito bago
    i-extract ang text; kapag nag-crash o na-restart ang server, maaaring
    may maiwang file. Best-effort ito: hindi pinapabagsak ang startup
    kapag may ayaw mabura. Bilang lang ang naka-log — walang filename at
    walang laman ng file.
    """
    removed = 0
    try:
        os.makedirs(directory, exist_ok=True)
        entries = os.listdir(directory)
    except OSError:
        return 0
    for name in entries:
        path = os.path.join(directory, name)
        try:
            if os.path.isfile(path) or os.path.islink(path):
                os.unlink(path)
                removed += 1
            elif os.path.isdir(path):
                shutil.rmtree(path)
                removed += 1
        except OSError:
            continue
    return removed


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = [
        name for name in REQUIRED_ENV_VARS
        if not (os.getenv(name) or "").strip()
    ]
    if missing:
        raise RuntimeError(
            "Missing required environment variables: "
            + ", ".join(missing)
            + ". Set them in the backend .env file before starting."
        )
    init_db()
    ensure_schema()
    recover_interrupted_indexes()

    # Task P0 startup: linisin ang mga lumang temp upload files.
    removed = _cleanup_temp_uploads()
    if removed:
        startup_logger.info(
            "temp_uploads cleanup: %d leftover file(s) removed.",
            removed,
        )

    # Task P0 startup: i-warning kapag walang laman ang knowledge base.
    # Bilang lang ang naka-log — hindi kailanman ilalabas ang laman.
    kb_count = _chroma_document_count()
    if kb_count is None:
        startup_logger.warning(
            "Knowledge base check unavailable: hindi mabasa ang count ng "
            "Chroma 'lex_collection'. Tingnan ang GET /ready pagkatapos ng "
            "startup."
        )
    elif kb_count <= 0:
        startup_logger.warning(
            "Knowledge base is EMPTY: 0 vectors sa 'lex_collection'. "
            "Walang retrieved legal context ang chat hanggang may "
            "ma-approve na batas (Knowledge Base endpoints o "
            "scripts/rebuild_chroma_index.py)."
        )
    yield


# Task P0: ang docs/redoc/openapi ay naka-off by default (ENABLE_DOCS
# hindi nakaset o false). I-set ang ENABLE_DOCS=1 sa .env kapag
# nagde-develop para mabalik ang /docs at /redoc.
ENABLE_DOCS = _env_flag("ENABLE_DOCS")

app = FastAPI(
    title="Lex-Simple Backend",
    description="Legal literacy and source-reviewed knowledge API.",
    version="6.3.2",
    openapi_tags=[
        {"name": "1 · Batas: I-upload at I-approve",
         "description": "Sundan ang 1 → 2 → 3. Isang PDF muna bago ang susunod."},
        {"name": "2 · Batas: Listahan ng Files",
         "description": "Tingnan kung draft, indexing, active, o failed ang bawat batas."},
        {"name": "3 · Batas: Ibang Gawain",
         "description": "Page selection, legacy records, disable, at pag-alis ng draft."},
        {"name": "Knowledge Base", "description": "Dictionary at existing guide sync."},
        {"name": "AI Processing", "description": "Simplify, chat, at explain endpoints."},
        {"name": "User Feedback", "description": "Feedback endpoints."},
    ],
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Task P0: ang allow_origins ay mula na sa CORS_ORIGINS env (comma-
# separated; default [] kapag walang laman). Hindi nangangailangan ng
# CORS ang mobile app, kaya walang masamang epekto ang walang laman na
# listahan sa mga native HTTP clients.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def track_install_activity(request: Request, call_next):
    """Task A1: anonymous install tracking (bilang lang, walang laman).

    - May valid X-Install-Id at HINDI X-Analytics: 0 → i-upsert ang
      last_seen ng install (hashed lang ang id sa DB).
    - X-Analytics: 0 → huwag mag-store ng kahit ano.
    - Best-effort: kahit anong error sa tracking, tuloy pa rin ang request.
    - Task B1: ang daily quota ay hiwalay na sa tracking — hindi na
      umaasa sa analytics flag (tingnan ang api/routers/ai.py).
    """
    install_id = (request.headers.get("X-Install-Id") or "").strip()
    opted_out = (request.headers.get("X-Analytics") or "").strip() == "0"
    if not opted_out and install_id and re.fullmatch(INSTALL_ID_PATTERN, install_id):
        try:
            touch_install(install_id)
        except Exception:
            pass
    return await call_next(request)

app.include_router(api_router)


@app.get("/")
def read_root():
    return {"message": "Lex-Simple backend is online."}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/ready")
def ready_check():
    """Task P0: readiness probe para sa hosting/deployment health.

    Checks:
    - usage_db: nasusulat ang SQLite usage DB (totoong write probe).
    - metadata_db: nasusulat ang metadata DB (totoong write probe).
    - chroma_collection: may laman ang lex_collection (count > 0).
    - llm: breaker state ("unknown" kapag wala pa — hindi nagpapa-fail).

    Kapag may pumalya: 503 na may listahan ng mga pumalyang check
    (mga pangalan lang — walang sensitibong detalye).
    """
    checks = _ready_checks()
    failed = [name for name, result in checks.items() if not result["ok"]]
    if failed:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "failed": failed,
                "checks": checks,
            },
        )
    return {"status": "ready", "checks": checks}