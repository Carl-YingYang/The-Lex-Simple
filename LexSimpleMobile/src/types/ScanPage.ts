/**
 * Shared data model for one locally stored document page.
 *
 * Important:
 * - `originalUri` is the untouched local copy.
 * - `editedUri` is the working copy used for preview and OCR.
 * - Raw document images must never be represented as remote URLs here.
 */

export type ScanPageRotation = 0 | 90 | 180 | 270;

export type ScanPageStatus =
    | 'idle'
    | 'editing'
    | 'ready'
    | 'ocr-complete'
    | 'error';

export type ScanPageSource =
    | 'camera'
    | 'gallery'
    | 'legacy';

/**
 * Retained only so older saved sessions remain readable.
 * Perspective crop will be handled by the native scanner later.
 */
export type CropRect = {
    originX: number;
    originY: number;
    width: number;
    height: number;
};

/**
 * Retained only for backward compatibility with older scan objects.
 * The new review screen does not simulate these filters.
 */
export type ScanFilter =
    | 'original'
    | 'magic'
    | 'grayscale'
    | 'bw';

export interface ScanPage {
    /** Unique ID of this page inside a scan session. */
    id: string;

    /** ID shared by all pages captured in the same session. */
    sessionId: string;

    /** Permanent and untouched local image copy. */
    originalUri: string;

    /** Latest local image used by the preview and offline OCR. */
    editedUri: string;

    /** Image dimensions, when known. */
    width?: number;
    height?: number;

    /** Total clockwise rotation already applied to `editedUri`. */
    rotation: ScanPageRotation;

    /** Current local processing state of this page. */
    status: ScanPageStatus;

    /** Identifies where the page originally came from. */
    source?: ScanPageSource;

    /** Locally recognized text. Never use this field for raw images. */
    ocrText?: string;

    /** Non-fatal OCR quality warning for this page. */
    ocrWarning?: string;

    /** Latest local editing or OCR failure message. */
    errorMessage?: string;

    /** Unix timestamp for optional session restoration. */
    createdAt?: number;

    /**
     * @deprecated Compatibility fields for older scan sessions only.
     * They are optional because the new flow no longer performs fake
     * crop, brightness, contrast, or filter previews.
     */
    crop?: CropRect | null;
    brightness?: number;
    contrast?: number;
    filter?: ScanFilter;
}

/**
 * Runtime guard for route parameters or restored local data.
 * This prevents malformed objects from reaching the editor and OCR.
 */
export const isScanPage = (
    value: unknown
): value is ScanPage => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Partial<ScanPage>;

    return (
        typeof candidate.id === 'string' &&
        candidate.id.length > 0 &&
        typeof candidate.sessionId === 'string' &&
        candidate.sessionId.length > 0 &&
        typeof candidate.originalUri === 'string' &&
        candidate.originalUri.length > 0 &&
        typeof candidate.editedUri === 'string' &&
        candidate.editedUri.length > 0 &&
        (
            candidate.rotation === 0 ||
            candidate.rotation === 90 ||
            candidate.rotation === 180 ||
            candidate.rotation === 270
        ) &&
        (
            candidate.status === 'idle' ||
            candidate.status === 'editing' ||
            candidate.status === 'ready' ||
            candidate.status === 'ocr-complete' ||
            candidate.status === 'error'
        )
    );
};