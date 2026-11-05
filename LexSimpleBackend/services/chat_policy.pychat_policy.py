"""Chat policy classifier — Task C2 (Chat Phase).

Rule-based lang: walang LLM call, walang network call, walang print/log
ng laman ng tanong. Ginagamit ng /chat router (Task C3, Batch 2) para
piliin kung anong flow ang isasagot sa tanong.

Order ng tsekrecheck (ayon sa spec):
  greeting -> statute -> document -> glossary -> off_topic -> general
"""

from __future__ import annotations

import re
from typing import Tuple

from services.glossary import find_glossary_entry

# ---------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------

_PUNCT_RE = re.compile(r"[^0-9a-z\s]")


def _normalize(text: str) -> str:
    """Maliit na titik, walang bantas; isang espasyo sa pagitan ng salita."""
    if not text:
        return ""
    cleaned = _PUNCT_RE.sub(" ", text.casefold())
    return re.sub(r"\s+", " ", cleaned).strip()


# ---------------------------------------------------------------
# 1) Greeting: maikling pagbati/pasasalamat, <= 4 na salita.
#    Lahat ng salita ay dapat kabilang sa greeting vocabulary,
#    para hindi madamay ang tunay na tanong na may "hi" sa simula.
# ---------------------------------------------------------------

_GREETING_WORDS = {
    "hi", "hii", "hello", "helo", "elo", "hey", "yo",
    "kumusta", "kamusta", "musta", "muzta",
    "salamat", "salamaat", "thanks", "thank", "you", "much", "maraming",
    "ok", "okay", "okie", "sige",
    "po", "opo", "lang",
    "good", "morning", "afternoon", "evening",
    "umaga", "hapon", "gabi", "lexie", "admin",
}

# ---------------------------------------------------------------
# 2) Statute: tahasang RA/PD/Republic Act + numero, article/section +
#    numero, o pangalan ng batas. Ang "legal", "law", "batas" lang ay
#    HINDI sapat (wala sa mga pattern sa ibaba ang mga salitang iyon).
# ---------------------------------------------------------------

_STATUTE_PATTERNS = [
    re.compile(r"\bra\s*\.?\s*(?:no\.?)?\s*\d{1,5}\b", re.IGNORECASE),
    re.compile(r"\bp\.?\s*d\.?\s*(?:no\.?)?\s*\d{1,5}\b", re.IGNORECASE),
    re.compile(r"\bpd\s*\.?\s*(?:no\.?)?\s*\d{1,5}\b", re.IGNORECASE),
    re.compile(r"\bbatas\s+pambansa\s*(?:blg\.?|bilang)?\s*\d{1,4}\b", re.IGNORECASE),
    re.compile(r"\brepublic\s+act\s*(?:no\.?)?\s*\d{1,5}\b", re.IGNORECASE),
    re.compile(r"\bpresidential\s+decree\s*(?:no\.?)?\s*\d{1,5}\b", re.IGNORECASE),
    re.compile(r"\barticles?\s*\.?\s*(?:no\.?)?\s*\d{1,4}\b", re.IGNORECASE),
    re.compile(r"\bart\.?\s*(?:no\.?)?\s*\d{1,4}\b", re.IGNORECASE),
    re.compile(r"\bsections?\s*\.?\s*(?:no\.?)?\s*\d{1,4}\b", re.IGNORECASE),
    re.compile(r"\bsec\.?\s*(?:no\.?)?\s*\d{1,4}\b", re.IGNORECASE),
]

_STATUTE_NAMES = (
    "civil code", "new civil code", "family code", "rent control act",
    "labor code", "revised penal code", "consumer act", "data privacy act",
    "rules of court", "local government code",
)

# ---------------------------------------------------------------
# 5) Off-topic: halatang walang kinalaman sa legal. Kapag
#    nag-aalinlangan, hindi ito tina-trigger — "general" ang bagsak.
# ---------------------------------------------------------------

_OFF_TOPIC_WORDS = (
    # Pagkain / recipe
    "recipe", "resipe", "luto", "magluto", "pagluluto", "lutuin",
    "adobo", "sinigang", "menudo", "caldereta", "cake", "brownies",
    # Laro
    "laro", "naglalaro", "game", "gaming", "dota", "valorant",
    "basketball", "volleyball", "nba", "pba",
    # Showbiz / balita
    "showbiz", "celebrity", "teleserye", "kdrama", "netflix",
    "balita", "news", "chika",
    # Kanta / movie
    "kanta", "song", "music", "movie", "pelikula", "playlist",
    # Math
    "math", "mathematics", "algebra", "geometry", "trigonometry",
    "calculus", "equation", "multiplication", "division",
    # Programming
    "programming", "programmer", "coding", "python", "javascript",
    "typescript", "html", "css", "react",
)


def _is_greeting(tokens: list) -> bool:
    return bool(tokens) and len(tokens) <= 4 and all(t in _GREETING_WORDS for t in tokens)


def _is_statute(original: str, normalized: str) -> bool:
    for pattern in _STATUTE_PATTERNS:
        if pattern.search(original):
            return True
    return any(name in normalized for name in _STATUTE_NAMES)


def _is_off_topic(normalized: str) -> bool:
    if not normalized:
        return False
    for word in _OFF_TOPIC_WORDS:
        if re.search(r"\b" + re.escape(word) + r"\b", normalized):
            return True
    return False


def classify_question(question: str, has_document: bool) -> Tuple[str, str]:
    """Iuuri ang tanong. Bumabalik na (intent, reason).

    Rule-based lang — walang LLM call. Ang "reason" ay maikling
    fixed na paliwanag (hindi kasama ang laman ng tanong).
    """
    text = (question or "").strip()
    normalized = _normalize(text)
    tokens = normalized.split()

    # 1) Greeting: maikling pagbati o pasasalamat.
    if _is_greeting(tokens):
        return ("greeting", "maikling pagbati o pasasalamat")

    # 2) Statute: may tahasang banggit ng batas/artikulo/section.
    if _is_statute(text, normalized):
        return ("statute", "tahasang nabanggit ang batas, artikulo, o section")

    # 3) Document: may nakalakip na dokumento at hindi statute.
    if has_document:
        return ("document", "may nakalakip na dokumento ang tanong")

    # 4) Glossary: may tumugmang termino (ang term ay galing sa
    #    sarili nating glossary file, hindi laman ng tanong).
    entry = find_glossary_entry(text)
    if entry:
        term = str(entry.get("term", "")).strip()
        if term:
            return ("glossary", f"tugma sa glossary: {term}")
        return ("glossary", "tugma sa glossary")

    # 5) Off-topic: halatang hindi legal ang paksa.
    if _is_off_topic(normalized):
        return ("off_topic", "halatang hindi legal ang paksa")

    # 6) General: lahat ng iba.
    return ("general", "pangkalahatang tanong, walang tiyak na kategorya")