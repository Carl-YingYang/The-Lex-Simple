# orchestrator/pipeline.py
import hashlib
from typing import Optional, Dict
from dataclasses import dataclass, field
from rules.engine import RuleEngine
from rules.patterns.base import RuleMatch
from services.llm_service import analyze_legal_text
from services.sanitizer import sanitize_legal_text
from services.validator import validate_llm_response

@dataclass
class ProcessRequest:
    text: str
    source: str = "text"  # "text" | "file" | "chat"

@dataclass
class ProcessResult:
    status: str               # "rule_match" | "llm" | "cache_hit" | "error"
    data: dict                # JSON-serializable result para sa mobile app
    source_layer: str         # "rule_engine" | "llm" | "cache" — para sa cost logging
    llm_calls_made: int = 0   # 0 kapag rule engine/cache ang nag-handle

class Orchestrator:
    """
    Central coordinator ng layered processing flow.
    Layer 1: Sanitize text
    Layer 2: Rule engine (deterministic clause detection)
    Layer 3: Cache Check (Hindi muna tatawagin si Groq kapag may kamukha)
    Layer 4: LLM (fallback kapag walang rule match/cache)
    Layer 5: Validation (Iche-check ang sagot ng LLM bago ibalik)
    """

    def __init__(self, rule_engine: Optional[RuleEngine] = None):
        self.rule_engine = rule_engine or RuleEngine()
        # 🆕 SIMPLE IN-MEMORY CACHE (Key: hash text, Value: result)
        self._cache: Dict[str, dict] = {}

    def process(self, request: ProcessRequest) -> ProcessResult:
        # Layer 1: sanitize muna
        safe_text = sanitize_legal_text(request.text)

        # Layer 2: rule engine — subukan muna kung may deterministic match
        rule_matches = self.rule_engine.match_all(safe_text)
        if rule_matches:
            return self._format_rule_result(rule_matches, safe_text)

        # 🆕 Layer 3: CACHE CHECK — baka na-process na natin ito kanina
        text_hash = hashlib.md5(safe_text.encode('utf-8')).hexdigest()
        if text_hash in self._cache:
            print("[ORCHESTRATOR] Cache HIT! Returning cached result.")
            return ProcessResult(
                status="cache_hit",
                data=self._cache[text_hash],
                source_layer="cache",
                llm_calls_made=0
            )

        # Layer 4: LLM (existing function mo)
        raw_llm_result = analyze_legal_text(safe_text)
        
        # Layer 5: VALIDATION GATE
        # Kung nag-error si Groq, pass through lang yung error
        if not isinstance(raw_llm_result, dict) or raw_llm_result.get("status") == "error":
            return ProcessResult(
                status="error",
                data=raw_llm_result or {"status": "error", "message": "Unknown LLM error"},
                source_layer="llm",
                llm_calls_made=1
            )

        # 🆕 I-VALIDATE AT ILINIS ANG SAGOT NG LLM
        validated_data = validate_llm_response(raw_llm_result)
        
        # Dagdagan ang sanitized text bago i-cache at ibalik
        if validated_data.get("status") == "success":
            validated_data["sanitizedText"] = safe_text
            # 🆕 SAVE SA CACHE PARA SA SUSUNOD NA MAG-QUERY NG PAREHONG TEXT
            self._cache[text_hash] = validated_data

        return ProcessResult(
            status="llm",
            data=validated_data,
            source_layer="llm",
            llm_calls_made=1,
        )

    def _format_rule_result(self, matches: list, safe_text: str) -> ProcessResult:
        """I-convert ang rule matches sa parehong schema na inaasahan ng mobile app."""
        total_deduction = sum(m.score_deduction for m in matches)
        score = max(0, 100 - total_deduction)
        
        # FIX: Kapag may match, hindi pwedeng "Very Safe"
        if not matches:
            risk = "Very Safe"
        else:
            if score >= 80: risk = "Acceptable"
            elif score >= 50: risk = "Risky"
            else: risk = "High Risk"

        return ProcessResult(
            status="rule_match",
            data={
                "status": "success",
                "data": {
                    "score": score,
                    "riskLevel": risk,
                    "findings": [
                        {
                            "title": m.clause_title,
                            "description": m.explanation,
                            "advice": m.advice,
                            "foundText": m.matched_text,
                            "confidence": f"{int(m.confidence * 100)}%",
                        }
                        for m in matches
                    ],
                },
                "sanitizedText": safe_text,
            },
            source_layer="rule_engine",
            llm_calls_made=0,
        )