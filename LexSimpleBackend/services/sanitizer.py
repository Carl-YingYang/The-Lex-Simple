import re

def sanitize_legal_text(raw_text: str) -> str:
    """
    Nililinis ang text para itago ang mga sensitive info (DPA Compliance).
    TYPO-RESILIENT UPDATE: Kayang i-handle ang OCR errors tulad ng "of legal aEe" o "FilipinD".
    """
    if not raw_text: return ""
    sanitized = raw_text

    sanitized = re.sub(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '[REDACTED_EMAIL]', sanitized)
    sanitized = re.sub(r'(\+63|0)9\d{2}[-\s]?\d{3}[-\s]?\d{4}', '[REDACTED_PHONE]', sanitized)

    entities_to_redact = []

    # 1. Smart Address Catcher
    addr_pattern = r'(?i)(?:address(?: at)?|residing(?: at)?|located(?: at)?|location:)\s+([^\(\);\n]{5,80}?)(?=\s*(?:\(|hereinafter|;|$))'
    for match in re.finditer(addr_pattern, sanitized):
        entities_to_redact.append(("[REDACTED_ADDRESS]", match.group(1).strip()))

    # 2. TYPO-RESILIENT Legal Name/Entity Catcher 💡
    legal_name_pattern = r'(?i)([A-Z][A-Za-z0-9\.\-\s\&]{3,50}?),\s*(?:of legal|a duly|Filipin[a-z]|single|married|widow|an entity)'
    for match in re.finditer(legal_name_pattern, sanitized):
        val = match.group(1).strip()
        val = re.sub(r'(?i)^-and-\s*', '', val).strip()
        if len(val) > 3 and "address" not in val.lower() and "hereinafter" not in val.lower():
            entities_to_redact.append(("[REDACTED_NAME]", val))

    # 3. Fallback Labels
    label_pattern = r'(?i)(?:Tenant|Landlord|Lessor|Lessee|Buyer|Seller|Name)\s*:\s*([A-Z][a-zA-Z\.\-\s]{3,40})(?=\n|,|$)'
    for match in re.finditer(label_pattern, sanitized):
        entities_to_redact.append(("[REDACTED_NAME]", match.group(1).strip()))

    # 4. EXECUTE GLOBAL REDACTION
    entities_to_redact.sort(key=lambda x: len(x[1]), reverse=True)

    for entity_type, entity_value in entities_to_redact:
        safe_entity = re.escape(entity_value)
        sanitized = re.sub(f'(?i){safe_entity}', entity_type, sanitized)

    return sanitized