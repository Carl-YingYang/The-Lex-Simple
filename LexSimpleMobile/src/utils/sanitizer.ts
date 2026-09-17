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

/* ============================================================
 * PRIVACY-SAFE MULTI-PAGE PAYLOAD
 * ============================================================ */

export type OcrPageForSanitization = {
    pageId: string;
    sessionId: string;
    pageNumber: number;
    sourceUri: string;
    text: string;
};

export type SanitizedPagePayload = {
    pageNumber: number;
    sanitizedText: string;
    textHash: string;
};

export type SanitizedDocumentApiPayload = {
    documentId: string;
    pageCount: number;
    pages: SanitizedPagePayload[];
};

export type SanitizedPageSummary = SanitizedPagePayload & {
    pageId: string;
    sourceUri: string;
    characterCount: number;
    redactionCount: number;
    hadRedactions: boolean;
};

export type SanitizedDocumentResult = {
    apiPayload: SanitizedDocumentApiPayload;
    sanitizedPages: SanitizedPageSummary[];
    combinedText: string;
    blocked: boolean;
    blockedPageNumbers: number[];
    hadRedactions: boolean;
};

const SHA_256_INITIAL_HASHES = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
] as const;

const SHA_256_CONSTANTS = [
    0x428a2f98,
    0x71374491,
    0xb5c0fbcf,
    0xe9b5dba5,
    0x3956c25b,
    0x59f111f1,
    0x923f82a4,
    0xab1c5ed5,
    0xd807aa98,
    0x12835b01,
    0x243185be,
    0x550c7dc3,
    0x72be5d74,
    0x80deb1fe,
    0x9bdc06a7,
    0xc19bf174,
    0xe49b69c1,
    0xefbe4786,
    0x0fc19dc6,
    0x240ca1cc,
    0x2de92c6f,
    0x4a7484aa,
    0x5cb0a9dc,
    0x76f988da,
    0x983e5152,
    0xa831c66d,
    0xb00327c8,
    0xbf597fc7,
    0xc6e00bf3,
    0xd5a79147,
    0x06ca6351,
    0x14292967,
    0x27b70a85,
    0x2e1b2138,
    0x4d2c6dfc,
    0x53380d13,
    0x650a7354,
    0x766a0abb,
    0x81c2c92e,
    0x92722c85,
    0xa2bfe8a1,
    0xa81a664b,
    0xc24b8b70,
    0xc76c51a3,
    0xd192e819,
    0xd6990624,
    0xf40e3585,
    0x106aa070,
    0x19a4c116,
    0x1e376c08,
    0x2748774c,
    0x34b0bcb5,
    0x391c0cb3,
    0x4ed8aa4a,
    0x5b9cca4f,
    0x682e6ff3,
    0x748f82ee,
    0x78a5636f,
    0x84c87814,
    0x8cc70208,
    0x90befffa,
    0xa4506ceb,
    0xbef9a3f7,
    0xc67178f2,
] as const;

const rotateRight = (
    value: number,
    bits: number
): number => {
    return (
        (value >>> bits) |
        (value << (32 - bits))
    ) >>> 0;
};

const encodeUtf8 = (value: string): number[] => {
    const bytes: number[] = [];

    for (let index = 0; index < value.length; index += 1) {
        let codePoint = value.codePointAt(index);

        if (codePoint === undefined) {
            continue;
        }

        if (codePoint > 0xffff) {
            index += 1;
        }

        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
        } else if (codePoint <= 0x7ff) {
            bytes.push(
                0xc0 | (codePoint >>> 6),
                0x80 | (codePoint & 0x3f)
            );
        } else if (codePoint <= 0xffff) {
            bytes.push(
                0xe0 | (codePoint >>> 12),
                0x80 | ((codePoint >>> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        } else {
            bytes.push(
                0xf0 | (codePoint >>> 18),
                0x80 | ((codePoint >>> 12) & 0x3f),
                0x80 | ((codePoint >>> 6) & 0x3f),
                0x80 | (codePoint & 0x3f)
            );
        }
    }

    return bytes;
};

/**
 * Dependency-free SHA-256 for hashing sanitized text on-device.
 *
 * This is used only for integrity verification. It does not encrypt text.
 */
export const sha256Text = (value: string): string => {
    const bytes = encodeUtf8(value);
    const originalBitLength = bytes.length * 8;

    bytes.push(0x80);

    while (bytes.length % 64 !== 56) {
        bytes.push(0);
    }

    const highBits = Math.floor(
        originalBitLength / 0x100000000
    );
    const lowBits = originalBitLength >>> 0;

    bytes.push(
        (highBits >>> 24) & 0xff,
        (highBits >>> 16) & 0xff,
        (highBits >>> 8) & 0xff,
        highBits & 0xff,
        (lowBits >>> 24) & 0xff,
        (lowBits >>> 16) & 0xff,
        (lowBits >>> 8) & 0xff,
        lowBits & 0xff
    );

    const hashes = [...SHA_256_INITIAL_HASHES];
    const schedule = new Array<number>(64).fill(0);

    for (
        let blockStart = 0;
        blockStart < bytes.length;
        blockStart += 64
    ) {
        for (let wordIndex = 0; wordIndex < 16; wordIndex += 1) {
            const byteIndex = blockStart + wordIndex * 4;
            schedule[wordIndex] = (
                (bytes[byteIndex] << 24) |
                (bytes[byteIndex + 1] << 16) |
                (bytes[byteIndex + 2] << 8) |
                bytes[byteIndex + 3]
            ) >>> 0;
        }

        for (let wordIndex = 16; wordIndex < 64; wordIndex += 1) {
            const previous15 = schedule[wordIndex - 15];
            const previous2 = schedule[wordIndex - 2];
            const smallSigma0 = (
                rotateRight(previous15, 7) ^
                rotateRight(previous15, 18) ^
                (previous15 >>> 3)
            ) >>> 0;
            const smallSigma1 = (
                rotateRight(previous2, 17) ^
                rotateRight(previous2, 19) ^
                (previous2 >>> 10)
            ) >>> 0;

            schedule[wordIndex] = (
                schedule[wordIndex - 16] +
                smallSigma0 +
                schedule[wordIndex - 7] +
                smallSigma1
            ) >>> 0;
        }

        let a = hashes[0];
        let b = hashes[1];
        let c = hashes[2];
        let d = hashes[3];
        let e = hashes[4];
        let f = hashes[5];
        let g = hashes[6];
        let h = hashes[7];

        for (let round = 0; round < 64; round += 1) {
            const bigSigma1 = (
                rotateRight(e, 6) ^
                rotateRight(e, 11) ^
                rotateRight(e, 25)
            ) >>> 0;
            const choose = ((e & f) ^ (~e & g)) >>> 0;
            const temporary1 = (
                h +
                bigSigma1 +
                choose +
                SHA_256_CONSTANTS[round] +
                schedule[round]
            ) >>> 0;
            const bigSigma0 = (
                rotateRight(a, 2) ^
                rotateRight(a, 13) ^
                rotateRight(a, 22)
            ) >>> 0;
            const majority = (
                (a & b) ^
                (a & c) ^
                (b & c)
            ) >>> 0;
            const temporary2 = (
                bigSigma0 + majority
            ) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temporary1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temporary1 + temporary2) >>> 0;
        }

        hashes[0] = (hashes[0] + a) >>> 0;
        hashes[1] = (hashes[1] + b) >>> 0;
        hashes[2] = (hashes[2] + c) >>> 0;
        hashes[3] = (hashes[3] + d) >>> 0;
        hashes[4] = (hashes[4] + e) >>> 0;
        hashes[5] = (hashes[5] + f) >>> 0;
        hashes[6] = (hashes[6] + g) >>> 0;
        hashes[7] = (hashes[7] + h) >>> 0;
    }

    return hashes
        .map((hash) => hash.toString(16).padStart(8, '0'))
        .join('');
};

const countRedactions = (value: string): number => {
    return (
        value.match(/\[REDACTED_[A-Z_]+\]/g) ?? []
    ).length;
};

const assertOrderedCompletePages = (
    pages: OcrPageForSanitization[]
): void => {
    if (!Array.isArray(pages) || pages.length === 0) {
        throw new Error(
            'Walang complete OCR pages na puwedeng linisin.'
        );
    }

    const pageIds = new Set<string>();
    const sourceUris = new Set<string>();

    pages.forEach((page, index) => {
        const expectedPageNumber = index + 1;

        if (page.pageNumber !== expectedPageNumber) {
            throw new Error(
                `Hindi complete o mali ang order ng OCR pages. Inaasahan ang Page ${expectedPageNumber}.`
            );
        }

        if (!page.pageId || pageIds.has(page.pageId)) {
            throw new Error(
                `Duplicate o invalid ang page ID ng Page ${expectedPageNumber}.`
            );
        }

        if (!page.sourceUri || sourceUris.has(page.sourceUri)) {
            throw new Error(
                `Duplicate o invalid ang image source ng Page ${expectedPageNumber}.`
            );
        }

        if (
            typeof page.text !== 'string' ||
            page.text.trim().length < 20
        ) {
            throw new Error(
                `Hindi sapat ang OCR text ng Page ${expectedPageNumber}.`
            );
        }

        pageIds.add(page.pageId);
        sourceUris.add(page.sourceUri);
    });
};

/**
 * Sanitize every OCR page independently, then create the one exact payload
 * accepted by the backend /simplify endpoint.
 *
 * Raw OCR text and image URIs are not included in apiPayload.
 */
export const buildSanitizedDocumentForAI = (
    documentId: string,
    pages: OcrPageForSanitization[]
): SanitizedDocumentResult => {
    const normalizedDocumentId = documentId?.trim();

    if (!normalizedDocumentId) {
        throw new Error(
            'Walang valid document ID para sa analysis.'
        );
    }

    assertOrderedCompletePages(pages);

    const blockedPageNumbers: number[] = [];
    const sanitizedPages: SanitizedPageSummary[] = [];

    for (const page of pages) {
        const privacyResult = sanitizeDocumentForAI(page.text);
        const sanitizedText = privacyResult.safeText.trim();

        if (
            privacyResult.blocked ||
            sanitizedText.length < 20
        ) {
            blockedPageNumbers.push(page.pageNumber);
        }

        sanitizedPages.push({
            pageId: page.pageId,
            sourceUri: page.sourceUri,
            pageNumber: page.pageNumber,
            sanitizedText,
            textHash: sha256Text(sanitizedText),
            characterCount: sanitizedText.length,
            redactionCount: countRedactions(sanitizedText),
            hadRedactions: privacyResult.hadRedactions,
        });
    }

    const combinedText = sanitizedPages
        .map(
            (page) =>
                `--- Page ${page.pageNumber} ---\n${page.sanitizedText}`
        )
        .join('\n\n');

    const apiPayload: SanitizedDocumentApiPayload = {
        documentId: normalizedDocumentId,
        pageCount: sanitizedPages.length,
        pages: sanitizedPages.map((page) => ({
            pageNumber: page.pageNumber,
            sanitizedText: page.sanitizedText,
            textHash: page.textHash,
        })),
    };

    return {
        apiPayload,
        sanitizedPages,
        combinedText,
        blocked: blockedPageNumbers.length > 0,
        blockedPageNumbers,
        hadRedactions: sanitizedPages.some(
            (page) => page.hadRedactions
        ),
    };
};


