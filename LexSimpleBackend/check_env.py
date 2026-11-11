"""
check_env.py - mabilisang health check ng LLM env config (walang network call)

Naka-mask ang mga key (prefix + haba lang) - hindi priniprint ang buong secret.
Diagnostic tool lang - huwag i-commit; burahin pagkatapos kasama ng check_nvidia.py.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def mask(value):
    if not value:
        return "(EMPTY / WALANG LAMAN!)"
    return value[:4] + "... (" + str(len(value)) + " chars)"


def main():
    print("=" * 64)
    print("PRIMARY (Groq)")
    print("=" * 64)
    groq_url = os.getenv("GROQ_BASE_URL", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    print("GROQ_BASE_URL :", groq_url or "(EMPTY - gagamit ng code default, ok lang)")
    if groq_url and groq_url != "https://api.groq.com/openai/v1":
        print("                ^ HINDI ito ang opisyal na Groq URL!")
        print("                  Dapat: https://api.groq.com/openai/v1")
    print("GROQ_API_KEY  :", mask(groq_key))
    if groq_key and not groq_key.startswith("gsk_"):
        print("                ^ HINDI Groq key ito (Groq keys ay nagsisimula sa 'gsk_')!")
        print("                  Kung AIza... ito - GEMINI key ang napunta dito!")
    if not groq_key:
        print("                ^ WALANG KEY - hindi kakayanin ng Groq na mag-auth")

    print()
    print("=" * 64)
    print("FALLBACK (Gemini)")
    print("=" * 64)
    fb_url = os.getenv("LLM_FALLBACK_BASE_URL", "").strip()
    fb_key = os.getenv("LLM_FALLBACK_API_KEY", "").strip()
    print("LLM_FALLBACK_BASE_URL :", fb_url or "(EMPTY - fallback OFF)")
    print("LLM_FALLBACK_API_KEY  :", mask(fb_key))
    if fb_key and not fb_key.startswith("AIza"):
        print("                        ^ hindi nagsisimula sa 'AIza' - kung Gemini dapat, i-double check")
    print("LLM_FALLBACK_ALLOW_USER_DATA:", os.getenv("LLM_FALLBACK_ALLOW_USER_DATA", "").strip() or "(empty)")
    for name in ("LLM_FALLBACK_EXTRACT_MODEL", "LLM_FALLBACK_CHAT_MODEL", "LLM_FALLBACK_EXPLAIN_MODEL"):
        print(name + ":", os.getenv(name, "").strip() or "(EMPTY)")

    print()
    print("=" * 64)
    print("IBANG LINES NA MADALING MALITO")
    print("=" * 64)
    usage_db = os.getenv("USAGE_DB_PATH", "(unset - ok, default ang gamit)")
    print("USAGE_DB_PATH       :", usage_db or "(EMPTY! ito ang sanhi ng crash - ayusin o burahin)")
    kdir = os.getenv("KNOWLEDGE_FILES_DIR", "(unset - ok, default ang gamit)")
    print("KNOWLEDGE_FILES_DIR :", kdir or "(EMPTY! - backend root ang matetake, hindi ang folder)")

    print()
    print("CROSS-CHECK:")
    if groq_key and fb_key and groq_key == fb_key:
        print("  !! GROQ_API_KEY at LLM_FALLBACK_API_KEY ay MAGKAPAREHO - may napalit na linya!")
    if groq_url and fb_url and groq_url == fb_url:
        print("  !! GROQ_BASE_URL at LLM_FALLBACK_BASE_URL ay MAGKAPAREHO - may napalit na linya!")
    print("(tapos na ang check - walang network call na ginawa)")


if __name__ == "__main__":
    main()