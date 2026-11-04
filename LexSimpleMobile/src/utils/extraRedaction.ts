/**
 * LEX-SIMPLE EXTRA REDACTION UTILITIES
 *
 * DISENYO:
 * - normalizeOcrNoise(text): inaayos ang mga karaniwang OCR noise
 *   (zero-width characters, fullwidth chars, sirang email, kabilisang
 *   "J U A N", "|" sa gitna ng digits) PARA MAS MADALING MAHULI ng mga
 *   regex sa sanitizer. Walang external import (iwas circular import).
 * - redactExtraPatterns(text): karagdagang redaction passes na tumatakbo
 *   PAGKATAPOS ng pangunahing sanitizing — obfuscated emails, social
 *   handles, DOB/address sa konteksto, at mga serye ng vehicle/title
 *   numbers. Hindi ginagalaw ang mga umiiral nang [REDACTED_*] tokens.
 *
 * LIMITASYON:
 * - Regex-based pa rin ito — hindi perpekto. May mga false negative na
 *   maaaring lumampas (kaya may blocked/fail-safe check pa rin ang
 *   sanitizer) at paminsan-minsang false positive. May user review pa
 *   rin bago ipadala ang text sa AI.
 */

// Hardcoded (huwag i-import mula sa sanitizer.ts — iwas circular import).
const REDACTED_EMAIL = '[REDACTED_EMAIL]';
const REDACTED_SOCIAL_ACCOUNT = '[REDACTED_SOCIAL_ACCOUNT]';
const REDACTED_DATE_OF_BIRTH = '[REDACTED_DATE_OF_BIRTH]';
const REDACTED_ADDRESS = '[REDACTED_ADDRESS]';
const REDACTED_ID = '[REDACTED_ID]';

const COMMON_TLD_SOURCE =
    'com|net|org|edu|gov|ph|co|io|me|info|biz|us|uk';

/* ============================================================
 * normalizeOcrNoise
 * ============================================================ */

/**
 * Inaayos ang mga karaniwang OCR noise bago pumasok ang text sa mga
 * detection pass:
 * 1. Tinatanggal ang zero-width characters (\u200b–\u200d, \uFEFF).
 * 2. NFKC normalization para sa fullwidth characters (＠ → @, ｎ → n).
 * 3. Inaayos ang email na may OCR error:
 *    "name@yahoo,com" → "name@yahoo.com"
 *    "name @ gmail .com" → "name@gmail.com"
 * 4. Cinocollapse ang spaced na letra: 3+ single uppercase letters na
 *    pinaghihiwalay ng espasyo ("J U A N") → "JUAN".
 * 5. Sa loob ng sunud-sunod na digits, ang "|" ay ginagawang espasyo
 *    ("0917 | 123 | 4567" → "0917 123 4567").
 */
export const normalizeOcrNoise = (text: string): string => {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let output = text
        // Zero-width characters
        .replace(/[\u200b-\u200d\uFEFF]/g, '')
        // Fullwidth → normal (＠ → @, atbp.)
        .normalize('NFKC');

    // Email na may comma bago ang TLD: "name@yahoo,com" → ".com"
    output = output.replace(
        new RegExp(
            `(@[A-Za-z0-9.-]+)[ \\t]*,[ \\t]*(${COMMON_TLD_SOURCE})(?![A-Za-z0-9])`,
            'gi'
        ),
        '$1.$2'
    );

    // Email na may espasyo: "name @ gmail .com" → "name@gmail.com"
    output = output.replace(
        new RegExp(
            `([A-Za-z0-9._%+-]+)[ \\t]*@[ \\t]*` +
                `([A-Za-z][A-Za-z0-9-]*(?:\\.[A-Za-z0-9-]+)*)` +
                `[ \\t]*\\.[ \\t]*(${COMMON_TLD_SOURCE})(?![A-Za-z0-9])`,
            'gi'
        ),
        '$1@$2.$3'
    );

    // Spaced na letra: "J U A N" → "JUAN" (3+ na single uppercase)
    output = output.replace(
        /(?:\b[A-Z][ \t]+){2,}[A-Z]\b/g,
        (match) => match.replace(/[ \t]+/g, '')
    );

    // "|" sa loob ng sunud-sunod na digits → espasyo
    output = output.replace(/(\d)[ \t]*\|(?=[ \t]*\d)/g, '$1 ');

    return output;
};

/* ============================================================
 * redactExtraPatterns
 * ============================================================ */

/** Hindi galawin ang mga umiiral nang [REDACTED_*] tokens. */
const isAlreadyRedacted = (match: string): boolean =>
    match.includes('[REDACTED_');

/**
 * Karagdagang redaction passes na tumatakbo pagkatapos ng pangunahing
 * sanitizing:
 * - Obfuscated email: "x (at) y (dot) com", "[at]", "[dot]"
 * - Social handle: @handle (3–30 chars) at "Messenger/Viber/Telegram/
 *   IG/Instagram/Facebook/FB: <value>"
 * - Petsa ng kapanganakan sa konteksto ("ipinanganak noong", "born on",
 *   "Date of Birth" — kasama ang Tagalog na buwan)
 * - Lugar ng kapanganakan / tirahan ("Place of Birth:", "born ... in/sa",
 *   "residing at", "naninirahan sa", "address:", Unit/Tower/Bldg/Blk/
 *   Lot/Phase/Subd/Village/Brgy fragments)
 * - Plate No., Engine No., Chassis No., MV File No., TCT/OCT/CCT No.,
 *   Tax Declaration No. (label ang natitira, [REDACTED_ID] ang numero)
 *
 * HUWAG mag-redact ng pangalan ng lungsod sa labas ng ganitong konteksto
 * — ang "City of Malolos" sa court header ay dapat manatili.
 */
export const redactExtraPatterns = (text: string): string => {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let output = text;

    /* --- Obfuscated email: "x (at) y (dot) com", "[at]", "[dot]" --- */
    output = output.replace(
        /[A-Za-z0-9._%+-]+\s*(?:\(\s*at\s*\)|\[\s*at\s*\])\s*[A-Za-z0-9-]+(?:\s*(?:\.\s*|\(\s*dot\s*\)|\[\s*dot\s*\])\s*[A-Za-z0-9-]+)+/gi,
        (match) =>
            isAlreadyRedacted(match)
                ? match
                : REDACTED_EMAIL
    );

    /* --- Social handle: @handle (3–30 chars) --- */
    output = output.replace(
        /(^|[^A-Za-z0-9._%+-])@[A-Za-z0-9._-]{3,30}(?=$|[^A-Za-z0-9._-])/g,
        (match, prefix: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${prefix}${REDACTED_SOCIAL_ACCOUNT}`
    );

    /* --- "Messenger/Viber/Telegram/IG/Instagram/Facebook/FB: <value>" --- */
    output = output.replace(
        /\b(Messenger|Viber|Telegram|IG|Instagram|Facebook|FB)\s*[:#]\s*[^\n;]{2,80}/gi,
        (match, label: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${label}: ${REDACTED_SOCIAL_ACCOUNT}`
    );

    /* --- Petsa ng kapanganakan sa konteksto (EN + TL na buwan) --- */
    // "ipinanganak noong Enero 5, 1990" / "born on May 5, 1990" /
    // "Date of Birth: 05/05/1990" — label ang natitira.
    const dateValue =
        /(?:[0-9]{1,2}[\/.-][0-9]{1,2}[\/.-][0-9]{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Enero|Pebrero|Marso|Abril|Mayo|Hunyo|Hulyo|Agosto|Setyembre|Oktubre|Nobyembre|Disyembre)\s+[0-9]{1,2},?\s+[0-9]{4})/i;

    output = output.replace(
        new RegExp(
            `(ipinanganak\\s+noong|ipinanganak\\s+sa|born\\s+on|` +
                `date\\s+of\\s+birth|birth\\s+date|` +
                `petsa\\s+ng\\s+kapanganakan|kaarawan)` +
                `\\s*[:#.-]?\\s*` +
                dateValue.source,
            'gi'
        ),
        (match, label: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${label} ${REDACTED_DATE_OF_BIRTH}`
    );

    /* --- Lugar ng kapanganakan: "Place of Birth: ..." / "born ... in/sa" --- */
    output = output.replace(
        /\b(place\s+of\s+birth|birthplace|lugar\s+ng\s+kapanganakan)\s*[:#.-]?\s*[^\n,;]{2,60}/gi,
        (match, label: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${label} ${REDACTED_ADDRESS}`
    );

    output = output.replace(
        /(\bborn\b[^.\n;,]{0,80}?\b(?:in|sa)\s+)([A-Z][^\n,;]{2,60})/gi,
        (match, prefix: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${prefix}${REDACTED_ADDRESS}`
    );

    /* --- Address fragment pagkatapos ng Unit/Tower/Bldg/Blk/Lot/... --- */
    // Hanggang kuwit o tuldok; max 60 chars. Label ang natitira.
    output = output.replace(
        /\b(Unit|Tower|Bldg|Building|Blk|Block|Lot|Phase|Subd\.?|Subdivision|Village|Brgy\.?|Barangay)\s*[:#.-]?\s*[^\n,.;]{1,60}/gi,
        (match, label: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${label} ${REDACTED_ADDRESS}`
    );

    /* --- Buong parirala pagkatapos ng "residing at" / "address:" --- */
    // Hanggang tuldok o bagong linya. Hindi kinakapa ang mga lungsod sa
    // labas ng ganitong konteksto (court header ay mananatili).
    output = output.replace(
        /\b((?:a\s+)?resident\s+of|residing\s+(?:at|in)|located\s+(?:at|in)|naninirahan\s+sa|address\s*:)\s*[^\n.]{1,200}/gi,
        (match, label: string) =>
            isAlreadyRedacted(match)
                ? match
                : `${label} ${REDACTED_ADDRESS}`
    );

    /* --- Vehicle / title numbers: label ang natitira --- */
    output = output.replace(
        /(\b(?:Plate|Engine|Chassis|MV\s+File|TCT|OCT|CCT|Tax\s+Declaration)\s*(?:No\.?|Number|#)\s*[:#.-]?\s*)([A-Z0-9][A-Z0-9-]{1,20})/gi,
        (match, label: string, value: string) =>
            isAlreadyRedacted(match) || !/\d/.test(value)
                ? match
                : `${label}${REDACTED_ID}`
    );

    return output;
};