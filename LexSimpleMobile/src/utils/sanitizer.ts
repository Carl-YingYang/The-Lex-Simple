/**
 * Lex-Simple Local Privacy Sanitizer
 *
 * PURPOSE:
 * Prevent personally identifiable / sensitive information from being
 * sent to the AI backend.
 *
 * IMPORTANT:
 * This is a LOCAL PRE-SEND sanitizer.
 *
 * It is intentionally aggressive because legal documents may contain:
 * - Full names
 * - Addresses
 * - Phone numbers
 * - Emails
 * - Government IDs
 * - Account numbers
 * - Tax IDs
 * - Dates of birth
 * - Financial information
 * - URLs / social accounts
 * - OCR-corrupted versions of the above
 *
 * IMPORTANT SECURITY NOTE:
 * No regex sanitizer can mathematically guarantee that 100% of all
 * possible sensitive information is detected.
 *
 * Therefore this sanitizer uses:
 * 1. Unicode normalization
 * 2. Direct regex detection
 * 3. OCR-tolerant number detection
 * 4. Context-aware label detection
 * 5. Global replacement
 * 6. Re-scan pass
 * 7. Final high-risk pattern sweep
 *
 * NEVER send raw OCR text directly to the AI.
 */

export const REDACTION = {
    EMAIL: '[REDACTED_EMAIL]',
    PHONE: '[REDACTED_PHONE]',
    ADDRESS: '[REDACTED_ADDRESS]',
    NAME: '[REDACTED_NAME]',
    ID: '[REDACTED_ID]',
    ACCOUNT: '[REDACTED_ACCOUNT]',
    CARD: '[REDACTED_CARD]',
    TAX_ID: '[REDACTED_TAX_ID]',
    DATE_OF_BIRTH: '[REDACTED_DATE_OF_BIRTH]',
    FINANCIAL: '[REDACTED_FINANCIAL_INFO]',
    URL: '[REDACTED_URL]',
    SOCIAL: '[REDACTED_SOCIAL_ACCOUNT]',
    SIGNATURE: '[REDACTED_SIGNATURE]',
    UNKNOWN_SENSITIVE: '[REDACTED_SENSITIVE_DATA]',
} as const;


/* ============================================================
 * BASIC HELPERS
 * ============================================================ */

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


const replaceAllInsensitive = (
    text: string,
    value: string,
    replacement: string
): string => {
    if (!value || value.length < 2) return text;

    try {
        const regex = new RegExp(escapeRegex(value), 'giu');
        return text.replace(regex, replacement);
    } catch {
        return text;
    }
};


/**
 * Normalize Unicode and common OCR characters.
 *
 * We DO NOT aggressively replace letters globally because doing so can
 * destroy legitimate legal words.
 */
const normalizeForDetection = (raw: string): string => {
    return raw
        .normalize('NFKC')
        .replace(/\u00A0/g, ' ')
        .replace(/[‐-‒–—―]/g, '-')
        .replace(/[“”„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
};


/**
 * OCR-friendly digit normalization.
 *
 * Only use this for DETECTION.
 * Never replace the actual sanitized text with this version.
 */
const normalizeOcrDigits = (value: string): string => {
    return value
        .replace(/[Oo]/g, '0')
        .replace(/[IiLl|]/g, '1')
        .replace(/[Zz]/g, '2')
        .replace(/[Ss]/g, '5')
        .replace(/[Gg]/g, '6')
        .replace(/[Tt]/g, '7')
        .replace(/[Bb]/g, '8')
        .replace(/[Qq]/g, '9');
};


/* ============================================================
 * CORE SANITIZER
 * ============================================================ */

export const sanitizeLocalText = (rawText: string): string => {
    if (!rawText || typeof rawText !== 'string') {
        return '';
    }

    let sanitized = normalizeForDetection(rawText);

    /*
     * ==========================================================
     * PASS 1 — EMAIL ADDRESSES
     * ==========================================================
     */

    sanitized = sanitized.replace(
        /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/giu,
        REDACTION.EMAIL
    );


    /*
     * ==========================================================
     * PASS 2 — PHILIPPINE MOBILE NUMBERS
     * ==========================================================
     *
     * Examples:
     * 09171234567
     * 0917 123 4567
     * 0917-123-4567
     * +639171234567
     * +63 917 123 4567
     *
     * Also catches common OCR corruption:
     * O9171234567
     * D9171234567
     */

    sanitized = sanitized.replace(
        /(?:\+?\s*63[\s.-]*)?(?:0?9[\s.-]*[0-9OoIlL]{2})[\s.-]*[0-9OoIlL]{3}[\s.-]*[0-9OoIlL]{4}/giu,
        REDACTION.PHONE
    );


    /*
     * ==========================================================
     * PASS 3 — PHILIPPINE LANDLINES
     * ==========================================================
     *
     * Examples:
     * (02) 8123-4567
     * 02-8123-4567
     * (044) 123-4567
     */

    sanitized = sanitized.replace(
        /(?:\+?63[\s.-]*)?(?:\(?0[2-9][0-9]{1,2}\)?[\s.-]*)[0-9]{3,4}[\s.-]*[0-9]{4}/giu,
        REDACTION.PHONE
    );


    /*
     * ==========================================================
     * PASS 4 — CREDIT / DEBIT CARD NUMBERS
     * ==========================================================
     */

    sanitized = sanitized.replace(
        /\b(?:\d[ -]*?){13,19}\b/g,
        (match) => {
            const digits = match.replace(/\D/g, '');

            if (digits.length >= 13 && digits.length <= 19) {
                return REDACTION.CARD;
            }

            return match;
        }
    );


    /*
     * ==========================================================
     * PASS 5 — BANK / ACCOUNT NUMBERS
     * ==========================================================
     *
     * Context-aware to reduce false positives.
     */

    const accountPatterns = [
        /\b(?:account\s*(?:no|number|#)?|acct\.?\s*(?:no|number|#)?|account\s*id)\s*[:#.-]?\s*[A-Z0-9][A-Z0-9 .-]{5,30}\b/giu,

        /\b(?:bank\s*account|deposit\s*account|savings\s*account|checking\s*account)\s*[:#.-]?\s*[A-Z0-9][A-Z0-9 .-]{5,30}\b/giu,

        /\b(?:account\s*number|acct\s*number)\s*[:#.-]?\s*[0-9OoIlL -]{6,24}\b/giu,
    ];

    for (const pattern of accountPatterns) {
        sanitized = sanitized.replace(pattern, REDACTION.ACCOUNT);
    }


    /*
     * ==========================================================
     * PASS 6 — PHILIPPINE GOVERNMENT IDENTIFIERS
     * ==========================================================
     */

    const governmentIdPatterns: RegExp[] = [

        // SSS
        /\b(?:sss|social\s*security)\s*(?:no|number|#)?\s*[:#.-]?\s*[0-9OoIlL -]{8,20}\b/giu,

        // GSIS
        /\b(?:gsis)\s*(?:no|number|#)?\s*[:#.-]?\s*[A-Z0-9 -]{6,25}\b/giu,

        // PhilHealth
        /\b(?:philhealth|phil\s*health)\s*(?:no|number|#)?\s*[:#.-]?\s*[0-9OoIlL -]{8,20}\b/giu,

        // Pag-IBIG / HDMF
        /\b(?:pag[\s-]?ibig|hdmf)\s*(?:no|number|#)?\s*[:#.-]?\s*[0-9OoIlL -]{8,20}\b/giu,

        // TIN
        /\b(?:tin|taxpayer\s*identification\s*(?:no|number)?)\s*[:#.-]?\s*[0-9OoIlL -]{8,20}\b/giu,

        // Driver's license
        /\b(?:driver'?s?\s*license|drivers?\s*license|dl\s*(?:no|number)?)\s*[:#.-]?\s*[A-Z0-9 -]{5,25}\b/giu,

        // Passport
        /\b(?:passport)\s*(?:no|number|#)?\s*[:#.-]?\s*[A-Z0-9 -]{5,20}\b/giu,

        // National ID / PhilSys / PhilID
        /\b(?:national\s*id|national\s*identification|philid|philsys)\s*(?:no|number|#)?\s*[:#.-]?\s*[A-Z0-9 -]{6,30}\b/giu,

        // UMID
        /\b(?:umid)\s*(?:no|number|#)?\s*[:#.-]?\s*[A-Z0-9 -]{6,25}\b/giu,

        // PRC
        /\b(?:prc)\s*(?:license|id)?\s*(?:no|number|#)?\s*[:#.-]?\s*[A-Z0-9 -]{5,25}\b/giu,

        // Postal ID
        /\b(?:postal\s*id|postal\s*identification)\s*(?:no|number|#)?\s*[:#.-]?\s*[A-Z0-9 -]{5,25}\b/giu,

        // Voter's ID
        /\b(?:voter'?s?\s*(?:id|identification)|voter\s*number)\s*[:#.-]?\s*[A-Z0-9 -]{5,30}\b/giu,

        // Generic ID number
        /\b(?:id\s*(?:no|number)|identification\s*(?:no|number))\s*[:#.-]?\s*[A-Z0-9 -]{5,30}\b/giu,
    ];

    for (const pattern of governmentIdPatterns) {
        sanitized = sanitized.replace(pattern, REDACTION.ID);
    }


    /*
     * ==========================================================
     * PASS 7 — DATE OF BIRTH
     * ==========================================================
     *
     * Only redact dates when they have DOB/birth context.
     */

    const dobPatterns: RegExp[] = [

        /\b(?:date\s*of\s*birth|birth\s*date|dob|born\s*on|birthday)\s*[:#.-]?\s*[0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}\b/giu,

        /\b(?:date\s*of\s*birth|birth\s*date|dob|born\s*on|birthday)\s*[:#.-]?\s*(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+[0-9]{1,2},?\s+[0-9]{4}\b/giu,

        /\b(?:kapanganakan|petsa\s*ng\s*kapanganakan|kaarawan)\s*[:#.-]?\s*[0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}\b/giu,
    ];

    for (const pattern of dobPatterns) {
        sanitized = sanitized.replace(pattern, REDACTION.DATE_OF_BIRTH);
    }


    /*
     * ==========================================================
     * PASS 8 — FINANCIAL INFORMATION
     * ==========================================================
     */

    const financialPatterns: RegExp[] = [

        /\b(?:salary|sahod|income|kita|monthly\s*income|annual\s*income|gross\s*income|net\s*income)\s*[:=]?\s*(?:php|₱|\$|usd)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\b/giu,

        /\b(?:bank\s*balance|account\s*balance|balance\s*of)\s*[:=]?\s*(?:php|₱|\$|usd)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\b/giu,

        /\b(?:credit\s*limit|loan\s*amount|loan\s*balance|debt|utang)\s*[:=]?\s*(?:php|₱|\$|usd)?\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?\b/giu,
    ];

    for (const pattern of financialPatterns) {
        sanitized = sanitized.replace(pattern, REDACTION.FINANCIAL);
    }


    /*
     * ==========================================================
     * PASS 9 — ADDRESSES
     * ==========================================================
     *
     * English + Filipino legal labels.
     */

    const addressPatterns: RegExp[] = [

        /(?:address|home\s*address|residential\s*address|current\s*address|present\s*address|permanent\s*address|mailing\s*address)\s*[:#-]?\s*([^\n;]{5,160})/giu,

        /(?:residing\s*(?:at|in)|located\s*(?:at|in)|living\s*(?:at|in))\s+([^\n;]{5,160})/giu,

        /(?:naninirahan\s*(?:sa|ng)|tahanan\s*sa|tirahan\s*sa|address\s*ay)\s+([^\n;]{5,160})/giu,

        /(?:street|st\.|barangay|brgy\.|sitio|purok|subdivision|village|phase|block|lot|building|unit|floor|apartment|apt\.)\s+[^,\n;]{2,80}(?:,|\n|;|$)/giu,
    ];

    for (const pattern of addressPatterns) {
        sanitized = sanitized.replace(
            pattern,
            (match) => REDACTION.ADDRESS
        );
    }


    /*
     * ==========================================================
     * PASS 10 — SOCIAL MEDIA / URLS
     * ==========================================================
     */

    sanitized = sanitized.replace(
        /(?:https?:\/\/|www\.)[^\s<>"']+/giu,
        REDACTION.URL
    );

    sanitized = sanitized.replace(
        /(?:facebook\.com|fb\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|linkedin\.com)\/[^\s<>"']*/giu,
        REDACTION.SOCIAL
    );


    /*
     * ==========================================================
     * PASS 11 — SIGNATURE / SIGNED BY INFORMATION
     * ==========================================================
     */

    sanitized = sanitized.replace(
        /(?:signed\s*by|signature\s*of|signature|signatory|pirma|lagda)\s*[:#-]?\s*[^\n]{2,100}/giu,
        REDACTION.SIGNATURE
    );


    /*
     * ==========================================================
     * PASS 12 — LEGAL NAME LABELS
     * ==========================================================
     *
     * This is deliberately context-aware.
     *
     * We DO NOT redact every capitalized word because that would
     * destroy legal document meaning.
     */

    const nameLabelPatterns: RegExp[] = [

        /(?:full\s*name|complete\s*name|legal\s*name|name\s*of\s*(?:party|tenant|landlord|lessor|lessee|buyer|seller|client|applicant|employee|employer))\s*[:#-]\s*[^\n,;]{2,100}/giu,

        /(?:tenant|landlord|lessor|lessee|buyer|seller|client|applicant|employee|employer|witness|representative|owner)\s*(?:name)?\s*[:#-]\s*[^\n,;]{2,100}/giu,

        /(?:pangalan|buong\s*panan|buong\s*pangalan|pangalan\s*ng)\s*[:#-]\s*[^\n,;]{2,100}/giu,

        /(?:ako\s*si|ang\s*pangalan\s*ko\s*ay)\s+[A-Z][^\n,;]{2,100}/giu,

        /(?:hereinafter\s*(?:referred\s*to\s*as|called))\s*["']?[^"'\n]{2,100}["']?/giu,
    ];

    for (const pattern of nameLabelPatterns) {
        sanitized = sanitized.replace(
            pattern,
            (match) => {
                /*
                 * Preserve the label itself where possible.
                 * Example:
                 * "Tenant Name: Juan Dela Cruz"
                 *
                 * becomes:
                 * "Tenant Name: [REDACTED_NAME]"
                 */

                const separatorMatch = match.match(/[:#-]\s*/);

                if (separatorMatch) {
                    const separator = separatorMatch[0];

                    const index = match.indexOf(separator);

                    if (index >= 0) {
                        return (
                            match.slice(0, index + separator.length) +
                            REDACTION.NAME
                        );
                    }
                }

                return REDACTION.NAME;
            }
        );
    }


    /*
     * ==========================================================
     * PASS 13 — COMMON LEGAL PARTY DECLARATIONS
     * ==========================================================
     *
     * Example:
     * "Juan Dela Cruz, Filipino, single..."
     *
     * We redact the person's name while preserving the legal
     * descriptors.
     */

    const legalPartyPattern =
        /\b([A-Z][A-Za-z.'-]{1,40}(?:\s+[A-Z][A-Za-z.'-]{1,40}){1,5}),\s*(?=(?:Filipino|Filipina|Filipino citizen|single|married|widowed|widower|divorced|of legal age|of lawful age|a resident|an entity)\b)/giu;

    sanitized = sanitized.replace(
        legalPartyPattern,
        REDACTION.NAME + ', '
    );


    /*
     * ==========================================================
     * PASS 14 — "NAME + PERSONAL DESCRIPTION" OCR RESILIENT
     * ==========================================================
     *
     * Catches common forms like:
     *
     * Juan Dela Cruz
     * Filipino
     * 35 years old
     *
     * We only do this when the surrounding context strongly
     * suggests a person's identity.
     */

    sanitized = sanitized.replace(
        /\b(?:Mr\.?|Mrs\.?|Ms\.?|Atty\.?|Dr\.?)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,5}\b/gu,
        REDACTION.NAME
    );


    /*
     * ==========================================================
     * PASS 15 — EXPLICIT PERSONAL DATA LABELS
     * ==========================================================
     */

    const personalDataLabels: RegExp[] = [

        /(?:contact\s*(?:number|no)|mobile\s*(?:number|no)|telephone\s*(?:number|no)|phone\s*(?:number|no))\s*[:#-]?\s*[^\n,;]{5,50}/giu,

        /(?:email\s*(?:address|add)?|e-mail)\s*[:#-]?\s*[^\n,;]{3,100}/giu,

        /(?:personal\s*email|private\s*email)\s*[:#-]?\s*[^\n,;]{3,100}/giu,

        /(?:birthplace|place\s*of\s*birth|lugar\s*ng\s*kapanganakan)\s*[:#-]?\s*[^\n,;]{2,100}/giu,
    ];

    for (const pattern of personalDataLabels) {
        sanitized = sanitized.replace(
            pattern,
            (match) => {
                const lower = match.toLowerCase();

                if (
                    lower.includes('email') ||
                    lower.includes('e-mail')
                ) {
                    return REDACTION.EMAIL;
                }

                if (
                    lower.includes('contact') ||
                    lower.includes('mobile') ||
                    lower.includes('telephone') ||
                    lower.includes('phone')
                ) {
                    return REDACTION.PHONE;
                }

                return REDACTION.UNKNOWN_SENSITIVE;
            }
        );
    }


    /*
     * ==========================================================
     * PASS 16 — RAW LONG NUMERIC SEQUENCES
     * ==========================================================
     *
     * This is a FINAL safety net.
     *
     * Any unusually long numeric sequence is suspicious in a
     * legal document because it can represent:
     * - account number
     * - ID number
     * - membership number
     * - card number
     * - reference number
     *
     * We don't redact ordinary years (2026) or short numbers.
     */

    sanitized = sanitized.replace(
        /\b(?:\d[\s.-]?){9,20}\b/g,
        (match) => {
            const digits = match.replace(/\D/g, '');

            if (digits.length >= 9 && digits.length <= 20) {
                return REDACTION.UNKNOWN_SENSITIVE;
            }

            return match;
        }
    );


    /*
     * ==========================================================
     * PASS 17 — OCR-LIKE LONG DIGIT STRINGS
     * ==========================================================
     */

    const ocrScan = normalizeOcrDigits(sanitized);

    /*
     * If OCR-normalized text contains suspicious 10–20 digit
     * sequences, we cannot reliably map them back to the original
     * text without risking false replacements.
     *
     * Therefore we perform targeted replacement in the ORIGINAL
     * sanitized text using digit/letter tolerant matching.
     */

    const suspiciousOcrNumber =
        /(?:[0-9OoIlLZzSsGgTtBbQq][\s.-]?){10,20}/giu;

    sanitized = sanitized.replace(
        suspiciousOcrNumber,
        (match) => {
            const normalized = normalizeOcrDigits(match);
            const digits = normalized.replace(/\D/g, '');

            if (digits.length >= 10 && digits.length <= 20) {
                return REDACTION.UNKNOWN_SENSITIVE;
            }

            return match;
        }
    );


    /*
     * ==========================================================
     * PASS 18 — GLOBAL CLEANUP OF LEFTOVER EMAIL/PHONE-LIKE DATA
     * ==========================================================
     */

    sanitized = sanitized.replace(
        /[a-z0-9._%+-]+[\s]*@[\s]*[a-z0-9.-]+[\s]*\.[a-z]{2,}/giu,
        REDACTION.EMAIL
    );

    sanitized = sanitized.replace(
        /(?:\+?63|0)\s*9[\s.-]*[0-9OoIlL]{2}[\s.-]*[0-9OoIlL]{3}[\s.-]*[0-9OoIlL]{4}/giu,
        REDACTION.PHONE
    );


    /*
     * ==========================================================
     * PASS 19 — COLLAPSE DUPLICATED REDACTION TOKENS
     * ==========================================================
     *
     * Prevent ugly output like:
     * [REDACTED_NAME][REDACTED_NAME]
     */

    const redactionTokens = Object.values(REDACTION);

    for (const token of redactionTokens) {
        const escaped = escapeRegex(token);

        sanitized = sanitized.replace(
            new RegExp(`(?:${escaped}\\s*){2,}`, 'giu'),
            token
        );
    }


    /*
     * ==========================================================
     * PASS 20 — FINAL NORMALIZATION
     * ==========================================================
     */

    sanitized = sanitized
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();


    return sanitized;
};


/* ============================================================
 * DOCUMENT-SPECIFIC SANITIZER
 * ============================================================ */

/**
 * Use this specifically for OCR/document text.
 *
 * It applies the normal sanitizer and then performs an
 * additional aggressive pass.
 */
export const sanitizeDocumentText = (rawText: string): string => {
    if (!rawText || typeof rawText !== 'string') {
        return '';
    }

    let sanitized = sanitizeLocalText(rawText);


    /*
     * Extra document-level patterns.
     */

    // Notarization / acknowledgment personal details
    sanitized = sanitized.replace(
        /\b(?:subscribed\s+and\s+sworn|personally\s+appeared|appeared\s+before\s+me)[\s\S]{0,250}?/giu,
        (match) => {
            /*
             * Don't destroy the entire legal clause.
             * Only aggressively remove obvious personal fields inside it.
             */
            return sanitizeLocalText(match);
        }
    );


    // Witness / signatory details
    sanitized = sanitized.replace(
        /(?:witness|signatory|signed\s+in\s+the\s+presence\s+of)\s*[:#-]?\s*[^\n]{2,150}/giu,
        REDACTION.SIGNATURE
    );


    return sanitized.trim();
};


/* ============================================================
 * HIGH-RISK DETECTOR
 * ============================================================ */

/**
 * Returns TRUE if suspicious sensitive information still appears
 * to exist after sanitization.
 *
 * This is useful as a FAIL-SAFE before sending data to the AI.
 */
export const containsPotentialSensitiveData = (
    text: string
): boolean => {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const normalized = normalizeForDetection(text);
    const ocrNormalized = normalizeOcrDigits(normalized);


    /*
     * Email
     */
    if (
        /[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.[a-z]{2,}/iu.test(
            normalized
        )
    ) {
        return true;
    }


    /*
     * Philippine mobile
     */
    if (
        /(?:\+?63|0)\s*9[\s.-]*[0-9]{2}[\s.-]*[0-9]{3}[\s.-]*[0-9]{4}/iu.test(
            ocrNormalized
        )
    ) {
        return true;
    }


    /*
     * Long number sequences
     */
    const numericGroups = ocrNormalized.match(
        /(?:\d[\s.-]?){9,20}/g
    );

    if (numericGroups && numericGroups.length > 0) {
        return true;
    }


    /*
     * Explicit sensitive labels
     */
    const sensitiveLabels = [
        /\b(?:password|passcode|pin)\b/iu,
        /\b(?:credit\s*card|debit\s*card)\b/iu,
        /\b(?:bank\s*account|account\s*number)\b/iu,
        /\b(?:sss|gsis|philhealth|pag[\s-]?ibig|hdmf)\b/iu,
        /\b(?:tin|taxpayer\s*identification)\b/iu,
        /\b(?:passport|driver'?s?\s*license|national\s*id|philid|philsys|umid)\b/iu,
    ];

    for (const pattern of sensitiveLabels) {
        if (pattern.test(normalized)) {
            return true;
        }
    }


    return false;
};


/* ============================================================
 * FAIL-SAFE SANITIZATION
 * ============================================================ */

/**
 * Use this BEFORE sending ANY text to the AI.
 *
 * If suspicious information remains after sanitization,
 * we DO NOT send the raw text.
 *
 * Instead, the caller should treat this as a privacy block.
 */
export const sanitizeForAI = (
    rawText: string
): {
    safeText: string;
    blocked: boolean;
    hadRedactions: boolean;
} => {
    if (!rawText || typeof rawText !== 'string') {
        return {
            safeText: '',
            blocked: false,
            hadRedactions: false,
        };
    }

    const safeText = sanitizeLocalText(rawText);

    const hadRedactions = safeText !== rawText;

    /*
     * SECOND SCAN
     *
     * This is important.
     */
    const stillPotentiallySensitive =
        containsPotentialSensitiveData(safeText);

    /*
     * If anything suspicious remains, DON'T attempt to be clever.
     *
     * Return the sanitized text but tell the caller to block it.
     */
    return {
        safeText,
        blocked: stillPotentiallySensitive,
        hadRedactions,
    };
};


/* ============================================================
 * SAFE DOCUMENT API
 * ============================================================ */

/**
 * Stronger version intended for OCR / uploaded legal documents.
 */
export const sanitizeDocumentForAI = (
    rawText: string
): {
    safeText: string;
    blocked: boolean;
    hadRedactions: boolean;
} => {
    if (!rawText || typeof rawText !== 'string') {
        return {
            safeText: '',
            blocked: false,
            hadRedactions: false,
        };
    }

    const safeText = sanitizeDocumentText(rawText);

    const hadRedactions = safeText !== rawText;

    /*
     * FINAL SECONDARY SCAN.
     */
    const blocked = containsPotentialSensitiveData(safeText);

    return {
        safeText,
        blocked,
        hadRedactions,
    };
};