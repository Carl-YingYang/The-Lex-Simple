import copy
import hashlib
import re
from dataclasses import dataclass
from typing import Dict, List, Optional

from rules.engine import RuleEngine
from services.llm_service import analyze_legal_text
from services.ocr_quality import assess_ocr_quality
from services.sanitizer import sanitize_legal_text
from services.validator import validate_llm_response


CACHE_SCHEMA_VERSION = "document-analysis-v5-quality-outcomes"
MIN_READABLE_CHARACTERS = 40
MIN_READABLE_WORDS = 8

# These patterns identify content captured from an app, browser, editor, or
# source-code screen. They are intentionally separate from ordinary OCR noise:
# readable non-document content must be rejected as "not_legal_document", not
# rewarded with a 100 safety score.
UI_CONTENT_PATTERNS = (
    r"\bdownload\b",
    r"\bshare\b",
    r"\bsearch\b",
    r"\bwork on anything\b",
    r"\bgpt[-\s]?\d",
    r"\bmostly cloudy\b",
    r"\bviewplus\b",
    r"\bscan results\b",
    r"\bmajor fixes\b",
    r"\bimportant\s*:?\s*kailangan\b",
    r"\bpalitan ang buong laman\b",
)

SOURCE_CODE_PATTERNS = (
    r"\bimport\s+(?:type\s+)?[\w{*]",
    r"\bfrom\s+['\"](?:react|@expo|\.\.?/)\S*['\"]",
    r"\bconst\s+[A-Za-z_$][\w$]*\s*=",
    r"\bfunction\s+[A-Za-z_$][\w$]*\s*\(",
    r"\bexport\s+(?:default\s+)?(?:function|const|type|class)\b",
    r"\breact-native\b",
    r"\bStyleSheet\.create\s*\(",
    r"\buse(?:State|Effect|Ref|Memo|Callback)\s*\(",
    r"\.(?:tsx|ts|jsx|js|py)\b",
    r"src[/\\]screens[/\\]",
)

# At least one structural signal is required. Generic words such as "legal",
# "contract", or "clause" are deliberately excluded because an article,
# tutorial, or app screen can mention them without being a legal document.
LEGAL_STRUCTURE_PATTERNS = (
    r"\b(?:this\s+)?agreement\s+(?:is\s+)?(?:made|entered|executed)\b",
    r"\bby\s+and\s+between\b",
    r"\bhereinafter\s+(?:referred\s+to\s+as|called)\b",
    r"\bwhereas\b",
    r"\b(?:party|parties)\s+(?:agrees?|shall|must|represents?|warrants?)\b",
    r"\b(?:borrower|lender|lessor|lessee|tenant|landlord|buyer|seller)\b",
    r"\b(?:shall|must)\s+(?:pay|provide|deliver|return|maintain|not|be)\b",
    r"\b(?:section|article|clause)\s+\d+(?:\.\d+)*\b",
    r"\bterms?\s+and\s+conditions\b",
    r"\byou\s+agree\s+to\b",
    r"\b(?:effective|commencement|termination|expiration)\s+date\b",
    r"\b(?:signed|executed)\s+(?:this|on|by)\b",
    r"\bin\s+witness\s+whereof\b",
    r"\bnotary\s+public\b",
    r"\b(?:republic\s+of\s+the\s+philippines|regional\s+trial\s+court|municipal\s+trial\s+court)\b",
    r"\b(?:plaintiff|defendant|petitioner|respondent|accused)\b",
    r"\bcase\s*(?:no\.?|number)\s*[:\-]?\s*[A-Za-z0-9-]+",
    r"\b(?:ordered|adjudged|decreed)\b",
    r"\b(?:affidavit|deponent|subscribed\s+and\s+sworn)\b",
    r"\b(?:promissory\s+note|promise\s+to\s+pay|principal\s+sum|interest\s+rate|due\s+date)\b",
    r"\b(?:authorize|authorization)\s+[A-Za-zÀ-ÖØ-öø-ÿ]+\s+to\b",
    r"\b(?:kasunduan|kontrata)\s+(?:na|sa|ng|para)\b",
    r"\b(?:nagpapaupa|umuupa|nagpapautang|umutang)\b",
)


@dataclass
class ProcessRequest:
    text: str
    source: str = "text"  # "text" | "file" | "chat"


@dataclass
class ProcessResult:
    status: str
    data: dict
    source_layer: str
    llm_calls_made: int = 0


def _normalize_for_comparison(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _risk_level_from_score(score: int) -> str:
    if score >= 90:
        return "Very Safe"
    if score >= 70:
        return "Acceptable"
    if score >= 50:
        return "Risky"
    return "High Risk"


def _error_payload(
    code: str,
    message: str,
    document_status: str,
    **extra,
) -> dict:
    payload = {
        "status": "error",
        "code": code,
        "message": message,
        "documentStatus": document_status,
    }
    payload.update(extra)
    return payload


def _processing_meta(text: str) -> dict:
    return {
        "chunkCount": 0,
        "pageCount": max(
            1,
            len(re.findall(r"(?m)^--- Page \d+ ---$", text)),
        ),
        "processedCharacters": len(text),
        "documentHash": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    }


def _inconclusive_payload(text: str, quality: dict) -> dict:
    mixed = any(
        issue.get("code") == "mixed_documents"
        for issue in quality.get("issues", [])
    )
    return {
        "status": "success",
        "data": {
            "score": None,
            "riskLevel": "Analysis unavailable",
            "documentTitle": (
                "Multiple Documents" if mixed else "Document Review Needed"
            ),
            "documentStatus": (
                "mixed_documents" if mixed else "inconclusive_ocr"
            ),
            "analysisOutcome": (
                "mixed_documents" if mixed else "inconclusive_ocr"
            ),
            "analysisMode": "quality_gate",
            "findings": [],
            "processingMeta": _processing_meta(text),
            "ocrQuality": quality,
        },
        "sanitizedText": text,
    }


class Orchestrator:
    """
    Coordinates the privacy-safe legal-document analysis pipeline.

    Flow:
    1. Sanitize and validate OCR text.
    2. Run deterministic rules for known risky patterns.
    3. Check the in-memory cache.
    4. Run the LLM on the complete accepted document.
    5. Validate the LLM response.
    6. Merge and deduplicate rule and LLM findings.

    The rule engine is a safety net. A rule match must not prevent the
    remaining document from being analyzed by the LLM.
    """

    def __init__(
        self,
        rule_engine: Optional[RuleEngine] = None,
    ):
        self.rule_engine = rule_engine or RuleEngine()
        self._cache: Dict[str, dict] = {}

    def process(self, request: ProcessRequest) -> ProcessResult:
        if not isinstance(request.text, str):
            return ProcessResult(
                status="error",
                data=_error_payload(
                    code="invalid_text_type",
                    message="The OCR input must be text.",
                    document_status="unreadable",
                ),
                source_layer="input_validation",
                llm_calls_made=0,
            )

        sanitized_text = sanitize_legal_text(request.text).strip()
        quality_error = self._validate_document_text(sanitized_text)

        if quality_error:
            return ProcessResult(
                status="error",
                data=quality_error,
                source_layer="input_validation",
                llm_calls_made=0,
            )

        ocr_quality = assess_ocr_quality(sanitized_text)
        if ocr_quality["status"] == "analysis_blocked":
            return ProcessResult(
                status="quality_gate",
                data=_inconclusive_payload(
                    sanitized_text,
                    ocr_quality,
                ),
                source_layer="quality_gate",
                llm_calls_made=0,
            )

        cache_key = self._make_cache_key(sanitized_text)

        if cache_key in self._cache:
            print("[ORCHESTRATOR] Cache hit for sanitized document hash.")
            return ProcessResult(
                status="cache_hit",
                data=copy.deepcopy(self._cache[cache_key]),
                source_layer="cache",
                llm_calls_made=0,
            )

        try:
            rule_matches = self.rule_engine.match_all(sanitized_text)
        except Exception as error:
            # A broken optional rule must not destroy the complete analysis.
            print(f"[ORCHESTRATOR] Rule engine error: {error}")
            rule_matches = []

        raw_llm_result = analyze_legal_text(sanitized_text)

        if (
            not isinstance(raw_llm_result, dict)
            or raw_llm_result.get("status") == "error"
        ):
            message = (
                raw_llm_result.get("message")
                if isinstance(raw_llm_result, dict)
                else None
            )

            return ProcessResult(
                status="error",
                data=_error_payload(
                    code="llm_analysis_failed",
                    message=message or "The AI analysis did not complete.",
                    document_status="processing_error",
                    preliminaryRuleFindings=(
                        self._format_rule_findings(rule_matches)
                        if rule_matches
                        else []
                    ),
                ),
                source_layer="llm",
                llm_calls_made=1,
            )

        validated_response = validate_llm_response(raw_llm_result)

        if (
            not isinstance(validated_response, dict)
            or validated_response.get("status") != "success"
            or not isinstance(validated_response.get("data"), dict)
        ):
            validation_message = (
                validated_response.get("message")
                if isinstance(validated_response, dict)
                else None
            )

            return ProcessResult(
                status="error",
                data=_error_payload(
                    code="invalid_ai_response",
                    message=(
                        validation_message
                        or "The AI returned an invalid analysis response."
                    ),
                    document_status="processing_error",
                ),
                source_layer="validation",
                llm_calls_made=1,
            )

        final_response = self._merge_analysis_results(
            validated_response=validated_response,
            rule_matches=rule_matches,
            sanitized_text=sanitized_text,
            ocr_quality=ocr_quality,
        )

        # Cache only a complete, validated analysis.
        self._cache[cache_key] = copy.deepcopy(final_response)

        return ProcessResult(
            status="hybrid" if rule_matches else "llm",
            data=final_response,
            source_layer="hybrid" if rule_matches else "llm",
            llm_calls_made=1,
        )

    def _validate_document_text(self, text: str) -> Optional[dict]:
        if len(text) < MIN_READABLE_CHARACTERS:
            return _error_payload(
                code="insufficient_ocr_text",
                message=(
                    "Hindi sapat ang text na nabasa. Linawin o kunan ulit "
                    "ang document."
                ),
                document_status="unreadable",
            )

        words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ]{2,}", text)
        if len(words) < MIN_READABLE_WORDS:
            return _error_payload(
                code="insufficient_readable_words",
                message=(
                    "Kaunti ang malinaw na salitang nakuha mula sa document. "
                    "Kunan ulit ito nang mas maliwanag at tuwid."
                ),
                document_status="unreadable",
            )

        non_space_characters = [character for character in text if not character.isspace()]
        letter_count = sum(character.isalpha() for character in non_space_characters)
        letter_ratio = letter_count / max(1, len(non_space_characters))

        if letter_ratio < 0.35:
            return _error_payload(
                code="low_ocr_quality",
                message=(
                    "Masyadong maraming sirang character sa OCR. "
                    "I-scan ulit ang document bago ito ipa-check."
                ),
                document_status="unreadable",
                quality={"letterRatio": round(letter_ratio, 3)},
            )

        code_matches = [
            pattern
            for pattern in SOURCE_CODE_PATTERNS
            if re.search(pattern, text, re.IGNORECASE)
        ]
        ui_matches = [
            pattern
            for pattern in UI_CONTENT_PATTERNS
            if re.search(pattern, text, re.IGNORECASE)
        ]

        if (
            len(code_matches) >= 2
            or len(ui_matches) >= 3
            or (
                len(code_matches) >= 1
                and len(ui_matches) >= 1
            )
        ):
            return _error_payload(
                code="non_document_screen_content",
                message=(
                    "Mukhang app, browser, o source-code screen ang na-scan, "
                    "hindi isang legal document. Kunan ang mismong dokumento "
                    "at subukan ulit."
                ),
                document_status="not_legal_document",
                detection={
                    "codeSignals": len(code_matches),
                    "uiSignals": len(ui_matches),
                },
            )

        browser_markers = (
            "client=firefox",
            "client=chrome",
            "all images",
            "short videos",
            "ask anything",
            "people also ask",
            "related searches",
            "search results",
        )
        lowered = text.casefold()
        browser_marker_count = sum(
            marker in lowered for marker in browser_markers
        )

        if browser_marker_count >= 2:
            return _error_payload(
                code="browser_ui_detected",
                message=(
                    "Browser o app interface ang mukhang nabasa ng OCR, "
                    "hindi ang mismong legal document."
                ),
                document_status="unreadable",
            )

        legal_structure_count = sum(
            bool(re.search(pattern, lowered, re.IGNORECASE))
            for pattern in LEGAL_STRUCTURE_PATTERNS
        )

        if legal_structure_count == 0:
            return _error_payload(
                code="unsupported_document",
                message=(
                    "Nababasa ang text pero walang sapat na legal-document "
                    "structure. Hindi ito bibigyan ng safety score. I-scan "
                    "ang mismong kontrata, kasunduan, court document, o "
                    "katulad na legal record."
                ),
                document_status="not_legal_document",
            )

        return None

    def _make_cache_key(self, sanitized_text: str) -> str:
        cache_input = (
            f"{CACHE_SCHEMA_VERSION}\n{sanitized_text}"
        ).encode("utf-8")
        return hashlib.sha256(cache_input).hexdigest()

    def _format_rule_findings(self, matches: list) -> List[dict]:
        findings = []

        for match in matches:
            try:
                confidence_value = int(float(match.confidence) * 100)
            except (TypeError, ValueError):
                confidence_value = 80

            confidence_value = max(0, min(100, confidence_value))

            findings.append(
                {
                    "title": match.clause_title,
                    "description": match.explanation,
                    "advice": match.advice,
                    "foundText": match.matched_text,
                    "confidence": f"{confidence_value}%",
                    "source": "rule_engine",
                    "scoreDeduction": self._safe_deduction(
                        match.score_deduction
                    ),
                }
            )

        return findings

    def _safe_deduction(self, value) -> int:
        try:
            return max(0, min(100, abs(int(value))))
        except (TypeError, ValueError):
            return 10

    def _merge_analysis_results(
        self,
        validated_response: dict,
        rule_matches: list,
        sanitized_text: str,
        ocr_quality: dict,
    ) -> dict:
        response = copy.deepcopy(validated_response)
        analysis = response["data"]

        llm_findings = analysis.get("findings", [])
        if not isinstance(llm_findings, list):
            llm_findings = []

        merged_findings: List[dict] = []
        seen_finding_keys = set()

        # Deterministic findings go first so known rule matches are retained.
        for finding in self._format_rule_findings(rule_matches):
            key = self._finding_key(finding)
            if key in seen_finding_keys:
                continue
            seen_finding_keys.add(key)
            merged_findings.append(finding)

        for finding in llm_findings:
            if not isinstance(finding, dict):
                continue

            normalized_finding = {
                **finding,
                "source": finding.get("source", "llm"),
            }
            key = self._finding_key(normalized_finding)

            if key in seen_finding_keys:
                continue

            seen_finding_keys.add(key)
            merged_findings.append(normalized_finding)

        llm_score = (
            self._safe_score(analysis.get("score"))
            if analysis.get("score") is not None else 100
        )

        if not merged_findings:
            final_score = None
        elif rule_matches:
            rule_deduction = sum(
                self._safe_deduction(match.score_deduction)
                for match in rule_matches
            )
            # A confirmed risky rule finding must not produce Very Safe.
            rule_score = min(89, max(0, 100 - rule_deduction))
            final_score = min(llm_score, rule_score)
        else:
            final_score = llm_score

        analysis["score"] = final_score
        analysis["riskLevel"] = (
            _risk_level_from_score(final_score)
            if final_score is not None else "No findings detected"
        )
        analysis["findings"] = merged_findings
        analysis["documentStatus"] = (
            "analyzed" if merged_findings else "analyzed_no_flags"
        )
        analysis["analysisOutcome"] = (
            "inconclusive_analysis"
            if analysis.get("analysisOutcome") == "inconclusive_analysis"
            else "findings_detected"
            if merged_findings
            else "inconclusive_ocr"
            if ocr_quality.get("status") == "review_recommended"
            else "no_findings_detected"
        )
        if analysis["analysisOutcome"] in (
            "inconclusive_ocr",
            "inconclusive_analysis",
        ):
            analysis["documentStatus"] = analysis["analysisOutcome"]
            analysis["riskLevel"] = "Review required"
            analysis["score"] = None
        analysis["ocrQuality"] = ocr_quality
        analysis["analysisMode"] = (
            "hybrid" if rule_matches else "llm"
        )
        analysis["pageCount"] = max(
            1,
            len(
                re.findall(
                    r"(?m)^--- Page \d+ ---$",
                    sanitized_text,
                )
            ),
        )

        response["sanitizedText"] = sanitized_text
        return response

    def _safe_score(self, value) -> int:
        if isinstance(value, bool):
            return 0

        try:
            score = int(value)
        except (TypeError, ValueError):
            # The validator will be tightened in the next file. Until then,
            # never convert an absent/malformed score into 100 here.
            return 0

        return max(0, min(100, score))

    def _finding_key(self, finding: dict) -> str:
        found_text = _normalize_for_comparison(
            str(finding.get("foundText", ""))
        )
        title = _normalize_for_comparison(
            str(finding.get("title", ""))
        )

        if found_text and found_text != "refer to document":
            return f"text:{found_text}"

        return f"title:{title}"
