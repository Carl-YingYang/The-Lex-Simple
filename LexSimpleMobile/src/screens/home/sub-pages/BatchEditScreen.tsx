import React, {
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    FlatList,
    Image,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import { analyzeSanitizedDocument } from '../../../services/AiEngine';
import {
    isOcrCancelledError,
    recognizePagesOffline,
} from '../../../services/localOcrService';
import type { BatchOcrResult } from '../../../services/localOcrService';
import { buildSanitizedDocumentForAI } from '../../../utils/sanitizer';
import { isScanPage } from '../../../types/ScanPage';
import type { ScanPage } from '../../../types/ScanPage';

// BATCH EDIT SCREEN VERSION: 3.0.0
const COLORS = {
    black: '#000000',
    background: '#090B10',
    surface: '#11151C',
    elevated: '#181E28',
    border: '#2A3240',
    primary: '#3478F6',
    primaryLight: '#66A0FF',
    text: '#FFFFFF',
    subText: '#B8C0CC',
    muted: '#788395',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
};
const HISTORY_STORAGE_KEY = '@lex_scan_history';
const createLegacyPage = (
    uri: string,
    index: number
): ScanPage => ({
    id: `legacy_page_${Date.now()}_${index}`,
    sessionId: 'legacy',
    originalUri: uri,
    editedUri: uri,
    rotation: 0,
    status: 'ready',
    source: 'legacy',
});
const normalizeRoutePages = (
    rawPages: unknown
): ScanPage[] => {
    if (!Array.isArray(rawPages)) {
        return [];
    }
    return rawPages
        .map((page, index): ScanPage | null => {
            if (isScanPage(page)) {
                return page;
            }
            if (typeof page === 'string' && page.trim()) {
                return createLegacyPage(
                    page.trim(),
                    index
                );
            }
            return null;
        })
        .filter((page): page is ScanPage => page !== null);
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
const readHistory = async (): Promise<any[]> => {
    const storedHistory = await AsyncStorage.getItem(
        HISTORY_STORAGE_KEY
    );
    if (!storedHistory) {
        return [];
    }
    try {
        const parsedHistory = JSON.parse(storedHistory);
        return Array.isArray(parsedHistory)
            ? parsedHistory
            : [];
    } catch {
        return [];
    }
};
const savePendingHistoryItem = async (
    historyId: string,
    pages: ScanPage[],
    rawOcrText: string,
    sanitizedText: string,
    source?: string
): Promise<void> => {
    const history = await readHistory();
    const newItem = {
        id: historyId,
        uri: pages[0]?.editedUri ?? '',
        pageUris: pages.map((page) => page.editedUri),
        title:
            pages.length === 1
                ? 'Document Scan'
                : `Document Scan (${pages.length} pages)`,
        date: new Date().toLocaleString(),
        type: source === 'gallery' ? 'gallery' : 'camera',
        status: 'unscanned',
        ocrText: rawOcrText,
        sanitizedText,
    };
    await AsyncStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify([newItem, ...history])
    );
};
const markHistoryAsScanned = async (
    historyId: string,
    analysisResult: any,
    rawOcrText: string,
    sanitizedText: string
): Promise<void> => {
    const history = await readHistory();
    const updatedHistory = history.map((item) =>
        item.id === historyId
            ? {
                  ...item,
                  status: 'scanned',
                  analysisResult,
                  ocrText: rawOcrText,
                  sanitizedText,
              }
            : item
    );
    await AsyncStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(updatedHistory)
    );
};
export default function BatchEditScreen({
    route,
    navigation,
}: any) {
    const { width: screenWidth } = useWindowDimensions();
    const initialRoutePages = route?.params?.pages;
    const lastRoutePagesRef = useRef(initialRoutePages);
    const [pages, setPages] = useState<ScanPage[]>(() =>
        normalizeRoutePages(initialRoutePages)
    );
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isOcrRunning, setIsOcrRunning] = useState(false);
    const [ocrProgress, setOcrProgress] = useState({
        current: 0,
        total: 0,
    });
    const mainListRef = useRef<FlatList<ScanPage>>(null);
    const thumbnailListRef =
        useRef<FlatList<ScanPage>>(null);
    const ocrAbortControllerRef =
        useRef<AbortController | null>(null);
    const {
        isProcessing: isAiAnalyzing,
        isGlobalProcessing,
        triggerBackgroundProcess,
        cancelProcess,
    } = useBackgroundProcessScreen('BatchEditScreen');
    const { showAlert, AlertRender } = useCustomAlert();
    const currentPage = pages[currentIndex];
    const documentSource =
        route?.params?.source === 'gallery'
            ? 'gallery'
            : 'camera';
    const isBusy = isOcrRunning || isAiAnalyzing;
    useEffect(() => {
        const nextRoutePages = route?.params?.pages;
        if (
            nextRoutePages === lastRoutePagesRef.current
        ) {
            return;
        }
        lastRoutePagesRef.current = nextRoutePages;
        const normalizedPages =
            normalizeRoutePages(nextRoutePages);
        if (normalizedPages.length > 0) {
            setPages(normalizedPages);
            setCurrentIndex(
                Math.max(0, normalizedPages.length - 1)
            );
            setTimeout(() => {
                const lastIndex =
                    normalizedPages.length - 1;
                mainListRef.current?.scrollToIndex({
                    index: lastIndex,
                    animated: false,
                });
            }, 0);
        }
    }, [route?.params?.pages]);
    const scrollToPage = (
        index: number,
        animated = false
    ): void => {
        if (index < 0 || index >= pages.length) {
            return;
        }
        setCurrentIndex(index);
        mainListRef.current?.scrollToIndex({
            index,
            animated,
        });
        thumbnailListRef.current?.scrollToIndex({
            index,
            animated,
            viewPosition: 0.5,
        });
    };
    const handleViewableItemsChanged = useRef(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            const visibleIndex = viewableItems.find(
                (item) => item.isViewable
            )?.index;
            if (typeof visibleIndex === 'number') {
                setCurrentIndex(visibleIndex);
                thumbnailListRef.current?.scrollToIndex({
                    index: visibleIndex,
                    animated: false,
                    viewPosition: 0.5,
                });
            }
        }
    ).current;
    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 70,
    }).current;
    const deleteCurrentPage = (): void => {
        if (pages.length <= 1) {
            showAlert(
                'Kailangan ng isang pahina',
                'Hindi maaaring alisin ang nag-iisang pahina.',
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        const pageToDelete = pages[currentIndex];
        const nextPages = pages.filter(
            (page) => page.id !== pageToDelete.id
        );
        const nextIndex = Math.min(
            currentIndex,
            nextPages.length - 1
        );
        setPages(nextPages);
        setCurrentIndex(nextIndex);
        setTimeout(() => {
            mainListRef.current?.scrollToIndex({
                index: nextIndex,
                animated: false,
            });
        }, 0);
    };
    const handleDelete = (): void => {
        if (!currentPage || isBusy) {
            return;
        }
        showAlert(
            `Alisin ang pahina ${currentIndex + 1}?`,
            'Hindi ito isasama sa document.',
            'warning',
            [
                {
                    text: 'Huwag alisin',
                    style: 'cancel',
                },
                {
                    text: 'Alisin',
                    style: 'destructive',
                    onPress: deleteCurrentPage,
                },
            ]
        );
    };
    const handleAddPage = (): void => {
        if (isBusy) {
            return;
        }

        if (documentSource === 'gallery') {
            navigation.navigate('UploadImageScreen', {
                existingPages: pages,
                appendToBatch: true,
            });
            return;
        }

        navigation.navigate('ScannerScreen', {
            existingPages: pages,
        });
    };
    const handleOpenCamera = (): void => {
        if (isBusy) {
            return;
        }

        navigation.navigate({
            name: 'ScannerScreen',
            params: {
                existingPages: pages,
            },
            merge: true,
        });
    };
    const openSanitizedPreview = (
        sanitizedText: string
    ): void => {
        navigation.navigate('SanitizedOcrScreen', {
            sanitizedText,
            isOfflinePreview: true,
            pageCount: pages.length,
        });
    };
    const beginAiAnalysis = async (
        ocrResult: BatchOcrResult
    ): Promise<void> => {
        const hasEveryPage =
            ocrResult.isComplete &&
            ocrResult.failedPages.length === 0 &&
            ocrResult.expectedPageCount === pages.length &&
            ocrResult.recognizedPageCount === pages.length &&
            ocrResult.successfulPages.length === pages.length;
        if (!hasEveryPage) {
            showAlert(
                'Hindi kumpleto ang document',
                "Hindi ipapadala sa AI hangga't hindi malinaw at kumpleto ang lahat ng pahina.",
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        const hasStalePage = ocrResult.successfulPages.some(
            (ocrPage, index) => {
                const current = pages[index];
                return (
                    !current ||
                    ocrPage.pageNumber !== index + 1 ||
                    ocrPage.pageId !== current.id ||
                    ocrPage.sessionId !== current.sessionId ||
                    ocrPage.sourceUri !== current.editedUri
                );
            }
        );
        if (hasStalePage) {
            showAlert(
                'Nagbago ang mga pahina',
                'May pahinang nabago habang binabasa ang document. Pindutin ulit ang Ipa-check sa AI para siguradong tama ang ipapadala.',
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        const historyId = Date.now().toString();
        let sanitizedResult: ReturnType<
            typeof buildSanitizedDocumentForAI
        >;
        try {
            sanitizedResult = buildSanitizedDocumentForAI(
                historyId,
                ocrResult.successfulPages
            );
        } catch (error: unknown) {
            showAlert(
                'Hindi maihanda ang document',
                getErrorMessage(
                    error,
                    'May problema sa pagkakasunod o nilalaman ng mga pahina.'
                ),
                'error',
                [{ text: 'OK' }]
            );
            return;
        }
        if (sanitizedResult.blocked) {
            const blockedPages =
                sanitizedResult.blockedPageNumbers.join(', ');
            showAlert(
                'Hindi ipinadala sa AI',
                `Kailangang i-review ang sensitibo o kulang na text sa pahina ${blockedPages}.`,
                'warning',
                [
                    { text: 'Bumalik', style: 'cancel' },
                    {
                        text: 'Tingnan ang Text',
                        onPress: () =>
                            openSanitizedPreview(
                                sanitizedResult.combinedText
                            ),
                    },
                ]
            );
            return;
        }
        try {
            await savePendingHistoryItem(
                historyId,
                pages,
                ocrResult.combinedText,
                sanitizedResult.combinedText,
                route?.params?.source
            );
        } catch (error) {
            console.error(
                '[BatchEditScreen] History save failed:',
                error
            );
        }
        let hasInternet = false;
        try {
            const networkState =
                await Network.getNetworkStateAsync();
            hasInternet = Boolean(
                networkState.isConnected &&
                    networkState.isInternetReachable !== false
            );
        } catch {
            hasInternet = false;
        }
        if (!hasInternet) {
            showAlert(
                'Walang Internet',
                'Na-save ang document at text sa Recent Files. Kailangan ng internet para ma-check ito ng AI.',
                'info',
                [
                    {
                        text: 'Tingnan ang Text',
                        onPress: () =>
                            openSanitizedPreview(
                                sanitizedResult.combinedText
                            ),
                    },
                    {
                        text: 'Bumalik sa Home',
                        onPress: () =>
                            navigation.navigate('Main', {
                                screen: 'Scan',
                            }),
                    },
                ]
            );
            return;
        }
        triggerBackgroundProcess(
            async (signal: AbortSignal) => {
                const response = await analyzeSanitizedDocument(
                    sanitizedResult.apiPayload,
                    signal
                );
                if (!response || response.status !== 'success') {
                    throw new Error(
                        'Hindi natapos ang AI analysis.'
                    );
                }
                const analysisResult = {
                    ...response.data,
                    rag_context_used:
                        response.data.rag_context_used,
                    sanitizedText:
                        sanitizedResult.combinedText,
                    inputMeta: response.inputMeta,
                };
                await markHistoryAsScanned(
                    historyId,
                    analysisResult,
                    ocrResult.combinedText,
                    sanitizedResult.combinedText
                );
                return analysisResult;
            },
            historyId
        );
    };
    const handleAnalyze = async (): Promise<void> => {
        if (pages.length === 0 || isBusy) {
            return;
        }
        if (isGlobalProcessing) {
            showAlert(
                'May document pang sinusuri',
                'Hintayin munang matapos o i-cancel ang kasalukuyang AI analysis.',
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        const abortController = new AbortController();
        ocrAbortControllerRef.current = abortController;
        setIsOcrRunning(true);
        setOcrProgress({
            current: 1,
            total: pages.length,
        });
        try {
            const result = await recognizePagesOffline(
                pages,
                (progress) => {
                    setOcrProgress({
                        current: progress.current,
                        total: progress.total,
                    });
                    setPages((previousPages) =>
                        previousPages.map((page) => {
                            if (
                                page.id !== progress.pageId
                            ) {
                                return page;
                            }
                            if (
                                progress.status ===
                                'processing'
                            ) {
                                return {
                                    ...page,
                                    status: 'editing',
                                    errorMessage: undefined,
                                };
                            }
                            if (
                                progress.status === 'success'
                            ) {
                                return {
                                    ...page,
                                    status: 'ocr-complete',
                                };
                            }
                            return {
                                ...page,
                                status: 'error',
                            };
                        })
                    );
                },
                abortController.signal
            );
            const textByPageId = new Map(
                result.successfulPages.map((page) => [
                    page.pageId,
                    page,
                ])
            );
            const errorByPageId = new Map(
                result.failedPages.map((page) => [
                    page.pageId,
                    page.message,
                ])
            );
            setPages((previousPages) =>
                previousPages.map((page) => {
                    const successfulPage =
                        textByPageId.get(page.id);
                    if (successfulPage) {
                        return {
                            ...page,
                            ocrText: successfulPage.text,
                            ocrWarning:
                                successfulPage.warning,
                            errorMessage: undefined,
                            status: 'ocr-complete',
                        };
                    }
                    const failureMessage =
                        errorByPageId.get(page.id);
                    if (failureMessage) {
                        return {
                            ...page,
                            errorMessage: failureMessage,
                            status: 'error',
                        };
                    }
                    return page;
                })
            );
            if (
                !result.isComplete ||
                result.failedPages.length > 0 ||
                result.recognizedPageCount !== pages.length
            ) {
                const failedPageNumbers =
                    result.failedPages
                        .map((page) => page.pageNumber)
                        .join(', ');
                const firstFailedPage =
                    result.failedPages[0]?.pageNumber;
                if (firstFailedPage) {
                    scrollToPage(
                        firstFailedPage - 1,
                        false
                    );
                }
                showAlert(
                    'May pahinang hindi nabasa',
                    `Hindi ipinadala sa AI. Ayusin muna ang pahina ${failedPageNumbers || 'na may error'} para kumpleto ang document.`,
                    'warning',
                    [
                        {
                            text: 'OK',
                            style: 'cancel',
                        },
                    ]
                );
                return;
            }
            const warningPages = result.successfulPages
                .filter((page) => Boolean(page.warning))
                .map((page) => page.pageNumber);
            if (warningPages.length > 0) {
                showAlert(
                    'I-review ang malabong pahina',
                    `May mababang kalidad na OCR sa pahina ${warningPages.join(', ')}. Maaari itong magpababa sa accuracy ng analysis.`,
                    'warning',
                    [
                        {
                            text: 'Bumalik',
                            style: 'cancel',
                            onPress: () =>
                                scrollToPage(
                                    warningPages[0] - 1,
                                    false
                                ),
                        },
                        {
                            text: 'Magpatuloy',
                            onPress: () =>
                                void beginAiAnalysis(result),
                        },
                    ]
                );
                return;
            }
            await beginAiAnalysis(result);
        } catch (error: unknown) {
            if (isOcrCancelledError(error)) {
                showAlert(
                    'Itinigil ang Pagbasa',
                    'Walang image o text na ipinadala sa AI.',
                    'info',
                    [{ text: 'OK' }]
                );
            } else {
                showAlert(
                    'Hindi mabasa ang Document',
                    getErrorMessage(
                        error,
                        'Subukang kumuha ng mas malinaw na larawan.'
                    ),
                    'error',
                    [{ text: 'OK' }]
                );
            }
        } finally {
            ocrAbortControllerRef.current = null;
            setIsOcrRunning(false);
            setOcrProgress({ current: 0, total: 0 });
        }
    };
    const handleCancelOcr = (): void => {
        ocrAbortControllerRef.current?.abort();
    };
    const handleBack = (): void => {
        if (isBusy) {
            return;
        }
        navigation.goBack();
    };
    const renderPage = ({ item }: { item: ScanPage }) => (
        <View
            style={[
                styles.pageSlide,
                { width: screenWidth },
            ]}
        >
            <View style={styles.documentFrame}>
                <Image
                    key={item.editedUri}
                    source={{ uri: item.editedUri }}
                    style={styles.documentImage}
                    resizeMode="contain"
                    accessibilityLabel="Document page preview"
                />
            </View>
        </View>
    );
    const renderThumbnail = ({
        item,
        index,
    }: {
        item: ScanPage;
        index: number;
    }) => {
        const isSelected = index === currentIndex;
        return (
            <TouchableOpacity
                style={[
                    styles.thumbnailButton,
                    isSelected &&
                        styles.thumbnailButtonSelected,
                ]}
                onPress={() => scrollToPage(index)}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel={`Pahina ${index + 1}`}
            >
                <Image
                    source={{ uri: item.editedUri }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                />
                <View style={styles.thumbnailNumber}>
                    <Text style={styles.thumbnailNumberText}>
                        {index + 1}
                    </Text>
                </View>
                {item.status === 'ocr-complete' && (
                    <View
                        style={[
                            styles.thumbnailStatus,
                            styles.thumbnailSuccess,
                        ]}
                    >
                        <Ionicons
                            name="checkmark"
                            size={12}
                            color={COLORS.text}
                        />
                    </View>
                )}
                {item.status === 'error' && (
                    <View
                        style={[
                            styles.thumbnailStatus,
                            styles.thumbnailError,
                        ]}
                    >
                        <Ionicons
                            name="alert"
                            size={12}
                            color={COLORS.text}
                        />
                    </View>
                )}
            </TouchableOpacity>
        );
    };
    if (isAiAnalyzing) {
        return (
            <SafeAreaView
                style={styles.processingScreen}
                edges={['top', 'bottom']}
            >
                <StatusBar
                    barStyle="light-content"
                    backgroundColor={COLORS.background}
                />
                <View style={styles.processingHeader}>
                    <Text style={styles.processingHeaderTitle}>
                        Sinusuri ang Document
                    </Text>
                </View>
                <View style={styles.processingBody}>
                    <View style={styles.processingIconBox}>
                        <Ionicons
                            name="document-text-outline"
                            size={34}
                            color={COLORS.primaryLight}
                        />
                    </View>
                    <Text style={styles.processingTitle}>
                        Sinusuri ang lahat ng pahina
                    </Text>
                    <Text style={styles.processingMessage}>
                        Tinitingnan ang mga clause at posibleng panganib. Maaari kang bumalik sa home habang nagpapatuloy ito.
                    </Text>
                    <View style={styles.processingInfoRow}>
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={19}
                            color={COLORS.success}
                        />
                        <Text style={styles.processingInfoText}>
                            Nilinis na text lamang ang ipinadala. Hindi kasama ang larawan.
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.backgroundButton}
                        onPress={() =>
                            navigation.navigate('Main', {
                                screen: 'Scan',
                            })
                        }
                        accessibilityRole="button"
                    >
                        <Text style={styles.backgroundButtonText}>
                            Ipagpatuloy sa Background
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.processingCancelButton}
                        onPress={cancelProcess}
                        accessibilityRole="button"
                    >
                        <Text style={styles.processingCancelText}>
                            Itigil ang Analysis
                        </Text>
                    </TouchableOpacity>
                </View>
                <AlertRender />
            </SafeAreaView>
        );
    }
    if (pages.length === 0) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar
                    barStyle="light-content"
                    backgroundColor={COLORS.background}
                />
                <View style={styles.emptyState}>
                    <Ionicons
                        name="documents-outline"
                        size={48}
                        color={COLORS.muted}
                    />
                    <Text style={styles.emptyTitle}>
                        Walang document page
                    </Text>
                    <Text style={styles.emptyMessage}>
                        Kumuha muna ng kahit isang malinaw na pahina.
                    </Text>
                    <TouchableOpacity
                        style={styles.emptyButton}
                        onPress={() =>
                            navigation.replace(
                                'ScannerScreen'
                            )
                        }
                    >
                        <Text style={styles.emptyButtonText}>
                            Buksan ang Camera
                        </Text>
                    </TouchableOpacity>
                </View>
                <AlertRender />
            </SafeAreaView>
        );
    }
    return (
        <SafeAreaView
            style={styles.container}
            edges={['top', 'bottom']}
            testID="batch-edit-screen-v3"
        >
            <StatusBar
                barStyle="light-content"
                backgroundColor={COLORS.background}
            />
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.headerButton}
                    onPress={handleBack}
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
                        Suriin ang mga Pahina
                    </Text>
                    <Text style={styles.headerHint}>
                        I-swipe para makita ang iba
                    </Text>
                </View>
                <View style={styles.pageCounter}>
                    <Text style={styles.pageCounterText}>
                        {currentIndex + 1}/{pages.length}
                    </Text>
                </View>
            </View>
            <View style={styles.viewerSection}>
                <FlatList
                    ref={mainListRef}
                    data={pages}
                    horizontal
                    pagingEnabled
                    scrollEnabled={!isBusy}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.id}
                    renderItem={renderPage}
                    onViewableItemsChanged={
                        handleViewableItemsChanged
                    }
                    viewabilityConfig={viewabilityConfig}
                    getItemLayout={(_, index) => ({
                        length: screenWidth,
                        offset: screenWidth * index,
                        index,
                    })}
                    onScrollToIndexFailed={({ index }) => {
                        mainListRef.current?.scrollToOffset({
                            offset: index * screenWidth,
                            animated: false,
                        });
                    }}
                />
            </View>
            <View style={styles.thumbnailSection}>
                <View style={styles.thumbnailHeader}>
                    <Text style={styles.thumbnailHeaderText}>
                        MGA PAHINA
                    </Text>
                    <Text style={styles.thumbnailCountText}>
                        {pages.length}
                    </Text>
                </View>
                <FlatList
                    ref={thumbnailListRef}
                    horizontal
                    data={pages}
                    keyExtractor={(item) =>
                        `thumb_${item.id}`
                    }
                    renderItem={renderThumbnail}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={
                        styles.thumbnailListContent
                    }
                    onScrollToIndexFailed={() => undefined}
                />
            </View>
            <View style={styles.toolBar}>
                <TouchableOpacity
                    style={styles.toolButton}
                    onPress={handleAddPage}
                    disabled={isBusy}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel={
                        documentSource === 'gallery'
                            ? 'Magdagdag mula sa gallery'
                            : 'Magdagdag gamit ang camera'
                    }
                >
                    <Ionicons
                        name={
                            documentSource === 'gallery'
                                ? 'images-outline'
                                : 'add'
                        }
                        size={23}
                        color={COLORS.primaryLight}
                    />
                    <Text style={styles.toolButtonText}>
                        Dagdag
                    </Text>
                </TouchableOpacity>
                <View style={styles.toolDivider} />
                <TouchableOpacity
                    style={styles.toolButton}
                    onPress={handleOpenCamera}
                    disabled={isBusy}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel="Buksan ang camera"
                >
                    <Ionicons
                        name="camera-outline"
                        size={22}
                        color={COLORS.primaryLight}
                    />
                    <Text style={styles.toolButtonText}>
                        Camera
                    </Text>
                </TouchableOpacity>
                <View style={styles.toolDivider} />
                <TouchableOpacity
                    style={styles.toolButton}
                    onPress={handleDelete}
                    disabled={isBusy}
                    activeOpacity={0.72}
                    accessibilityRole="button"
                    accessibilityLabel="Alisin ang kasalukuyang pahina"
                >
                    <Ionicons
                        name="trash-outline"
                        size={21}
                        color={COLORS.danger}
                    />
                    <Text
                        style={[
                            styles.toolButtonText,
                            styles.deleteText,
                        ]}
                    >
                        Alisin
                    </Text>
                </TouchableOpacity>
            </View>
            <View style={styles.bottomActionArea}>
                <Text style={styles.privacyNote}>
                    Sa phone muna babasahin at lilinisin ang text.
                </Text>
                <TouchableOpacity
                    style={styles.analyzeButton}
                    onPress={handleAnalyze}
                    disabled={isBusy}
                    activeOpacity={0.78}
                    accessibilityRole="button"
                    accessibilityLabel={`Ipa-check sa AI ang ${pages.length} pahina`}
                >
                    <Ionicons
                        name="shield-checkmark-outline"
                        size={21}
                        color={COLORS.text}
                    />
                    <Text style={styles.analyzeButtonText}>
                        Ipa-check sa AI ({pages.length})
                    </Text>
                </TouchableOpacity>
            </View>
            {isOcrRunning && (
                <View style={styles.ocrOverlay}>
                    <View style={styles.ocrPanel}>
                        <View style={styles.ocrIconBox}>
                            <Ionicons
                                name="document-text-outline"
                                size={29}
                                color={COLORS.primary}
                            />
                        </View>
                        <Text style={styles.ocrTitle}>
                            Binabasa ang document
                        </Text>
                        <Text style={styles.ocrMessage}>
                            Pahina {ocrProgress.current} sa{' '}
                            {ocrProgress.total}
                        </Text>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: `${Math.max(
                                            5,
                                            (ocrProgress.current /
                                                Math.max(
                                                    ocrProgress.total,
                                                    1
                                                )) *
                                                100
                                        )}%`,
                                    },
                                ]}
                            />
                        </View>
                        <Text style={styles.ocrPrivacyText}>
                            Offline ito. Wala pang ipinapadala sa AI.
                        </Text>
                        <TouchableOpacity
                            style={styles.cancelOcrButton}
                            onPress={handleCancelOcr}
                        >
                            <Text style={styles.cancelOcrButtonText}>
                                Itigil
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
            <AlertRender />
        </SafeAreaView>
    );
}
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    processingScreen: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    processingHeader: {
        height: 62,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    processingHeaderTitle: {
        color: COLORS.text,
        fontSize: 17,
        fontWeight: '900',
    },
    processingBody: {
        flex: 1,
        paddingHorizontal: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    processingIconBox: {
        width: 66,
        height: 66,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    processingTitle: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 22,
    },
    processingMessage: {
        maxWidth: 360,
        color: COLORS.subText,
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
        marginTop: 9,
    },
    processingInfoRow: {
        width: '100%',
        maxWidth: 360,
        minHeight: 58,
        marginTop: 24,
        paddingHorizontal: 14,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 6,
    },
    processingInfoText: {
        flex: 1,
        color: COLORS.subText,
        fontSize: 12,
        lineHeight: 18,
        marginLeft: 10,
    },
    backgroundButton: {
        width: '100%',
        maxWidth: 360,
        height: 50,
        marginTop: 24,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
    },
    backgroundButtonText: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: '900',
    },
    processingCancelButton: {
        height: 44,
        marginTop: 10,
        paddingHorizontal: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    processingCancelText: {
        color: COLORS.danger,
        fontSize: 13,
        fontWeight: '800',
    },
    header: {
        height: 60,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    headerButton: {
        width: 44,
        height: 44,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    headerTitle: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
    },
    headerHint: {
        color: COLORS.muted,
        fontSize: 10,
        marginTop: 3,
    },
    pageCounter: {
        minWidth: 44,
        height: 36,
        paddingHorizontal: 7,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    pageCounterText: {
        color: COLORS.text,
        fontSize: 12,
        fontWeight: '900',
    },
    viewerSection: {
        flex: 1,
        minHeight: 160,
        backgroundColor: COLORS.black,
    },
    pageSlide: {
        height: '100%',
        paddingHorizontal: 14,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    documentFrame: {
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: 5,
        backgroundColor: '#050609',
        borderWidth: 1,
        borderColor: '#242A35',
    },
    documentImage: {
        width: '100%',
        height: '100%',
    },
    thumbnailSection: {
        height: 84,
        paddingTop: 7,
        backgroundColor: COLORS.surface,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    thumbnailHeader: {
        height: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
    },
    thumbnailHeaderText: {
        color: COLORS.muted,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.9,
    },
    thumbnailCountText: {
        color: COLORS.primaryLight,
        fontSize: 10,
        fontWeight: '900',
        marginLeft: 7,
    },
    thumbnailListContent: {
        paddingHorizontal: 10,
        paddingTop: 3,
    },
    thumbnailButton: {
        width: 46,
        height: 54,
        marginHorizontal: 4,
        overflow: 'hidden',
        borderRadius: 5,
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: COLORS.elevated,
    },
    thumbnailButtonSelected: {
        borderColor: COLORS.primaryLight,
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    thumbnailNumber: {
        position: 'absolute',
        left: 3,
        bottom: 3,
        minWidth: 19,
        height: 19,
        paddingHorizontal: 4,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
    },
    thumbnailNumberText: {
        color: COLORS.text,
        fontSize: 9,
        fontWeight: '900',
    },
    thumbnailStatus: {
        position: 'absolute',
        top: 3,
        right: 3,
        width: 19,
        height: 19,
        borderRadius: 9.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbnailSuccess: {
        backgroundColor: COLORS.success,
    },
    thumbnailError: {
        backgroundColor: COLORS.danger,
    },
    toolBar: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    toolButton: {
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolButtonText: {
        color: COLORS.subText,
        fontSize: 11,
        fontWeight: '800',
        marginTop: 4,
    },
    deleteText: {
        color: COLORS.danger,
    },
    toolDivider: {
        width: 1,
        height: 28,
        backgroundColor: COLORS.border,
    },
    bottomActionArea: {
        minHeight: 83,
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 5,
        marginBottom: 5,
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    privacyNote: {
        color: COLORS.muted,
        fontSize: 10,
        textAlign: 'center',
        marginBottom: 7,
    },
    analyzeButton: {
        height: 48,
        borderRadius: 6,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
    },
    analyzeButtonText: {
        color: COLORS.text,
        fontSize: 16,
        fontWeight: '900',
        textAlign: 'center',
        marginLeft: 9,
    },
    ocrOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 50,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.84)',
    },
    ocrPanel: {
        width: '100%',
        maxWidth: 350,
        padding: 24,
        borderRadius: 8,
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    ocrIconBox: {
        width: 58,
        height: 58,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.elevated,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    ocrTitle: {
        color: COLORS.text,
        fontSize: 18,
        fontWeight: '900',
        marginTop: 15,
    },
    ocrMessage: {
        color: COLORS.subText,
        fontSize: 13,
        marginTop: 6,
    },
    progressTrack: {
        width: '100%',
        height: 6,
        marginTop: 18,
        overflow: 'hidden',
        borderRadius: 3,
        backgroundColor: COLORS.elevated,
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
        backgroundColor: COLORS.primary,
    },
    ocrPrivacyText: {
        color: COLORS.success,
        fontSize: 11,
        lineHeight: 17,
        textAlign: 'center',
        marginTop: 14,
    },
    cancelOcrButton: {
        minWidth: 100,
        height: 42,
        marginTop: 18,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.10)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    cancelOcrButtonText: {
        color: COLORS.danger,
        fontSize: 13,
        fontWeight: '900',
    },
    emptyState: {
        flex: 1,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        color: COLORS.text,
        fontSize: 20,
        fontWeight: '900',
        marginTop: 16,
    },
    emptyMessage: {
        color: COLORS.subText,
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
        marginTop: 8,
    },
    emptyButton: {
        minHeight: 50,
        marginTop: 22,
        borderRadius: 7,
        paddingHorizontal: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.primary,
    },
    emptyButtonText: {
        color: COLORS.text,
        fontSize: 14,
        fontWeight: '900',
    },
});
