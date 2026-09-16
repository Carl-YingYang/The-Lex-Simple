import type { ScanPage } from '../../../types/ScanPage';

import {

    rotatePageClockwise,

} from '../../../services/localImageEditor';

import React, { useRef, useState } from 'react';

import {

    View,

    Text,

    TouchableOpacity,

    Image,

    StyleSheet,

    StatusBar,

    Dimensions,

    FlatList,

    LayoutChangeEvent,

    PanResponder,

    DimensionValue, // <-- IMPORTANTE: Dinagdag para sa TypeScript fix

} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';

import ProcessingLoader from '../../../components/ProcessingLoader';

import { useCustomAlert } from '../../../components/CustomAlert';

const { width } = Dimensions.get('window');

type ActiveMenu = 'main' | 'crop' | 'adjust' | 'filters';

type FilterType = 'original' | 'magic' | 'grayscale' | 'bw';

type NumericMap = Record<number, number>;

type StringMap = Record<number, string>;

type CropState = {

    enabled: boolean;

    top: number;

    left: number;

    right: number;

    bottom: number;

};

type CropMap = Record<number, CropState>;

const MIN_ADJUST = -100;

const MAX_ADJUST = 100;

const DEFAULT_CROP: CropState = {

    enabled: false,

    top: 0,

    left: 0,

    right: 0,

    bottom: 0,

};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const valueToPercent = (value: number) => {

    return (((value - MIN_ADJUST) / (MAX_ADJUST - MIN_ADJUST)) * 100);

};

const percentToValue = (percent: number) => {

    const safePercent = clamp(percent, 0, 100);

    const value = MIN_ADJUST + ((MAX_ADJUST - MIN_ADJUST) * safePercent) / 100;

    return Math.round(value);

};

// ================================================================

// TOP-LEVEL SLIDER

// ================================================================

type AdjustmentSliderProps = {

    value: number;

    onChange: (value: number) => void;

};

function AdjustmentSlider({ value, onChange }: AdjustmentSliderProps) {

    // PanResponder is created only once. Values used by its callbacks must live
    // in refs; otherwise it permanently captures sliderWidth === 0.
    const sliderWidthRef = useRef(0);
    const currentValueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const startDragValue = useRef(0);

    currentValueRef.current = value;
    onChangeRef.current = onChange;

    const panResponder = useRef(

        PanResponder.create({

            onStartShouldSetPanResponder: () => true,

            onMoveShouldSetPanResponder: () => true,

            onPanResponderGrant: (evt) => {

                const sliderWidth = sliderWidthRef.current;
                if (sliderWidth > 0) {

                    // Kapag tinap mo yung track, tatalon agad yung thumb

                    const touchX = evt.nativeEvent.locationX;

                    const percent = (touchX / sliderWidth) * 100;

                    const tappedValue = percentToValue(percent);

                    onChangeRef.current(tappedValue);

                    startDragValue.current = tappedValue; // I-save kung saan nag-start para sa drag

                } else {

                    startDragValue.current = currentValueRef.current;

                }

            },

            onPanResponderMove: (_evt, gestureState) => {

                const sliderWidth = sliderWidthRef.current;
                if (sliderWidth <= 0) return;

                // gestureState.dx = pixels na nai-drag mo pakaliwa o pakanan

                const range = MAX_ADJUST - MIN_ADJUST;

                const movementValue = (gestureState.dx / sliderWidth) * range;

                const newValue = startDragValue.current + movementValue;

                onChangeRef.current(clamp(Math.round(newValue), MIN_ADJUST, MAX_ADJUST));

            },

        })

    ).current;

    const handleLayout = (evt: LayoutChangeEvent) => {

        sliderWidthRef.current = evt.nativeEvent.layout.width;

    };

    const thumbLeft = `${valueToPercent(value)}%` as DimensionValue;

    const centerLeft = '50%' as DimensionValue;

    return (

        <View

            style={[styles.sliderWrapper, { height: 40 }]}

            onLayout={handleLayout}

            {...panResponder.panHandlers}

        >

            {/* pointerEvents="none" prevents these elements from blocking your drag */}

            <View style={styles.sliderTrack} pointerEvents="none" />

            <View style={[styles.sliderCenterMark, { left: centerLeft }]} pointerEvents="none" />

            <View style={[styles.sliderThumb, { left: thumbLeft }]} pointerEvents="none" />

        </View>

    );

}

type CropCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

type DraggableCropOverlayProps = {
    crop: CropState;
    onChange: (crop: CropState) => void;
};

function DraggableCropOverlay({ crop, onChange }: DraggableCropOverlayProps) {
    const sizeRef = useRef({ width: 0, height: 0 });
    const cropRef = useRef(crop);
    const onChangeRef = useRef(onChange);
    const startCropRef = useRef(crop);
    const respondersRef = useRef<Record<CropCorner, ReturnType<typeof PanResponder.create>> | null>(null);

    cropRef.current = crop;
    onChangeRef.current = onChange;

    const makeResponder = (corner: CropCorner) => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
            startCropRef.current = cropRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
            const { width: overlayWidth, height: overlayHeight } = sizeRef.current;
            if (overlayWidth <= 0 || overlayHeight <= 0) return;

            const start = startCropRef.current;
            const dx = (gesture.dx / overlayWidth) * 100;
            const dy = (gesture.dy / overlayHeight) * 100;
            const minimumVisible = 15;
            const next: CropState = { ...start, enabled: true };

            if (corner === 'topLeft' || corner === 'bottomLeft') {
                next.left = clamp(start.left + dx, 0, 100 - start.right - minimumVisible);
            } else {
                next.right = clamp(start.right - dx, 0, 100 - start.left - minimumVisible);
            }

            if (corner === 'topLeft' || corner === 'topRight') {
                next.top = clamp(start.top + dy, 0, 100 - start.bottom - minimumVisible);
            } else {
                next.bottom = clamp(start.bottom - dy, 0, 100 - start.top - minimumVisible);
            }

            onChangeRef.current(next);
        },
    });

    if (!respondersRef.current) {
        respondersRef.current = {
            topLeft: makeResponder('topLeft'),
            topRight: makeResponder('topRight'),
            bottomLeft: makeResponder('bottomLeft'),
            bottomRight: makeResponder('bottomRight'),
        };
    }

    const responders = respondersRef.current!;
    const boxStyle = {
        top: `${crop.top}%` as DimensionValue,
        left: `${crop.left}%` as DimensionValue,
        right: `${crop.right}%` as DimensionValue,
        bottom: `${crop.bottom}%` as DimensionValue,
    };

    return (
        <View
            style={styles.cropGestureArea}
            pointerEvents="box-none"
            onLayout={(event) => {
                sizeRef.current = event.nativeEvent.layout;
            }}
        >
            <View style={[styles.cropOverlay, boxStyle]} pointerEvents="box-none">
                <View style={styles.cropBorder} pointerEvents="box-none">
                    <View style={[styles.cropHandle, styles.topLeft]} {...responders.topLeft.panHandlers} />
                    <View style={[styles.cropHandle, styles.topRight]} {...responders.topRight.panHandlers} />
                    <View style={[styles.cropHandle, styles.bottomLeft]} {...responders.bottomLeft.panHandlers} />
                    <View style={[styles.cropHandle, styles.bottomRight]} {...responders.bottomRight.panHandlers} />
                </View>
            </View>
        </View>
    );
}

// ================================================================

// MAIN SCREEN

// ================================================================

export default function BatchEditScreen({ route, navigation }: any) {

    // PAGES

    const rawPages = route?.params?.pages;

    const [pages, setPages] = useState<ScanPage[]>(() => {

        if (!Array.isArray(rawPages)) {

            return [];

        }

        /**

         * Backward compatibility:

         * Tatanggap pa rin ng lumang string URI pages

         * habang ginagawa natin ang migration.

         */

        return rawPages.map((page, index): ScanPage => {

            if (

                typeof page === 'object' &&

                page !== null &&

                typeof page.editedUri === 'string'

            ) {

                return page as ScanPage;

            }

            const legacyUri = String(page);

            return {

                id: `legacy_page_${Date.now()}_${index}`,

                sessionId: 'legacy',

                originalUri: legacyUri,

                editedUri: legacyUri,

                rotation: 0,

                crop: null,

                brightness: 0,

                contrast: 1,

                filter: 'original',

                status: 'ready',

            };

        });

    });

    const [isApplyingEdit, setIsApplyingEdit] = useState(false);

    const flatListRef = useRef<FlatList<ScanPage>>(null);

    const [currentIndex, setCurrentIndex] = useState(0);

    const [activeMenu, setActiveMenu] = useState<ActiveMenu>('main');

    // EDIT STATES

    const [pageFilters, setPageFilters] = useState<StringMap>({});

    const [pageBrightness, setPageBrightness] = useState<NumericMap>({});

    const [pageContrast, setPageContrast] = useState<NumericMap>({});

    const [pageCrops, setPageCrops] = useState<CropMap>({});

    // PROCESSING

    const { isProcessing, triggerBackgroundProcess } = useBackgroundProcessScreen('BatchEditScreen');

    const { showAlert, AlertRender } = useCustomAlert();

    // CURRENT PAGE VALUES

    const currentBrightness = pageBrightness[currentIndex] ?? 0;

    const currentContrast = pageContrast[currentIndex] ?? 0;

    const currentFilter = (pageFilters[currentIndex] as FilterType) ?? 'original';

    const currentCrop = pageCrops[currentIndex] ?? DEFAULT_CROP;

    // VIEWABILITY

    const onViewRef = useRef(({ viewableItems }: { viewableItems: any[] }) => {

        if (viewableItems?.length > 0 && typeof viewableItems[0]?.index === 'number') {

            setCurrentIndex(viewableItems[0].index);

        }

    });

    const viewConfigRef = useRef({ itemVisiblePercentThreshold: 50 });

    // ROTATE

    const handleRotate = async () => {
        const currentPage = pages[currentIndex];

        if (!currentPage || isApplyingEdit) return;

        setIsApplyingEdit(true);

        setPages((previousPages) =>
            previousPages.map((page, index) =>
                index === currentIndex
                    ? { ...page, status: 'editing' }
                    : page
            )
        );

        try {
            const rotatedPage = await rotatePageClockwise(currentPage);

            setPages((previousPages) =>
                previousPages.map((page, index) =>
                    index === currentIndex ? rotatedPage : page
                )
            );
        } catch (error: any) {
            console.error('[BatchEditScreen] Offline rotation failed:', error);

            setPages((previousPages) =>
                previousPages.map((page, index) =>
                    index === currentIndex
                        ? { ...page, status: 'error' }
                        : page
                )
            );

            showAlert(
                'Rotate Error',
                error?.message || 'Hindi ma-rotate ang page offline.',
                'error',
                [{ text: 'OK' }]
            );
        } finally {
            setIsApplyingEdit(false);
        }
    };

    // FILTER

    const handleFilterChange = (filter: FilterType) => {

        setPageFilters((prev) => ({ ...prev, [currentIndex]: filter }));

    };

    // BRIGHTNESS

    const handleBrightnessChange = (value: number) => {

        setPageBrightness((prev) => ({

            ...prev,

            [currentIndex]: clamp(Math.round(value), MIN_ADJUST, MAX_ADJUST),

        }));

    };

    // CONTRAST

    const handleContrastChange = (value: number) => {

        setPageContrast((prev) => ({

            ...prev,

            [currentIndex]: clamp(Math.round(value), MIN_ADJUST, MAX_ADJUST),

        }));

    };

    // RESET ADJUSTMENTS

    const resetAdjustments = () => {

        setPageBrightness((prev) => ({ ...prev, [currentIndex]: 0 }));

        setPageContrast((prev) => ({ ...prev, [currentIndex]: 0 }));

        setPageFilters((prev) => ({ ...prev, [currentIndex]: 'original' }));

    };

    // CROP

    const handleAutoCrop = () => {

        setPageCrops((prev) => ({

            ...prev,

            [currentIndex]: { enabled: true, top: 8, left: 6, right: 6, bottom: 8 },

        }));

    };

    const handleStraighten = () => {
        showAlert(
            'Straighten',
            'Perspective straighten will be added in the crop phase.',
            'info',
            [{ text: 'OK' }]
        );
    };

    const handleCropDone = () => {

        setPageCrops((prev) => ({

            ...prev,

            [currentIndex]: { ...(prev[currentIndex] ?? DEFAULT_CROP), enabled: true },

        }));

        setActiveMenu('main');

    };

    const handleCropChange = (crop: CropState) => {
        setPageCrops((prev) => ({ ...prev, [currentIndex]: crop }));
    };

    const resetCrop = () => {

        setPageCrops((prev) => ({ ...prev, [currentIndex]: DEFAULT_CROP }));

    };

    // NAVIGATION

    const scrollToIndex = (index: number) => {

        if (index < 0 || index >= pages.length) return;

        flatListRef.current?.scrollToIndex({ index, animated: true });

        setCurrentIndex(index);

    };

    // ANALYZE

    const handleAnalyze = async () => {

        if (pages.length === 0) {

            showAlert('No Images', 'Walang image na pwedeng i-analyze.', 'warning', [{ text: 'OK' }]);

            return;

        }

        const historyId = Date.now().toString();

        const instructions = {

            rotations: {},

            filters: pageFilters,

            brightness: pageBrightness,

            contrast: pageContrast,

            crops: pageCrops,

        };

        try {

            const newItem = {

                id: historyId,

                uri: pages[0].editedUri,

                pageUris: pages.map((page) => page.editedUri),

                title: `Batch Scan (${pages.length} pages)`,

                date: new Date().toLocaleString(),

                type: route?.params?.source === 'gallery' ? 'gallery' : 'camera',

                status: 'unscanned',

                editInstructions: instructions,

            };

            const storedHistory = await AsyncStorage.getItem('@lex_scan_history');

            const historyArray = storedHistory ? JSON.parse(storedHistory) : [];

            await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));

        } catch (error) {

            console.error('Failed to save batch history:', error);

        }

        triggerBackgroundProcess(async (signal: AbortSignal) => {

            const formData = new FormData();

            pages.forEach((page: ScanPage, index: number) => {

                const uri = page.editedUri;

                const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;

                formData.append('files', {

                    uri: fileUri,

                    name: `scan_page_${index + 1}.jpg`,

                    type: 'image/jpeg',

                } as any);

            });

            formData.append('instructions', JSON.stringify(instructions));

            try {

                const { postBatchFileEndpoint } = require('../../../services/AiEngine');

                const data = await postBatchFileEndpoint('/simplify_batch', formData, signal);

                if (data?.status === 'success') {

                    if (!data.results) data.results = [];

                    try {

                        const storedHistory = await AsyncStorage.getItem('@lex_scan_history');

                        if (storedHistory) {

                            const historyArray = JSON.parse(storedHistory);

                            const updatedHistory = historyArray.map((item: any) => {

                                if (item.id === historyId) {

                                    return {

                                        ...item,

                                        status: 'scanned',

                                        analysisResult: data.results?.[0] ?? data.data ?? null,

                                        editInstructions: instructions,

                                    };

                                }

                                return item;

                            });

                            await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(updatedHistory));

                        }

                    } catch (historyError) {

                        console.error('Failed to update batch history:', historyError);

                    }

                    return data;

                }

                throw new Error(data?.message ?? 'Server batch processing failed.');

            } catch (error) {

                throw error;

            }

        }, historyId);

    };

    // IMAGE PREVIEW

    const renderPage = ({ item, index }: { item: ScanPage; index: number }) => {

        const isCurrent = index === currentIndex;

        const filter = pageFilters[index] ?? 'original';

        const brightness = pageBrightness[index] ?? 0;

        const contrast = pageContrast[index] ?? 0;

        const crop = pageCrops[index] ?? DEFAULT_CROP;

        let brightnessOpacity = Math.min(Math.abs(brightness) / 160, 0.55);

        let contrastOpacity = Math.min(Math.abs(contrast) / 220, 0.35);

        return (

            <View style={styles.pageWrapper}>

                <View style={styles.imageCanvas}>

                    <View style={[styles.imageClip, crop.enabled && styles.imageCroppedPreview]}>

                        <Image

                            source={{ uri: item.editedUri }}

                            style={styles.previewImage}

                            resizeMode="contain"

                        />

                        {/* FILTER PREVIEW */}

                        {isCurrent && filter === 'grayscale' && (

                            <View pointerEvents="none" style={[styles.fullOverlay, { backgroundColor: '#777', opacity: 0.22 }]} />

                        )}

                        {isCurrent && filter === 'bw' && (

                            <View pointerEvents="none" style={[styles.fullOverlay, { backgroundColor: '#111', opacity: 0.3 }]} />

                        )}

                        {isCurrent && filter === 'magic' && (

                            <View pointerEvents="none" style={[styles.fullOverlay, { backgroundColor: '#FFD166', opacity: 0.1 }]} />

                        )}

                        {/* BRIGHTNESS PREVIEW */}

                        {isCurrent && brightness !== 0 && (

                            <View pointerEvents="none" style={[styles.fullOverlay, { backgroundColor: brightness > 0 ? '#FFF' : '#000', opacity: brightnessOpacity }]} />

                        )}

                        {/* CONTRAST PREVIEW */}

                        {isCurrent && contrast !== 0 && (

                            <View pointerEvents="none" style={[styles.fullOverlay, { backgroundColor: contrast > 0 ? '#000' : '#FFF', opacity: contrastOpacity }]} />

                        )}

                    </View>

                    {/* CROP OVERLAY */}

                    {isCurrent && activeMenu === 'crop' && (
                        <DraggableCropOverlay
                            crop={crop.enabled ? crop : { enabled: true, top: 10, left: 5, right: 5, bottom: 10 }}
                            onChange={handleCropChange}
                        />
                    )}

                    {/* FILTER BADGE */}

                    {isCurrent && filter !== 'original' && activeMenu !== 'crop' && (

                        <View style={styles.filterBadge}>

                            <Text style={styles.filterBadgeText}>

                                {filter === 'magic' ? 'Magic Color' : filter === 'grayscale' ? 'Grayscale' : 'B&W'}

                            </Text>

                        </View>

                    )}

                    {/* ADJUST BADGE */}

                    {isCurrent && activeMenu === 'adjust' && (

                        <View style={styles.adjustBadge}>

                            <Text style={styles.adjustBadgeText}>

                                B {brightness >= 0 ? '+' : ''}{brightness}   C {contrast >= 0 ? '+' : ''}{contrast}

                            </Text>

                        </View>

                    )}

                </View>

            </View>

        );

    };

    if (isProcessing) {

        return (

            <View style={styles.processingScreen}>

                <StatusBar barStyle="light-content" backgroundColor="#121212" />

                <ProcessingLoader

                    title="Analyzing Documents"

                    messages={[

                        'Preparing document images...',

                        'Applying image adjustments...',

                        'Applying filters...',

                        'Extracting text...',

                        'Connecting to Lex-Simple AI...',

                    ]}

                    onCancel={() => navigation.goBack()}

                />

                <AlertRender />

            </View>

        );

    }

    if (pages.length === 0) {

        return (

            <SafeAreaView style={styles.container}>

                <StatusBar barStyle="light-content" backgroundColor="#121212" />

                <View style={styles.emptyContainer}>

                    <Ionicons name="images-outline" size={60} color="#777" />

                    <Text style={styles.emptyTitle}>No images</Text>

                    <TouchableOpacity style={styles.emptyButton} onPress={() => navigation.goBack()}>

                        <Text style={styles.emptyButtonText}>Go Back</Text>

                    </TouchableOpacity>

                </View>

            </SafeAreaView>

        );

    }

    return (

        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

            <StatusBar barStyle="light-content" backgroundColor="#121212" />

            {/* HEADER */}

            <View style={styles.header}>

                <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.headerIcon}>

                    <Ionicons name="home" size={24} color="#FFF" />

                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>

                    <Text style={styles.headerTitle}>Lex-Simple Scan</Text>

                    <View style={styles.headerTitleUnderline} />

                </View>

                <View style={styles.pageCounter}>

                    <Text style={styles.pageCounterText}>

                        {currentIndex + 1} / {pages.length}

                    </Text>

                </View>

            </View>

            {/* MAIN VIEWER */}

            <View style={styles.mainViewer}>

                <FlatList

                    ref={flatListRef}

                    data={pages}

                    horizontal

                    pagingEnabled

                    showsHorizontalScrollIndicator={false}

                    keyExtractor={(item) => item.id}

                    renderItem={renderPage}

                    onViewableItemsChanged={onViewRef.current}

                    viewabilityConfig={viewConfigRef.current}

                    scrollEnabled={activeMenu === 'main'}

                    getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}

                />

                {currentIndex > 0 && activeMenu === 'main' && (

                    <TouchableOpacity style={styles.arrowLeft} onPress={() => scrollToIndex(currentIndex - 1)}>

                        <Ionicons name="chevron-back-circle" size={40} color="rgba(255,255,255,0.65)" />

                    </TouchableOpacity>

                )}

                {currentIndex < pages.length - 1 && activeMenu === 'main' && (

                    <TouchableOpacity style={styles.arrowRight} onPress={() => scrollToIndex(currentIndex + 1)}>

                        <Ionicons name="chevron-forward-circle" size={40} color="rgba(255,255,255,0.65)" />

                    </TouchableOpacity>

                )}

            </View>

            {/* FILTERS MENU */}

            {activeMenu === 'filters' && (

                <View style={styles.subMenuContainer}>

                    <View style={styles.subMenuHeader}>

                        <Text style={styles.subMenuTitle}>Filters</Text>

                        <TouchableOpacity onPress={() => setActiveMenu('main')}>

                            <Ionicons name="close-circle" size={24} color="#FFF" />

                        </TouchableOpacity>

                    </View>

                    <View style={styles.filterOptionsRow}>

                        {(['original', 'magic', 'grayscale', 'bw'] as FilterType[]).map((filter) => {

                            const active = currentFilter === filter;

                            return (

                                <TouchableOpacity key={filter} style={styles.filterItem} onPress={() => handleFilterChange(filter)}>

                                    <View style={[styles.filterThumb, active && styles.filterThumbActive]}>

                                        <Image source={{ uri: pages[currentIndex]?.editedUri }} style={styles.filterThumbImg} />

                                        {filter === 'grayscale' && <View style={[styles.thumbOverlay, { backgroundColor: '#777', opacity: 0.22 }]} />}

                                        {filter === 'bw' && <View style={[styles.thumbOverlay, { backgroundColor: '#111', opacity: 0.3 }]} />}

                                        {filter === 'magic' && <View style={[styles.thumbOverlay, { backgroundColor: '#FFD166', opacity: 0.1 }]} />}

                                    </View>

                                    <Text style={[styles.filterText, active && styles.filterTextActive]}>

                                        {filter === 'original' ? 'Original' : filter === 'magic' ? 'Auto-color' : filter === 'grayscale' ? 'Grayscale' : 'B&W'}

                                    </Text>

                                </TouchableOpacity>

                            );

                        })}

                    </View>

                </View>

            )}

            {/* ADJUST MENU */}

            {activeMenu === 'adjust' && (

                <View style={styles.subMenuContainer}>

                    <View style={styles.subMenuHeader}>

                        <View>

                            <Text style={styles.subMenuTitle}>Adjust</Text>

                            <Text style={styles.subMenuHint}>Offline preview</Text>

                        </View>

                        <View style={styles.adjustHeaderActions}>

                            <TouchableOpacity style={styles.resetButton} onPress={resetAdjustments}>

                                <Ionicons name="refresh-outline" size={17} color="#4880FF" />

                                <Text style={styles.resetButtonText}>Reset</Text>

                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => setActiveMenu('main')}>

                                <Ionicons name="close-circle" size={24} color="#FFF" />

                            </TouchableOpacity>

                        </View>

                    </View>

                    {/* BRIGHTNESS */}

                    <View style={styles.adjustControlBlock}>

                        <View style={styles.adjustLabelRow}>

                            <View style={styles.adjustLabelLeft}>

                                <Ionicons name="sunny" size={21} color="#FBBF24" />

                                <Text style={styles.adjustLabel}>Brightness</Text>

                            </View>

                            <Text style={styles.adjustValue}>{currentBrightness >= 0 ? '+' : ''}{currentBrightness}</Text>

                        </View>

                        <AdjustmentSlider value={currentBrightness} onChange={handleBrightnessChange} />

                        <View style={styles.sliderLabels}>

                            <Text style={styles.sliderLabel}>Dark</Text>

                            <Text style={styles.sliderLabel}>0</Text>

                            <Text style={styles.sliderLabel}>Bright</Text>

                        </View>

                    </View>

                    {/* CONTRAST */}

                    <View style={styles.adjustControlBlock}>

                        <View style={styles.adjustLabelRow}>

                            <View style={styles.adjustLabelLeft}>

                                <Ionicons name="contrast" size={21} color="#4880FF" />

                                <Text style={styles.adjustLabel}>Contrast</Text>

                            </View>

                            <Text style={styles.adjustValue}>{currentContrast >= 0 ? '+' : ''}{currentContrast}</Text>

                        </View>

                        <AdjustmentSlider value={currentContrast} onChange={handleContrastChange} />

                        <View style={styles.sliderLabels}>

                            <Text style={styles.sliderLabel}>Less</Text>

                            <Text style={styles.sliderLabel}>0</Text>

                            <Text style={styles.sliderLabel}>More</Text>

                        </View>

                    </View>

                    <Text style={styles.helperText}>Brightness and contrast are previewed locally and saved per page.</Text>

                </View>

            )}

            {/* CROP MENU */}

            {activeMenu === 'crop' && (

                <View style={styles.subMenuContainer}>

                    <View style={styles.subMenuHeader}>

                        <View>

                            <Text style={styles.subMenuTitle}>Crop</Text>

                            <Text style={styles.subMenuHint}>Frame preview</Text>

                        </View>

                        <TouchableOpacity onPress={() => setActiveMenu('main')}>

                            <Ionicons name="close-circle" size={24} color="#FFF" />

                        </TouchableOpacity>

                    </View>

                    <View style={styles.cropOptionsRow}>

                        <TouchableOpacity style={styles.cropActionBtn} onPress={handleAutoCrop}>

                            <Ionicons name="scan-outline" size={20} color="#4880FF" />

                            <Text style={styles.cropActionText}>Auto-detect</Text>

                        </TouchableOpacity>

                        <TouchableOpacity style={styles.cropActionBtn} onPress={handleStraighten}>

                            <Ionicons name="grid-outline" size={20} color="#4880FF" />

                            <Text style={styles.cropActionText}>Straighten</Text>

                        </TouchableOpacity>

                        {currentCrop.enabled && (

                            <TouchableOpacity style={[styles.cropActionBtn, styles.cropResetBtn]} onPress={resetCrop}>

                                <Ionicons name="refresh-outline" size={20} color="#EF4444" />

                                <Text style={[styles.cropActionText, { color: '#EF4444' }]}>Reset</Text>

                            </TouchableOpacity>

                        )}

                    </View>

                    <TouchableOpacity style={styles.cropDoneBtn} onPress={handleCropDone}>

                        <Ionicons name="checkmark" size={22} color="#FFF" />

                        <Text style={styles.cropDoneText}>Done</Text>

                    </TouchableOpacity>

                </View>

            )}

            {/* MAIN TOOLBAR */}

            {activeMenu === 'main' && (

                <View style={styles.toolbar}>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => navigation.navigate({ name: 'ScannerScreen', params: { existingPages: pages.map((page) => page.editedUri) }, merge: true })}>

                        <Ionicons name="camera-reverse-outline" size={24} color="#FFF" />

                        <Text style={styles.toolText}>Retake</Text>

                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => setActiveMenu('crop')}>

                        <Ionicons name="crop" size={24} color="#FFF" />

                        <Text style={styles.toolText}>Crop</Text>

                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.toolBtn, isApplyingEdit && { opacity: 0.5 }]}
                        onPress={handleRotate}
                        disabled={isApplyingEdit}
                    >

                        <Ionicons name={isApplyingEdit ? 'hourglass-outline' : 'refresh'} size={24} color="#FFF" />

                        <Text style={styles.toolText}>{isApplyingEdit ? 'Applying...' : 'Rotate'}</Text>

                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => setActiveMenu('adjust')}>

                        <Ionicons name="options-outline" size={24} color="#FFF" />

                        <Text style={styles.toolText}>Adjust</Text>

                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => setActiveMenu('filters')}>

                        <Ionicons name="color-filter-outline" size={24} color="#4880FF" />

                        <Text style={[styles.toolText, { color: '#4880FF' }]}>Filters</Text>

                    </TouchableOpacity>

                </View>

            )}

            {/* BOTTOM BAR */}

            <View style={styles.bottomBar}>

                <TouchableOpacity style={styles.keepScanningBtn} onPress={() => navigation.navigate({ name: 'ScannerScreen', params: { existingPages: pages.map((page) => page.editedUri) }, merge: true })}>

                    <Text style={styles.keepScanningText}>Keep scanning</Text>

                </TouchableOpacity>

                <TouchableOpacity style={styles.saveBtn} onPress={handleAnalyze}>

                    <Text style={styles.saveBtnText}>Analyze ({pages.length})</Text>

                    <Ionicons name="chevron-up" size={20} color="#FFF" style={{ marginLeft: 5 }} />

                </TouchableOpacity>

            </View>

            <AlertRender />

        </SafeAreaView>

    );

}

// ================================================================

// STYLES

// ================================================================

const styles = StyleSheet.create({

    container: { flex: 1, backgroundColor: '#121212' },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 15, backgroundColor: '#121212' },

    headerIcon: { width: 42, padding: 5, alignItems: 'flex-start' },

    headerTitleContainer: { flex: 1, alignItems: 'center' },

    headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },

    headerTitleUnderline: { width: '80%', height: 2, backgroundColor: '#555', marginTop: 4, borderStyle: 'dashed' },

    pageCounter: { width: 42, alignItems: 'flex-end' },

    pageCounterText: { color: '#BBB', fontSize: 12, fontWeight: '700' },

    mainViewer: { flex: 1, backgroundColor: '#1E1E1E', position: 'relative' },

    pageWrapper: { width, height: '100%', justifyContent: 'center', alignItems: 'center', padding: 20 },

    imageCanvas: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },

    imageClip: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden' },

    imageCroppedPreview: { width: '92%', height: '92%' },

    previewImage: { width: '100%', height: '100%' },

    fullOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

    arrowLeft: { position: 'absolute', left: 10, top: '45%', zIndex: 10 },

    arrowRight: { position: 'absolute', right: 10, top: '45%', zIndex: 10 },

    filterBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(72,128,255,0.9)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },

    filterBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },

    adjustBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.75)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },

    adjustBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

    cropGestureArea: { ...StyleSheet.absoluteFillObject },

    cropOverlay: { position: 'absolute', borderWidth: 2, borderColor: '#4880FF' },

    cropBorder: { flex: 1, position: 'relative' },

    cropHandle: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#4880FF', borderWidth: 2, borderColor: '#FFF' },

    topLeft: { top: -12, left: -12 },

    topRight: { top: -12, right: -12 },

    bottomLeft: { bottom: -12, left: -12 },

    bottomRight: { bottom: -12, right: -12 },

    cropHandleBar: { position: 'absolute', backgroundColor: '#4880FF', borderWidth: 1, borderColor: '#FFF' },

    topMid: { top: -6, left: '45%', width: 30, height: 12, borderRadius: 6 },

    bottomMid: { bottom: -6, left: '45%', width: 30, height: 12, borderRadius: 6 },

    leftMid: { left: -6, top: '45%', width: 12, height: 30, borderRadius: 6 },

    rightMid: { right: -6, top: '45%', width: 12, height: 30, borderRadius: 6 },

    toolbar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#121212', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },

    toolBtn: { alignItems: 'center', justifyContent: 'center', width: 60 },

    toolText: { color: '#FFF', fontSize: 11, marginTop: 5 },

    subMenuContainer: { backgroundColor: '#1E1E1E', padding: 15, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },

    subMenuHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },

    subMenuTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

    subMenuHint: { color: '#777', fontSize: 11, marginTop: 3 },

    filterOptionsRow: { flexDirection: 'row', justifyContent: 'space-around' },

    filterItem: { alignItems: 'center' },

    filterThumb: { width: 60, height: 80, borderWidth: 2, borderColor: 'transparent', borderRadius: 8, overflow: 'hidden', marginBottom: 8, position: 'relative' },

    filterThumbActive: { borderColor: '#4880FF' },

    filterThumbImg: { width: '100%', height: '100%' },

    thumbOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

    filterText: { color: '#FFF', fontSize: 12 },

    filterTextActive: { color: '#4880FF', fontWeight: '700' },

    adjustHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },

    resetButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },

    resetButtonText: { color: '#4880FF', fontSize: 12, fontWeight: '700' },

    adjustControlBlock: { marginBottom: 14 },

    adjustLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },

    adjustLabelLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },

    adjustLabel: { color: '#FFF', fontSize: 14, fontWeight: '700' },

    adjustValue: { color: '#4880FF', fontSize: 14, fontWeight: '900', minWidth: 40, textAlign: 'right' },

    sliderWrapper: { height: 34, justifyContent: 'center', position: 'relative' },

    sliderTrack: { position: 'absolute', left: 0, right: 0, height: 5, borderRadius: 3, backgroundColor: '#444' },

    sliderCenterMark: { position: 'absolute', width: 2, height: 14, marginLeft: -1, backgroundColor: '#777' },

    sliderThumb: { position: 'absolute', width: 21, height: 21, marginLeft: -10.5, borderRadius: 11, backgroundColor: '#4880FF', borderWidth: 2, borderColor: '#FFF' },

    sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },

    sliderLabel: { color: '#777', fontSize: 10 },

    helperText: { color: '#777', fontSize: 11, textAlign: 'center', marginTop: 2, fontStyle: 'italic', lineHeight: 16 },

    cropOptionsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 15 },

    cropActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(72,128,255,0.12)', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(72,128,255,0.20)' },

    cropResetBtn: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.16)' },

    cropActionText: { color: '#4880FF', marginLeft: 7, fontWeight: 'bold', fontSize: 12 },

    cropDoneBtn: { alignSelf: 'center', flexDirection: 'row', backgroundColor: '#4880FF', minWidth: 95, height: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

    cropDoneText: { color: '#FFF', fontWeight: '800', marginLeft: 5 },

    bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000', paddingHorizontal: 20, paddingVertical: 15, paddingBottom: 18 },

    keepScanningBtn: { padding: 10 },

    keepScanningText: { color: '#FFF', fontSize: 16, fontWeight: '600' },

    saveBtn: { flexDirection: 'row', backgroundColor: '#0052CC', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, alignItems: 'center' },

    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },

    processingScreen: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },

    emptyContainer: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },

    emptyTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginTop: 14 },

    emptyButton: { marginTop: 20, backgroundColor: '#0052CC', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 20 },

    emptyButtonText: { color: '#FFF', fontWeight: '700' }

});
