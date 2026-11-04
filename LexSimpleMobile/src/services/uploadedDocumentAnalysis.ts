// UPLOADED DOCUMENT ANALYSIS VERSION: 1.0.0
/**
 * Privacy-safe na daloy para sa mga UPLOADED na PDF/DOCX/TXT files.
 *
 * Mga hakbang (U2):
 *  1. POST /extract_text (FormData) — extraction LANG sa server; walang
 *     LLM at walang sanitize duon. Ang raw text ay bumabalik sa app at
 *     hindi iniiwan sa server (temp file agad nabubura).
 *  2. Hatiin ang extractedText sa pages gamit ang "--- Page N ---"
 *     markers at gawing OcrPageForSanitization[].
 *  3. buildSanitizedDocumentForAI — LOKAL na sanitization ng bawat page
 *     (cross-page name registry kasama).
 *  4. Kung blocked, itatapon ang malinaw na Error sa Filipino — hindi
 *     ipapadala kahit ano sa AI.
 *  5. Ang apiPayload ay ipinapadala sa PAREHONG endpoint at paraan ng
 *     BatchEditScreen: analyzeSanitizedDocument() → POST /simplify.
 *  6. Ibinabalik ang response + raw extractedText (para sa history,
 *     lokal lang) + sanitizedText/combinedText (sanitized na bersyon).
 *
 * WALANG pag-log ng laman ng dokumento sa file na ito.
 */

import {
    analyzeSanitizedDocument,
    postFileEndpoint,
    type SimplifyResponse,
} from './AiEngine';
import {
    buildSanitizedDocumentForAI,
    type OcrPageForSanitization,
} from '../utils/sanitizer';

export type UploadedDocumentFile = {
    uri: string;
    name: string;
    mimeType: string;
};

export type UploadedDocumentAnalysisResult = {
    /** Response ng /simplify (pareho ng nakukuha ng BatchEditScreen). */
    response: SimplifyResponse;
    /** Raw na extraction mula sa /extract_text — para sa history (lokal lang). */
    extractedText: string;
    /** Sanitized na kabuuan ng dokumento (combined ng mga page). */
    sanitizedText: string;
    /** Alias ng sanitizedText (combined text ng mga sanitized page). */
    combinedText: string;
};

type ExtractTextResponse = {
    status?: string;
    extractedText?: string;
    pageCount?: number;
    message?: string;
};

/**
 * Hatiin ang extracted text sa pages gamit ang "--- Page N ---" markers.
 *
 * Kung walang markers (docx/txt), isang page lang. Ang mga page na sobrang
 * maikli (< 20 chars — hal. image-only na pahina) ay inaalis at
 * nire-renumber para hindi mahinto ang buong dokumento sa page check ng
 * buildSanitizedDocumentForAI. Ang bawat page ay kailangang may UNIQUE na
 * sourceUri (assertOrderedCompletePages), kaya may "#page=N" suffix.
 */
const splitIntoPages = (
    extractedText: string,
    documentId: string,
    sourceUri: string
): OcrPageForSanitization[] => {
    const markerPattern = /---\s*Page\s+\d+\s*---/g;
    const markers: Array<{ start: number; end: number }> = [];

    let match: RegExpExecArray | null;
    while ((match = markerPattern.exec(extractedText)) !== null) {
        markers.push({
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    const pageTexts: string[] =
        markers.length === 0
            ? [extractedText]
            : markers.map((marker, index) => {
                  const nextStart =
                      index + 1 < markers.length
                          ? markers[index + 1].start
                          : extractedText.length;
                  return extractedText
                      .slice(marker.end, nextStart)
                      .trim();
              });

    // Alisin ang mga sobrang maikling page (image-only / blank), tapos
    // i-renumber nang sunud-sunod.
    const usablePages = pageTexts.filter(
        (text) => text.trim().length >= 20
    );

    return usablePages.map((text, index) => ({
        pageId: `${documentId}_page_${index + 1}`,
        sessionId: documentId,
        pageNumber: index + 1,
        sourceUri: `${sourceUri}#page=${index + 1}`,
        text,
    }));
};

/**
 * Ipa-check sa AI ang isang uploaded document nang privacy-safe:
 * extract → lokal na sanitize → blocked check → /simplify (sanitized
 * pages lang). Ibinabalik ang response kasama ang raw extractedText at
 * sanitizedText/combinedText para sa history save ng caller.
 */
export const analyzeUploadedDocument = async (
    file: UploadedDocumentFile,
    documentId: string,
    signal?: AbortSignal
): Promise<UploadedDocumentAnalysisResult> => {
    if (!file?.uri) {
        throw new Error('Hindi mahanap ang document file.');
    }

    const normalizedDocumentId = String(documentId || '').trim();
    if (!normalizedDocumentId) {
        throw new Error('Walang document ID ang na-save na file.');
    }

    // (1) Extraction lang sa server — walang LLM, walang sanitize.
    const formData = new FormData();
    formData.append('file', {
        uri: file.uri,
        name: file.name || 'document',
        type: file.mimeType || 'application/octet-stream',
    } as any);

    const extraction = await postFileEndpoint<ExtractTextResponse>(
        '/extract_text',
        formData,
        signal
    );

    const extractedText = String(
        extraction?.extractedText || ''
    ).trim();

    if (
        !extraction ||
        extraction.status !== 'success' ||
        extractedText.length < 20
    ) {
        throw new Error(
            extraction?.message ||
                'Hindi mabasa ang text ng document na ito. Siguraduhing may selectable text ito at hindi lamang scanned images.'
        );
    }

    // (2) + (3) Hatiin sa pages at i-sanitize nang lokal.
    const pages = splitIntoPages(
        extractedText,
        normalizedDocumentId,
        file.uri
    );

    const safe = buildSanitizedDocumentForAI(
        normalizedDocumentId,
        pages
    );

    // (4) Privacy block — huwag ipadala ang kahit ano sa AI.
    if (safe.blocked) {
        throw new Error(
            `May hindi nalinis na text sa pahina ${safe.blockedPageNumbers.join(', ')}. Tingnan ang sanitized text at kunan ulit kung kulang o malabo ang dokumento.`
        );
    }

    // (5) PAREHONG endpoint at paraan ng BatchEditScreen.
    const response = await analyzeSanitizedDocument(
        safe.apiPayload,
        signal
    );

    // (6) Ibalik ang lahat para ma-save ng caller sa history.
    return {
        response,
        extractedText,
        sanitizedText: safe.combinedText,
        combinedText: safe.combinedText,
    };
};