import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Linking,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import {
    CameraView,
    useCameraPermissions,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCustomAlert } from '../../../components/CustomAlert';
import {
    appendToScanSession,
    createScanSession,
    getMaximumScanPages,
} from '../../../services/scanFileStorage';
import type { LocalScanImage } from '../../../services/scanFileStorage';
import { isScanPage } from '../../../types/ScanPage';
import type { ScanPage } from '../../../types/ScanPage';

// SCANNER SCREEN VERSION: 3.0.0
const COLORS = {
    black: '#000000',
    background: '#090B10',
    surface: '#121720',
    elevated: '#1A2130',
    border: '#2C3647',
    primary: '#3478F6',
    primaryLight: '#66A0FF',
    text: '#FFFFFF',
    subText: '#C5CDDA',
    muted: '#8994A6',
    success: '#22C55E',
    warning: '#FBBF24',
    danger: '#EF4444',
};
type ExistingRouteData = {
    scanPages: ScanPage[];
    legacyImages: LocalScanImage[];
};
type PagePreview = {
    key: string;
    uri: string;
};

type QualityTone =
    | 'neutral'
    | 'checking'
    | 'good'
    | 'warning'
    | 'error';

type MeasuredRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const clamp = (
    value: number,
    minimum: number,
    maximum: number
): number => Math.min(Math.max(value, minimum), maximum);

const measureViewInWindow = (
    view: View | null
): Promise<MeasuredRect> =>
    new Promise((resolve, reject) => {
        if (!view) {
            reject(new Error('Hindi masukat ang scan area.'));
            return;
        }

        view.measureInWindow((x, y, measuredWidth, measuredHeight) => {
            if (measuredWidth <= 0 || measuredHeight <= 0) {
                reject(new Error('Hindi pa handa ang scan area.'));
                return;
            }

            resolve({
                x,
                y,
                width: measuredWidth,
                height: measuredHeight,
            });
        });
    });
const normalizeExistingPages = (
    value: unknown
): ExistingRouteData => {
    if (!Array.isArray(value)) {
        return {
            scanPages: [],
            legacyImages: [],
        };
    }
    const scanPages: ScanPage[] = [];
    const legacyImages: LocalScanImage[] = [];
    value.forEach((item) => {
        if (isScanPage(item)) {
            scanPages.push(item);
            return;
        }
        if (typeof item === 'string' && item.trim()) {
            legacyImages.push({
                uri: item.trim(),
                source: 'legacy',
            });
        }
    });
    return {
        scanPages,
        legacyImages,
    };
};
const getErrorMessage = (
    error: unknown,
    fallback: string
): string => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};
export default function ScannerScreen({
    route,
    navigation,
}: any) {
    const insets = useSafeAreaInsets();
    const { width, height } = useWindowDimensions();
    const [permission, requestPermission] =
        useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const rootViewRef = useRef<View>(null);
    const scanFrameRef = useRef<View>(null);
    const qualityCheckSequenceRef = useRef(0);
    const existingRouteData = useMemo(
        () =>
            normalizeExistingPages(
                route?.params?.existingPages
            ),
        [route?.params?.existingPages]
    );
    const [newImages, setNewImages] = useState<
        LocalScanImage[]
    >([]);
    const [isCameraReady, setIsCameraReady] =
        useState(false);
    const [isCapturing, setIsCapturing] =
        useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [statusMessage, setStatusMessage] = useState(
        'Ilagay ang buong pahina sa loob ng kahon.'
    );
    const [qualityTone, setQualityTone] =
        useState<QualityTone>('neutral');
    const { showAlert, AlertRender } = useCustomAlert();
    const existingPageCount =
        existingRouteData.scanPages.length +
        existingRouteData.legacyImages.length;
    const totalPageCount = existingPageCount + newImages.length;
    const maximumPages = getMaximumScanPages();
    const remainingPageSlots = Math.max(
        0,
        maximumPages - totalPageCount
    );
    const isAddingPages = existingPageCount > 0;
    const isBusy = isCapturing || isSaving;
    const qualityColor =
        qualityTone === 'good'
            ? COLORS.success
            : qualityTone === 'warning'
              ? COLORS.warning
              : qualityTone === 'error'
                ? COLORS.danger
                : COLORS.primaryLight;
    const qualityIcon =
        qualityTone === 'good'
            ? 'checkmark-circle'
            : qualityTone === 'warning'
              ? 'warning'
              : qualityTone === 'error'
                ? 'alert-circle'
                : qualityTone === 'checking'
                  ? 'scan'
                  : 'information-circle';
    const bottomSheetHeight =
        totalPageCount > 0
            ? 210 + insets.bottom
            : 148 + insets.bottom;
    const headerHeight = insets.top + 64;
    const availableFrameHeight = Math.max(
        230,
        height -
            headerHeight -
            bottomSheetHeight -
            76
    );
    const scanFrameWidth = Math.min(width - 32, 430);
    const scanFrameHeight = Math.min(
        scanFrameWidth * 1.28,
        availableFrameHeight
    );
    const pagePreviews = useMemo<PagePreview[]>(() => {
        const savedPages = existingRouteData.scanPages.map(
            (page) => ({
                key: `saved_${page.id}`,
                uri: page.editedUri,
            })
        );
        const legacyPages =
            existingRouteData.legacyImages.map(
                (image, index) => ({
                    key: `legacy_${index}_${image.uri}`,
                    uri: image.uri,
                })
            );
        const capturedPages = newImages.map(
            (image, index) => ({
                key: `new_${index}_${image.uri}`,
                uri: image.uri,
            })
        );
        return [
            ...savedPages,
            ...legacyPages,
            ...capturedPages,
        ];
    }, [existingRouteData, newImages]);
    useEffect(() => {
        if (isFlashOn && !permission?.granted) {
            setIsFlashOn(false);
        }
    }, [isFlashOn, permission?.granted]);
    const showPageLimitAlert = (): void => {
        showAlert(
            'Puno na ang document',
            `Hanggang ${maximumPages} pahina lamang ang maaaring ilagay sa isang document.`,
            'warning',
            [{ text: 'Naiintindihan ko' }]
        );
    };
    const cropPhotoToScanFrame = async (
        photoUri: string,
        photoWidth: number,
        photoHeight: number
    ): Promise<{ uri: string; width: number; height: number }> => {
        const [rootRect, frameRect] = await Promise.all([
            measureViewInWindow(rootViewRef.current),
            measureViewInWindow(scanFrameRef.current),
        ]);
        const previewScale = Math.max(
            rootRect.width / photoWidth,
            rootRect.height / photoHeight
        );
        const renderedWidth = photoWidth * previewScale;
        const renderedHeight = photoHeight * previewScale;
        const hiddenX = (renderedWidth - rootRect.width) / 2;
        const hiddenY = (renderedHeight - rootRect.height) / 2;
        const frameX = frameRect.x - rootRect.x;
        const frameY = frameRect.y - rootRect.y;
        const originX = clamp(
            Math.round((frameX + hiddenX) / previewScale),
            0,
            Math.max(0, photoWidth - 2)
        );
        const originY = clamp(
            Math.round((frameY + hiddenY) / previewScale),
            0,
            Math.max(0, photoHeight - 2)
        );
        const cropWidth = clamp(
            Math.round(frameRect.width / previewScale),
            2,
            photoWidth - originX
        );
        const cropHeight = clamp(
            Math.round(frameRect.height / previewScale),
            2,
            photoHeight - originY
        );
        const croppedPhoto = await ImageManipulator.manipulateAsync(
            photoUri,
            [{
                crop: {
                    originX,
                    originY,
                    width: cropWidth,
                    height: cropHeight,
                },
            }],
            {
                compress: 0.92,
                format: ImageManipulator.SaveFormat.JPEG,
            }
        );
        return {
            uri: croppedPhoto.uri,
            width: croppedPhoto.width,
            height: croppedPhoto.height,
        };
    };
    const assessCapturedPage = async (
        imageUri: string,
        pageNumber: number,
        flashWasOn: boolean
    ): Promise<void> => {
        const checkSequence =
            ++qualityCheckSequenceRef.current;
        setQualityTone('checking');
        setStatusMessage(
            `Sinusuri ang linaw ng pahina ${pageNumber}…`
        );
        try {
            const recognitionResult =
                await TextRecognition.recognize(imageUri);
            const recognizedText = (
                recognitionResult?.text ?? ''
            ).replace(/\s+/g, ' ').trim();
            if (
                checkSequence !==
                qualityCheckSequenceRef.current
            ) {
                return;
            }
            if (recognizedText.length < 35) {
                setQualityTone('warning');
                setStatusMessage(
                    flashWasOn
                        ? 'Kaunti ang nabasang text. Posibleng malabo o may gusot—pakitingnan ang thumbnail.'
                        : 'Kaunti ang nabasang text. Posibleng madilim, malabo, o may gusot—subukan ang Flash.'
                );
                return;
            }
            setQualityTone('good');
            setStatusMessage(
                `Malinaw ang pahina ${pageNumber}. Maaari nang kumuha ng susunod.`
            );
        } catch {
            if (
                checkSequence !==
                qualityCheckSequenceRef.current
            ) {
                return;
            }
            setQualityTone('neutral');
            setStatusMessage(
                `Nakuha ang pahina ${pageNumber}. Pakitingnan ang thumbnail bago magpatuloy.`
            );
        }
    };
    const handleCapture = async (): Promise<void> => {
        if (
            !cameraRef.current ||
            !isCameraReady ||
            isBusy
        ) {
            return;
        }
        if (remainingPageSlots <= 0) {
            showPageLimitAlert();
            return;
        }
        setIsCapturing(true);
        setQualityTone('checking');
        setStatusMessage('Kinukuha ang larawan…');
        try {
            const flashWasOn = isFlashOn;
            const photo =
                await cameraRef.current.takePictureAsync({
                    quality: 0.92,
                    base64: false,
                    skipProcessing: false,
                });
            if (!photo?.uri) {
                throw new Error(
                    'Walang larawang nakuha mula sa camera.'
                );
            }
            if (!photo.width || !photo.height) {
                throw new Error(
                    'Hindi nakuha ang sukat ng larawan.'
                );
            }
            const croppedPhoto = await cropPhotoToScanFrame(
                photo.uri,
                photo.width,
                photo.height
            );
            setNewImages((previousImages) => [
                ...previousImages,
                {
                    uri: croppedPhoto.uri,
                    source: 'camera',
                    width: croppedPhoto.width,
                    height: croppedPhoto.height,
                },
            ]);
            const nextPageNumber = totalPageCount + 1;
            setIsFlashOn(false);
            void assessCapturedPage(
                croppedPhoto.uri,
                nextPageNumber,
                flashWasOn
            );
        } catch (error: unknown) {
            setQualityTone('error');
            setStatusMessage(
                'Hindi nakuha ang larawan. Subukan ulit.'
            );
            showAlert(
                'Hindi nakuha ang larawan',
                getErrorMessage(
                    error,
                    'Pakisubukan ulit at panatilihing steady ang phone.'
                ),
                'error',
                [{ text: 'Subukan ulit' }]
            );
        } finally {
            setIsCapturing(false);
        }
    };
    const handlePickFromGallery = async (): Promise<void> => {
        if (isBusy) {
            return;
        }
        if (remainingPageSlots <= 0) {
            showPageLimitAlert();
            return;
        }
        try {
            const result =
                await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsMultipleSelection: true,
                    selectionLimit: remainingPageSlots,
                    orderedSelection: true,
                    quality: 0.95,
                    exif: false,
                });
            if (result.canceled || !result.assets?.length) {
                return;
            }
            const selectedImages = result.assets
                .slice(0, remainingPageSlots)
                .map(
                    (asset): LocalScanImage => ({
                        uri: asset.uri,
                        source: 'gallery',
                        width: asset.width,
                        height: asset.height,
                    })
                );
            setNewImages((previousImages) => [
                ...previousImages,
                ...selectedImages,
            ]);
            qualityCheckSequenceRef.current += 1;
            setQualityTone('good');
            setStatusMessage(
                `${selectedImages.length} larawan ang idinagdag mula sa Gallery.`
            );
        } catch (error: unknown) {
            setQualityTone('error');
            showAlert(
                'Hindi mabuksan ang Gallery',
                getErrorMessage(
                    error,
                    'Pakisuri ang gallery permission ng Lex-Simple.'
                ),
                'error',
                [
                    { text: 'Bumalik', style: 'cancel' },
                    {
                        text: 'Buksan ang Settings',
                        onPress: () => Linking.openSettings(),
                    },
                ]
            );
        }
    };
    const openPageReview = (pages: ScanPage[]): void => {
        if (isAddingPages) {
            navigation.navigate({
                name: 'BatchEditScreen',
                params: { pages },
                merge: true,
            });
            return;
        }
        if (typeof navigation.replace === 'function') {
            navigation.replace('BatchEditScreen', {
                pages,
            });
            return;
        }
        navigation.navigate('BatchEditScreen', {
            pages,
        });
    };
    const handleFinishScanning = async (): Promise<void> => {
        if (totalPageCount === 0 || isBusy) {
            return;
        }
        if (isAddingPages && newImages.length === 0) {
            navigation.goBack();
            return;
        }
        setIsSaving(true);
        setStatusMessage(
            'Sine-save ang mga pahina sa phone…'
        );
        try {
            let savedPages: ScanPage[];
            if (
                existingRouteData.scanPages.length > 0 &&
                existingRouteData.legacyImages.length === 0
            ) {
                savedPages = appendToScanSession(
                    existingRouteData.scanPages,
                    newImages
                );
            } else {
                savedPages = createScanSession([
                    ...existingRouteData.legacyImages,
                    ...newImages,
                ]);
            }
            if (savedPages.length === 0) {
                throw new Error(
                    'Walang pahinang na-save.'
                );
            }
            openPageReview(savedPages);
        } catch (error: unknown) {
            setStatusMessage(
                'Hindi na-save ang document. Subukan ulit.'
            );
            showAlert(
                'Hindi na-save ang document',
                getErrorMessage(
                    error,
                    'Pakisubukan ulit. Walang larawan ang ipinadala sa internet.'
                ),
                'error',
                [{ text: 'Subukan ulit' }]
            );
        } finally {
            setIsSaving(false);
        }
    };
    const handleClose = (): void => {
        if (isBusy) {
            return;
        }
        if (newImages.length === 0) {
            navigation.goBack();
            return;
        }
        showAlert(
            'Bumalik at itapon ang bagong larawan?',
            `${newImages.length} bagong pahina ang hindi pa nase-save.`,
            'warning',
            [
                {
                    text: 'Ituloy ang pag-scan',
                    style: 'cancel',
                },
                {
                    text: 'Bumalik',
                    style: 'destructive',
                    onPress: () => navigation.goBack(),
                },
            ]
        );
    };
    const renderPagePreview = ({
        item,
        index,
    }: {
        item: PagePreview;
        index: number;
    }) => (
        <View style={styles.thumbnailContainer}>
            <View style={styles.thumbnailImageFrame}>
                <Image
                    source={{ uri: item.uri }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                    accessibilityLabel={`Larawan ng pahina ${index + 1}`}
                />
                <View style={styles.pageNumberBadge}>
                    <Text style={styles.pageNumberText}>
                        {index + 1}
                    </Text>
                </View>
            </View>
        </View>
    );
    if (!permission) {
        return (
            <View style={styles.centeredScreen}>
                <StatusBar barStyle="light-content" />
                <ActivityIndicator
                    size="large"
                    color={COLORS.primary}
                />
                <Text style={styles.loadingTitle}>
                    Binubuksan ang camera…
                </Text>
                <Text style={styles.loadingMessage}>
                    Sandali lamang.
                </Text>
                <AlertRender />
            </View>
        );
    }
    if (!permission.granted) {
        return (
            <View
                style={[
                    styles.permissionScreen,
                    {
                        paddingTop: insets.top + 20,
                        paddingBottom: insets.bottom + 20,
                    },
                ]}
            >
                <StatusBar barStyle="light-content" />
                <TouchableOpacity
                    style={styles.permissionBackButton}
                    onPress={() => navigation.goBack()}
                    accessibilityRole="button"
                    accessibilityLabel="Bumalik"
                >
                    <Ionicons
                        name="arrow-back"
                        size={24}
                        color={COLORS.text}
                    />
                    <Text style={styles.permissionBackText}>
                        Bumalik
                    </Text>
                </TouchableOpacity>
                <View style={styles.permissionContent}>
                    <View style={styles.permissionIconBox}>
                        <Ionicons
                            name="camera"
                            size={48}
                            color={COLORS.primaryLight}
                        />
                    </View>
                    <Text style={styles.permissionTitle}>
                        Payagan ang Camera
                    </Text>
                    <Text style={styles.permissionMessage}>
                        Kailangan ito para makuhanan ang iyong document. Sa phone mo muna sine-save ang mga larawan.
                    </Text>
                    <TouchableOpacity
                        style={styles.largePrimaryButton}
                        onPress={async () => {
                            const result =
                                await requestPermission();
                            if (!result.granted) {
                                showAlert(
                                    'Hindi pinayagan ang Camera',
                                    'Maaari mo itong payagan sa Settings, o pumili na lamang ng larawan mula sa Gallery.',
                                    'warning',
                                    [
                                        {
                                            text: 'Gallery na lang',
                                            onPress:
                                                handlePickFromGallery,
                                        },
                                        {
                                            text: 'Buksan ang Settings',
                                            onPress: () =>
                                                Linking.openSettings(),
                                        },
                                    ]
                                );
                            }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Payagan ang Camera"
                    >
                        <Ionicons
                            name="camera-outline"
                            size={24}
                            color={COLORS.text}
                        />
                        <Text style={styles.largePrimaryButtonText}>
                            Payagan ang Camera
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.largeSecondaryButton}
                        onPress={handlePickFromGallery}
                        accessibilityRole="button"
                        accessibilityLabel="Pumili mula sa Gallery"
                    >
                        <Ionicons
                            name="images-outline"
                            size={24}
                            color={COLORS.primaryLight}
                        />
                        <Text style={styles.largeSecondaryButtonText}>
                            Pumili sa Gallery
                        </Text>
                    </TouchableOpacity>
                    {totalPageCount > 0 && (
                        <TouchableOpacity
                            style={[
                                styles.largePrimaryButton,
                                styles.permissionFinishButton,
                            ]}
                            onPress={handleFinishScanning}
                            disabled={isBusy}
                        >
                            {isSaving ? (
                                <ActivityIndicator
                                    color={COLORS.text}
                                />
                            ) : (
                                <Ionicons
                                    name="checkmark-circle"
                                    size={24}
                                    color={COLORS.text}
                                />
                            )}
                            <Text style={styles.largePrimaryButtonText}>
                                Tingnan muna
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                <AlertRender />
            </View>
        );
    }
    return (
        <View
            ref={rootViewRef}
            collapsable={false}
            style={styles.container}
            testID="scanner-screen-v3"
        >
            <StatusBar
                barStyle="light-content"
                backgroundColor={COLORS.black}
                translucent={Platform.OS === 'android'}
            />
            <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFillObject}
                facing="back"
                enableTorch={isFlashOn}
                onCameraReady={() => setIsCameraReady(true)}
            />
            <View
                pointerEvents="none"
                style={styles.cameraTint}
            />
            <View
                style={[
                    styles.header,
                    {
                        height: headerHeight,
                        paddingTop: insets.top,
                    },
                ]}
            >
                <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={handleClose}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Bumalik"
                >
                    <Ionicons
                        name="arrow-back"
                        size={23}
                        color={COLORS.text}
                    />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text
                        style={styles.headerTitle}
                        numberOfLines={1}
                    >
                        {isAddingPages
                            ? 'Magdagdag ng Pahina'
                            : 'I-scan ang Document'}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {totalPageCount} pahina
                    </Text>
                </View>
                <TouchableOpacity
                    style={[
                        styles.headerIconButton,
                        isFlashOn && styles.flashButtonOn,
                    ]}
                    onPress={() =>
                        setIsFlashOn((value) => !value)
                    }
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={
                        isFlashOn
                            ? 'Patayin ang Flash'
                            : 'Buksan ang Flash'
                    }
                >
                    <Ionicons
                        name={
                            isFlashOn
                                ? 'flash'
                                : 'flash-off'
                        }
                        size={21}
                        color={
                            isFlashOn
                                ? COLORS.warning
                                : COLORS.text
                        }
                    />
                </TouchableOpacity>
            </View>
            <View
                style={[
                    styles.cameraContent,
                    {
                        paddingTop: headerHeight + 8,
                        paddingBottom: bottomSheetHeight + 8,
                    },
                ]}
            >
                <View
                    ref={scanFrameRef}
                    collapsable={false}
                    style={[
                        styles.scanFrame,
                        {
                            width: scanFrameWidth,
                            height: scanFrameHeight,
                        },
                    ]}
                >
                    <View
                        style={[
                            styles.scanCorner,
                            styles.topLeftCorner,
                        ]}
                    />
                    <View
                        style={[
                            styles.scanCorner,
                            styles.topRightCorner,
                        ]}
                    />
                    <View
                        style={[
                            styles.scanCorner,
                            styles.bottomLeftCorner,
                        ]}
                    />
                    <View
                        style={[
                            styles.scanCorner,
                            styles.bottomRightCorner,
                        ]}
                    />
                </View>
                <View
                    style={[
                        styles.statusPill,
                        { borderColor: qualityColor },
                    ]}
                >
                    {qualityTone === 'checking' ? (
                        <ActivityIndicator
                            size="small"
                            color={qualityColor}
                        />
                    ) : (
                        <Ionicons
                            name={qualityIcon as any}
                            size={18}
                            color={qualityColor}
                        />
                    )}
                    <Text
                        style={styles.instructionText}
                        numberOfLines={3}
                    >
                        {statusMessage}
                    </Text>
                </View>
            </View>
            <View
                style={[
                    styles.bottomSheet,
                    {
                        height: bottomSheetHeight,
                        paddingBottom: insets.bottom + 8,
                    },
                ]}
            >
                {pagePreviews.length > 0 && (
                    <View style={styles.pagesSection}>
                        <View style={styles.pagesHeaderRow}>
                            <Text style={styles.pagesSectionTitle}>
                                MGA PAHINA
                            </Text>
                            <Text style={styles.pagesCountText}>
                                {totalPageCount}
                            </Text>
                        </View>
                        <FlatList
                            horizontal
                            data={pagePreviews}
                            keyExtractor={(item) => item.key}
                            renderItem={renderPagePreview}
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={
                                styles.thumbnailList
                            }
                        />
                    </View>
                )}
                <View style={styles.captureRow}>
                    <TouchableOpacity
                        style={styles.galleryButton}
                        onPress={handlePickFromGallery}
                        disabled={isBusy}
                        accessibilityRole="button"
                        accessibilityLabel="Pumili ng larawan sa Gallery"
                    >
                        <View style={styles.galleryIconBox}>
                            <Ionicons
                                name="images-outline"
                                size={25}
                                color={COLORS.text}
                            />
                        </View>
                        <Text style={styles.galleryButtonText}>
                            Gallery
                        </Text>
                    </TouchableOpacity>
                    <View style={styles.captureCenter}>
                        <TouchableOpacity
                            style={[
                                styles.shutterButton,
                                (!isCameraReady || isBusy) &&
                                    styles.disabledButton,
                            ]}
                            onPress={handleCapture}
                            disabled={!isCameraReady || isBusy}
                            accessibilityRole="button"
                            accessibilityLabel="Kunan ang pahina"
                        >
                            {isCapturing ? (
                                <ActivityIndicator
                                    size="small"
                                    color={COLORS.primary}
                                />
                            ) : (
                                <View
                                    style={styles.shutterInner}
                                />
                            )}
                        </TouchableOpacity>
                        <Text style={styles.captureLabel}>
                            Kunan
                        </Text>
                    </View>
                    <View style={styles.pageCountControl}>
                        <Ionicons
                            name="documents-outline"
                            size={23}
                            color={COLORS.subText}
                        />
                        <Text style={styles.pageCountControlText}>
                            {totalPageCount} pahina
                        </Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={[
                        styles.finishButton,
                        totalPageCount === 0 &&
                            styles.disabledButton,
                    ]}
                    onPress={handleFinishScanning}
                    disabled={totalPageCount === 0 || isBusy}
                    accessibilityRole="button"
                    accessibilityLabel={
                        totalPageCount > 0
                            ? `Tingnan muna ang ${totalPageCount} pahina.`
                            : 'Kumuha muna ng pahina'
                    }
                >
                    {isSaving ? (
                        <ActivityIndicator
                            color={COLORS.text}
                        />
                    ) : (
                        <Ionicons
                            name="checkmark-circle"
                            size={25}
                            color={COLORS.text}
                        />
                    )}
                    <Text style={styles.finishButtonText}>
                        {totalPageCount === 0
                            ? 'Kumuha muna ng pahina'
                            : 'Tingnan muna'}
                    </Text>
                </TouchableOpacity>
            </View>
            {isSaving && (
                <View style={styles.savingOverlay}>
                    <View style={styles.savingCard}>
                        <ActivityIndicator
                            size="large"
                            color={COLORS.primary}
                        />
                        <Text style={styles.savingTitle}>
                            Sine-save ang document…
                        </Text>
                        <Text style={styles.savingMessage}>
                            Huwag munang isara ang app.
                        </Text>
                    </View>
                </View>
            )}
            <AlertRender />
        </View>
    );
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.black,
    },
    cameraTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.12)',
    },
    header: {
        position: 'absolute',
        zIndex: 10,
        top: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.12)',
    },
    headerIconButton: {
        width: 44,
        height: 44,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#17191E',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 10,
    },
    headerTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
        textAlign: 'center',
    },
    headerSubtitle: {
        color: COLORS.subText,
        fontSize: 11,
        fontWeight: '700',
        marginTop: 3,
    },
    flashButtonOn: {
        backgroundColor: 'rgba(251, 191, 36, 0.18)',
        borderWidth: 1,
        borderColor: 'rgba(251, 191, 36, 0.42)',
    },
    cameraContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanFrame: {
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 6,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.60)',
        backgroundColor: 'rgba(0, 0, 0, 0.03)',
    },
    scanCorner: {
        position: 'absolute',
        width: 48,
        height: 48,
        borderColor: COLORS.primaryLight,
    },
    topLeftCorner: {
        top: -2,
        left: -2,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 5,
    },
    topRightCorner: {
        top: -2,
        right: -2,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 5,
    },
    bottomLeftCorner: {
        bottom: -2,
        left: -2,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 5,
    },
    bottomRightCorner: {
        right: -2,
        bottom: -2,
        borderRightWidth: 4,
        borderBottomWidth: 4,
        borderBottomRightRadius: 5,
    },
    statusPill: {
        width: '84%',
        maxWidth: 430,
        minHeight: 40,
        marginTop: 8,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.76)',
        borderWidth: 1,
    },
    instructionText: {
        flexShrink: 1,
        color: COLORS.text,
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600',
        textAlign: 'left',
        marginLeft: 8,
    },
    bottomSheet: {
        position: 'absolute',
        zIndex: 12,
        left: 8,
        right: 8,
        bottom: 6,
        paddingTop: 8,
        paddingHorizontal: 14,
        backgroundColor: '#080A0F',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        overflow: 'hidden',
    },
    pagesSection: {
        height: 60,
        marginBottom: 2,
    },
    pagesHeaderRow: {
        height: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    pagesSectionTitle: {
        color: COLORS.muted,
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    pagesCountText: {
        color: COLORS.primaryLight,
        fontSize: 11,
        fontWeight: '900',
        marginLeft: 7,
    },
    thumbnailList: {
        paddingRight: 10,
        paddingTop: 1,
        paddingHorizontal: 1,
    },
    thumbnailContainer: {
        width: 40,
        height: 44,
        marginRight: 8,
    },
    thumbnailImageFrame: {
        width: 40,
        height: 44,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: COLORS.elevated,
        borderWidth: 2,
        borderColor: COLORS.border,
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
        borderRadius: 3,
    },
    pageNumberBadge: {
        position: 'absolute',
        left: 3,
        bottom: 3,
        minWidth: 16,
        height: 16,
        paddingHorizontal: 3,
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
    },
    pageNumberText: {
        color: COLORS.text,
        fontSize: 8,
        fontWeight: '900',
    },
    captureRow: {
        height: 76,
        marginTop: 2,
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    galleryButton: {
        width: 86,
        alignItems: 'center',
    },
    galleryIconBox: {
        width: 40,
        height: 40,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.elevated,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    galleryButtonText: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: '800',
        marginTop: 6,
    },
    captureCenter: {
        alignItems: 'center',
    },
    shutterButton: {
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.20)',
        borderWidth: 4,
        borderColor: COLORS.text,
    },
    shutterInner: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: COLORS.text,
    },
    captureLabel: {
        color: COLORS.text,
        fontSize: 11,
        fontWeight: '900',
        marginTop: 4,
    },
    pageCountControl: {
        width: 86,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageCountControlText: {
        color: COLORS.subText,
        fontSize: 11,
        textAlign: 'center',
        fontWeight: '800',
        marginTop: 4,
    },
    finishButton: {
        width: '100%',
        height: 46,
        marginTop: 2,
        marginBottom: 4,
        borderRadius: 6,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
    },
    finishButtonText: {
        color: COLORS.text,
        fontSize: 15,
        fontWeight: '900',
        textAlign: 'center',
        marginLeft: 9,
    },
    disabledButton: {
        opacity: 0.42,
    },
    savingOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 40,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
    },
    savingCard: {
        width: '100%',
        maxWidth: 330,
        borderRadius: 8,
        padding: 24,
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    savingTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: '900',
        marginTop: 14,
    },
    savingMessage: {
        color: COLORS.subText,
        fontSize: 14,
        marginTop: 6,
    },
    centeredScreen: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        backgroundColor: COLORS.background,
    },
    loadingTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: '900',
        marginTop: 16,
    },
    loadingMessage: {
        color: COLORS.subText,
        fontSize: 14,
        marginTop: 6,
    },
    permissionScreen: {
        flex: 1,
        paddingHorizontal: 22,
        backgroundColor: COLORS.background,
    },
    permissionBackButton: {
        alignSelf: 'flex-start',
        minHeight: 50,
        borderRadius: 13,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    permissionBackText: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: '800',
        marginLeft: 7,
    },
    permissionContent: {
        flex: 1,
        width: '100%',
        maxWidth: 390,
        alignSelf: 'center',
        alignItems: 'center',
        justifyContent: 'center',
    },
    permissionIconBox: {
        width: 94,
        height: 94,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(52, 120, 246, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(52, 120, 246, 0.32)',
        marginBottom: 24,
    },
    permissionTitle: {
        color: COLORS.text,
        fontSize: 24,
        fontWeight: '900',
        textAlign: 'center',
    },
    permissionMessage: {
        color: COLORS.subText,
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'center',
        marginTop: 10,
        marginBottom: 26,
    },
    largePrimaryButton: {
        width: '100%',
        minHeight: 58,
        borderRadius: 15,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
    },
    largePrimaryButtonText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
        marginLeft: 10,
    },
    largeSecondaryButton: {
        width: '100%',
        minHeight: 58,
        borderRadius: 15,
        paddingHorizontal: 18,
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    largeSecondaryButtonText: {
        color: COLORS.primaryLight,
        fontSize: 16,
        fontWeight: '900',
        marginLeft: 10,
    },
    permissionFinishButton: {
        marginTop: 12,
        backgroundColor: COLORS.success,
    },
});
