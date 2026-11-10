"""General (off-database) chat reply — Task C2 (Chat Phase).

Ginagamit kapag ang tanong ay "general" intent — hindi kayang sagutin
ng verified na knowledge base. Task P1: dumadaan na sa iisang entry
point na services.llm_providers.chat_completion (purpose="general") ang
tawag — doon na nagmumula ang client, model, at ang reasoning_effort
na extra_body kapag gpt-oss ang model.

Patakaran ng sagot: pangkalahatang impormasyon lang tungkol sa legal na
konsepto at kontrata sa Pilipinas — WALANG partikular na batas, Article o
Section number, RA/PD number, kaso, o URL. Walang print o log ng laman ng
tanong dito.

Ang tawag dito ay galing sa /chat router (Task C3, Batch 2).
"""

from __future__ import annotations

import re
from typing import List, Optional

from services.llm_providers import chat_completion

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
    messages: List[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in _normalize_history(history):
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": question})

    # Task P1: ang model at extra_body (gpt-oss reasoning) ay pinipili na
    # ng llm_providers batay sa purpose — wala nang model sa tawag dito.
    completion = chat_completion(
        messages,
        purpose="general",
        temperature=0.4,
        max_tokens=MAX_REPLY_TOKENS,
    )

    reply = (completion.choices[0].message.content or "").strip()
    reply = strip_unsupported_citations(reply)
    if not reply:
        return _SAFE_FALLBACK
    return f"{reply}\n\n{_DISCLAIMER}"