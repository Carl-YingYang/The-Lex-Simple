from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# I-import yung router na kakagawa lang natin
from api.routes import router as api_router

app = FastAPI(
    title="Lex-Simple Backend",
    description="Production-grade AI API with embedded RAG for linguistic simplification.",
    version="1.0.0"
)

# 🛡️ CORS Middleware (Para makapasok yung requests galing sa React Native / Ngrok)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Pwede niyo itong higpitan sa production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ikabit yung mga endpoints natin (yung /simplify at /ingest)
app.include_router(api_router)

# Simpleng health check
@app.get("/")
def read_root():
    return {"message": "Lex-Simpl AI & RAG Backend is Live and Online!"}