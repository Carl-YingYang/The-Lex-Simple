"""Select approved knowledge and check illustrative examples (v6.3.9).

This module is deliberately independent of FastAPI, Chroma and Groq so that
the source-selection rules can be tested without running those services.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Callable
from urllib.parse import urlparse


NO_SOURCE = (
    "Wala pa akong sapat na impormasyon sa naaprubahang legal database "
    "para masagot iyan nang maayos."
)


@dataclass(frozen=True)
class Source:
    law_id: str
    provision: str
    url: str


@dataclass(frozen=True)
class Evidence:
    context: str
    sources: tuple[Source, ...]
    missing_reply: str = NO_SOURCE


def _reference(message: str) -> tuple[str | None, str | None]:
    law = re.search(
        r"\b(?:RA|R\.?A\.?|Republic Act(?: No\.?)?)\s*(\d{1,6})\b",
        message,
        re.I,
    )
    provision = re.search(
        r"\b(article|art\.?|section|sec\.?)\s+([0-9]+[a-z]?)\b",
        message,
        re.I,
    )

    law_id = f"RA {law.group(1)}" if law else None

    # Users may call RA 386 by its familiar name, "Civil Code".
    # Keep an explicitly stated RA number if both names appear.
    if law_id is None and re.search(
        r"\b(?:the\s+)?civil\s+code\b", message, re.I
    ):
        law_id = "RA 386"

    label = None
    if provision:
        kind = (
            "SECTION"
            if provision.group(1).lower().startswith("sec")
            else "ARTICLE"
        )
        label = f"{kind} {provision.group(2).upper()}"

    return law_id, label


def _official_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return (
        parsed.scheme == "https"
        and not parsed.username
        and not parsed.password
        and (host.endswith(".gov.ph") or host == "gov.ph")
    )


def _exact_source(
    document: str, law_id: str, provision: str
) -> Source | None:
    lines = document.splitlines()
    if len(lines) < 3 or lines[0] != f"SOURCE: {law_id}, {provision}":
        return None
    if (
        not lines[1].startswith("OFFICIAL URL: ")
        or not lines[2].startswith("LEGAL TEXT: ")
    ):
        return None

    url = lines[1].removeprefix("OFFICIAL URL: ").strip()
    return Source(law_id, provision, url) if _official_url(url) else None


def _vector_hits(result: dict) -> list[tuple[str, Source]]:
    documents = (result.get("documents") or [[]])[0]
    metadata = (result.get("metadatas") or [[]])[0]
    hits = []

    for document, meta in zip(documents, metadata):
        if not isinstance(document, str) or not isinstance(meta, dict):
            continue

        source = Source(
            str(meta.get("law_id", "")).strip(),
            str(meta.get("provision", "")).strip(),
            str(meta.get("source_url", "")).strip(),
        )
        if (
            meta.get("verified") is True
            and meta.get("knowledge_file_id")
            and source.law_id
            and source.provision
            and _official_url(source.url)
        ):
            hits.append((document, source))

    return hits


def prepare_chat_evidence(
    message: str,
    query: str,
    exact_lookup: Callable[..., list[str]],
    vector_lookup: Callable[..., dict],
) -> Evidence:
    """Prefer an exact law and provision; never substitute a neighbor."""
    law_id, provision = _reference(message)

    if law_id and provision:
        kind, number = provision.split(" ", 1)
        documents = exact_lookup(kind, number, law_id=law_id, limit=5)
        matching = [
            (doc, _exact_source(doc, law_id, provision))
            for doc in documents
        ]
        verified = [
            (doc, src) for doc, src in matching if src is not None
        ]

        if not verified:
            return Evidence(
                "",
                (),
                f"Wala pa sa naaprubahang database ang "
                f"{law_id}, {provision}.",
            )

        return Evidence(
            "\n---\n".join(doc for doc, _ in verified),
            tuple(dict.fromkeys(src for _, src in verified)),
        )

    hits = _vector_hits(vector_lookup(query, n_results=5))

    if law_id:
        hits = [
            (doc, src)
            for doc, src in hits
            if src.law_id.upper() == law_id
        ]

    if provision:
        hits = [
            (doc, src)
            for doc, src in hits
            if src.provision.upper() == provision
        ]
        if len({src.law_id for _, src in hits}) > 1:
            return Evidence(
                "",
                (),
                f"Aling batas ang tinutukoy mo sa {provision}? "
                "Pakisama ang RA number.",
            )

    hits = hits[:3]
    if not hits:
        return Evidence("", ())

    return Evidence(
        "\n---\n".join(doc for doc, _ in hits),
        tuple(dict.fromkeys(src for _, src in hits)),
    )


def append_verified_sources(
    reply: str, sources: tuple[Source, ...]
) -> str:
    """URLs come from approved DB metadata, never from model output."""
    if not sources or reply.startswith(("Pasensya", "Wala pa", "Hindi ko")):
        return reply

    notes = [
        f"{src.law_id} · {src.provision}: {src.url}"
        for src in sources
    ]
    heading = (
        "Pinagkunang seksiyon"
        if len(notes) == 1
        else "Mga nahanap na sanggunian"
    )
    return (
        reply.rstrip()
        + "\n\n"
        + heading
        + ":\n"
        + "\n".join(notes)
    )


def sources_mentioned_in_reply(
    reply: str, sources: tuple[Source, ...], question: str = ""
) -> tuple[Source, ...]:
    """Only attach a verified source named in the answer or explicitly asked for."""
    requested_law, requested_provision = _reference(question)
    chosen = []
    for source in sources:
        if requested_law and requested_provision:
            if (source.law_id.upper(), source.provision.upper()) == (
                requested_law, requested_provision
            ):
                chosen.append(source)
            continue
        label = re.escape(source.law_id).replace(r"\ ", r"\s*")
        provision = re.escape(source.provision).replace(r"\ ", r"\s*")
        # A general mention of "Civil Code" or "rent" is not an attribution.
        # Require the exact law and provision near each other in the reply.
        if re.search(rf"{label}[^\n]{{0,70}}{provision}", reply, re.I):
            chosen.append(source)
    return tuple(chosen[:2])


def clean_chat_reply(reply: str) -> str:
    """Render plain text in the mobile Text bubble without Markdown debris."""
    reply = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1 (\2)", reply)
    lines = reply.replace("\r", "").split("\n")
    cleaned = []
    for index, raw_line in enumerate(lines):
        line = raw_line.strip().replace("\ufffd", "")
        if not line:
            if cleaned and cleaned[-1]:
                cleaned.append("")
            continue
        if re.match(r"^(?:Mga nahanap na sanggunian|Pinagkunang seksiyon):?$", line, re.I):
            break  # only server-verified sources may appear below the answer
        if re.fullmatch(r"[-*_]{3,}", line):
            continue
        if line.startswith("|") and line.endswith("|"):
            cells = [part.strip() for part in line.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", cell) for cell in cells):
                continue
            next_line = lines[index + 1].strip() if index + 1 < len(lines) else ""
            if next_line.startswith("|") and re.fullmatch(r"[|:\s-]+", next_line):
                continue  # table header
            line = "• " + ": ".join(cells)
        line = re.sub(r"^#{1,6}\s*", "", line)
        line = re.sub(r"^[-*]\s+", "• ", line)
        line = re.sub(r"^>\s*", "", line)
        line = line.replace("**", "").replace("__", "").replace("`", "").replace("~~", "")
        if re.match(r"^(SOURCE|OFFICIAL URL|LEGAL TEXT):", line, re.I):
            continue
        cleaned.append(line)
    while cleaned and (not cleaned[-1] or re.search(r"(?:\s[-–—:]|\b(?:at|o|ng))$", cleaned[-1])):
        cleaned.pop()
    return "\n".join(cleaned).strip()


_PARENTHETICAL_EXAMPLE = re.compile(
    r"\s*\((?:hal\.?|halimbawa|e\.?g\.?|for example)\s*[^()]{1,180}\)",
    re.IGNORECASE,
)
_EXAMPLE_PREFIX = re.compile(
    r"^(?:hal\.?|halimbawa|e\.?g\.?|for example)\s*",
    re.I,
)


def _words(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).casefold()
    normalized = "".join(
        ch for ch in normalized
        if not unicodedata.combining(ch)
    )
    return " ".join(re.findall(r"[a-z0-9]+", normalized))


def remove_unsupported_examples(reply: str, context: str) -> str:
    """Remove parenthetical examples unsupported by the legal text."""
    legal_text = re.sub(
        r"(?m)^(?:SOURCE|OFFICIAL URL):[^\n]*$",
        "",
        context,
    )
    source_words = f" {_words(legal_text)} "

    def keep_or_drop(match: re.Match[str]) -> str:
        original = match.group(0)
        content = _EXAMPLE_PREFIX.sub(
            "", original.strip()[1:-1].strip()
        )
        items = [
            item.strip()
            for item in re.split(
                r",|;|\s+(?:at|and)\s+",
                content,
                flags=re.I,
            )
        ]
        items = [
            item for item in items
            if _words(item) not in {"", "etc", "atbp"}
        ]

        if items and all(
            f" {_words(item)} " in source_words
            for item in items
        ):
            return original
        return ""

    return _PARENTHETICAL_EXAMPLE.sub(keep_or_drop, reply)