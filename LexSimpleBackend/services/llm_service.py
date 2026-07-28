import json
import re
import time
from core.config import settings
from db.chroma_store import query_vector_db
from db.sqlite_store import log_ai_transaction

from services.prompts import (
    get_analyze_legal_text_prompt,
    get_dictionary_search_prompt,
    get_explain_statutory_text_prompt
)
from services.llm_config import get_ai_client, CHAT_MODEL, EXTRACT_MODEL

def extract_and_clean_json(raw_response: str) -> str:
    cleaned = re.sub(r'```(?:json)?\n?|```', '', raw_response).strip()
    match = re.search(r'(\{.*\}|\[.*\])', cleaned, re.DOTALL)
    if match:
        return match.group(1)
    return cleaned

def normalize_ai_keys(clauses_list):
    normalized = []
    for c in clauses_list:
        norm_c = {}
        norm_c["clause_title"] = c.get("clause_title", c.get("title", "Legal Clause"))
        norm_c["explanation"] = c.get("explanation", c.get("description", "No explanation provided."))
        norm_c["practical_advice"] = c.get("practical_advice", c.get("advice", "Please read carefully."))
        deduct = c.get("score_deduction", c.get("deduction", c.get("points_deducted", 10)))
        norm_c["score_deduction"] = deduct
        norm_c["original_text"] = c.get("original_text", c.get("foundText", c.get("text", "Refer to document.")))
        normalized.append(norm_c)
    return normalized

def recalculate_safety_score(ai_json: dict) -> dict:
    starting_score = 100
    total_deductions = 0
    raw_clauses = ai_json.get("clauses", ai_json.get("findings", ai_json.get("results", [])))
    clauses_list = normalize_ai_keys(raw_clauses)
    
    for clause in clauses_list:
        deduct = clause.get('score_deduction', 10)
        try:
            total_deductions += abs(int(deduct))
        except:
            total_deductions += 10

    ai_json['safety_score'] = max(0, starting_score - total_deductions)
    ai_json["clauses"] = clauses_list
    return ai_json

def analyze_legal_text(ocr_text: str):
    try:
        # Pinalaki natin ulit ang context window dahil kaya ng GPT-4o-mini ang mas mahaba
        short_ocr = ocr_text[:6000] if len(ocr_text) > 6000 else ocr_text
        
        search_results = query_vector_db(short_ocr, n_results=2)
        context_texts = []
        if search_results and search_results['documents']:
            for doc_list in search_results['documents']:
                context_texts.extend(doc_list)
        
        retrieved_context = "\n---\n".join(context_texts) if context_texts else "Philippine legal context."
        prompt = get_analyze_legal_text_prompt(retrieved_context, short_ocr)

        # Mas sinusunod ng OpenAI ang JSON instructions, pero okay pa rin na may strict schema reminder
        strict_schema = """
        Output MUST be in valid JSON:
        {"safety_score": 100, "clauses": [{"clause_title": "", "explanation": "In Taglish", "practical_advice": "In Taglish", "score_deduction": 10, "original_text": ""}]}
        """
        
        client = get_ai_client()
        # 💡 UPDATE: OpenAI Chat Completions syntax
        completion = client.chat.completions.create(
            model=CHAT_MODEL,
            messages=[{"role": "user", "content": prompt + strict_schema}],
            temperature=0.1,
            max_tokens=1500 
        )

        raw_response = completion.choices[0].message.content
        print("\n[DEBUG] RAW RESPONSE RECEIVED\n")
        
        clean_json_str = extract_and_clean_json(raw_response)
        ai_json = json.loads(clean_json_str)
        ai_json = recalculate_safety_score(ai_json)

        log_ai_transaction(short_ocr, json.dumps(ai_json))
        return {"status": "success", "data": ai_json}

    except Exception as e:
        print(f"Analyze Error: {e}")
        return {"status": "error", "message": "May problema sa pag-process ng dokumento. Pakisubukan ulit."}

def search_legal_dictionary(keyword: str):
    try:
        prompt = get_dictionary_search_prompt(keyword, "")
        client = get_ai_client()
        completion = client.chat.completions.create(
            model=EXTRACT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1000
        )
        ai_response = json.loads(extract_and_clean_json(completion.choices[0].message.content))
        return {"status": "success", "data": ai_response}
    except:
        return {"status": "error", "message": "Dictionary error."}

def explain_raw_statutory_text(title: str, raw_text: str):
    try:
        prompt = get_explain_statutory_text_prompt(title, raw_text)
        client = get_ai_client()
        completion = client.chat.completions.create(
            model=EXTRACT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1000
        )
        ai_data = json.loads(extract_and_clean_json(completion.choices[0].message.content))
        return {"status": "success", "data": ai_data}
    except:
        return {"status": "error", "message": "Explanation error."}