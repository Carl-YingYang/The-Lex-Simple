/**
 * LEX-SIMPLE NAME REDACTION UTILITIES
 *
 * DISENYO:
 * - collectNameCandidates(rawText): kinukuha ang mga posibleng PANGALAN ng
 *   tao mula sa RAW na text (bago mag-redact) gamit ang mga contextual
 *   rules (R1–R8) na karaniwan sa Philippine legal documents. Dapat ito
 *   tawagin SA RAW text — hindi sa partially-redacted na text.
 * - applyNameRegistry(text, names): pinapalitan ang bawat occurrence ng
 *   mga nakolektang pangalan (kasama ang mga variant nito) ng
 *   '[REDACTED_NAME]'. OCR-confusable ang matching (l/I/1, O/0, rn/m).
 *
 * Bakit hiwalay na file at hindi nasa sanitizer.ts: ang '[REDACTED_NAME]'
 * string ay naka-hardcode dito para iwas circular import — hindi ito
 * nag-i-import ng kahit ano mula sa labas.
 *
 * LIMITASYON (mahalaga):
 * - Hindi perpekto ang detection ng pangalan. May mga pangalang hindi
 *   matutukoy (walang context) at may mga salita/langok na maaaring
 *   maling markahan (hal. venue header sa itaas ng "Notary Public").
 * - Mas madaling "over-redact" kaysa "under-redact" ang bias ng disenyo.
 * - KAYA MAY USER REVIEW PA RIN: dapat nakikita ng user ang sanitized
 *   text bago ito ipadala sa AI. Huwag ituring na perpektong privacy
 *   guarantee ang mga utilidad na ito.
 */

/* ============================================================
 * CONSTANTS AT STOPLISTS
 * ============================================================ */

// Hardcoded (huwag i-import mula sa sanitizer.ts — iwas circular import).
const REDACTED_NAME = '[REDACTED_NAME]';

/**
 * R6 stoplist: ALL-CAPS na legal headings/phrases na HINDI pangalan.
 * Constant na array — madaling dagdagan kung kailangan.
 */
const LEGAL_CAPS_STOPLIST: readonly string[] = [
    'REPUBLIC OF THE PHILIPPINES',
    'MUNICIPAL TRIAL COURT',
    'REGIONAL TRIAL COURT',
    'METROPOLITAN TRIAL COURT',
    'BRANCH',
    'ORDER',
    'SO ORDERED',
    'CRIMINAL CASE',
    'CIVIL CASE',
    'AFFIDAVIT OF',
    'CONTRACT OF',
    'DEED OF',
    'KNOW ALL MEN',
    'WHEREAS',
    'NOW THEREFORE',
    'LAW OFFICE OF',
];

/**
 * Mga salitang HINDI puwedeng maging name token (court/city/branch, atbp.
 * — "atbp.": madaling dagdagan).
 */
const COMMON_WORD_STOPLIST: readonly string[] = [
    'court', 'city', 'branch', 'republic', 'office', 'philippines',
    'province', 'municipality', 'barangay', 'government', 'department',
    'bureau', 'commission', 'region', 'island', 'metropolitan',
    'provincial', 'municipal', 'notary', 'public', 'ordered', 'whereof',
    'thereof', 'herein', 'hereby', 'hereinafter', 'witnesseth',
    'affidavit', 'contract', 'deed', 'agreement', 'versus', 'case',
    'page', 'annex', 'exhibit', 'receipt', 'invoice', 'country',
    'station', 'precinct', 'prosecution', 'plaintiff', 'defendant',
    'complainant', 'respondent', 'petitioner', 'accused', 'affiant',
    'witness', 'lessor', 'lessee', 'landlord', 'tenant', 'borrower',
    'lender', 'vendor', 'vendee', 'counsel', 'attorney', 'judge',
    'justice', 'prosecutor', 'sheriff', 'clerk', 'register', 'registry',
];

/** R1 — mga title bago ang pangalan. */
const TITLE_PATTERN_SOURCE =
    'Atty|Attorney|Hon|Honorable|Judge|Justice|Prosecutor|Mr|Mrs|Ms|Miss|' +
    'Dr|Engr|Arch|Fr|Gng|Ginoong|Binibini';

/** R2 — mga role na karaniwang sinusundan ng pangalan. */
const ROLE_PATTERN_SOURCE: string = [
    'private complainant',
    'prosecution attorney',
    'private prosecutor',
    'public attorney',
    'complainant',
    'accused',
    'plaintiff',
    'defendant',
    'petitioner',
    'respondent',
    'witness',
    'affiant',
    'lessor',
    'lessee',
    'landlord',
    'tenant',
    'borrower',
    'lender',
    'buyer',
    'seller',
    'vendor',
    'vendee',
    'employee',
    'employer',
    'mortgagor',
    'mortgagee',
    'counsel',
]
    .sort((left, right) => right.length - left.length)
    .join('|');

/** Particles sa mga apelyido (de la Cruz, Delos Santos, Van Ong, atbp.). */
const PARTICLE_WORDS: ReadonlySet<string> = new Set([
    'de', 'del', 'dela', 'delos', 'la', 'san', 'santa', 'sta', 'ng',
    'mc', 'mac', 'van', 'von',
]);

const NAME_SUFFIX_PATTERN = /^(?:jr|sr|ii|iii|iv)$/i;

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ============================================================
 * HELPERS — TOKEN CLASSIFICATION
 * ============================================================ */

const isParticleWord = (word: string): boolean => {
    if (word.toLowerCase() === "o'") {
        return true;
    }
    return PARTICLE_WORDS.has(word.replace(/\.$/, '').toLowerCase());
};

const isCommonWord = (word: string): boolean =>
    COMMON_WORD_STOPLIST.includes(
        word.replace(/\.$/, '').toLowerCase()
    );

const isRedactionToken = (word: string): boolean =>
    /^\[REDACTED_[A-Z_]+\]$/i.test(word);

/**
 * Valid ba ang token bilang bahagi ng pangalan?
 * Capitalized, ALL-CAPS, particle, initial (M.), suffix (Jr., III),
 * o hyphenated (Santos-Reyes). Hindi tinatanggap ang digits at ang mga
 * salita sa COMMON_WORD_STOPLIST.
 */
const isValidNameToken = (word: string): boolean => {
    if (!word || isRedactionToken(word) || isCommonWord(word)) {
        return false;
    }
    if (NAME_SUFFIX_PATTERN.test(word)) {
        return true;
    }
    if (/^[A-Z]\.?$/.test(word)) {
        return true;
    }
    if (isParticleWord(word)) {
        return true;
    }
    return /^[A-Z][A-Za-z.'-]*$/.test(word);
};

/**
 * OCR-tolerant na unang token: pagkatapos ng title/role, puwedeng
 * magsimula sa maliit na "l" o sa "1" (hal. "lan" = "Ian").
 */
const isOcrTolerantFirstToken = (word: string): boolean =>
    /^(?:l|1)[A-Za-z.'-]+$/.test(word) && !isCommonWord(word);

type ScanResult = {
    tokens: string[];
    endIndex: number;
};

/**
 * Name token scanner — kinukuha ang pinakamahabang valid na pangalan
 * (1..maxTokens) simula sa startIndex.
 *
 * Huminto sa: lowercase na salita (hindi particle), ";", ":", "(", "[",
 * digits, at comma (maliban kung suffix ang susunod: "Cruz, Jr.").
 */
const scanNameTokens = (
    text: string,
    startIndex: number,
    maxTokens: number,
    allowOcrTolerantFirst: boolean
): ScanResult => {
    const tokens: string[] = [];
    let index = startIndex;
    let consumedEnd = startIndex;

    while (tokens.length < maxTokens && index < text.length) {
        const whitespace = /^[ \t]+/.exec(text.slice(index));
        if (whitespace) {
            index += whitespace[0].length;
        }
        if (index >= text.length) {
            break;
        }

        const currentChar = text[index];

        if (
            currentChar === ';' ||
            currentChar === ':' ||
            currentChar === '(' ||
            currentChar === '['
        ) {
            break;
        }
        if (/[0-9]/.test(currentChar)) {
            break;
        }
        if (currentChar === ',') {
            // Ituloy lang ang comma kung suffix (Jr., Sr., II, III) ang
            // susunod na token.
            const afterComma = /^,[ \t]*([A-Za-z.]+)/.exec(
                text.slice(index)
            );
            if (afterComma && NAME_SUFFIX_PATTERN.test(afterComma[1])) {
                index += 1;
                continue;
            }
            break;
        }

        const wordMatch = /^[A-Za-z][A-Za-z.'-]*/.exec(
            text.slice(index)
        );
        if (!wordMatch) {
            break;
        }
        const word = wordMatch[0];

        const isFirst = tokens.length === 0;
        const valid = isFirst
            ? isValidNameToken(word) ||
              (allowOcrTolerantFirst && isOcrTolerantFirstToken(word))
            : isValidNameToken(word);

        if (!valid) {
            break;
        }

        index += wordMatch[0].length;
        consumedEnd = index;
        tokens.push(word);
    }

    return { tokens, endIndex: consumedEnd };
};

/** Alisin ang mga leading titles (Atty., Judge, atbp.) sa candidate. */
const TITLE_STRIP_PATTERN = new RegExp(
    `^(?:(?:${TITLE_PATTERN_SOURCE})\\.?\\s+)+`,
    'i'
);

/**
 * Linisin at i-validate ang isang name candidate. Nagbabalik ng null
 * kung hindi pwede (may digit, puro stoplist words, muy corto/largo,
 * o may [REDACTED_...] token).
 */
const cleanCandidate = (raw: string): string | null => {
    let value = String(raw || '')
        .replace(/\s+/g, ' ')
        .replace(/^[,\s]+|[,\s]+$/g, '')
        .trim();

    if (!value) {
        return null;
    }

    // Panatilihin sa text ang titles — alisin lang sa candidate.
    value = value.replace(TITLE_STRIP_PATTERN, '').trim();
    if (!value) {
        return null;
    }

    // Petsa, numero, atbp. — hindi pangalan.
    if (/\d/.test(value)) {
        return null;
    }
    // Mga label line ("Copy furnished:", "cc:") ay hindi pangalan.
    if (/[;:]$/.test(value)) {
        return null;
    }
    if (value.length < 3 || value.length > 60) {
        return null;
    }
    if (!/[A-Za-z]/.test(value)) {
        return null;
    }
    if (/\[REDACTED_/i.test(value)) {
        return null;
    }

    const words = value.split(' ').filter(Boolean);

    // Dapat may kahit isang totoong name word (hindi particle/initial/
    // suffix/stoplist).
    const hasNameWord = words.some(
        (word) =>
            !isCommonWord(word) &&
            !isParticleWord(word) &&
            !NAME_SUFFIX_PATTERN.test(word) &&
            !/^[A-Za-z]\.?$/.test(word)
    );
    if (!hasNameWord) {
        return null;
    }

    return value;
};

type AddName = (raw: string) => void;

/**
 * R6 helper: ALL-CAPS na legal phrase ba (heading/caption, hindi
 * pangalan)? Tinitingnan ang LEGAL_CAPS_STOPLIST (prefix match sa
 * parehong direksyon) at ang COMMON_WORD_STOPLIST per token.
 */
const isLegalCapsPhrase = (candidate: string): boolean => {
    const upper = candidate.toUpperCase();
    if (
        LEGAL_CAPS_STOPLIST.some(
            (entry) =>
                upper === entry ||
                upper.startsWith(entry + ' ') ||
                entry.startsWith(upper)
        )
    ) {
        return true;
    }
    return candidate
        .split(/\s+/)
        .some((word) => isCommonWord(word));
};

/* ============================================================
 * RULES R1–R8 (bawat isa ay hiwalay na helper)
 * ============================================================ */

/**
 * R1 — TITLE + PANGALAN:
 * "Atty. Juan Dela Cruz", "Judge Reyes", "Dr. Santos-Reyes".
 * 1–4 name tokens pagkatapos ng title.
 */
const collectFromTitles = (text: string, add: AddName): void => {
    const pattern = new RegExp(
        `\\b(?:${TITLE_PATTERN_SOURCE})\\b\\.?,?[ \\t]+`,
        'gi'
    );
    for (const match of text.matchAll(pattern)) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            4,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }
};

/**
 * R2 — ROLE + PANGALAN (may opsyonal na ":" "," "-" separator):
 * "private complainant Juan Dela Cruz", "accused: Reyes".
 */
const collectFromRoles = (text: string, add: AddName): void => {
    const pattern = new RegExp(
        `\\b(?:${ROLE_PATTERN_SOURCE})\\b[ \\t]*[:,\\-]?[ \\t]*`,
        'gi'
    );
    for (const match of text.matchAll(pattern)) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            4,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }
};

/**
 * R3 — PANGALAN + (ROLE):
 * "Roy Faustino Pabio (accused)", "(for the accused)",
 * "(private complainant)", "(counsel)". Kuha ng tokens mula sa dulo
 * (pinakamalapit sa parenthesis) pabalik.
 */
const collectFromParentheticalRoles = (
    text: string,
    add: AddName
): void => {
    const pattern = new RegExp(
        `([A-Za-z][A-Za-z.'-]*(?:[ \\t\\n]+[A-Za-z][A-Za-z.'-]*)*)` +
            `[ \\t]*\\([ \\t]*(?:for[ \\t]+the[ \\t]+)?` +
            `(?:${ROLE_PATTERN_SOURCE})\\b`,
        'gi'
    );
    for (const match of text.matchAll(pattern)) {
        const words = match[1].split(/[ \t\n]+/).filter(Boolean);
        const tokens: string[] = [];
        for (
            let index = words.length - 1;
            index >= 0 && tokens.length < 5;
            index -= 1
        ) {
            const word = words[index];
            if (!isValidNameToken(word)) {
                break;
            }
            tokens.unshift(word);
        }
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }
};

/**
 * R4 — INTRO PATTERNS:
 * "between X and Y", "I, X,", "Ako si X", "represented by [its title,] X",
 * "in the presence of X", "executed by X", pangalan bago ang
 * "of legal age", "Dear Mr./Ms. X".
 */
const collectFromIntros = (text: string, add: AddName): void => {
    // "between X and Y"
    for (const match of text.matchAll(/\bbetween\b/gi)) {
        const xScan = scanNameTokens(
            text,
            match.index + match[0].length,
            5,
            true
        );
        if (xScan.tokens.length === 0) {
            continue;
        }
        add(xScan.tokens.join(' '));
        const andMatch = /^[ \t]*,?[ \t]*\band\b[ \t]*/i.exec(
            text.slice(xScan.endIndex)
        );
        if (andMatch) {
            const yScan = scanNameTokens(
                text,
                xScan.endIndex + andMatch[0].length,
                5,
                true
            );
            if (yScan.tokens.length > 0) {
                add(yScan.tokens.join(' '));
            }
        }
    }

    // "I, X,"
    for (const match of text.matchAll(/\bI,[ \t]+/g)) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            5,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }

    // "Ako si X"
    for (const match of text.matchAll(/\bako[ \t]+si[ \t]+/gi)) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            5,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }

    // "represented by [its title,] X"
    for (const match of text.matchAll(/\brepresented[ \t]+by\b/gi)) {
        let cursor = match.index + match[0].length;
        const introPattern = new RegExp(
            `^[ \\t]*(?:(?:its|his|her|the)[ \\t]+)?` +
                `(?:(?:${TITLE_PATTERN_SOURCE})|President|` +
                `Vice[ \\t-]?President|Treasurer|Secretary|Manager|` +
                `Director|Officer|Representative|Agent)\\b\\.?,?[ \\t]*`,
            'i'
        );
        let introMatch = introPattern.exec(text.slice(cursor));
        while (introMatch) {
            cursor += introMatch[0].length;
            introMatch = introPattern.exec(text.slice(cursor));
        }
        const { tokens } = scanNameTokens(text, cursor, 4, true);
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }

    // "in the presence of X"
    for (const match of text.matchAll(
        /\bin[ \t]+the[ \t]+presence[ \t]+of\b/gi
    )) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            5,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }

    // "executed by X"
    for (const match of text.matchAll(/\bexecuted[ \t]+by\b/gi)) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            5,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }

    // Pangalan bago ang "of legal age" (backward walk).
    for (const match of text.matchAll(
        /\bof[ \t]+legal[ \t]+age\b/gi
    )) {
        const before = text.slice(0, match.index);
        const words = before.split(/[ \t\n]+/).filter(Boolean);
        const tokens: string[] = [];
        for (
            let index = words.length - 1;
            index >= 0 && tokens.length < 5;
            index -= 1
        ) {
            const word = words[index].replace(/,+$/, '');
            if (!isValidNameToken(word)) {
                break;
            }
            tokens.unshift(word);
        }
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }

    // "Dear Mr./Ms. X" (salamwow sa liham)
    for (const match of text.matchAll(
        /\bDear[ \t]+(?:(?:Mr|Ms|Mrs|Atty|Dr)\b\\.?)[ \t]+/gi
    )) {
        const { tokens } = scanNameTokens(
            text,
            match.index + match[0].length,
            4,
            true
        );
        if (tokens.length > 0) {
            add(tokens.join(' '));
        }
    }
};

/** Pure underscore/tuldok/gitling na linya (signature blank). */
const isSignatureSpacerLine = (line: string): boolean =>
    /^[ \t]*[_\-.]{4,}[ \t]*$/.test(line);

/**
 * R5 — SIGNATURE BLOCKS: ang 1–2 hindi-blankong linya sa itaas ng
 * linyang may Lessee, Lessor, Affiant, Witness, Borrower, Presiding
 * Judge, Judge, Notary Public, Clerk of Court, Counsel; at ang linya
 * pagkatapos ng linyang puro underscore/tuldok/gitling. Kasama ang
 * garbled na linya (hal. "GAYLE ANGEL) M. RECTO").
 */
const collectFromSignatureBlocks = (
    text: string,
    add: AddName
): void => {
    const labelPattern =
        /\b(?:Lessee|Lessor|Affiant|Witness|Borrower|Presiding[ \t]+Judge|Judge|Notary[ \t]+Public|Clerk[ \t]+of[ \t]+Court|Counsel)\b/i;
    const lines = text.split('\n');

    lines.forEach((line, index) => {
        // (a) mga linya sa itaas ng signature label
        if (labelPattern.test(line)) {
            const above: string[] = [];
            let cursor = index - 1;
            while (cursor >= 0 && above.length < 2) {
                const candidate = lines[cursor];
                if (!candidate.trim() || isSignatureSpacerLine(candidate)) {
                    cursor -= 1;
                    continue;
                }
                above.unshift(candidate.trim());
                cursor -= 1;
            }
            above.forEach((value) => add(value));
        }

        // (b) linya pagkatapos ng pure underscore/tuldok/gitling na linya
        if (
            isSignatureSpacerLine(line) &&
            index + 1 < lines.length
        ) {
            const next = lines[index + 1];
            if (next.trim() && !isSignatureSpacerLine(next)) {
                add(next.trim());
            }
        }
    });
};

/**
 * R6 — ALL-CAPS NA PANGALAN: 2–5 tokens (puwedeng initial gaya ng
 * "M."), hindi nasa LEGAL_CAPS_STOPLIST, kapag sinusundan ng role word
 * ("Plaintiff,", "Accused.") o nasa signature position (nahuhuli na ng
 * R5 ang signature position).
 */
const collectAllCapsNames = (text: string, add: AddName): void => {
    const pattern = new RegExp(
        '\\b(?:[A-Z][A-Z.\'-]*|[A-Z]\\.)' +
            '(?:[ \\t]+(?:[A-Z][A-Z.\'-]*|[A-Z]\\.)){1,4}' +
            '\\b\\s*[,.;:\\-]?\\s*(?=(?:' +
            ROLE_PATTERN_SOURCE +
            ')\\b)',
        'g'
    );
    for (const match of text.matchAll(pattern)) {
        const candidate = match[0]
            .replace(/[,.;:\-]\s*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (candidate && !isLegalCapsPhrase(candidate)) {
            add(candidate);
        }
    }
};

/**
 * R7 — "SURNAME, GIVEN [M.]" na ALL-CAPS (hal. "REYES, JUAN M.").
 * Ni-normalize sa "GIVEN [M.] SURNAME" at idinaragdag din ang orihinal
 * na "SURNAME, GIVEN" form.
 */
const collectSurnameFirstNames = (
    text: string,
    add: AddName
): void => {
    const pattern =
        /\b([A-Z][A-Z.'-]{2,})\s*,\s*([A-Z][A-Z.'-]{2,})(?:\s+([A-Z]\.?))?\b/g;
    for (const match of text.matchAll(pattern)) {
        const surname = match[1];
        const given = match[2];
        const initial = match[3];
        if (isCommonWord(surname) || isCommonWord(given)) {
            continue;
        }
        if (isLegalCapsPhrase(`${surname} ${given}`)) {
            continue;
        }
        add(
            initial
                ? `${given} ${initial} ${surname}`
                : `${given} ${surname}`
        );
        add(`${surname}, ${given}${initial ? ` ${initial}` : ''}`);
    }
};

/**
 * R8 — mga linya pagkatapos ng "Copy furnished" o "cc:": alisin ang
 * numbering, kunin ang bahaging bago ang "(", maliban kung nagsisimula
 * sa Office, Department, Bureau, Court, Republic, Registry.
 */
const collectCopyFurnished = (text: string, add: AddName): void => {
    const markerPattern = /^\s*(?:copy\s+furnished|cc\s*:)/i;
    const lines = text.split('\n');

    lines.forEach((line, index) => {
        const marker = markerPattern.exec(line);
        if (!marker) {
            return;
        }

        const entries: string[] = [];
        const remainder = line
            .slice(marker.index + marker[0].length)
            .trim();
        if (remainder) {
            entries.push(remainder);
        }
        for (
            let cursor = index + 1;
            cursor < lines.length && entries.length < 5;
            cursor += 1
        ) {
            const next = lines[cursor].trim();
            if (!next) {
                break;
            }
            entries.push(next);
        }

        for (const entry of entries) {
            let value = entry.replace(/\s+/g, ' ').trim();
            // Alisin ang numbering: "1.", "a.", "(a)"
            value = value.replace(
                /^(?:\d+[.)]|[A-Za-z][.)]|\([A-Za-z0-9]\))\s+/,
                ''
            );
            // Alisin din ang sariling "cc:" / "Copy furnished:" marker
            // ng mga sumunod na linya na cc entry din.
            value = value.replace(
                /^(?:cc\s*:|copy\s+furnished\s*:?)[ \t]*/i,
                ''
            );
            // Kunin ang bahagi bago ang "("
            const parenIndex = value.indexOf('(');
            if (parenIndex > 0) {
                value = value.slice(0, parenIndex).trim();
            }
            if (!value) {
                continue;
            }
            // Maliban kung opisina/korte ang simula
            if (
                /^(?:office|department|bureau|court|republic|registry)\b/i.test(
                    value
                )
            ) {
                continue;
            }
            add(value);
        }
    });
};

/* ============================================================
 * PUBLIC: collectNameCandidates
 * ============================================================ */

/**
 * Kolektahin ang mga posibleng pangalan mula sa RAW na text (bago
 * mag-redact), gamit ang rules R1–R8. Ang result ay unique at naka-sort
 * na pinakamahaba muna (para ang buong pangalan ang maunang mareplace
 * sa applyNameRegistry).
 */
export const collectNameCandidates = (rawText: string): string[] => {
    if (!rawText || typeof rawText !== 'string') {
        return [];
    }

    const discovered = new Map<string, string>();
    const add: AddName = (raw: string) => {
        const cleaned = cleanCandidate(raw);
        if (cleaned) {
            const key = cleaned.toLowerCase();
            if (!discovered.has(key)) {
                discovered.set(key, cleaned);
            }
        }
    };

    collectFromTitles(rawText, add);
    collectFromRoles(rawText, add);
    collectFromParentheticalRoles(rawText, add);
    collectFromIntros(rawText, add);
    collectFromSignatureBlocks(rawText, add);
    collectAllCapsNames(rawText, add);
    collectSurnameFirstNames(rawText, add);
    collectCopyFurnished(rawText, add);

    return [...discovered.values()].sort(
        (left, right) => right.length - left.length
    );
};

/* ============================================================
 * PUBLIC: applyNameRegistry
 * ============================================================ */

/**
 * Gawaing OCR-tolerant na regex pattern para sa isang token:
 * l/I/1, O/0, at rn/m ay mapagpapalit.
 */
const buildOcrTolerantTokenPattern = (token: string): string => {
    let pattern = '';
    let index = 0;

    while (index < token.length) {
        if (token.slice(index, index + 2).toLowerCase() === 'rn') {
            pattern += '(?:rn|m)';
            index += 2;
            continue;
        }
        const char = token[index];
        const lower = char.toLowerCase();
        if (lower === 'l' || lower === 'i' || char === '1') {
            pattern += '[il1]';
        } else if (lower === 'o' || char === '0') {
            pattern += '[o0]';
        } else if (lower === 'm') {
            pattern += '(?:m|rn)';
        } else {
            pattern += escapeRegex(char);
        }
        index += 1;
    }

    return pattern;
};

/**
 * Buuin ang whole-word, case-insensitive, OCR-confusable na pattern ng
 * isang name variant. Ang mga token ay pinaghihiwalay ng whitespace
 * (may opsyonal na comma/period) para tumugma kahit nag-wrap ang linya.
 */
const buildVariantPattern = (variant: string): RegExp | null => {
    const tokens = variant.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
        return null;
    }

    const tokenPatterns = tokens.map((token) => {
        const trailing = token.endsWith(',') ? ',' : '';
        const core = token.replace(/[,\.]+$/, '');
        if (!core) {
            return null;
        }
        const body = buildOcrTolerantTokenPattern(core);
        return `${body}${trailing ? '\\,' : ''}\\.?`;
    });

    if (tokenPatterns.some((piece) => piece === null)) {
        return null;
    }

    const joined = (tokenPatterns as string[]).join('\\s*,?\\s*');

    try {
        return new RegExp(
            `(^|[^\\p{L}\\p{N}])${joined}(?=$|[^\\p{L}\\p{N}])`,
            'giu'
        );
    } catch {
        return null;
    }
};

/**
 * Palitan ng '[REDACTED_NAME]' ang bawat occurrence ng mga pangalan sa
 * registry (at ang mga variant ng mga ito), case-insensitive at
 * whole-word, na OCR-confusable. Hindi binubura ang titles/role words
 * ("Atty. Reyes" → "Atty. [REDACTED_NAME]"). Ang magkakatabing
 * "[REDACTED_NAME]" tokens ay pinagsasama.
 */
export const applyNameRegistry = (
    text: string,
    names: string[]
): string => {
    if (!text || typeof text !== 'string') {
        return text;
    }
    if (!Array.isArray(names) || names.length === 0) {
        return text;
    }

    // Buuin ang lahat ng variant ng lahat ng pangalan.
    const variants: string[] = [];
    const seenVariants = new Set<string>();

    const pushVariant = (value: string | undefined): void => {
        if (!value) {
            return;
        }
        const trimmed = value.trim();
        if (trimmed.length < 2) {
            return;
        }
        // Legal headings/captions at common words ay hindi pangalan —
        // huwag gawing variant (hal. "Republic of the Philippines").
        if (isLegalCapsPhrase(trimmed)) {
            return;
        }
        if (
            trimmed
                .split(/\s+/)
                .every((word) => isCommonWord(word))
        ) {
            return;
        }
        const key = trimmed.toLowerCase();
        if (seenVariants.has(key)) {
            return;
        }
        seenVariants.add(key);
        variants.push(trimmed);
    };

    for (const name of names) {
        if (!name || typeof name !== 'string') {
            continue;
        }
        const tokens = name.split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
            continue;
        }

        // 1. Buong pangalan
        pushVariant(tokens.join(' '));

        // 2. Walang middle initial: "Juan M. Cruz" → "Juan Cruz"
        const withoutInitials = tokens.filter(
            (token, index) =>
                !(index > 0 && /^[A-Za-z]\.?$/.test(token))
        );
        if (withoutInitials.length >= 2) {
            pushVariant(withoutInitials.join(' '));
        }

        // Apelyido: huling 1–2 token kasama ang particle (hal. "De Leon")
        let surnameStart = tokens.length - 1;
        while (
            surnameStart > 0 &&
            isParticleWord(tokens[surnameStart - 1])
        ) {
            surnameStart -= 1;
        }
        const surnameTokens = tokens.slice(surnameStart);
        const surname = surnameTokens.join(' ');

        // 3. "Surname, Given"
        if (surnameTokens.length < tokens.length) {
            pushVariant(`${surname}, ${tokens[0]}`);
        }

        // 4. Apelyido (huling 1–2 token)
        pushVariant(surname);
        if (tokens.length >= 3 && surnameTokens.length < 2) {
            pushVariant(tokens.slice(-2).join(' '));
        }

        // 5. Unang pangalan (≥4 letters)
        const given = tokens[0].replace(/\.$/, '');
        if (/^[A-Za-z]{4,}$/.test(given)) {
            pushVariant(tokens[0]);
        }
    }

    // Single-token variants: laktawan kung lumalabas ang lowercase na
    // bersyon ng token bilang ordinaryong salita sa text.
    const usableVariants = variants.filter((variant) => {
        if (variant.includes(' ')) {
            return true;
        }
        if (variant.length < 3) {
            return false;
        }
        const lowercaseOccurrence = new RegExp(
            `\\b${escapeRegex(variant.toLowerCase())}\\b`
        );
        return !lowercaseOccurrence.test(text);
    });

    // Pinakamahaba muna para hindi mauna ang maikling fragment.
    usableVariants.sort((left, right) => right.length - left.length);

    let output = text;
    for (const variant of usableVariants) {
        const pattern = buildVariantPattern(variant);
        if (!pattern) {
            continue;
        }
        output = output.replace(
            pattern,
            (_match, prefix: string) => `${prefix}${REDACTED_NAME}`
        );
    }

    // Pagsamahin ang magkakatabing tokens.
    output = output.replace(
        /(?:\[REDACTED_NAME\][ \t]*){2,}/g,
        REDACTED_NAME
    );

    return output;
};