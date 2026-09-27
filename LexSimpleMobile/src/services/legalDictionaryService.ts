// LEGAL DICTIONARY SERVICE VERSION: 6.2.7
import { ApiError, postEndpoint } from './AiEngine';

export type LegalEntry = {
    id?: number;
    term?: string;
    definition?: string;
    raw_text?: string;
    legal_basis?: string;
    example?: string;
    [key: string]: unknown;
};

export const legalText = (entry: LegalEntry): string =>
    String(entry.raw_text || entry.definition || '').trim();

export const legalEntryKey = (entry: LegalEntry): string => {
    const source = String(entry.legal_basis || '').trim();
    const title = String(entry.term || '').trim();
    const text = legalText(entry);
    // Include the actual text so a cached explanation cannot attach to an
    // old provision after the offline dictionary changes.
    const identity = JSON.stringify([entry.id ?? null, source, title, text]);
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
        hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
    }
    return `${entry.id ?? 'local'}:${identity.length}:${hash >>> 0}`;
};

export const explanationErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
        return error.message;
    }
    return 'Hindi makuha ang paliwanag. Subukan ulit mamaya.';
};

export const explainLegalEntry = async (entry: LegalEntry): Promise<string> => {
    const rawText = legalText(entry);
    if (rawText.length < 5) {
        throw new Error('Walang sapat na legal text para ipaliwanag.');
    }
    const response = await postEndpoint<{
        status: string;
        data?: { definition?: string };
    }>('/explain', {
        title: String(entry.term || 'Legal provision'),
        raw_text: rawText,
        ...(typeof entry.id === 'number' ? { source_id: entry.id } : {}),
    });
    const explanation = response.data?.definition?.trim();
    if (response.status !== 'success' || !explanation) {
        throw new Error('Hindi mabasa ang paliwanag. Subukan ulit.');
    }
    return explanation;
};