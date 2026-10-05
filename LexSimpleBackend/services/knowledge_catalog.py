"""Knowledge PDF review and configurable publication scopes (v6.3.16).

PDFs are private audit copies. Only approved, source-labelled provisions are
searchable. Old unverified `documents` rows remain in SQLite but are inactive.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import sqlite3
import uuid
from collections import Counter
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import fitz

from core.config import settings


ROOT = Path(os.getenv("KNOWLEDGE_FILES_DIR", "./knowledge_files"))
MAX_BYTES = 12 * 1024 * 1024
MAX_PAGES = 500
MAX_TEXT = 2_000_000
SECTION = re.compile(
    # A heading ends its number with punctuation or ends the line. A bare
    # reference such as "Article 78 or a rule ..." inside Article 4 is text,
    # not the start of a new article.
    r"(?im)^[ \t]*(?:SECTION|SEC\.?|ARTICLE|ART\.?)\s+(\d+[A-Z]?)(?:[.:-][ \t]*|(?=\n|$))"
)
ARTICLE = re.compile(r"(?m)^[ \t]*(?:ARTICLE|ART\.?)\s+(\d+)(?=[.:-]|[ \t]|$)[.:-]?[ \t]*")
BSP_SECTION = re.compile(r"(?im)^[ \t]*\.?[ \t]*Section[ \t]+([1-7Il])\.[ \t]*")
TRUSTED_HOSTS = (
    "elibrary.judiciary.gov.ph", "officialgazette.gov.ph", "senate.gov.ph",
    "dole.gov.ph", "bsp.gov.ph", "gov.ph",
)
EXCLUSION_TOKEN = re.compile(r"(?i)^(ARTICLE|ART\.?|SECTION|SEC\.?)\s+(\d{1,4})(?:\s*-\s*(\d{1,4}))?$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def validate_source(url: str, law_id: str) -> tuple[str, str]:
    parsed = urlparse(url.strip())
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or not any(
        host == domain or host.endswith("." + domain) for domain in TRUSTED_HOSTS
    ):
        raise ValueError("Gumamit ng HTTPS link mula sa official Philippine government site.")
    normalized = " ".join(law_id.upper().replace(".", " ").split())
    if not re.fullmatch(r"(?:RA|PD) \d{1,6}|BSP CIRCULAR \d{1,6}", normalized):
        raise ValueError("Law ID format: RA 3765, PD 442, o BSP CIRCULAR 1160.")
    return url.strip(), normalized


@lru_cache(maxsize=32)
def _bsp_ocr_page(pdf_path: str, page_index: int) -> str:
    """OCR the printed BSP circular once per page during preview and approval."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError as exc:
        raise ValueError("Kailangan ang pytesseract at Pillow para sa BSP PDF OCR.") from exc
    command = os.getenv("TESSERACT_CMD", "").strip()
    if command:
        pytesseract.pytesseract.tesseract_cmd = command
    with fitz.open(pdf_path) as pdf:
        pix = pdf[page_index].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    try:
        return pytesseract.image_to_string(image, lang="eng", config="--psm 6")
    except pytesseract.TesseractNotFoundError as exc:
        raise ValueError("Hindi makita ang Tesseract. I-set ang TESSERACT_CMD sa backend .env.") from exc


def _page_text(page: fitz.Page, law_id: str) -> str:
    """Use image OCR for BSP 1160; exclude DOLE 2022 Labor Code footnotes."""
    if law_id == "BSP CIRCULAR 1160":
        return _bsp_ocr_page(page.parent.name, page.number)
    if law_id != "PD 442":
        return page.get_text(sort=True)
    separators = [
        drawing["rect"].y0 for drawing in page.get_drawings()
        if 130 <= drawing["rect"].width <= 170
        and drawing["rect"].height <= 2
        and 200 < drawing["rect"].y0 < page.rect.height - 40
    ]
    if not separators:
        return page.get_text(sort=True)
    area = fitz.Rect(0, 0, page.rect.width, min(separators))
    return page.get_text(sort=True, clip=area)


def parse_article_ranges(value: str, law_id: str) -> list[list[int]]:
    """An optional RA 386 filter, e.g. 1156-1430,1642-1688."""
    if not value.strip():
        return []
    if law_id != "RA 386":
        raise ValueError("Article ranges ay para lamang sa RA 386 Civil Code import.")
    tokens = value.split(",")
    if len(tokens) > 10:
        raise ValueError("Hanggang 10 article ranges lamang.")
    ranges = []
    for token in tokens:
        match = re.fullmatch(r"\s*(\d{1,4})\s*-\s*(\d{1,4})\s*", token)
        if not match:
            raise ValueError("Article ranges format: 1156-1430,1642-1688.")
        start, end = map(int, match.groups())
        if not 1 <= start <= end <= 2270 or (ranges and start <= ranges[-1][1]):
            raise ValueError("Ayusin ang article ranges: ascending, walang overlap, at 1–2270.")
        ranges.append([start, end])
    return ranges


def parse_excluded_provisions(value: str) -> list[dict]:
    """Parse reusable ARTICLE/SECTION ranges for inclusion or exclusion."""
    if not value.strip():
        return []
    tokens = value.split(",")
    if len(tokens) > 100:
        raise ValueError("Hanggang 100 exclusion ranges lamang.")
    exclusions = []
    for token in tokens:
        match = EXCLUSION_TOKEN.fullmatch(token.strip())
        if not match:
            raise ValueError("Excluded provisions format: ARTICLE 39, ARTICLE 131-147, SECTION 5.")
        kind = "SECTION" if match.group(1).upper().startswith("SEC") else "ARTICLE"
        start = int(match.group(2))
        end = int(match.group(3) or start)
        if start < 1 or end < start:
            raise ValueError("Ayusin ang excluded provision numbers.")
        item = {"kind": kind, "start": start, "end": end}
        if item in exclusions:
            raise ValueError("May duplicate na excluded provision.")
        exclusions.append(item)
    return exclusions


def _excluded(label: str, exclusions: list[dict]) -> bool:
    match = re.fullmatch(r"(ARTICLE|SECTION) (\d+)", label, re.I)
    return bool(match and any(
        item["kind"] == match.group(1).upper()
        and item["start"] <= int(match.group(2)) <= item["end"]
        for item in exclusions
    ))


def _scope(parts: list[dict], exclusions: list[dict],
           inclusions: list[dict] | None = None) -> tuple[list[dict], list[dict]]:
    inclusions = inclusions or []
    available = {part["label"] for part in parts}
    for item in [*exclusions, *inclusions]:
        for number in range(item["start"], item["end"] + 1):
            if f'{item["kind"]} {number}' not in available:
                raise ValueError(f'Hindi nahanap sa PDF ang {item["kind"]} {number}; ayusin ang scope.')
    included = [part for part in parts if (not inclusions or _excluded(part["label"], inclusions))
                and not _excluded(part["label"], exclusions)]
    excluded = [part for part in parts if part not in included]
    if not included:
        raise ValueError("Walang natirang provision para sa AI matapos ang exclusions.")
    return included, excluded


def _scope_summary(parts: list[dict], exclusions: list[dict],
                   inclusions: list[dict] | None = None) -> dict:
    included, excluded = _scope(parts, exclusions, inclusions)
    return {"chunkCount": len(parts), "activeChunkCount": len(included),
            "excludedChunkCount": len(excluded), "excludedProvisions": exclusions,
            "includedProvisions": inclusions or [],
            "excludedLabels": list(dict.fromkeys(part["label"] for part in excluded))[:50],
            "excludedLabelCount": len(set(part["label"] for part in excluded))}


def ensure_schema() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(settings.DB_PATH) as db:
        db.execute("""CREATE TABLE IF NOT EXISTS knowledge_files (
            id TEXT PRIMARY KEY, law_id TEXT NOT NULL, title TEXT NOT NULL,
            original_filename TEXT NOT NULL, source_url TEXT NOT NULL,
            file_sha256 TEXT NOT NULL, stored_path TEXT NOT NULL,
            total_pages INTEGER NOT NULL, first_page INTEGER NOT NULL,
            last_page INTEGER NOT NULL, excluded_pages TEXT NOT NULL DEFAULT '[]',
            article_ranges TEXT NOT NULL DEFAULT '[]',
            excluded_provisions TEXT NOT NULL DEFAULT '[]',
            included_provisions TEXT NOT NULL DEFAULT '[]',
            activation_mode TEXT NOT NULL DEFAULT 'article_review',
            activation_done INTEGER NOT NULL DEFAULT 0,
            activation_total INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL, created_at TEXT NOT NULL,
            approved_at TEXT, chunk_count INTEGER NOT NULL DEFAULT 0,
            error TEXT
        )""")
        db.execute("""CREATE TABLE IF NOT EXISTS article_reviews (
            knowledge_file_id TEXT NOT NULL,
            article_number INTEGER NOT NULL,
            basis_url TEXT NOT NULL,
            review_note TEXT NOT NULL,
            reviewed_at TEXT NOT NULL,
            PRIMARY KEY (knowledge_file_id, article_number)
        )""")
        file_columns = {row[1] for row in db.execute("PRAGMA table_info(knowledge_files)")}
        if "article_ranges" not in file_columns:
            db.execute("ALTER TABLE knowledge_files ADD COLUMN article_ranges TEXT NOT NULL DEFAULT '[]'")
        if "excluded_provisions" not in file_columns:
            db.execute("ALTER TABLE knowledge_files ADD COLUMN excluded_provisions TEXT NOT NULL DEFAULT '[]'")
        if "included_provisions" not in file_columns:
            db.execute("ALTER TABLE knowledge_files ADD COLUMN included_provisions TEXT NOT NULL DEFAULT '[]'")
        if "activation_mode" not in file_columns:
            db.execute("ALTER TABLE knowledge_files ADD COLUMN activation_mode TEXT NOT NULL DEFAULT 'article_review'")
        if "activation_done" not in file_columns:
            db.execute("ALTER TABLE knowledge_files ADD COLUMN activation_done INTEGER NOT NULL DEFAULT 0")
        if "activation_total" not in file_columns:
            db.execute("ALTER TABLE knowledge_files ADD COLUMN activation_total INTEGER NOT NULL DEFAULT 0")
        columns = {row[1] for row in db.execute("PRAGMA table_info(documents)")}
        if "knowledge_file_id" not in columns:
            backup_path = Path(str(settings.DB_PATH) + ".pre_v6_3_0.bak")
            if not backup_path.exists():
                with sqlite3.connect(str(backup_path)) as backup:
                    db.backup(backup)
        # Legacy records have no traceable official source; quarantine them.
        for name, definition in (
            ("knowledge_file_id", "TEXT"),
            ("provision_label", "TEXT"),
            ("page_number", "INTEGER"),
            ("active", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if name not in columns:
                db.execute(f"ALTER TABLE documents ADD COLUMN {name} {definition}")
        db.execute("CREATE INDEX IF NOT EXISTS idx_documents_knowledge_file ON documents(knowledge_file_id, active)")
        db.execute("CREATE INDEX IF NOT EXISTS idx_knowledge_files_law_status ON knowledge_files(law_id, status)")
        # Quarantine RA 386 rows imported by older versions, which marked
        # every historical article active without an applicability review.
        db.execute("""UPDATE documents SET active=0
                      WHERE active=1 AND knowledge_file_id IN
                        (SELECT id FROM knowledge_files WHERE law_id='RA 386'
                         AND activation_mode!='scope_review')
                        AND NOT EXISTS (
                          SELECT 1 FROM article_reviews r
                          WHERE r.knowledge_file_id=documents.knowledge_file_id
                            AND ('ARTICLE ' || r.article_number)=documents.provision_label
                        )""")
        db.execute("""UPDATE knowledge_files SET status='reference_only'
                      WHERE law_id='RA 386' AND status='active'
                        AND activation_mode!='scope_review'
                        AND NOT EXISTS (
                          SELECT 1 FROM article_reviews r
                          WHERE r.knowledge_file_id=knowledge_files.id
                        )""")


def _clean_line(line: str) -> str:
    line = html.unescape(line).replace("&mdash", "—")
    return line.replace("\u00a0", " ").strip()


def _repeat_key(line: str) -> str:
    return re.sub(r"\d+", "#", " ".join(line.casefold().split()))


def _split_long(label: str, text: str, page: int) -> list[dict]:
    # Word boundaries. Keep each source word once in the reviewed dictionary.
    # The previous overlap repeated the end of Section 6 in the next chunk.
    words = text.split()
    result = []
    start = 0
    while start < len(words):
        end = start
        length = 0
        while end < len(words) and (length + len(words[end]) + 1 <= 2000 or end == start):
            length += len(words[end]) + 1
            end += 1
        result.append({"label": label, "page": page, "text": " ".join(words[start:end])})
        if end == len(words):
            break
        start = end
    return result


def extract_provisions(pdf_path: str, first_page: int, last_page: int,
                       excluded_pages: list[int], law_id: str,
                       article_ranges: list[list[int]] | None = None) -> tuple[int, list[dict], list[str]]:
    article_ranges = article_ranges or []
    if article_ranges and law_id != "RA 386":
        raise ValueError("Article ranges ay para lamang sa RA 386 Civil Code import.")
    with fitz.open(pdf_path) as pdf:
        total = len(pdf)
        if not 1 <= first_page <= last_page <= total or total > MAX_PAGES:
            raise ValueError("Invalid page range o lampas sa 500 pages ang PDF.")
        if any(n < first_page or n > last_page for n in excluded_pages):
            raise ValueError("Ang excluded page ay dapat nasa selected page range.")
        selected = [n for n in range(first_page, last_page + 1) if n not in excluded_pages]
        if not selected:
            raise ValueError("Walang natirang page para sa preview.")
        # Check the original front matter even when the user excludes its cover.
        front = "\n".join(pdf[n].get_text(sort=True) for n in range(min(len(pdf), 10)))
        number = law_id.split()[-1]
        identity = (
            rf"(?:REPUBLIC\s+ACT|R\.?A\.?)\s*(?:NO\.?)?\s*{re.escape(number)}\b"
            if law_id.startswith("RA ") else
            rf"(?:PRESIDENTIAL\s+DECREE|P\.?D\.?)\s*(?:NO\.?)?\s*{re.escape(number)}\b"
            if law_id.startswith("PD ") else
            rf"CIRCULAR\s*(?:NO\.?)?\s*{re.escape(number)}\b"
        )
        if not re.search(identity, front, re.IGNORECASE):
            raise ValueError("Hindi tugma ang law ID sa PDF front matter. I-check ang file.")
        pages = []
        for number in selected:
            lines = [_clean_line(line) for line in _page_text(pdf[number - 1], law_id).splitlines()]
            pages.append((number, [line for line in lines if line]))

    counts = Counter()
    if len(pages) >= 3:
        for _, lines in pages:
            counts.update(set(_repeat_key(x) for x in lines[:2] + lines[-2:]))
    repeated = {key for key, count in counts.items() if count >= 3 and count / len(pages) >= 0.6}
    warnings = []
    if excluded_pages:
        warnings.append("May excluded pages sa gitna ng range; posibleng maputol ang provision.")
    assembled = []
    for number, lines in pages:
        if not lines or sum(len(x) for x in lines) < 70:
            warnings.append(f"Page {number}: kaunti o walang extractable text; tingnan ang PDF image.")
        # A final legal section often shares its page with signatories.
        # Stop at "Approved," after the last section on the last selected page.
        if number == pages[-1][0]:
            pattern = ARTICLE if law_id == "RA 386" else BSP_SECTION if law_id == "BSP CIRCULAR 1160" else SECTION
            last_section = max((i for i, line in enumerate(lines) if pattern.match(line)), default=-1)
            if last_section >= 0 or law_id == "RA 386":
                signing = next((i for i in range(last_section + 1, len(lines))
                                if re.match(r"(?i)^(?:Approved\s*[, :]|FOR THE MONETARY BOARD\s*:)", lines[i])), None)
                if signing is not None:
                    lines = lines[:signing]
        filtered = [line for index, line in enumerate(lines) if not (
            (index < 2 or index >= len(lines) - 2) and _repeat_key(line) in repeated
        ) and not (line.isdigit() and (index < 2 or index >= len(lines) - 2))
            and not re.match(r"(?i)^Source:\s*Supreme Court E-Library\b", line)
            and not re.match(r"(?i)^This page was dynamically generated\b", line)
            and not re.match(r"(?i)^by the E-Library Content Management System\b", line)
            and not (law_id == "BSP CIRCULAR 1160" and re.fullmatch(
                r"(?i)Page\s*[0-9ILT]+\s*of\s*26", line))]
        assembled.append((number, "\n".join(filtered)))

    whole = "\n".join(text for _, text in assembled)
    if len(whole) > MAX_TEXT:
        raise ValueError("Masyadong mahaba ang extracted text.")
    if law_id.startswith("BSP CIRCULAR") and law_id != "BSP CIRCULAR 1160":
        warnings.append("Scanned BSP PDF: i-review nang manu-mano ang bawat extracted section bago i-approve.")
    # Keep page markers for locating the beginning of each provision.
    offsets = []
    joined = ""
    for number, text in assembled:
        offsets.append((len(joined), number))
        joined += text + "\n"
    pattern = ARTICLE if law_id == "RA 386" else BSP_SECTION if law_id == "BSP CIRCULAR 1160" else SECTION
    matches = list(pattern.finditer(joined))
    if not matches:
        raise ValueError("Walang nakitang Article/Section. Palitan ang page range o i-review ang PDF OCR.")
    # The official RA 386 PDF has line-wrapped references that look like article
    # headings, plus two printed number errors. Accept a correction only when
    # the next heading confirms the expected sequence; expose it in the preview.
    numbered = [
        (match, int(match.group(1).replace("I", "1").replace("l", "1"))
         if law_id == "BSP CIRCULAR 1160" else int(match.group(1)))
        for match in matches
    ]
    if law_id == "BSP CIRCULAR 1160" and first_page == 1 and last_page == total and not excluded_pages:
        if [number for _, number in numbered] != list(range(1, 8)):
            raise ValueError("Hindi nabasa nang buo ang Section 1–7 ng BSP Circular 1160. I-review ang scan.")
    if law_id == "RA 386":
        reviewed = []
        expected = numbered[0][1]
        for index, (match, original) in enumerate(numbered):
            following = numbered[index + 1][1] if index + 1 < len(numbered) else None
            if original == expected:
                reviewed.append((match, original))
                expected += 1
            elif following == expected:
                # A citation beginning on a new PDF text line, or a duplicate
                # article heading. It stays inside the preceding article body.
                continue
            elif following == expected + 1:
                page = max((number for offset, number in offsets if offset <= match.start()), default=first_page)
                warnings.append(f"Source numbering note: PDF page {page}, ART. {original} printed where ART. {expected} belongs; corrected in indexed text.")
                reviewed.append((match, expected))
                expected += 1
            else:
                raise ValueError(f"Hindi tuloy-tuloy ang RA 386 article numbering malapit sa ART. {original}. I-review ang PDF.")
        if first_page == 1 and last_page == total and not excluded_pages and (
            reviewed[0][1] != 1 or reviewed[-1][1] != 2270 or len(reviewed) != 2270
        ):
            raise ValueError("Hindi kumpleto ang 1–2270 Civil Code articles sa buong PDF. I-review ang source.")
        matches_with_numbers = reviewed
    else:
        matches_with_numbers = numbered
    if article_ranges:
        seen = {number for _, number in matches_with_numbers}
        missing = [n for start, end in article_ranges for n in range(start, end + 1) if n not in seen]
        if missing:
            show = ", ".join(map(str, missing[:12]))
            raise ValueError(f"Hindi nabasa ang Article {show} sa selected PDF pages; i-check ang page range at PDF text.")
    provisions = []
    for i, (match, effective_number) in enumerate(matches_with_numbers):
        if article_ranges and not any(start <= effective_number <= end
                                      for start, end in article_ranges):
            continue
        end = matches_with_numbers[i + 1][0].start() if i + 1 < len(matches_with_numbers) else len(joined)
        kind = "SECTION" if law_id == "BSP CIRCULAR 1160" or match.group(0).strip().lower().startswith(("sec", "section")) else "ARTICLE"
        label = f"{kind} {effective_number if law_id in ('RA 386', 'BSP CIRCULAR 1160') else match.group(1).upper()}"
        if law_id == "BSP CIRCULAR 1160":
            # Section 1 spans nearly the whole PDF. Preserve its real page on
            # each excerpt instead of attributing every excerpt to page 1.
            for j, (offset, page_number) in enumerate(offsets):
                page_end = offsets[j + 1][0] if j + 1 < len(offsets) else len(joined)
                left, right = max(match.start(), offset), min(end, page_end)
                if left >= right:
                    continue
                fragment = re.sub(r"\s+", " ", joined[left:right]).strip()
                if len(fragment) >= 20:
                    provisions.extend(_split_long(label, fragment, page_number))
            continue
        body = joined[match.start():end].strip()
        if law_id == "RA 386" and effective_number != int(match.group(1)):
            start = match.start(1) - match.start()
            body = body[:start] + str(effective_number) + body[start + len(match.group(1)):]
        if law_id == "RA 386":
            # The Civil Code puts new Title/Chapter/Section headings after the
            # preceding article. They are navigation text, not part of it.
            heading = re.search(r"(?im)^\s*(?:BOOK\s+[IVXLCDM]+\s*$|Title\s+[IVXLCDM]+\s*[.\u2014-]|CHAPTER\s+\d+\s*$|SECTION\s+\d+\s*[.\u2014-])", body)
            if heading:
                body = body[:heading.start()].strip()
        body = re.sub(r"[ \t]+", " ", body)
        body = re.sub(r"(?<!\n)\n(?!\n)", " ", body)
        body = re.sub(r"\s+", " ", body).strip()
        if len(body) < 20:
            warnings.append(f"{label}: maikli ang nakuha; i-check ang PDF.")
            continue
        page = max((number for offset, number in offsets if offset <= match.start()), default=first_page)
        provisions.extend(_split_long(label, body, page))
    return total, provisions, warnings


def _review_messages(warnings: list[str]) -> tuple[list[str], list[str]]:
    notes = [message for message in warnings if message.startswith("Source numbering note:")]
    blocking = [message for message in warnings if not message.startswith("Source numbering note:")]
    return blocking, notes


def _file_row(db: sqlite3.Connection, file_id: str) -> sqlite3.Row:
    row = db.execute("SELECT * FROM knowledge_files WHERE id = ?", (file_id,)).fetchone()
    if not row:
        raise ValueError("Hindi nahanap ang knowledge file.")
    return row


def _matching_draft_id(db: sqlite3.Connection, law_id: str, digest: str,
                       title: str, source_url: str, first_page: int,
                       last_page: int, excluded_pages: list[int],
                       ranges: list[list[int]], exclusions: list[dict]) -> str | None:
    """Find the same unapproved import, including its selected publication scope."""
    rows = db.execute("""SELECT id, stored_path, excluded_pages, article_ranges,
                        excluded_provisions FROM knowledge_files
                        WHERE law_id=? AND file_sha256=? AND title=? AND source_url=?
                        AND first_page=? AND last_page=? AND status='draft'
                        ORDER BY created_at DESC""",
                      (law_id, digest, title, source_url, first_page, last_page)).fetchall()
    for file_id, stored_path, pages_json, ranges_json, exclusions_json in rows:
        if (Path(stored_path).is_file()
                and sorted(json.loads(pages_json)) == sorted(excluded_pages)
                and json.loads(ranges_json) == ranges
                and json.loads(exclusions_json) == exclusions):
            return file_id
    return None


def create_draft(data: bytes, filename: str, title: str, law_id: str,
                 source_url: str, first_page: int, last_page: int | None,
                 excluded_pages: list[int], article_ranges: str = "",
                 excluded_provisions: str = "") -> dict:
    ensure_schema()
    if not data or len(data) > MAX_BYTES or not data.startswith(b"%PDF-"):
        raise ValueError("PDF lang, hanggang 12 MB, ang puwedeng i-upload.")
    source_url, law_id = validate_source(source_url, law_id)
    ranges = parse_article_ranges(article_ranges, law_id)
    exclusions = parse_excluded_provisions(excluded_provisions)
    title = title.strip()
    if not 3 <= len(title) <= 150:
        raise ValueError("Maglagay ng maikling pamagat (3–150 characters).")
    digest = hashlib.sha256(data).hexdigest()
    with fitz.open(stream=data, filetype="pdf") as pdf:
        total_pages = len(pdf)
    end = last_page or total_pages
    with sqlite3.connect(settings.DB_PATH) as db:
        existing = _matching_draft_id(db, law_id, digest, title, source_url,
                                      first_page, end, excluded_pages, ranges, exclusions)
    if existing:
        return {**preview_draft(existing), "selectedPages": [first_page, end],
                "reusedDraft": True}

    file_id = uuid.uuid4().hex
    path = ROOT / f"{file_id}.pdf"
    path.write_bytes(data)
    try:
        total, parts, warnings = extract_provisions(str(path), first_page, end, excluded_pages, law_id, ranges)
        summary = _scope_summary(parts, exclusions)
        duplicate_id = None
        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("BEGIN IMMEDIATE")
            duplicate_id = _matching_draft_id(db, law_id, digest, title, source_url,
                                              first_page, end, excluded_pages, ranges, exclusions)
            if not duplicate_id:
                db.execute("""INSERT INTO knowledge_files
                    (id, law_id, title, original_filename, source_url, file_sha256,
                     stored_path, total_pages, first_page, last_page, excluded_pages, article_ranges,
                     excluded_provisions, status, created_at, chunk_count)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (file_id, law_id, title, os.path.basename(filename), source_url,
                     digest, str(path), total, first_page, end, json.dumps(excluded_pages),
                     json.dumps(ranges), json.dumps(exclusions), "draft", _now(), len(parts)))
        if duplicate_id:
            path.unlink(missing_ok=True)
            return {**preview_draft(duplicate_id), "selectedPages": [first_page, end],
                    "reusedDraft": True}
    except Exception:
        path.unlink(missing_ok=True)
        raise
    warnings, notes = _review_messages(warnings)
    return {"id": file_id, "status": "draft", "totalPages": total,
            "selectedPages": [first_page, end], **summary,
            **({"selectedArticleRanges": ranges} if ranges else {}),
            "warnings": warnings, "sourceCorrections": notes, "sections": parts[:20]}


def list_files() -> list[dict]:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        rows = db.execute("SELECT * FROM knowledge_files ORDER BY created_at DESC").fetchall()
        return [{**{key: row[key] for key in (
            "id", "law_id", "title", "original_filename", "source_url",
            "file_sha256", "total_pages", "first_page", "last_page",
            "status", "created_at", "approved_at", "chunk_count", "error"
        )},
            "activation_done": row["activation_done"],
            "activation_total": row["activation_total"],
            "active_chunk_count": db.execute(
                "SELECT COUNT(*) FROM documents WHERE knowledge_file_id=? AND active=1",
                (row["id"],)).fetchone()[0],
            "excluded_provisions": json.loads(row["excluded_provisions"]),
            "included_provisions": json.loads(row["included_provisions"]),
            "reviewed_article_count": db.execute(
                "SELECT COUNT(*) FROM article_reviews WHERE knowledge_file_id=?", (row["id"],)
            ).fetchone()[0]} for row in rows]


def preview_draft(file_id: str, offset: int = 0, limit: int = 20) -> dict:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = _file_row(db, file_id)
        if row["status"] not in ("draft", "failed"):
            raise ValueError("Draft/failed file lang ang puwedeng i-preview.")
        total, parts, warnings = extract_provisions(
            row["stored_path"], row["first_page"], row["last_page"],
            json.loads(row["excluded_pages"]), row["law_id"],
            json.loads(row["article_ranges"]))
        summary = _scope_summary(parts, json.loads(row["excluded_provisions"]))
        if row["chunk_count"] != len(parts):
            db.execute("UPDATE knowledge_files SET chunk_count=? WHERE id=?",
                       (len(parts), file_id))
        warnings, notes = _review_messages(warnings)
        return {"id": file_id, "status": row["status"], "totalPages": total,
                **summary, "warnings": warnings,
                "sourceCorrections": notes,
                **({"selectedArticleRanges": json.loads(row["article_ranges"])}
                   if json.loads(row["article_ranges"]) else {}),
                "sections": parts[offset:offset + limit]}


def update_draft_pages(file_id: str, first_page: int, last_page: int,
                       excluded_pages: list[int]) -> dict:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = _file_row(db, file_id)
        if row["status"] not in ("draft", "failed"):
            raise ValueError("Draft/failed file lang ang puwedeng baguhin.")
        total, parts, warnings = extract_provisions(row["stored_path"], first_page,
                                                     last_page, excluded_pages, row["law_id"],
                                                     json.loads(row["article_ranges"]))
        summary = _scope_summary(parts, json.loads(row["excluded_provisions"]))
        db.execute("""UPDATE knowledge_files SET first_page=?, last_page=?,
                      excluded_pages=?, chunk_count=?, status='draft', error=NULL
                      WHERE id=?""", (first_page, last_page, json.dumps(excluded_pages), len(parts), file_id))
    warnings, notes = _review_messages(warnings)
    return {"id": file_id, "status": "draft", "totalPages": total,
            "selectedPages": [first_page, last_page], **summary,
            **({"selectedArticleRanges": json.loads(row["article_ranges"])}
               if json.loads(row["article_ranges"]) else {}),
            "warnings": warnings, "sourceCorrections": notes, "sections": parts[:20]}


def update_draft_exclusions(file_id: str, value: str) -> dict:
    """One generic scope editor; reusing it needs no law-specific code changes."""
    ensure_schema()
    exclusions = parse_excluded_provisions(value)
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = _file_row(db, file_id)
        if row["status"] not in ("draft", "failed"):
            raise ValueError("Draft/failed file lang ang puwedeng baguhin dito.")
        _, parts, _ = extract_provisions(row["stored_path"], row["first_page"],
            row["last_page"], json.loads(row["excluded_pages"]), row["law_id"],
            json.loads(row["article_ranges"]))
        _scope(parts, exclusions)
        db.execute("UPDATE knowledge_files SET excluded_provisions=?, status='draft', error=NULL WHERE id=?",
                   (json.dumps(exclusions), file_id))
    return preview_draft(file_id)


def file_details(file_id: str, offset: int = 0, limit: int = 20) -> dict:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = _file_row(db, file_id)
        if row["status"] in ("draft", "failed"):
            return preview_draft(file_id, offset, limit)
        chunks = db.execute("""SELECT provision_label, page_number, chunk_text
                               FROM documents WHERE knowledge_file_id=?
                               ORDER BY id LIMIT ? OFFSET ?""", (file_id, limit, offset)).fetchall()
        return {"id": file_id, "status": row["status"], "lawId": row["law_id"],
                "sourceUrl": row["source_url"], "chunkCount": row["chunk_count"],
                "activationDone": row["activation_done"],
                "activationTotal": row["activation_total"],
                "activeChunkCount": db.execute(
                    "SELECT COUNT(*) FROM documents WHERE knowledge_file_id=? AND active=1",
                    (file_id,)).fetchone()[0],
                "excludedProvisions": json.loads(row["excluded_provisions"]),
                "includedProvisions": json.loads(row["included_provisions"]),
                "reviewedArticleCount": db.execute(
                    "SELECT COUNT(*) FROM article_reviews WHERE knowledge_file_id=?", (file_id,)
                ).fetchone()[0],
                **({"selectedArticleRanges": json.loads(row["article_ranges"])}
                   if json.loads(row["article_ranges"]) else {}),
                "sections": [dict(chunk) for chunk in chunks]}


def discard_draft(file_id: str) -> None:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        row = _file_row(db, file_id)
        if row["status"] not in ("draft", "failed"):
            raise ValueError("Draft/failed file lang ang puwedeng alisin.")
        db.execute("DELETE FROM knowledge_files WHERE id=?", (file_id,))
    Path(row["stored_path"]).unlink(missing_ok=True)


def mark_indexing(file_id: str) -> None:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN IMMEDIATE")
        row = _file_row(db, file_id)
        if row["status"] not in ("draft", "failed"):
            raise ValueError("Na-approve na o kasalukuyang ini-index ang file.")
        busy = db.execute("SELECT 1 FROM knowledge_files WHERE law_id=? AND status='indexing' AND id<>?",
                          (row["law_id"], file_id)).fetchone()
        if busy:
            raise ValueError("May kasalukuyang ini-index na version ng batas na ito.")
        _, parts, warnings = extract_provisions(
            row["stored_path"], row["first_page"], row["last_page"],
            json.loads(row["excluded_pages"]), row["law_id"],
            json.loads(row["article_ranges"]))
        _scope(parts, json.loads(row["excluded_provisions"]))
        warnings, _ = _review_messages(warnings)
        if warnings:
            raise ValueError("May extraction warnings. I-review ang preview at pumili ng malinis na pages bago mag-approve: " + warnings[0])
        db.execute("UPDATE knowledge_files SET status='indexing', error=NULL WHERE id=?", (file_id,))


def recover_interrupted_indexes() -> None:
    """Call only at server startup, before accepting requests."""
    with sqlite3.connect(settings.DB_PATH) as db:
        db.execute("""UPDATE knowledge_files SET status='failed',
                      error='Server stopped during indexing; retry approval.'
                      WHERE status='indexing'""")
        db.execute("""UPDATE knowledge_files SET status=CASE WHEN EXISTS (
                        SELECT 1 FROM documents d WHERE d.knowledge_file_id=knowledge_files.id
                        AND d.active=1) THEN 'active' ELSE 'reference_only' END,
                      error='Server stopped during activation; retry after checking the scope.'
                      WHERE status='activation_indexing'""")


def index_draft(file_id: str) -> None:
    """Background worker. Keep old active rows until ALL new vectors exist."""
    from db.chroma_store import add_to_vector_db, collection

    ensure_schema()
    created_ids = []
    try:
        with sqlite3.connect(settings.DB_PATH) as db:
            db.row_factory = sqlite3.Row
            row = _file_row(db, file_id)
            if row["status"] != "indexing":
                raise ValueError("File is not in indexing state.")
            blob = Path(row["stored_path"]).read_bytes()
            if hashlib.sha256(blob).hexdigest() != row["file_sha256"]:
                raise ValueError("Nagbago ang PDF mula noong preview. I-upload ulit.")
            _, parts, warnings = extract_provisions(
                row["stored_path"], row["first_page"], row["last_page"],
                json.loads(row["excluded_pages"]), row["law_id"],
                json.loads(row["article_ranges"]))
            warnings, _ = _review_messages(warnings)
            if warnings:
                raise ValueError("May extraction warning; ayusin muna ang PDF/page range: " + warnings[0])
            if not parts:
                raise ValueError("Walang ma-index na provision.")
            included, excluded = _scope(parts, json.loads(row["excluded_provisions"]))
            current = db.execute("SELECT id FROM knowledge_files WHERE law_id=? AND status='active'", (row["law_id"],)).fetchall()
            metadata = dict(row)

        for part in included:
            document = f"[{part['label']}] {part['text']}"
            vec_text = f"{metadata['law_id']} {part['label']}\n{part['text']}"
            vector_id = add_to_vector_db(vec_text, {
                "source": metadata["title"], "law_id": metadata["law_id"],
                "source_url": metadata["source_url"], "provision": part["label"],
                "knowledge_file_id": file_id, "verified": True,
            })
            created_ids.append((vector_id, document, part))

        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("BEGIN IMMEDIATE")
            for vector_id, document, part in created_ids:
                db.execute("""INSERT INTO documents
                    (filename, chunk_id, chunk_text, knowledge_file_id, provision_label, page_number, active)
                    VALUES (?,?,?,?,?,?,1)""", (
                        metadata["title"], vector_id, document, file_id, part["label"], part["page"]
                    ))
            for part in excluded:
                db.execute("""INSERT INTO documents
                    (filename, chunk_id, chunk_text, knowledge_file_id, provision_label, page_number, active)
                    VALUES (?,?,?,?,?,?,0)""", (
                        metadata["title"], "pending-" + uuid.uuid4().hex,
                        f"[{part['label']}] {part['text']}", file_id, part["label"], part["page"]
                    ))
            for old in current:
                db.execute("UPDATE documents SET active=0 WHERE knowledge_file_id=?", (old[0],))
                db.execute("UPDATE knowledge_files SET status='superseded' WHERE id=?", (old[0],))
            db.execute("""UPDATE knowledge_files SET status='active', activation_mode='scope_review',
                          approved_at=?, chunk_count=? WHERE id=?""",
                       (_now(), len(parts), file_id))
            db.commit()
    except Exception as exc:
        if created_ids:
            try:
                collection.delete(ids=[item[0] for item in created_ids])
            except Exception:
                pass  # Orphan vectors remain hidden by SQLite's active filter.
        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("UPDATE knowledge_files SET status='failed', error=? WHERE id=?",
                       (str(exc)[:400], file_id))
        raise


def activation_preview(file_id: str, excluded_provisions: str,
                       included_provisions: str = "") -> dict:
    """Show the complete scope before activating an already approved file."""
    ensure_schema()
    exclusions = parse_excluded_provisions(excluded_provisions)
    inclusions = parse_excluded_provisions(included_provisions)
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        file = _file_row(db, file_id)
        if file["status"] not in ("reference_only", "active"):
            raise ValueError("Approved reference_only/active file lang ang puwedeng i-activate.")
        rows = db.execute("""SELECT provision_label AS label, active FROM documents
                             WHERE knowledge_file_id=? ORDER BY id""", (file_id,)).fetchall()
        if len(rows) != file["chunk_count"] or not rows:
            raise ValueError("Hindi tugma ang saved chunks; i-review muna ang file bago i-activate.")
        parts = [dict(row) for row in rows]
        summary = _scope_summary(parts, exclusions, inclusions)
        return {"id": file_id, "status": file["status"], "lawId": file["law_id"],
                "currentlyActiveChunks": sum(row["active"] for row in rows),
                "note": "Source/OCR approval does not establish present legal applicability; check later amendments.",
                **summary}


def mark_activation(file_id: str, excluded_provisions: str,
                    confirmed_scope: bool, included_provisions: str = "") -> dict:
    """Lock a reviewed scope; background work starts after this call returns."""
    if not confirmed_scope:
        raise ValueError("I-confirm muna ang selected scope at exclusions sa preview.")
    preview = activation_preview(file_id, excluded_provisions, included_provisions)
    exclusions = parse_excluded_provisions(excluded_provisions)
    inclusions = parse_excluded_provisions(included_provisions)
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN IMMEDIATE")
        row = _file_row(db, file_id)
        if row["status"] not in ("reference_only", "active"):
            raise ValueError("May activation na kasalukuyang tumatakbo.")
        db.execute("""UPDATE knowledge_files SET status='activation_indexing',
                      excluded_provisions=?, included_provisions=?, activation_done=0,
                      activation_total=?, error=NULL WHERE id=?""",
                   (json.dumps(exclusions), json.dumps(inclusions), preview["activeChunkCount"], file_id))
    return {"id": file_id, "status": "activation_indexing", **{
        key: preview[key] for key in ("chunkCount", "activeChunkCount", "excludedChunkCount")}}


def activate_approved_file(file_id: str) -> None:
    """Stage missing vectors first, then publish all selected rows atomically."""
    from db.chroma_store import add_to_vector_db

    created: list[str] = []
    try:
        ensure_schema()
        with sqlite3.connect(settings.DB_PATH) as db:
            db.row_factory = sqlite3.Row
            file = _file_row(db, file_id)
            if file["status"] != "activation_indexing":
                raise ValueError("File is not awaiting activation.")
            blob = Path(file["stored_path"]).read_bytes()
            if hashlib.sha256(blob).hexdigest() != file["file_sha256"]:
                raise ValueError("Nagbago ang PDF mula noong approval; i-upload ulit.")
            exclusions = json.loads(file["excluded_provisions"])
            inclusions = json.loads(file["included_provisions"])
            rows = db.execute("""SELECT id, chunk_id, chunk_text, provision_label,
                                       active FROM documents WHERE knowledge_file_id=? ORDER BY id""",
                              (file_id,)).fetchall()
            included, _ = _scope([{"label": row["provision_label"], "id": row["id"]}
                                  for row in rows], exclusions, inclusions)
            selected_ids = {part["id"] for part in included}
            if len(rows) != file["chunk_count"]:
                raise ValueError("Hindi tugma ang saved chunks; hindi nagbago ang active data.")
            metadata = dict(file)

        for number, row in enumerate(rows, 1):
            if row["id"] not in selected_ids or not str(row["chunk_id"]).startswith("pending-"):
                continue
            label = row["provision_label"]
            vector_id = add_to_vector_db(f"{metadata['law_id']} {label}\n{row['chunk_text']}", {
                "source": metadata["title"], "law_id": metadata["law_id"],
                "source_url": metadata["source_url"], "provision": label,
                "knowledge_file_id": file_id, "verified": True,
            })
            created.append(vector_id)
            # Store only staged IDs. Their SQLite rows remain inactive until
            # the final transaction, including after a server restart.
            with sqlite3.connect(settings.DB_PATH) as db:
                db.execute("UPDATE documents SET chunk_id=? WHERE id=? AND active=0",
                           (vector_id, row["id"]))
                if number % 25 == 0:
                    db.execute("UPDATE knowledge_files SET activation_done=? WHERE id=?",
                               (number, file_id))

        with sqlite3.connect(settings.DB_PATH) as db:
            db.row_factory = sqlite3.Row
            db.execute("BEGIN IMMEDIATE")
            if _file_row(db, file_id)["status"] != "activation_indexing":
                raise ValueError("Nagbago ang status habang ini-index ang file.")
            db.execute("UPDATE documents SET active=0 WHERE knowledge_file_id=?", (file_id,))
            db.executemany("UPDATE documents SET active=1 WHERE id=?",
                           [(part["id"],) for part in included])
            db.execute("""UPDATE knowledge_files SET status='active', activation_mode='scope_review',
                          activation_done=?, activation_total=?, error=NULL WHERE id=?""",
                       (len(included), len(included), file_id))
    except Exception as exc:
        # A failed activation does not publish staged chunks. Existing reviewed
        # chunks remain active and become searchable again after status reset.
        with sqlite3.connect(settings.DB_PATH) as db:
            db.execute("""UPDATE knowledge_files SET status=CASE WHEN EXISTS (
                            SELECT 1 FROM documents d WHERE d.knowledge_file_id=knowledge_files.id
                            AND d.active=1) THEN 'active' ELSE 'reference_only' END,
                          error=? WHERE id=?""", (str(exc)[:400], file_id))
        raise


def disable_file(file_id: str) -> None:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN IMMEDIATE")
        row = _file_row(db, file_id)
        if row["status"] not in ("active", "reference_only"):
            raise ValueError("Active o reference_only file lang ang puwedeng i-disable.")
        db.execute("UPDATE documents SET active=0 WHERE knowledge_file_id=?", (file_id,))
        db.execute("UPDATE knowledge_files SET status='disabled' WHERE id=?", (file_id,))


def review_civil_code_article(file_id: str, article_number: int,
                              basis_url: str, review_note: str,
                              checked_later_laws: bool) -> dict:
    """A human-reviewed article becomes searchable; other articles stay blocked.

    The checkbox and government URL document the editor's review. The server
    cannot decide whether a legal provision is currently applicable.
    """
    from db.chroma_store import add_to_vector_db, collection

    ensure_schema()
    if not checked_later_laws:
        raise ValueError("I-check muna ang mas bagong batas bago gamitin ang Article sa AI.")
    if not 1 <= article_number <= 2270:
        raise ValueError("Civil Code Article number must be 1–2270.")
    basis_url, _ = validate_source(basis_url, "RA 386")
    review_note = " ".join(review_note.split())
    if not 20 <= len(review_note) <= 1000:
        raise ValueError("Ilagay ang review note at dahilan (20–1000 characters).")
    label = f"ARTICLE {article_number}"
    vector_ids = []
    try:
        with sqlite3.connect(settings.DB_PATH) as db:
            db.row_factory = sqlite3.Row
            db.execute("BEGIN IMMEDIATE")
            file = _file_row(db, file_id)
            if file["law_id"] != "RA 386" or file["status"] not in ("reference_only", "active"):
                raise ValueError("RA 386 reference_only/active file lang ang puwedeng i-review.")
            if file["activation_mode"] == "scope_review":
                raise ValueError("Gamitin ang activation-preview at activate para baguhin ang scope ng file.")
            if basis_url == file["source_url"]:
                raise ValueError("Magbigay ng hiwalay na official URL na ginamit sa pagsuri ng mas bagong batas.")
            rows = db.execute("""SELECT id, chunk_id, chunk_text, active FROM documents
                                 WHERE knowledge_file_id=? AND provision_label=?
                                 ORDER BY id""", (file_id, label)).fetchall()
            if not rows:
                raise ValueError("Hindi nahanap ang Article sa indexed PDF.")
            if any(not str(item["chunk_id"]).startswith("pending-") for item in rows):
                if not all(item["active"] for item in rows):
                    raise ValueError("Old RA 386 import ito. Gumawa ng bagong draft gamit ang v6.3.8 bago mag-review.")
            if any(item["active"] for item in rows):
                raise ValueError("Reviewed na ang Article na ito. I-disable muna kung may kailangang itama.")
            for item in rows:
                text = item["chunk_text"]
                vector_id = add_to_vector_db(f"RA 386 {label}\n{text}", {
                    "source": file["title"], "law_id": "RA 386",
                    "source_url": file["source_url"], "provision": label,
                    "knowledge_file_id": file_id, "verified": True,
                })
                vector_ids.append(vector_id)
                db.execute("UPDATE documents SET chunk_id=?, active=1 WHERE id=?",
                           (vector_id, item["id"]))
            db.execute("""INSERT INTO article_reviews
                          (knowledge_file_id, article_number, basis_url, review_note, reviewed_at)
                          VALUES (?,?,?,?,?)""",
                       (file_id, article_number, basis_url, review_note, _now()))
            db.execute("UPDATE knowledge_files SET status='active' WHERE id=?", (file_id,))
    except Exception:
        if vector_ids:
            try:
                collection.delete(ids=vector_ids)
            except Exception:
                pass
        raise
    return {"id": file_id, "article": label, "status": "reviewed_for_ai",
            "activeChunks": len(vector_ids), "reviewBasisUrl": basis_url}


def list_civil_code_reviews(file_id: str) -> list[dict]:
    ensure_schema()
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        file = _file_row(db, file_id)
        if file["law_id"] != "RA 386":
            raise ValueError("Para lamang sa RA 386 ang Article reviews.")
        return [dict(row) for row in db.execute("""SELECT article_number, basis_url,
                    review_note, reviewed_at FROM article_reviews
                    WHERE knowledge_file_id=? ORDER BY article_number""", (file_id,))]


def revoke_civil_code_article(file_id: str, article_number: int) -> dict:
    from db.chroma_store import collection

    ensure_schema()
    label = f"ARTICLE {article_number}"
    with sqlite3.connect(settings.DB_PATH) as db:
        db.row_factory = sqlite3.Row
        db.execute("BEGIN IMMEDIATE")
        file = _file_row(db, file_id)
        if file["law_id"] != "RA 386" or file["status"] != "active":
            raise ValueError("Walang active RA 386 review sa file na ito.")
        if file["activation_mode"] == "scope_review":
            raise ValueError("Gamitin ang activation-preview at activate para baguhin ang scope ng file.")
        prior = db.execute("""SELECT 1 FROM article_reviews WHERE knowledge_file_id=?
                              AND article_number=?""", (file_id, article_number)).fetchone()
        if not prior:
            raise ValueError("Hindi pa reviewed ang Article na ito.")
        ids = [row[0] for row in db.execute("""SELECT chunk_id FROM documents
                      WHERE knowledge_file_id=? AND provision_label=? AND active=1""",
                      (file_id, label))]
        db.execute("""UPDATE documents SET active=0, chunk_id='pending-' || lower(hex(randomblob(16)))
                      WHERE knowledge_file_id=? AND provision_label=?""", (file_id, label))
        db.execute("DELETE FROM article_reviews WHERE knowledge_file_id=? AND article_number=?",
                   (file_id, article_number))
        remaining = db.execute("SELECT 1 FROM article_reviews WHERE knowledge_file_id=? LIMIT 1",
                               (file_id,)).fetchone()
        if not remaining:
            db.execute("UPDATE knowledge_files SET status='reference_only' WHERE id=?", (file_id,))
    try:
        if ids:
            collection.delete(ids=ids)
    except Exception:
        pass  # SQLite active=0 already blocks retrieval.
    return {"id": file_id, "article": label, "status": "reference_only",
            "removedChunks": len(ids)}


def find_verified_reference_context(kind: str, number: str,
                                    law_id: str | None = None, limit: int = 5) -> list[str]:
    """Find a provision by its own label, never by an incidental body match."""
    ensure_schema()
    label = f"{kind.upper()} {number.upper()}"
    sql = """SELECT d.chunk_text, k.law_id, k.source_url
             FROM documents d JOIN knowledge_files k ON d.knowledge_file_id=k.id
             WHERE d.active=1 AND k.status='active' AND d.provision_label=?"""
    params = [label]
    if law_id:
        sql += " AND k.law_id=?"
        params.append(law_id.upper())
    sql += " ORDER BY k.approved_at DESC LIMIT ?"
    params.append(limit)
    with sqlite3.connect(settings.DB_PATH) as db:
        rows = db.execute(sql, params).fetchall()
    return [f"SOURCE: {source}, {label}\nOFFICIAL URL: {url}\nLEGAL TEXT: {text}"
            for text, source, url in rows]
