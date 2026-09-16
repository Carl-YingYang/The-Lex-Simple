import {
    Directory,
    File,
    Paths,
} from 'expo-file-system';

import type { ScanPage } from '../types/ScanPage';

/**
 * Permanent app folder:
 *
 * document/lexsimple/scans/
 */
const SCANS_ROOT = new Directory(
    Paths.document,
    'lexsimple',
    'scans'
);

const ensureScansRoot = (): void => {
    SCANS_ROOT.create({
        idempotent: true,
        intermediates: true,
    });
};

const createSessionId = (): string => {
    return `scan_${Date.now()}`;
};

const getSafeExtension = (source: File): string => {
    const extension = source.extension?.toLowerCase();

    const allowedExtensions = [
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
        '.heic',
    ];

    if (extension && allowedExtensions.includes(extension)) {
        return extension;
    }

    return '.jpg';
};

/**
 * Kinokopya ang camera/gallery cache images papunta sa
 * permanent document directory ng application.
 */
export const createScanSession = (
    imageUris: string[]
): ScanPage[] => {
    if (!Array.isArray(imageUris) || imageUris.length === 0) {
        return [];
    }

    ensureScansRoot();

    const sessionId = createSessionId();

    const sessionDirectory = new Directory(
        SCANS_ROOT,
        sessionId
    );

    sessionDirectory.create({
        idempotent: true,
        intermediates: true,
    });

    return imageUris.map((uri, index): ScanPage => {
        const sourceFile = new File(uri);

        if (!sourceFile.exists) {
            throw new Error(
                `Hindi makita ang captured image para sa Page ${index + 1}.`
            );
        }

        const extension = getSafeExtension(sourceFile);
        const pageNumber = index + 1;

        const destinationFile = new File(
            sessionDirectory,
            `page_${pageNumber}_original${extension}`
        );

        sourceFile.copy(destinationFile);

        return {
            id: `${sessionId}_page_${pageNumber}`,
            sessionId,

            originalUri: destinationFile.uri,
            editedUri: destinationFile.uri,

            rotation: 0,
            crop: null,

            brightness: 0,
            contrast: 1,
            filter: 'original',

            status: 'ready',
        };
    });
};