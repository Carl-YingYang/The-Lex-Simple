"""Lex-Simple API: knowledge intake v6.3.2."""
import os
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from api.routes import router as api_router
from core.rate_limit import INSTALL_ID_PATTERN, limiter, rate_limit_exceeded_handler
from db.usage_store import touch_install
from db.sqlite_store import init_db
from services.knowledge_catalog import ensure_schema, recover_interrupted_indexes

REQUIRED_ENV_VARS = ("GROQ_API_KEY", "ADMIN_API_KEY", "INSTALL_ID_SALT")


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
    yield


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
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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