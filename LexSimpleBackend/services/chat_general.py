"""General (off-database) chat reply — Task C2 (Chat Phase).

Ginagamit kapag ang tanong ay "general" intent — hindi kayang sagutin
ng verified na knowledge base. Kapareho ng chat_service.generate_chat_reply
ang client/model/extra_body pattern (get_ai_client + CHAT_MODEL +
reasoning_effort na extra_body kung gpt-oss ang model).

Patakaran ng sagot: pangkalahatang impormasyon lang tungkol sa legal na
konsepto at kontrata sa Pilipinas — WALANG partikular na batas, Article o
Section number, RA/PD number, kaso, o URL. Walang print o log ng laman ng
tanong dito.

Ang tawag dito ay galing sa /chat router (Task C3, Batch 2).
"""

from __future__ import annotations

import re
from typing import List, Optional

from services.llm_config import get_ai_client, CHAT_MODEL

MAX_HISTORY_MESSAGES = 15
MAX_REPLY_TOKENS = 450  # kaya ng ~150 salita na may buo

SYSTEM_PROMPT = (
    "Ikaw si Lexie, ang Legal Text Guide ng Lex-Simple. Sagutin ang tanong "
    "sa simpleng Filipino o Taglish bilang PANGKALAHATANG impormasyon lang "
    "tungkol sa legal na konsepto at kontrata sa Pilipinas.\n"
    "BAWAL: magbanggit ng partikular na batas, Article o Section number, "
    "RA o PD number, kaso, o URL. BAWAL ding magbigay ng konklusyon sa "
    "partikular na kaso ng user, manghula ng resulta, o magsabi na legal o "
    "ilegal ang tiyak na sitwasyon — ipaliwanag ang konsepto at kung anong "
    "mga detalye ang karaniwang mahalaga.\n"
    "Kung kailangan ng tiyak na payo, imungkahi sa ISANG pangungusap na "
    "kumonsulta sa PAO, IBP, o abogado.\n"
    "Hanggang 150 salita lang. Plain text (walang Markdown, table, o "
    "asterisk). Tapusin nang maayos ang bawat pangungusap."
)

# Mga pangungusap na may ganitong marka ay tinatanggal sa reply.
_UNSUPPORTED_CITATION_RE = re.compile(
    r"\bra\s*\.?\s*\d+"
    r"|republic\s+act"
    r"|\barticle\s*\d+"
    r"|\bart\.?\s*\d+"
    r"|\bsection\s*\d+"
    r"|\bsec\.?\s*\d+"
    r"|g\.r\.\s*no\.?"
    r"|https?://\S+",
    re.IGNORECASE,
)

_SAFE_FALLBACK = (
    "Pasensya na, hindi ako sigurado sa sagot diyan ngayon. "
    "Subukan muli mamaya o itanong sa ibang paraan."
)

_DISCLAIMER = (
    "Pangkalahatang paliwanag ito at hindi galing sa naaprubahang "
    "database ng batas; hindi ito legal advice."
)


def _normalize_history(history: Optional[List[dict]]) -> List[dict]:
    """Kapareho ng lohika ng chat_service: user/assistant lang, may laman."""
    cleaned: List[dict] = []
    for msg in history or []:
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        role = msg.get("role", "user")
        if role == "ai":
            role = "assistant"
        if role not in ("user", "assistant"):
            continue
        cleaned.append({"role": role, "content": content.strip()})
    return cleaned[-MAX_HISTORY_MESSAGES:]


def strip_unsupported_citations(reply: str) -> str:
    """Tanggalin ang mga pangungusap na may hindi beripikadong sanggunian.

    Tinatanggal ang mga pangungusap na may "RA <numero>", "Republic Act",
    "Article <numero>", "Section <numero>", "G.R. No.", o URL. Kapag wala
    nang natira, ibinabalik ang safe fallback.
    """
    if not reply or not reply.strip():
        return ""
    sentences = re.split(r"(?<=[.!?])\s+|\n+", reply.strip())
    kept = [
        sentence.strip()
        for sentence in sentences
        if sentence.strip() and not _UNSUPPORTED_CITATION_RE.search(sentence)
    ]
    if not kept:
        return _SAFE_FALLBACK
    return " ".join(kept)


def generate_general_reply(question: str, history: Optional[List[dict]] = None) -> str:
    """Pangkalahatang sagot mula sa LLM, walang verified na batas source.

    Hayaang itaas ng router ang exception (kasama ng quota/error handling
    ng /chat) — hindi nito nilulunok ang error para makita ng catch sa
    taas ang totoong sanhi.
    """
    client = get_ai_client()

    messages: List[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in _normalize_history(history):
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": question})

    completion = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=messages,
        temperature=0.4,
        max_tokens=MAX_REPLY_TOKENS,
        extra_body={
            "reasoning_effort": "low",
            "include_reasoning": False,
        } if CHAT_MODEL.startswith("openai/gpt-oss-") else {},
    )

    reply = (completion.choices[0].message.content or "").strip()
    reply = strip_unsupported_citations(reply)
    if not reply:
        return _SAFE_FALLBACK
    return f"{reply}\n\n{_DISCLAIMER}"