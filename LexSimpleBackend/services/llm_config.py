import os

from dotenv import load_dotenv
from openai import OpenAI

from core.config import settings


load_dotenv()

GROQ_BASE_URL = "https://api.groq.com/openai/v1"

CHAT_MODEL = os.getenv(
    "GROQ_CHAT_MODEL",
    "openai/gpt-oss-20b",
).strip()

EXTRACT_MODEL = os.getenv(
    "GROQ_EXTRACT_MODEL",
    "llama-3.1-8b-instant",
).strip()


def _get_groq_api_key() -> str:
    configured_key = getattr(
        settings,
        "GROQ_API_KEY",
        None,
    )

    if hasattr(configured_key, "get_secret_value"):
        configured_key = configured_key.get_secret_value()

    api_key = configured_key or os.getenv(
        "GROQ_API_KEY",
        "",
    )
    normalized_key = str(api_key).strip()

    if not normalized_key:
        raise RuntimeError(
            "Missing GROQ_API_KEY. Add it to the backend .env file."
        )

    return normalized_key


def get_ai_client() -> OpenAI:
    return OpenAI(
        api_key=_get_groq_api_key(),
        base_url=GROQ_BASE_URL,
        timeout=120.0,
        max_retries=2,
    )