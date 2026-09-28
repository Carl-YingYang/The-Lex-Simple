"""Lex-Simple API: knowledge intake v6.3.2."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as api_router
from db.sqlite_store import init_db
from services.knowledge_catalog import ensure_schema, recover_interrupted_indexes


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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def initialize_knowledge_catalog():
    init_db()
    ensure_schema()
    recover_interrupted_indexes()


app.include_router(api_router)


@app.get("/")
def read_root():
    return {"message": "Lex-Simple backend is online."}