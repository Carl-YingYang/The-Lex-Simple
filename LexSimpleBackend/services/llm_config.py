import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") 

# Gagamitin natin ang gpt-4o-mini dahil mabilis, mura, at magaling mag-Taglish.
CHAT_MODEL = "gpt-4o-mini" 
EXTRACT_MODEL = "gpt-4o-mini"

def get_ai_client():
    # OpenAI Official Client
    return OpenAI(api_key=OPENAI_API_KEY)