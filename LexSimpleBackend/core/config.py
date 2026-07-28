import os
from dotenv import load_dotenv

# I-load ang mga laman ng .env file
load_dotenv()

class Settings:
    PROJECT_NAME: str = "Lex-Simple Backend"
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")
    
# Gagawin nating object para madaling tawagin sa ibang files
settings = Settings()