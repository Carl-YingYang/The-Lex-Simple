// DOCUMENT GROUPING VERSION: 1.0.0
// Suggestions only: page order stays intact and the user may change boundaries.
export type DocumentKind =
    | 'loan' | 'service' | 'purchase' | 'lease' | 'supply' | 'court';

export type RecognizedDocumentPage = {
    pageNumber: number;
    text: string;
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
    loan: 'Loan agreement',
    service: 'Service agreement',
    purchase: 'Purchase document',
    lease: 'Lease agreement',
    supply: 'Supply agreement',
    court: 'Court document',
};

export const detectDocumentKind = (text: string): DocumentKind | null => {
    const header = text.slice(0, 700);
    const signatures: Array<[DocumentKind, RegExp[]]> = [
        ['loan', [/\bloan agreement\b/i, /\bprincipal amount\b/i, /\bcreditor\b[\s\S]{0,180}\bdebtor\b/i]],
        ['service', [/\bservice agre(?:e|en)ment\b/i, /\bprovider\b[\s\S]{0,180}\bclient\b/i]],
        ['purchase', [/\bpurchase price\b/i, /\bbuyer\b[\s\S]{0,180}\b(?:seller|office equipment)\b/i]],
        ['lease', [/\blease (?:agreement|excerpt)\b/i, /\blessor\b[\s\S]{0,180}\blessee\b/i, /\bmonthly rent\b/i]],
        ['supply', [/\bsupply agreement\b/i, /\bdelivery schedule\b/i, /\bbatch\s+[A-Z]-?\d+\b/i]],
        ['court', [/\brepublic of the philippines\b/i, /\bcomplainant\b[\s\S]{0,180}\brespondent\b/i]],
    ];
    let best: { kind: DocumentKind; score: number } | null = null;
    for (const [kind, patterns] of signatures) {
        const score = patterns.filter((pattern) => pattern.test(header)).length;
        if (score >= 2 && (!best || score > best.score)) {
            best = { kind, score };
        }
    }
    return best?.kind ?? null;
};

export const suggestDocumentStarts = (
    pages: RecognizedDocumentPage[]
): number[] => {
    const starts = [1];
    let lastKnownKind: DocumentKind | null = null;
    for (const page of pages) {
        const kind = detectDocumentKind(page.text);
        if (kind && lastKnownKind && kind !== lastKnownKind) {
            starts.push(page.pageNumber);
        }
        if (kind) lastKnownKind = kind;
    }
    return starts;
};

export const partitionDocumentPages = <T extends RecognizedDocumentPage>(
    pages: T[],
    starts: number[]
): T[][] => {
    if (!pages.length || starts[0] !== 1 ||
        new Set(starts).size !== starts.length ||
        starts.some((value) => !Number.isInteger(value) || value < 1 || value > pages.length)
    ) {
        throw new Error('Hindi valid ang paghahati ng mga pahina.');
    }
    const boundaries = [...starts].sort((a, b) => a - b);
    return boundaries.map((start, index) =>
        pages.slice(start - 1, (boundaries[index + 1] ?? pages.length + 1) - 1)
    );
};