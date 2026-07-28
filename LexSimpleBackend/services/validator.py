# services/validator.py
import logging

logger = logging.getLogger("lex.validator")

def validate_llm_response(llm_data: dict) -> dict:
    """
    Linisin at i-validate ang sagot ng LLM bago ibalik sa user.
    Nagfa-fix ng mismatched scores at missing fields.
    """
    if not isinstance(llm_data, dict):
        return {"status": "error", "message": "Invalid AI response format."}

    # Kunin yung data (minsan nested ito depende sa prompt)
    data = llm_data.get("data", llm_data)
    
    try:
        # 1. FIX SCORE & RISK MISMATCH
        # Kung minsan mali ang lagay ng LLM sa riskLevel, so we compute it deterministically
        score = int(data.get("safety_score", data.get("score", 100)))
        data["score"] = score
        
        if score >= 90: data["riskLevel"] = "Very Safe"
        elif score >= 70: data["riskLevel"] = "Acceptable"
        elif score >= 50: data["riskLevel"] = "Risky"
        else: data["riskLevel"] = "High Risk"

        # 2. FIX MISSING FINDINGS/CLAUSES
        findings = data.get("clauses", data.get("findings", []))
        if not isinstance(findings, list):
            findings = []
            
        clean_findings = []
        for item in findings:
            if not isinstance(item, dict): continue
            
            # Ensure lahat ng required fields ay may laman
            clean_findings.append({
                "title": item.get("clause_title", item.get("title", "Legal Clause")),
                "description": item.get("explanation", item.get("description", "No explanation provided.")),
                "advice": item.get("practical_advice", item.get("advice", "Please read carefully.")),
                "foundText": item.get("original_text", item.get("foundText", "Refer to document.")),
                "confidence": item.get("confidence", "80%")
            })
            
        data["findings"] = clean_findings
        
        # Ibalik sa parehong schema na inaasahan ng mobile app
        return {
            "status": "success",
            "data": {
                "score": data["score"],
                "riskLevel": data["riskLevel"],
                "findings": data["findings"]
            }
        }
        
    except Exception as e:
        logger.error(f"Validation Error: {e} | Raw Data: {llm_data}")
        return {"status": "error", "message": "AI returned malformed data."}