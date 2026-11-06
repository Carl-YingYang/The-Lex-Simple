"""Task CH2: deterministic na mga sagot tungkol sa score sa /chat.

Dalawang deterministic na landas, walang LLM call:

1. May nakalakip na DOCUMENT ANALYSIS na may linyang "Score: N/100" at ang
   tanong ay tungkol sa score -> buod mula sa attachment mismo (score,
   risk label, at mga pamagat ng findings).
2. "Walang score" na sitwasyon (attachment na may linyang nagsisimula sa
   "Score: Hindi ibinigay", o malinaw na tanong tungkol sa nawawalang
   score) -> direktang pagbabalik ng "SCORE STATUS REASON".

Ang direktang "SCORE STATUS REASON" ay para LANG sa "walang score" na
sitwasyon — hindi ito dapat tumama sa "bakit ganito ang score" kapag may
score na ang attachment. Ang mga functions dito ay sadyang walang mabigat
na dependency upang madaling ma-test nang hiwalay sa router at para walang
tunay na LLM call sa mga test.
"""
import re
from typing import Any, Dict, List, Optional

# ============================================================
# MGA PATTERN NG TANONG
# ============================================================

# Direktang banggit ng score at ng mga kapareho nito sa app.
_SCORE_WORD_PATTERN = re.compile(
    r"\bscores?\b|\bpuntos?\b|\bratings?\b|\brisk\s*level\b",
    re.IGNORECASE,
)

# Mga pariralang tumutukoy sa resulta (hal. "paano nakuha ang 22?",
# "ano ibig sabihin ng 22?"). Kailangan pa ng bilang na tugma sa score ng
# attachment upang hindi mahigop ang ibang numero (hal. "ano ibig sabihin
# ng penalty na 8%?" ay hindi tanong tungkol sa score).
_SCORE_PHRASE_PATTERN = re.compile(
    r"bakit\s+ganito|paano\s+nakuha|ano\s+(?:ang\s+)?ibig\s+sabihin\s+ng",
    re.IGNORECASE,
)
_SCORE_RESULT_NUMBER_PATTERN = re.compile(
    r"(?<![\d.,])(\d{1,3})(?:\s*/\s*100|\s+sa\s+100)?"
    r"(?!\s*%)(?!\s*\d)(?![,\d])",
    re.IGNORECASE,
)

# Tanong na malinaw na tungkol sa NAWAWALANG score.
_MISSING_SCORE_QUESTION_PATTERN = re.compile(
    r"(?:walang|wala(?:\s+bang)?|no)\s+(?:na\s+)?(?:scores?|puntos?|ratings?)\b"
    r"|(?:scores?|puntos?|ratings?)\b[^.\n]{0,30}?"
    r"(?:walang|wala|hindi\s+ibinigay|missing|not\s+given)"
    r"|hindi\s+(?:ma)?ibinigay(?:\s+ang)?\s+(?:scores?|puntos?|ratings?)\b"
    r"|why\s+(?:is\s+there\s+)?no\s+score",
    re.IGNORECASE,
)

# ============================================================
# MGA PATTERN NG ATTACHMENT
# (Tingnan ang ResultScreen.tsx sa mobile: "DOCUMENT ANALYSIS",
# "Score: N/100", "SCORE STATUS REASON: ...", "Risk: ...", "FINDINGS",
# at mga entry na "<numero>. <pamagat>" na sinusundan ng "Paliwanag:")
# ============================================================

_ATTACHMENT_CURRENT_PATTERN = re.compile(
    r"\[ATTACHED DOCUMENT CONTEXT:[^\]]*\]\s*\n"
    r"(.*?)(?=\n\[CURRENT USER QUESTION\]|\Z)",
    re.DOTALL,
)
_ATTACHMENT_HISTORY_PATTERN = re.compile(
    r"\[PREVIOUSLY ATTACHED DOCUMENT:[^\]]*\]\s*\n"
    r"(.*?)(?=\n\nUSER MESSAGE:\n|\Z)",
    re.DOTALL,
)
_SCORE_LINE_PATTERN = re.compile(r"(?m)^Score:\s*(\d{1,3})\s*/\s*100\b")
_NO_SCORE_LINE_PATTERN = re.compile(r"(?m)^Score:\s*Hindi\s+ibinigay\b")
_RISK_LINE_PATTERN = re.compile(r"(?m)^Risk:\s*(.+?)\s*$")
_FINDINGS_SECTION_PATTERN = re.compile(
    r"(?ms)^FINDINGS\s*$\n(.*?)"
    r"(?=^(?:MAHAHALAGANG DETALYE|BAHAGI NG SANITIZED DOCUMENT TEXT)\b|\Z)",
)
_FINDING_TITLE_PATTERN = re.compile(r"^(\d{1,2})\.\s+(.+?)\s*$")
_SCORE_STATUS_REASON_PATTERN = re.compile(
    r"(?m)^SCORE STATUS REASON:\s*([^\n]+)"
)

# Hanggang 6 na pamagat ng finding ang nakalista sa deterministic na sagot.
MAX_LISTED_FINDINGS = 6

_FALLBACK_NO_REASON_REPLY = (
    "Hindi ko makita ang dahilan sa kasalukuyang chat. Buksan ang Resulta "
    "at i-tap ang \u2018Bakit walang score?\u2019 para makita ang status ng scan."
)


# ============================================================
# PAGKLASIPYKA NG TANONG
# ============================================================

def is_score_related_question(
    question: str,
    expected_score: Optional[int] = None,
) -> bool:
    """Totoo kapag ang tanong ay tungkol sa score.

    Direct na tugma: "score", "puntos", "rating", o "risk level" ang
    nabanggit. Ang mga parirala tulad ng "paano nakuha ang ...?" ay
    bibilangin lang kapag may bilang na tugma sa score ng attachment
    (expected_score), para hindi mahigop ang ibang numero sa tanong.
    """
    if not question:
        return False

    if _SCORE_WORD_PATTERN.search(question):
        return True

    phrase_match = _SCORE_PHRASE_PATTERN.search(question)
    if not phrase_match or expected_score is None:
        return False

    for number_match in _SCORE_RESULT_NUMBER_PATTERN.finditer(question):
        if int(number_match.group(1)) == expected_score:
            return True

    return False


def is_missing_score_question(question: str) -> bool:
    """Totoo kapag malinaw na tungkol sa NAWAWALANG score ang tanong."""
    if not question:
        return False
    return bool(_MISSING_SCORE_QUESTION_PATTERN.search(question))


# ============================================================
# PAG-PARSE NG ATTACHMENT
# ============================================================

def extract_attached_document(
    message: str,
    history: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Ibalik ang text ng pinakabagong attachment (DOCUMENT ANALYSIS block).

    Kasalukuyang mensahe muna, tapos ang pinakahuling attachment sa
    history ("[PREVIOUSLY ATTACHED DOCUMENT: ...]"). Walang attachment,
    walang lumanab na text.
    """
    current_match = _ATTACHMENT_CURRENT_PATTERN.search(message or "")
    if current_match:
        return current_match.group(1).strip()

    for item in reversed(history or []):
        if not isinstance(item, dict):
            continue
        content = item.get("content", "")
        if not isinstance(content, str):
            continue
        if "[PREVIOUSLY ATTACHED DOCUMENT:" not in content:
            continue
        history_match = _ATTACHMENT_HISTORY_PATTERN.search(content)
        if history_match:
            return history_match.group(1).strip()

    return ""


def parse_attachment_score(attachment_text: str) -> Optional[int]:
    """Kunin ang N mula sa linyang "Score: N/100" ng attachment."""
    match = _SCORE_LINE_PATTERN.search(attachment_text or "")
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def attachment_says_score_missing(attachment_text: str) -> bool:
    """Totoo kapag may linyang nagsisimula sa "Score: Hindi ibinigay"."""
    return bool(_NO_SCORE_LINE_PATTERN.search(attachment_text or ""))


def extract_risk_label(attachment_text: str) -> str:
    """Kunin ang label mula sa linyang "Risk: ..." ng attachment."""
    match = _RISK_LINE_PATTERN.search(attachment_text or "")
    if not match:
        return ""
    return match.group(1).strip()


def _extract_findings_section(attachment_text: str) -> str:
    """Ang bahagi mula sa linyang "FINDINGS" hanggang sa susunod na section
    header (hal. "MAHAHALAGANG DETALYE" o "BAHAGI NG SANITIZED DOCUMENT
    TEXT"). Kung walang "FINDINGS" na header, ang buong attachment."""
    match = _FINDINGS_SECTION_PATTERN.search(attachment_text or "")
    if match:
        return match.group(1)
    return attachment_text or ""


def extract_finding_titles(attachment_text: str) -> List[str]:
    """Mga pamagat ng finding mula sa attachment.

    Isang linya ang itinuturing na pamagat ng finding kapag nagsisimula ito
    sa "<numero>. <pamagat>" at SUNOD-SUNOD na may linyang nagsisimula sa
    "Paliwanag:" — para hindi mapagkamalang finding ang mga numbered na
    linya sa loob ng "Nakitang text:".
    """
    titles: List[str] = []
    lines = _extract_findings_section(attachment_text).split("\n")

    for index in range(len(lines) - 1):
        title_match = _FINDING_TITLE_PATTERN.match(lines[index].strip())
        if not title_match:
            continue
        next_line = lines[index + 1].strip()
        if not next_line.startswith("Paliwanag:"):
            continue
        title = title_match.group(2).strip()
        if title:
            titles.append(title)

    return titles


# ============================================================
# DETERMINISTIC NA MGA SAGOT
# ============================================================

def build_score_summary_reply(attachment_text: str) -> str:
    """Buuin ang deterministic na sagot mula sa attachment na may score.

    Template (Taglish), ang mga pamagat ay nasa sariling linya. Kung hindi
    ma-parse ang findings, gamitin ang template nang walang listahan.
    Huwag mag-imbento ng paraan ng pagkuha ng score.
    """
    score = parse_attachment_score(attachment_text)
    if score is None:
        # Dapat ay hindi dito dumadaan kapag walang score (may hiwalay na
        # landas para doon). Huwag mag-imbento ng numero.
        return ""

    risk = extract_risk_label(attachment_text)
    risk_part = f" ({risk})" if risk else ""

    intro = (
        f"Ang score mo ay {score}/100{risk_part}. Nagsisimula ang score sa "
        "100 at binabawasan ayon sa dami at bigat ng mga clause na nakitang "
        "posibleng mapanganib."
    )
    ending = (
        "Para makita ang bawas ng bawat clause, buksan ang Resulta at i-tap "
        "ang 'Paano nakuha ang score?'. Tantiya lang ito at hindi legal na "
        "hatol o patunay na ligtas o hindi ligtas ang dokumento."
    )

    titles = extract_finding_titles(attachment_text)
    if not titles:
        return f"{intro} {ending}"

    count_word = "finding" if len(titles) == 1 else "findings"
    count_line = (
        f"May {len(titles)} {count_word} sa dokumentong ito:"
    )
    numbered = "\n".join(
        f"{index}. {title}"
        for index, title in enumerate(
            titles[:MAX_LISTED_FINDINGS], start=1,
        )
    )
    return f"{intro} {count_line}\n{numbered}\n{ending}"


def resolve_score_reply(
    message: str,
    history: Optional[List[Dict[str, Any]]] = None,
) -> Optional[str]:
    """Deterministic na sagot sa mga tanong tungkol sa score sa /chat.

    Bumabalik ng str kapag may tamang deterministic na sagot (walang LLM
    call), o None kung dapat ituloy sa normal na daloy ng chat.
    """
    message = message or ""
    question = message.rsplit("[CURRENT USER QUESTION]", 1)[-1].strip()
    if not question:
        return None

    attachment_text = extract_attached_document(message, history)
    score = parse_attachment_score(attachment_text)
    missing_score_asked = is_missing_score_question(question)

    # 1) May tunay na score ("Score: N/100") ang attachment at hindi
    #    tungkol sa nawawalang score ang tanong: deterministic na buod
    #    mula sa attachment.
    if (
        score is not None
        and not missing_score_asked
        and is_score_related_question(question, score)
    ):
        return build_score_summary_reply(attachment_text)

    # 2) "Walang score" na sitwasyon LANG ang direktang nagbabalik ng
    #    "SCORE STATUS REASON": attachment na may "Score: Hindi ibinigay",
    #    o malinaw na tanong tungkol sa nawawalang score. Hindi ito
    #    dapat tumama sa "bakit ganito ang score" kapag may score na.
    if score is None and (
        attachment_says_score_missing(attachment_text) or missing_score_asked
    ) and is_score_related_question(question):
        score_context = "\n".join(
            [message]
            + [
                item.get("content", "")
                for item in reversed(history or [])
                if isinstance(item, dict)
            ]
        )
        reason_match = _SCORE_STATUS_REASON_PATTERN.search(score_context)
        if reason_match:
            return reason_match.group(1).strip()
        return _FALLBACK_NO_REASON_REPLY

    # May score ang attachment pero nawawalang score ang tanong, o hindi
    # kaya maparse ang attachment: ituloy sa normal na daloy ng chat.
    return None