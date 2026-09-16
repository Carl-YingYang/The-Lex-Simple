import {
    ImageManipulator,
    SaveFormat,
} from 'expo-image-manipulator';

import {
    File,
} from 'expo-file-system';

import type { ScanPage } from '../types/ScanPage';

const getNextRotation = (
    currentRotation: ScanPage['rotation']
): ScanPage['rotation'] => {
    return ((currentRotation + 90) % 360) as ScanPage['rotation'];
};

/**
 * Totoong image rotation.
 *
 * Hindi lang nito iniikot ang React Native preview.
 * Gumagawa ito ng bagong JPEG file sa permanent scan folder.
 */
export const rotatePageClockwise = async (
    page: ScanPage
): Promise<ScanPage> => {
    if (!page.editedUri) {
        throw new Error('Walang image na maaaring i-rotate.');
    }

    const context = ImageManipulator.manipulate(
        page.editedUri
    );

    context.rotate(90);

    const renderedImage = await context.renderAsync();

    const temporaryResult = await renderedImage.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.92,
    });

    const temporaryFile = new File(temporaryResult.uri);
    const originalFile = new File(page.originalUri);

    if (!temporaryFile.exists) {
        throw new Error('Hindi nagawa ang rotated image.');
    }

    const outputFile = new File(
        originalFile.parentDirectory,
        `${page.id}_edited_${Date.now()}.jpg`
    );

    temporaryFile.copy(outputFile);

    return {
        ...page,

        editedUri: outputFile.uri,
        width: temporaryResult.width,
        height: temporaryResult.height,

        rotation: getNextRotation(page.rotation),
        status: 'ready',
    };
};