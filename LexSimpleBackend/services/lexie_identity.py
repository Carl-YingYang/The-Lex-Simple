"""Lexie identity guard — Task LX1 (persona consistency + UPL boundary).

Rule-based lang ito: walang LLM call, walang network call, walang
print/log ng laman ng tanong. Nagbibigay ito ng DETERMINISTIKONG sagot
sa mga tanong tungkol sa sarili ni Lexie at sa legal advice boundary:

  "sino ka?", "anong model ka?", "abogado ka ba?", "legal advice ba ito?"

Bakit deterministic: kahit Groq o ang fallback provider ang nasa ilalim,
hindi maaaring sumagot ang model na "ako si Llama/Gemini..." at hindi
maaaring magmukhang legal guide o abogado ang app (UPL risk). Ang sagot
ay laging pareho — walang LLM cost, walang quota, walang model name leak.

Ginagamit ng /chat router bago ang anumang LLM path. Ang tsekrecheck ay
gumagana LANG sa parte ng mensahe pagkatapos ng "[CURRENT USER QUESTION]"
kaya hindi mahuhugot ng regex ang salitang "legal advice" mula sa
nakalakip na dokumento o sa conversation history.
"""

from __future__ import annotations

import re
from typing import Optional

# Ang opisyal na pagpapakilala ni Lexie. Laging ito ang sagot sa mga
# identity question — hindi nagbabago kahit anong provider ang gamit.
LEXIE_IDENTITY_REPLY = (
    "Ako si Lexie, isang AI na tagapaliwanag ng dokumento sa Lex-Simple. "
    "Ang trabaho ko lang ay gawing simple at madaling maintindihan ang mga "
    "legal terms at dokumentong ipapadala mo — gabay sa pag-unawa ito, "
    "hindi legal advice. Hindi ako abogado, law firm, o ahensya ng "
    "gobyerno, at hindi ako kapalit ng propesyonal na payo. Kung "
    "kailangan mo ng tiyak na payo sa sitwasyon mo, kumonsulta sa "
    "lisensyadong abogado, PAO, o IBP legal aid. May gusto ka bang "
    "ipaliwanag ako ngayon?"
)

# ============================================================
# MGA PATTERN NG IDENTITY QUESTION
# ============================================================

_IDENTITY_PATTERNS = (
    # A. Sino/ano si Lexie — pangalan at persona.
    r"\bsino\s+(?:po\s+)?(?:ba\s+)?ka\b",
    r"\bsino\s+(?:po\s+)?(?:ba\s+)?kayo\b",
    r"\bcno\s+(?:po\s+)?(?:ba\s+)?ka\b",
    r"\bcno\s+(?:po\s+)?(?:ba\s+)?kayo\b",
    r"\bwho\s+are\s+you\b",
    r"\bwhat(?:'s|\s+is)\s+your\s+name\b",
    r"\bano\s+(?:po\s+)?(?:ang\s+)?pangalan\s+mo\b",
    r"\bwhat\s+are\s+you\b",
    r"\banu?\s+ka\s+ba\b",
    # B. Model/AI na pinagmulan — bawal i-self-report ang model name.
    r"\b(?:what|which|anong|ano(?:ng)?)\s+(?:ai\s+)?model\b",
    r"\bmodel\s+mo\b",
    r"\b(?:are\s+you|ikaw\s+ba\s+si|ikaw\s+ba\s+ang)\s+(?:si\s+|ang\s+)?"
    r"(?:lexie|lexi|chatgpt|gpt|gemini|llama|claude|deepseek|copilot"
    r"|mistral|qwen)\b",
    r"\bare\s+you\s+(?:a\s+|an\s+|the\s+)?"
    r"(?:bot|robot|ai|human|person|real|lawyer|attorney|counsel)\b",
    r"\b(?:chatgpt|gpt|gemini|llama|claude|deepseek|copilot|bot|robot|ai"
    r"|tao|human|abogado|lawyer|attorney)\s+(?:po\s+)?ka\s+ba\b",
    r"\bkayo\s+po\s+ba\s+ay\s+(?:ai|bot|robot|abogado|lawyer)\b",
    # C. Legal advice / UPL boundary.
    r"\blegal\s+advice\b",
    r"\blegal\s+guidance\b",
    r"\b(?:payo|advice)\s+ng\s+abogado\b",
)

_IDENTITY_RE = re.compile("|".join(_IDENTITY_PATTERNS), re.IGNORECASE)

# Mga tanong tungkol sa KAHULUGAN ng parirala (hal. "ano ang ibig
# sabihin ng legal advice?") ay HINDI identity question — dapat sagutin
# ng normal na daloy ng chat (RAG/dictionary/LLM), hindi ng canned reply.
_MEANING_QUESTION_RE = re.compile(
    r"(?:ibig\s+sabihin|kahulugan|meaning|define|definition"
    r"|ano\s+ang|anu\s+ang|what\s+is|what\s+are|what\s+does)"
    r"[^?\n]{0,60}?(?:legal\s+advice|legal\s+guidance|payo\s+ng\s+abogado)",
    re.IGNORECASE,
)


def _question_part(message: str) -> str:
    """Ang tanong lang ng user — pagkatapos ng "[CURRENT USER QUESTION]".

    Kapag walang marker, ang buong mensahe ang itinuturing na tanong.
    Hindi kailanman binabasa dito ang laman ng attachment o history.
    """
    return (message or "").rsplit("[CURRENT USER QUESTION]", 1)[-1].strip()


def is_identity_question(message: str) -> bool:
    """Totoo kapag ang tanong ng user ay tungkol sa identity ni Lexie
    o sa legal advice boundary."""
    question = _question_part(message)
    if not question:
        return False
    if _MEANING_QUESTION_RE.search(question):
        return False
    return bool(_IDENTITY_RE.search(question))


def resolve_identity_reply(message: str) -> Optional[str]:
    """Deterministikong sagot sa identity/UPL questions.

    Bumabalik ng LEXIE_IDENTITY_REPLY kapag identity question, o None
    kung dapat ituloy sa normal na daloy ng /chat.
    """
    if is_identity_question(message):
        return LEXIE_IDENTITY_REPLY
    return None