# check_llm.py - Lex Simple live LLM checker (PRIMARY Groq + FALLBACK Gemini)
#
# 1. Static check: kumpleto at TAMA ANG SPELLING ng mga env var na
#    binabasa ng services/llm_providers.py (eksaktong pangalan).
# 2. Live check: totoong chat call sa PRIMARY at sa FALLBACK gamit ang
#    values mula sa .env - pareho ng estilo ng tawag ng backend.
#
# PRIVACY: canned prompt lang. Hindi nire-print ang buong API key.
# Diagnostic tool lang ito - huwag i-commit sa repo.

import os
import time

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

GATE_TRUE = {"1", "true", "yes", "on"}
CANNED_PROMPT = "Sumagot nang isang salita lang: OK"
OLD_FALLBACK_ALLOW = "LLM_FALLBACK_ALLOW"  # lumang pangalan - hindi binabasa ng code


def env_text(name):
    value = os.getenv(name)
    if value is None or not str(value).strip():
        return ""
    return str(value).strip()


def live_test(label, base_url, api_key, models):
    print()
    print("-" * 62)
    print(f"LIVE TEST: {label}")
    print(f"  base_url : {base_url}")
    print(f"  api key  : (haba: {len(api_key)} chars)")
    deduped = []
    for m in models:
        if m and m not in deduped:
            deduped.append(m)
    if any(m.lower().startswith("models/") for m in deduped):
        print("  [!] May model na nagsisimula sa 'models/'. Dapat BARE ID lang")
        print("      (hal. gemini-flash-lite-latest). Ang endpoint mismo ang")
        print("      nagdaragdag ng 'models/' prefix - dobleng prefix = 404.")
    client = OpenAI(api_key=api_key, base_url=base_url, timeout=30.0, max_retries=0)
    results = []
    for model in deduped:
        started = time.monotonic()
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": CANNED_PROMPT}],
                max_tokens=1000,
            )
        except Exception as exc:
            msg = str(exc)
            if api_key and api_key in msg:
                msg = msg.replace(api_key, "***")
            print(f"  FAIL {model} : {type(exc).__name__}: {msg[:180]}")
            results.append(False)
            continue
        elapsed = time.monotonic() - started
        choice = resp.choices[0] if resp.choices else None
        text = (choice.message.content or "").strip() if choice else ""
        finish = getattr(choice, "finish_reason", "?") if choice else "?"
        if text:
            print(f"  PASS {model} : {elapsed:.1f}s, finish={finish}, sagot: {text[:40]!r}")
            results.append(True)
        else:
            print(f"  EMPTY {model} : {elapsed:.1f}s, finish={finish} (walang laman ang sagot)")
            results.append(False)
    return bool(results) and all(results)


def main():
    print("=" * 62)
    print("CHECK_LLM: live na pagsubok sa PRIMARY (Groq) at FALLBACK (Gemini)")
    print("=" * 62)

    # ---------- PRIMARY (Groq) ----------
    print()
    print("[PRIMARY - Groq]")
    p_base = env_text("GROQ_BASE_URL") or "https://api.groq.com/openai/v1"
    p_key = (os.getenv("GROQ_API_KEY") or "").strip()
    p_models = [
        env_text("GROQ_CHAT_MODEL") or "openai/gpt-oss-120b",
        env_text("GROQ_EXTRACT_MODEL") or "openai/gpt-oss-120b",
        env_text("GROQ_EXPLAIN_MODEL") or "openai/gpt-oss-120b",
    ]
    if not p_key:
        print("  GROQ_API_KEY: (MISSING!) - hindi ma-test ang primary.")
        p_ok = False
    else:
        p_ok = live_test("PRIMARY", p_base, p_key, p_models)

    # ---------- FALLBACK (Gemini) ----------
    print()
    print("[FALLBACK - Gemini]")
    f_name = env_text("LLM_FALLBACK_NAME")
    f_base = env_text("LLM_FALLBACK_BASE_URL")
    f_key = (os.getenv("LLM_FALLBACK_API_KEY") or "").strip()
    f_models = [
        env_text("LLM_FALLBACK_CHAT_MODEL"),
        env_text("LLM_FALLBACK_EXTRACT_MODEL"),
        env_text("LLM_FALLBACK_EXPLAIN_MODEL"),
    ]
    f_allow = env_text("LLM_FALLBACK_ALLOW_USER_DATA")
    f_old = env_text(OLD_FALLBACK_ALLOW)

    print(f"  LLM_FALLBACK_NAME           : {f_name or '(MISSING!)'}")
    print(f"  LLM_FALLBACK_BASE_URL       : {f_base or '(MISSING!)'}")
    key_disp = f"(haba: {len(f_key)} chars)" if f_key else "(MISSING!)"
    print(f"  LLM_FALLBACK_API_KEY        : {key_disp}")
    print(f"  LLM_FALLBACK_CHAT_MODEL     : {f_models[0] or '(MISSING!)'}")
    print(f"  LLM_FALLBACK_EXTRACT_MODEL  : {f_models[1] or '(MISSING!)'}")
    print(f"  LLM_FALLBACK_EXPLAIN_MODEL  : {f_models[2] or '(MISSING!)'}")
    print(f"  LLM_FALLBACK_ALLOW_USER_DATA: {f_allow or '(MISSING!)'}")
    if f_old:
        print()
        print(f"  [!] May nakitang {OLD_FALLBACK_ALLOW} sa .env - YANG PANGALAN ANG MALI.")
        print("      Hindi ito binabasa ng code; burahin na lang o palitan ng")
        print("      LLM_FALLBACK_ALLOW_USER_DATA=true")

    missing = []
    if not f_name:
        missing.append("LLM_FALLBACK_NAME")
    if not f_base:
        missing.append("LLM_FALLBACK_BASE_URL")
    if not f_key:
        missing.append("LLM_FALLBACK_API_KEY")
    for var, val in zip(
        (
            "LLM_FALLBACK_CHAT_MODEL",
            "LLM_FALLBACK_EXTRACT_MODEL",
            "LLM_FALLBACK_EXPLAIN_MODEL",
        ),
        f_models,
    ):
        if not val:
            missing.append(var)

    gate_on = f_allow.casefold() in GATE_TRUE

    print()
    if missing:
        print("  CONFIG: NAKA-OFF ang fallback - kulang ang mga sumusunod:")
        for m in missing:
            print(f"    - {m}")
        f_ok = False
    else:
        if gate_on:
            print("  CONFIG: kumpleto at NAKA-ON ang failover gate.")
        else:
            print("  CONFIG: kumpleto pero NAKA-OFF ang gate!")
            print("  Kulang: LLM_FALLBACK_ALLOW_USER_DATA=true sa .env")
            print("  (Kapag may failover attempt, lalabas sa log: reason=policy_blocked)")
        f_ok = live_test("FALLBACK", f_base, f_key, f_models)

    # ---------- BUOD ----------
    print()
    print("=" * 62)
    print("BUOD")
    print("=" * 62)
    print(f"  PRIMARY  (Groq)   live call : {'GUMAGANA' if p_ok else 'HINDI GUMAGANA'}")
    print(f"  FALLBACK config kumpleto    : {'OO' if not missing else 'HINDI (tingnan ang listahan)'}")
    print(f"  FALLBACK gate (failover)    : {'ON' if gate_on else 'OFF'}")
    print(f"  FALLBACK  (Gemini) live call: {'GUMAGANA' if f_ok else 'HINDI GUMAGANA'}")
    print()
    print("  Paalala: direct na tawag ito sa provider - hindi dumadaan sa backend")
    print("  routing. Para sa totoong failover test, gawin ang failover drill sa")
    print("  chat (GROQ_BASE_URL=.invalid trick).")


if __name__ == "__main__":
    main()
    