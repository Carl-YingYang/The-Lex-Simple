export type ScanFilter =
    | 'original'
    | 'magic'
    | 'grayscale'
    | 'bw';

export type ScanPageStatus =
    | 'idle'
    | 'editing'
    | 'ready'
    | 'ocr-complete'
    | 'error';

export type CropRect = {
    originX: number;
    originY: number;
    width: number;
    height: number;
};

export interface ScanPage {
    id: string;
    sessionId: string;

    /**
     * Permanent untouched copy.
     * Gagamitin para sa Reset to Original.
     */
    originalUri: string;

    /**
     * Latest edited image.
     * Ito ang ipapakita at gagamitin sa OCR.
     */
    editedUri: string;

    width?: number;
    height?: number;

    rotation: 0 | 90 | 180 | 270;
    crop: CropRect | null;

    brightness: number;
    contrast: number;
    filter: ScanFilter;

    status: ScanPageStatus;
    ocrText?: string;
}