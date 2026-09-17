import TextRecognition from '@react-native-ml-kit/text-recognition';

import type { ScanPage } from '../types/ScanPage';


export type OcrProgressStatus =
    | 'processing'
    | 'success'
    | 'error';

export type OcrProgress = {
    current: number;
    total: number;
    pageId: string;
    pageNumber: number;
    status: OcrProgressStatus;
};

export type OcrQualityMetrics = {
    characterCount: number;
    wordCount: number;
    letterRatio: number;
    browserUiDetected: boolean;
};

export type OcrPageResult = {
    pageId: string;
    sessionId: string;
    pageNumber: number;
    sourceUri: string;
    text: string;
    quality: OcrQualityMetrics;
    warning?: string;
};

export type OcrPageFailure = {
    pageId: string;
    pageNumber: number;
    sourceUri: string;
    message: string;
};

export type BatchOcrResult = {
    expectedPageCount: number;
    recognizedPageCount: number;
    isComplete: boolean;
    successfulPages: OcrPageResult[];
    failedPages: OcrPageFailure[];
    combinedText: string;
};

type ProgressCallback = (
    progress: OcrProgress
) => void;

type PageSnapshot = {
    id: string;
    sessionId: string;
    editedUri: string;
};

const OCR_CANCELLED_MESSAGE = 'OCR_CANCELLED';
const MIN_REQUIRED_TEXT_LENGTH = 20;
const MIN_USEFUL_TEXT_LENGTH = 80;
const MIN_USEFUL_WORD_COUNT = 12;

const BROWSER_UI_MARKERS = [
    'client=firefox',
    'client=chrome',
    'all images',
    'short videos',
    'ask anything',
    'people also ask',
    'related searches',
    'search results',
    'images videos more',
] as const;


const normalizeRecognizedText = (
    value: string
): string => {
    return value
        .normalize('NFKC')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\u00a0/g, ' ')
        .replace(/\0/g, '')
        .replace(/[\t ]+\n/g, '\n')
        .replace(/[\t ]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const getErrorMessage = (
    error: unknown
): string => {
    if (
        error instanceof Error &&
        error.message
    ) {
        return error.message;
    }

    return 'Hindi mabasa ang text sa page na ito.';
};

const throwIfCancelled = (
    signal?: AbortSignal
): void => {
    if (signal?.aborted) {
        throw new Error(OCR_CANCELLED_MESSAGE);
    }
};

const createPageSnapshots = (
    pages: ScanPage[]
): PageSnapshot[] => {
    const pageIds = new Set<string>();
    const pageUris = new Set<string>();

    return pages.map((page, index) => {
        const pageNumber = index + 1;
        const pageId = page?.id?.trim();
        const sessionId = page?.sessionId?.trim();
        const editedUri = page?.editedUri?.trim();

        if (!pageId) {
            throw new Error(
                `Walang valid page ID ang Page ${pageNumber}.`
            );
        }

        if (!sessionId) {
            throw new Error(
                `Walang valid scan session ang Page ${pageNumber}.`
            );
        }

        if (!editedUri) {
            throw new Error(
                `Walang image ang Page ${pageNumber}.`
            );
        }

        if (pageIds.has(pageId)) {
            throw new Error(
                `Duplicate ang page ID ng Page ${pageNumber}. Bumalik at buksan ulit ang scan.`
            );
        }

        if (pageUris.has(editedUri)) {
            throw new Error(
                `Parehong image file ang ginagamit ng higit sa isang page. Bumalik at kunan ulit ang duplicate page.`
            );
        }

        pageIds.add(pageId);
        pageUris.add(editedUri);

        return Object.freeze({
            id: pageId,
            sessionId,
            editedUri,
        });
    });
};

const calculateQualityMetrics = (
    text: string
): OcrQualityMetrics => {
    const words = text.match(
        /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/g
    ) ?? [];
    const nonSpaceCharacters = Array.from(text).filter(
        (character) => !/\s/.test(character)
    );
    const letterCount = nonSpaceCharacters.filter(
        (character) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(character)
    ).length;
    const letterRatio =
        nonSpaceCharacters.length > 0
            ? letterCount / nonSpaceCharacters.length
            : 0;

    const loweredText = text.toLocaleLowerCase();
    const browserMarkerCount = BROWSER_UI_MARKERS.filter(
        (marker) => loweredText.includes(marker)
    ).length;
    const queryFragmentCount = (
        loweredText.match(
            /(?:[?&][a-z0-9_]+=[^\s]+|\+[a-z0-9]+)/g
        ) ?? []
    ).length;

    return {
        characterCount: text.length,
        wordCount: words.length,
        letterRatio: Number(letterRatio.toFixed(3)),
        browserUiDetected:
            browserMarkerCount >= 2 ||
            (
                browserMarkerCount >= 1 &&
                queryFragmentCount >= 2
            ),
    };
};

const getQualityWarning = (
    quality: OcrQualityMetrics
): string | undefined => {
    if (
        quality.characterCount < MIN_USEFUL_TEXT_LENGTH ||
        quality.wordCount < MIN_USEFUL_WORD_COUNT
    ) {
        return 'Kaunti lang ang text na nabasa. Maaaring malabo, putol, o kulang ang page.';
    }

    if (quality.letterRatio < 0.45) {
        return 'Maraming hindi malinaw na character ang nabasa. I-review muna ang page.';
    }

    return undefined;
};

/**
 * Runs Google ML Kit text recognition completely on-device for one
 * immutable page snapshot.
 *
 * No network request is made here. The source image and raw OCR text remain
 * on the device.
 */
const recognizePageSnapshotOffline = async (
    page: PageSnapshot,
    pageNumber: number,
    signal?: AbortSignal
): Promise<OcrPageResult> => {
    throwIfCancelled(signal);

    const recognitionResult =
        await TextRecognition.recognize(
            page.editedUri
        );

    throwIfCancelled(signal);

    const text = normalizeRecognizedText(
        recognitionResult?.text ?? ''
    );

    if (!text || text.length < MIN_REQUIRED_TEXT_LENGTH) {
        throw new Error(
            `Hindi sapat ang text na nakita sa Page ${pageNumber}.`
        );
    }

    const quality = calculateQualityMetrics(text);

    if (quality.browserUiDetected) {
        throw new Error(
            `Browser o app screen ang mukhang nabasa sa Page ${pageNumber}, hindi ang document. Kunan ulit ang page.`
        );
    }

    return {
        pageId: page.id,
        sessionId: page.sessionId,
        pageNumber,
        sourceUri: page.editedUri,
        text,
        quality,
        warning: getQualityWarning(quality),
    };
};

/**
 * Public single-page helper retained for compatibility.
 */
export const recognizePageOffline = async (
    page: ScanPage,
    pageNumber: number,
    signal?: AbortSignal
): Promise<OcrPageResult> => {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
        throw new Error('Hindi valid ang page number para sa OCR.');
    }

    const snapshots = createPageSnapshots([page]);

    return recognizePageSnapshotOffline(
        snapshots[0],
        pageNumber,
        signal
    );
};

/**
 * Processes immutable page snapshots sequentially to keep phone memory
 * predictable and preserve the exact page order shown to the user.
 *
 * A failed page is reported, but is never silently replaced, renumbered, or
 * represented as a successful page in combinedText.
 */
export const recognizePagesOffline = async (
    pages: ScanPage[],
    onProgress?: ProgressCallback,
    signal?: AbortSignal
): Promise<BatchOcrResult> => {
    if (
        !Array.isArray(pages) ||
        pages.length === 0
    ) {
        throw new Error(
            'Walang document pages na pwedeng basahin.'
        );
    }

    throwIfCancelled(signal);

    const pageSnapshots = createPageSnapshots(pages);
    const successfulPages: OcrPageResult[] = [];
    const failedPages: OcrPageFailure[] = [];

    for (
        let index = 0;
        index < pageSnapshots.length;
        index += 1
    ) {
        throwIfCancelled(signal);

        const page = pageSnapshots[index];
        const pageNumber = index + 1;

        onProgress?.({
            current: pageNumber,
            total: pageSnapshots.length,
            pageId: page.id,
            pageNumber,
            status: 'processing',
        });

        try {
            const result =
                await recognizePageSnapshotOffline(
                    page,
                    pageNumber,
                    signal
                );

            successfulPages.push(result);

            onProgress?.({
                current: pageNumber,
                total: pageSnapshots.length,
                pageId: page.id,
                pageNumber,
                status: 'success',
            });
        } catch (error: unknown) {
            if (isOcrCancelledError(error)) {
                throw error;
            }

            failedPages.push({
                pageId: page.id,
                pageNumber,
                sourceUri: page.editedUri,
                message: getErrorMessage(error),
            });

            onProgress?.({
                current: pageNumber,
                total: pageSnapshots.length,
                pageId: page.id,
                pageNumber,
                status: 'error',
            });
        }
    }

    throwIfCancelled(signal);

    if (successfulPages.length === 0) {
        throw new Error(
            'Walang text na nakuha sa lahat ng document pages.'
        );
    }

    const combinedText = successfulPages
        .map(
            (page) =>
                `--- Page ${page.pageNumber} ---\n${page.text}`
        )
        .join('\n\n');

    return {
        expectedPageCount: pageSnapshots.length,
        recognizedPageCount: successfulPages.length,
        isComplete:
            successfulPages.length === pageSnapshots.length &&
            failedPages.length === 0,
        successfulPages,
        failedPages,
        combinedText,
    };
};

export const isOcrCancelledError = (
    error: unknown
): boolean => {
    return (
        error instanceof Error &&
        error.message === OCR_CANCELLED_MESSAGE
    );
};
