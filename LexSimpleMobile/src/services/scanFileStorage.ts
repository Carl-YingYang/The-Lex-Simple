import {
    Directory,
    File,
    Paths,
} from 'expo-file-system';

import type {
    ScanPage,
    ScanPageSource,
} from '../types/ScanPage';

const MAX_PAGES_PER_SESSION = 50;

const ALLOWED_EXTENSIONS = new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.heic',
    '.heif',
]);

/**
 * Permanent application folder:
 *
 * document/lexsimple/scans/
 *
 * Files stored here remain available after the temporary camera or
 * gallery cache is cleared.
 */
const SCANS_ROOT = new Directory(
    Paths.document,
    'lexsimple',
    'scans'
);

export type LocalScanImage = {
    uri: string;
    ocrText?: string;
    source?: ScanPageSource;
    width?: number;
    height?: number;
};

export type ScanImageInput = string | LocalScanImage;

const ensureScansRoot = (): void => {
    SCANS_ROOT.create({
        idempotent: true,
        intermediates: true,
    });
};

const createNonce = (): string => {
    return Math.random().toString(36).slice(2, 8);
};

const createSessionId = (): string => {
    return `scan_${Date.now()}_${createNonce()}`;
};

const normalizeInput = (
    input: ScanImageInput,
    pageNumber: number
): LocalScanImage => {
    const normalizedInput =
        typeof input === 'string'
            ? { uri: input }
            : input;

    const uri = normalizedInput?.uri?.trim();

    if (!uri) {
        throw new Error(
            `Walang valid image URI ang Page ${pageNumber}.`
        );
    }

    if (
        uri.startsWith('http://') ||
        uri.startsWith('https://') ||
        uri.startsWith('data:')
    ) {
        throw new Error(
            `Hindi local image ang Page ${pageNumber}.`
        );
    }

    return {
        ...normalizedInput,
        uri,
    };
};

const getSafeExtension = (sourceFile: File): string => {
    const extension = sourceFile.extension?.toLowerCase();

    if (extension && ALLOWED_EXTENSIONS.has(extension)) {
        return extension;
    }

    return '.jpg';
};

const getSessionDirectory = (
    sessionId: string
): Directory => {
    const directory = new Directory(
        SCANS_ROOT,
        sessionId
    );

    directory.create({
        idempotent: true,
        intermediates: true,
    });

    return directory;
};

const assertPageLimit = (pageCount: number): void => {
    if (pageCount > MAX_PAGES_PER_SESSION) {
        throw new Error(
            `Hanggang ${MAX_PAGES_PER_SESSION} pages lamang ang isang scan session.`
        );
    }
};

const copyInputsToSession = (
    inputs: ScanImageInput[],
    sessionId: string,
    startingIndex: number
): ScanPage[] => {
    const sessionDirectory =
        getSessionDirectory(sessionId);

    return inputs.map((input, index): ScanPage => {
        const pageNumber = startingIndex + index + 1;

        const normalizedInput = normalizeInput(
            input,
            pageNumber
        );

        const sourceFile = new File(
            normalizedInput.uri
        );

        if (!sourceFile.exists) {
            throw new Error(
                `Hindi makita ang local image para sa Page ${pageNumber}.`
            );
        }

        const extension =
            getSafeExtension(sourceFile);

        const pageNonce = createNonce();

        const paddedPageNumber = String(
            pageNumber
        ).padStart(3, '0');

        const destinationFile = new File(
            sessionDirectory,
            `page_${paddedPageNumber}_${pageNonce}_original${extension}`
        );

        sourceFile.copy(destinationFile);

        if (!destinationFile.exists) {
            throw new Error(
                `Hindi ma-save offline ang Page ${pageNumber}.`
            );
        }

        const createdAt = Date.now();

        return {
            id: `${sessionId}_page_${createdAt}_${pageNonce}`,
            sessionId,

            originalUri: destinationFile.uri,
            editedUri: destinationFile.uri,

            width: normalizedInput.width,
            height: normalizedInput.height,

            rotation: 0,
            source: normalizedInput.source,
            ocrText: normalizedInput.ocrText,
            ocrSourceUri: normalizedInput.ocrText ? destinationFile.uri : undefined,
            status: normalizedInput.ocrText ? 'ocr-complete' : 'ready',
            createdAt,
        };
    });
};

/**
 * Creates a new permanent offline scan session.
 *
 * Backward compatible:
 * - Accepts the old string[] URI format.
 * - Accepts objects containing source and image dimensions.
 *
 * No raw document image is uploaded by this service.
 */
export const createScanSession = (
    imageInputs: ScanImageInput[]
): ScanPage[] => {
    if (
        !Array.isArray(imageInputs) ||
        imageInputs.length === 0
    ) {
        return [];
    }

    assertPageLimit(imageInputs.length);
    ensureScansRoot();

    const sessionId = createSessionId();

    return copyInputsToSession(
        imageInputs,
        sessionId,
        0
    );
};

/**
 * Adds newly captured or selected images to an existing session
 * while preserving its original pages and untouched copies.
 */
export const appendToScanSession = (
    existingPages: ScanPage[],
    newImageInputs: ScanImageInput[]
): ScanPage[] => {
    if (
        !Array.isArray(newImageInputs) ||
        newImageInputs.length === 0
    ) {
        return Array.isArray(existingPages)
            ? existingPages
            : [];
    }

    if (
        !Array.isArray(existingPages) ||
        existingPages.length === 0
    ) {
        return createScanSession(newImageInputs);
    }

    assertPageLimit(
        existingPages.length +
            newImageInputs.length
    );

    const sessionId =
        existingPages[0].sessionId;

    const hasMixedSessions = existingPages.some(
        (page) => page.sessionId !== sessionId
    );

    if (!sessionId || hasMixedSessions) {
        throw new Error(
            'Hindi valid ang existing scan session.'
        );
    }

    ensureScansRoot();

    const newPages = copyInputsToSession(
        newImageInputs,
        sessionId,
        existingPages.length
    );

    return [
        ...existingPages,
        ...newPages,
    ];
};

export const getMaximumScanPages = (): number => {
    return MAX_PAGES_PER_SESSION;
};