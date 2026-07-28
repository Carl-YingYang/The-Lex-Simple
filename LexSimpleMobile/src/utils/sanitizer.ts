export const sanitizeLocalText = (rawText: string): string => {
  if (!rawText) return "";
  let sanitized = rawText;

  // 1. Static Redactions (Emails & Phones)
  sanitized = sanitized.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]');
  
  // 💡 THE FIX: OCR-TYPO RESILIENT PHONE CATCHER
  // Huhulihin nito ang 09, +639, pati na rin kung naging D9, O9, o kaya may letter O sa gitna ng numbers!
  sanitized = sanitized.replace(/(?:\+63|[O0DoD][9gq])[\dODo]{2}[-\s]?[\dODo]{3}[-\s]?[\dODo]{4}/gi, '[REDACTED_PHONE]');

  // Huhulihin din ang mga landlines (044) 123-4567 kahit may typo
  sanitized = sanitized.replace(/\([O0DoD]\d{1,3}\)\s*[\dODo]{3}[-\s]?[\dODo]{4}/gi, '[REDACTED_PHONE]');

  const entitiesToRedact: { type: string, value: string }[] = [];

  // 2. SMART ADDRESS CATCHER
  const addressPattern = /(?:address(?: at)?|residing(?: at)?|located(?: at)?|location:|naninirahan sa)\s+([^\(\);\n]{5,80}?)(?=\s*(?:\(|hereinafter|;|$))/gi;
  let match;
  while ((match = addressPattern.exec(sanitized)) !== null) {
      entitiesToRedact.push({ type: '[REDACTED_ADDRESS]', value: match[1].trim() });
  }

  // 3. TYPO-RESILIENT LEGAL NAME CATCHER
  const legalNamePattern = /([A-Z][A-Za-z0-9\.\-\s\&]{3,50}?),\s*(?:of legal|a duly|Filipin[a-zA-Z]|single|married|widow|an entity)/gi;
  while ((match = legalNamePattern.exec(sanitized)) !== null) {
      let val = match[1].trim();
      val = val.replace(/^-and-\s*/i, '').trim(); 
      if (val.length > 3 && !val.toLowerCase().includes('address') && !val.toLowerCase().includes('hereinafter')) {
          entitiesToRedact.push({ type: '[REDACTED_NAME]', value: val });
      }
  }

  // 4. FALLBACK LABELS & TAGALOG MARKERS
  const labelPattern = /(?:Tenant|Landlord|Lessor|Lessee|Buyer|Seller|Name|Pangalan|Ako si)\s*[:\s]+([A-Z][a-zA-Z\.\-\s]{2,40})(?=\n|,|$)/gi;
  while ((match = labelPattern.exec(sanitized)) !== null) {
      let val = match[1].trim();
      if (val.length > 2) {
          entitiesToRedact.push({ type: '[REDACTED_NAME]', value: val });
      }
  }

  // 5. EXECUTE GLOBAL REDACTION
  entitiesToRedact.sort((a, b) => b.value.length - a.value.length);
  
  entitiesToRedact.forEach(entity => {
      const safeVal = entity.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safeVal, 'gi');
      sanitized = sanitized.replace(regex, entity.type);
  });

  return sanitized;
};