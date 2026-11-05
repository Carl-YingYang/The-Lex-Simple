"""Glossary service — Task C1 (Chat Phase).

Pure Python lang: walang FastAPI, Groq, o Chroma import dito.
Pinagmumulan ng mga termino: data/glossary_tl.json (katabi ng backend root,
kaugnay ng lokasyon ng file na ito).

PAALALA: AI-drafted ang mga kahulugan; lahat ng entries ay "reviewed": false.
Dapat suriin muna ng team o abogado bago i-release sa publiko.
"""

from __future__ import annotations

import json
import re
import unicodedata
from difflib import get_close_matches
from pathlib import Path
from typing import Optional

# services/ -> LexSimpleBackend/ -> data/glossary_tl.json
GLOSSARY_PATH = Path(__file__).resolve().parent.parent / "data" / "glossary_tl.json"

_CACHE: Optional[list] = None

# Mga pattern para kunin ang termino mula sa tanong. Tinatakbo ang mga ito
# laban sa normalized (maliit na titik, walang bantas) na tanong.
_TERM_PATTERNS = [
    r"^ano ang ibig sabihin ng (.+)$",
    r"^ano ang kahulugan ng (.+)$",
    r"^ano yung (.+)$",
    r"^ano ang (.+)$",
    r"^ano si (.+)$",
    r"^ibig sabihin ng (.+)$",
    r"^kahulugan ng (.+)$",
    r"^meaning of (.+)$",
    r"^what does (.+) mean$",
    r"^what is (.+)$",
    r"^what are (.+)$",
    r"^define (.+)$",
    r"^explain (.+)$",
]

# Fuzzy matching: difflib ratio >= 0.90, para sa termino na >= 6 na letra.
_MIN_FUZZY_LEN = 6
_FUZZY_CUTOFF = 0.90

# Bare na termino: buong tanong na hindi hihigit sa 4 na salita.
_MAX_BARE_WORDS = 4


def load_glossary() -> list:
    """Binabasa ang JSON glossary (naka-cache). Ligtas kahit walang file."""
    global _CACHE
    if _CACHE is not None:
        return _CACHE
    try:
        with open(GLOSSARY_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        _CACHE = data if isinstance(data, list) else []
    except (OSError, ValueError):
        # Walang file o sirang JSON: gumagana pa rin ang service, walang entries.
        _CACHE = []
    return _CACHE


def _normalize(text: str) -> str:
    """Casefold + tanggalin ang diacritics at bantas; normal na espasyo."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    cleaned = re.sub(r"[^0-9a-z\s]", " ", without_marks.casefold())
    return re.sub(r"\s+", " ", cleaned).strip()


def _extract_candidate(question: str) -> Optional[str]:
    """Kunin ang termino mula sa mga karaniwang pattern ng tanong."""
    normalized = _normalize(question)
    if not normalized:
        return None
    for pattern in _TERM_PATTERNS:
        match = re.match(pattern, normalized)
        if match:
            candidate = match.group(1).strip()
            if candidate:
                return candidate
    # Bare na termino: buong tanong na hindi hihigit sa 4 na salita.
    if len(normalized.split()) <= _MAX_BARE_WORDS:
        return normalized
    return None


def _variants(candidate: str) -> list:
    """Tinatanggap ang plural at -ing na anyo (hal. 'lessees' -> 'lessee')."""
    forms = {candidate}
    if candidate.endswith("ies") and len(candidate) > 4:
        forms.add(candidate[:-3] + "y")
    if candidate.endswith("es") and len(candidate) > 3:
        forms.add(candidate[:-2])
    if candidate.endswith("s") and len(candidate) > 2:
        forms.add(candidate[:-1])
    if candidate.endswith("ing") and len(candidate) > 5:
        forms.add(candidate[:-3])
        forms.add(candidate[:-3] + "e")
    return list(forms)


def _entry_keys(entry: dict) -> list:
    """Lahat ng normalized na pangalan ng entry: term + aliases."""
    names = [entry.get("term", "")] + list(entry.get("aliases") or [])
    keys = [_normalize(name) for name in names]
    return [key for key in keys if key]


def find_glossary_entry(question: str) -> Optional[dict]:
    """Hanapin ang tugmang entry: exact -> word-boundary sa tanong -> fuzzy."""
    entries = load_glossary()
    if not entries:
        return None
    normalized_question = _normalize(question)
    if not normalized_question:
        return None

    keys: list = []
    for entry in entries:
        for key in _entry_keys(entry):
            keys.append((key, entry))

    candidate = _extract_candidate(question)

    # 1) Eksaktong tugma sa term/alias (kasama ang plural/-ing na anyo).
    if candidate:
        for variant in _variants(candidate):
            for key, entry in keys:
                if variant == key:
                    return entry

    # 2) Word-boundary: termino bilang buong salita sa loob ng tanong.
    for key, entry in keys:
        pattern = r"\b" + re.escape(key) + r"(?:s|es|ing)?\b"
        if re.search(pattern, normalized_question):
            return entry

    # 3) Fuzzy: difflib ratio >= 0.90, candidate na >= 6 na letra.
    if candidate and len(candidate) >= _MIN_FUZZY_LEN:
        known = sorted({key for key, _ in keys if len(key) >= _MIN_FUZZY_LEN})
        for variant in _variants(candidate):
            matches = get_close_matches(variant, known, n=1, cutoff=_FUZZY_CUTOFF)
            if matches:
                hit = matches[0]
                for key, entry in keys:
                    if key == hit:
                        return entry
    return None


def format_glossary_reply(entry: dict) -> str:
    """Plain text na sagot (walang Markdown) mula sa glossary entry."""
    term = str(entry.get("term", "")).strip() or "Termino"
    definition = str(entry.get("definition_tl", "")).strip()
    why = str(entry.get("why_it_matters", "")).strip()
    return (
        f"{term}: {definition}\n\n"
        f"Bakit mahalaga: {why}\n\n"
        "Pangkalahatang kahulugan lang ito mula sa Lex-Simple glossary; "
        "hindi ito legal advice."
    )