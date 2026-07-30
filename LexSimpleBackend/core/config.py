import os
from dotenv import load_dotenv

# I-load ang mga laman ng .env file
load_dotenv()

class Settings:
    PROJECT_NAME: str = "Lex-Simple Backend"
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "") # Optional na
    
    # 🆕 CENTRALIZED DATABASE PATHS
    DB_PATH: str = "./lex_metadata.db"
    GUIDES_DB_PATH: str = "./lex_guides.db"
    CHROMA_PATH: str = "./chroma_db"
    CHROMA_GUIDES_PATH: str = "./chroma_guides_db"

# Gagawin nating object para madaling tawagin sa ibang files
settings = Settings()