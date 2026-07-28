import os
from dotenv import load_dotenv
from openai import OpenAI
from core.config import settings

load_dotenv()

# Gamitin natin ang GROQ API keys
GROQ_API_KEY = settings.GROQ_API_KEY

# 🧠 MODELS (UPDATED TO LATEST GROQ SUPPORTED MODELS): 
# Llama 3.3 70B = Replacement for the old 70B (Para sa /simplify at /chat)
CHAT_MODEL = "llama-3.3-70b-versatile"
# Llama 3.1 8B = Replacement for the old 8B (Para sa /dictionary at /explain)
EXTRACT_MODEL = "llama-3.1-8b-instant"

def get_ai_client():
    # 💡 GROQ COMPATIBILITY: OpenAI SDK gamitin natin, pero baguhin yung base_url papunta sa Groq
    return OpenAI(
        api_key=GROQ_API_KEY,
        base_url="https://api.groq.com/openai/v1"
    )