// BATCH EDIT SCREEN VERSION: 7.0.3 — PURPLE NEO-BRUTALISM SPEC
// (UI lang ang nagbago; walang binagong logic/state/network)
// 7.0.3: FIX sa Android crash na "Value for translateX cannot be cast
// from String to double" — ang indeterminate sweep ng progress bar ay
// dating percentage na translateX ('-130%'/'485%') na may
// useNativeDriver: true, na hindi kayang i-parse ng Android native
// animated (puro numero lang ang tinatanggap nito sa translateX).
// Ngayon: pixel-based sweep — 76px na segment, sinusukat ng onLayout
// ang totoong haba ng track. Pixels = lehitimong numero kaya native
// driver pa rin (smooth kahit abala ang JS thread). Walang binagong
// analysis/cancel/navigation logic.
// 7.0.2: RESPONSIVE na progress bar sa loading screen — smooth animated
// fill papunta sa totoong porsyento, at indeterminate sweep (gumagalaw
// na segment) habang 0% pa ang analysis (sa single document, walang
// per-document report hanggang matapos mismo ang analysis). Laging
// nakikita ang progress card habang nag-aanalyze. Walang binagong
// analysis/cancel/navigation logic.
// 7.0.1: linisin ang AI processing view — lagging spinner, totoong
// progress bar (mula sa BackgroundProcess context), bordered privacy
// chip, at bordered danger cancel button. Walang binagong analysis/
// cancel/navigation logic.
// Spec: purple system (tanggal ang blue), 1.5px standard borders,
// 2px sa CTA/app-bar rules, 2–6px radius (squared), predominantly FLAT —
// hard shadow lang sa focal CTAs (Ipa-check sa AI, split CTAs) at sa
// AI notice modal.
// Editor chrome (header, toolbar, thumbnails, footer) = theme tokens
// (sumusunod sa light/dark purple theme). Ang document canvas ay
// sadyang madilim (media canvas — hindi themed, gaya ng image viewer).
// CTA pattern: split-button (purple main + black arrow square na may
// puting arrow) — spec signature.

import React, {
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    Animated,
    BackHandler,
    FlatList,
    Image,
    type LayoutChangeEvent,
    Modal,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    ViewToken,
    type ViewStyle,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useCustomAlert } from '../../../components/CustomAlert';
import { NeoIconButton, getNeoShadow } from '../../../components/Neo';
import { useBackgroundProcess } from '../../../context/BackgroundProcessContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import { analyzeSanitizedDocument } from '../../../services/AiEngine';
import {
    isOcrCancelledError,
    recognizePagesOffline,
} from '../../../services/localOcrService';
import type { BatchOcrResult, OcrPageResult } from '../../../services/localOcrService';
import {
    partitionDocumentPages,
    suggestDocumentStarts,
} from '../../../services/documentGrouping';
import { buildSanitizedDocumentForAI, sanitizeLocalText } from '../../../utils/sanitizer';
import { isScanPage } from '../../../types/ScanPage';
import type { ScanPage } from '../../../types/ScanPage';
import {
    completeScan,
    deleteScans,
    markScanNeedsRetry,
    savePendingScan,
    saveScanDraft,
} from '../../../services/scanHistoryStorage';
import { useTheme } from '../../../theme/ThemeContext';
import { BORDER, RADIUS, SHADOW, SPACING, type ThemeColors } from '../../../theme/tokens';

/**
 * Hard-shadow press helper ("sink into paper") — pareho ng helper ng
 * ProfileScreen. Para lang sa mga focal element na may 2px hard shadow
 * (dito: split CTAs at notice proceed button).
 */
function makeSink(colors: ThemeColors) {
    return (pressed: boolean, level: 'sm' | 'md' | 'lg'): ViewStyle => {
        if (!pressed) return getNeoShadow(colors, level);
        const offset = SHADOW[level].ios.shadowOffset;
        return {
            elevation: 0,
            transform: [
                { translateX: offset.width },
                { translateY: offset.height },
            ],
        };
    };
}

// MEDIA CANVAS — sadyang madilim (hindi themed) para eksaktong
// pagtingin sa scan quality. Hindi ito brand color.
const CANVAS = {
    black: '#050609',
    border: '#242A35',
};

// Haba ng gumagalaw na segment (sweep) ng indeterminate progress bar,
// sa PIXELS — hindi porsyento. Bawal ang percentage na translateX sa
// Android native animated ("Value for translateX cannot be cast from
// String to double"), kaya pixels ang unit ng buong sweep animation.
const PROGRESS_SWEEP_WIDTH = 76;

const AI_NOTICE_KEY = '@lex_ai_notice_v1';
const makeGroupResult = (ocrPages: OcrPageResult[]): BatchOcrResult => {
    const successfulPages = ocrPages.map((page, index) => ({
        ...page,
        pageNumber: index + 1,
    }));
    return {
        expectedPageCount: successfulPages.length,
        recognizedPageCount: successfulPages.length,
        isComplete: true,
        successfulPages,
        failedPages: [],
        combinedText: successfulPages.map((page) =>
            `--- Page ${page.pageNumber} ---\n${page.text}`
        ).join('\n\n'),
    };
};
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

/**
 * SPLIT CTA — spec signature: purple main section + hiwalay na black
 * square na may puting right-arrow. Focal element kaya may 2px hard
 * shadow na bumabagsak kapag pinindot.
 */
function SplitCta({
    label,
    icon,
    onPress,
    disabled,
    busy,
    colors: T,
    sink,
    height = 52,
    arrowIcon = 'arrow-forward',
}: {
    label: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
    colors: ThemeColors;
    sink: (pressed: boolean, level: 'sm' | 'md' | 'lg') => ViewStyle;
    height?: number;
    arrowIcon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: Boolean(disabled) }}
        >
            {({ pressed }) => (
                <View
                    style={[
                        styles.splitCta,
                        disabled
                            ? styles.disabledButton
                            : sink(pressed, 'sm'),
                    ]}
                >
                    <View
                        style={[
                            styles.splitCtaMain,
                            { backgroundColor: T.brand, height },
                        ]}
                    >
                        {busy ? (
                            <ActivityIndicator size="small" color={T.brandText} />
                        ) : (
                            <Ionicons
                                name={icon ?? 'shield-checkmark-outline'}
                                size={20}
                                color={T.brandText}
                            />
                        )}
                        <Text
                            style={[styles.splitCtaText, { color: T.brandText }]}
                            numberOfLines={1}
                        >
                            {label}
                        </Text>
                    </View>
                    <View style={[styles.splitCtaArrow, { backgroundColor: T.ink, height }]}>
                        <Ionicons name={arrowIcon} size={17} color={T.card} />
                    </View>
                </View>
            )}
        </Pressable>
    );
}

export default function BatchEditScreen({
    route,
    navigation,
}: any) {
    const { width: screenWidth } = useWindowDimensions();
    const { colors: T, isDarkMode } = useTheme();
    const initialRoutePages = route?.params?.pages;
    const lastRoutePagesRef = useRef(initialRoutePages);
    const [pages, setPages] = useState<ScanPage[]>(() =>
        normalizeRoutePages(initialRoutePages)
    );
    const latestPagesRef = useRef(pages);
    latestPagesRef.current = pages;
    const draftIdRef = useRef<string>(
        route?.params?.draftId || pages[0]?.sessionId || ''
    );
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isOcrRunning, setIsOcrRunning] = useState(false);
    const [ocrProgress, setOcrProgress] = useState({
        current: 0,
        total: 0,
    });
    const [reviewResult, setReviewResult] = useState<BatchOcrResult | null>(null);
    const [pendingNotice, setPendingNotice] = useState<BatchOcrResult | null>(null);
    const mainListRef = useRef<FlatList<ScanPage>>(null);
    const thumbnailListRef =
        useRef<FlatList<ScanPage>>(null);
    const ocrAbortControllerRef =
        useRef<AbortController | null>(null);
    const analysisRequestRef = useRef(false);
    const noticeSubmittingRef = useRef(false);
    const {
        isProcessing: isAiAnalyzing,
        isGlobalProcessing,
        triggerBackgroundProcess,
        cancelProcess,
    } = useBackgroundProcessScreen('BatchEditScreen');
    // Totoong progress ng AI analysis (0–100) mula sa background process
    // context — para sa determinate progress bar ng processing view.
    const { progress: analysisProgress } = useBackgroundProcess();
    const { showAlert, AlertRender } = useCustomAlert();
    const sink = makeSink(T);
    const processingPulse = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!isAiAnalyzing) {
            processingPulse.setValue(0);
            return;
        }
        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(processingPulse, {
                    toValue: 1,
                    duration: 950,
                    useNativeDriver: true,
                }),
                Animated.timing(processingPulse, {
                    toValue: 0,
                    duration: 950,
                    useNativeDriver: true,
                }),
            ])
        );
        pulseLoop.start();
        return () => pulseLoop.stop();
    }, [isAiAnalyzing, processingPulse]);
    const processingPulseScale = processingPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.06],
    });
    const processingPulseOpacity = processingPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.62, 1],
    });
    // RESPONSIVE PROGRESS BAR — animated fill (smooth na gumagalaw
    // papunta sa totoong porsyento) + indeterminate sweep habang 0% pa
    // (single document: walang report hanggang matapos mismo ito).
    const safeAnalysisProgress = Math.min(
        100,
        Math.max(0, Math.round(Number(analysisProgress) || 0))
    );
    const isProgressDeterminate = safeAnalysisProgress > 0;
    const progressFillAnim = useRef(new Animated.Value(0)).current;
    const progressSweepAnim = useRef(new Animated.Value(0)).current;
    // PIXEL-BASED SWEEP — sinusukat ng onLayout ng track ang totoong
    // haba nito sa pixels, tapos gumagalaw ang 76px na segment mula sa
    // kaliwa (-76px, nakatago sa likod ng overflow: hidden na track)
    // hanggang sa dulo ng track. Pixels (numero) ang gamit sa
    // translateX — hindi '%'-string — kaya hindi na mag-crash ang
    // Android, at native driver pa rin kaya smooth kahit abala ang JS
    // thread sa analysis.
    const [trackWidth, setTrackWidth] = useState(0);
    const progressSweepRange = progressSweepAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [
            -PROGRESS_SWEEP_WIDTH,
            Math.max(trackWidth, 0),
        ],
    });
    const handleTrackLayout = React.useCallback(
        (event: LayoutChangeEvent): void => {
            const measured = event.nativeEvent.layout.width;
            setTrackWidth(
                Number.isFinite(measured) ? measured : 0
            );
        },
        []
    );
    useEffect(() => {
        if (!isAiAnalyzing || !isProgressDeterminate) {
            // Snap sa 0 sa indeterminate phase (bagong analysis = bagong
            // simula; hindi dapat kita ang lumang 100% na pagbaba).
            progressFillAnim.setValue(0);
            return;
        }
        Animated.timing(progressFillAnim, {
            toValue: safeAnalysisProgress,
            duration: 380,
            useNativeDriver: false,
        }).start();
    }, [
        isAiAnalyzing,
        isProgressDeterminate,
        safeAnalysisProgress,
        progressFillAnim,
    ]);
    useEffect(() => {
        if (!isAiAnalyzing || isProgressDeterminate) {
            progressSweepAnim.setValue(0);
            return;
        }
        const sweepLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(progressSweepAnim, {
                    toValue: 1,
                    duration: 1150,
                    useNativeDriver: true,
                }),
                Animated.timing(progressSweepAnim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true,
                }),
            ])
        );
        sweepLoop.start();
        return () => sweepLoop.stop();
    }, [
        isAiAnalyzing,
        isProgressDeterminate,
        progressSweepAnim,
    ]);
    const currentPage = pages[currentIndex];
    const documentSource =
        route?.params?.source === 'gallery'
            ? 'gallery'
            : 'camera';
    const isBusy = isOcrRunning || isAiAnalyzing;
    const pageSignature = pages.map((page) => `${page.id}:${page.editedUri}`).join('|');
    useEffect(() => {
        const id = draftIdRef.current;
        if (!id || pages.length === 0) return;
        void saveScanDraft(id, pages, documentSource).catch((error) =>
            console.error('[BatchEditScreen] Draft save failed:', error)
        );
    }, [pages, documentSource]);
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
            draftIdRef.current = route?.params?.draftId ||
                normalizedPages[0].sessionId;
            setReviewResult(null);
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
        setReviewResult(null);
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
                draftId: draftIdRef.current,
                appendToBatch: true,
            });
            return;
        }

        navigation.navigate('ScannerScreen', {
            existingPages: pages,
            draftId: draftIdRef.current,
            source: documentSource,
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
                draftId: draftIdRef.current,
                source: documentSource,
            },
            merge: true,
        });
    };
    const openSanitizedPreview = (
        sanitizedText: string,
        pageCount: number
    ): void => {
        navigation.navigate('SanitizedOcrScreen', {
            sanitizedText,
            isOfflinePreview: true,
            pageCount,
        });
    };
    const previewReadText = (): void => {
        const readPages = pages.map((page, index) => ({
            pageNumber: index + 1,
            text: page.ocrSourceUri === page.editedUri && typeof page.ocrText === 'string'
                ? page.ocrText.trim() : '',
        })).filter((page) => page.text.length > 0);
        if (!readPages.length) {
            showAlert('Wala pang text', 'Hintaying mabasa ang mga pahina sa phone.', 'info');
            return;
        }
        const sanitizedText = readPages.map((page) =>
            `--- Page ${page.pageNumber} ---\n${sanitizeLocalText(page.text)}`
        ).join('\n\n');
        navigation.navigate('SanitizedOcrScreen', {
            sanitizedText,
            isOfflinePreview: true,
            unreadPageCount: pages.length - readPages.length,
        });
    };

    const beginAiAnalysis = async (
        ocrResult: BatchOcrResult,
        starts: number[]
    ): Promise<void> => {
        const hasEveryPage =
            ocrResult.isComplete &&
            ocrResult.failedPages.length === 0 &&
            ocrResult.expectedPageCount === pages.length &&
            ocrResult.recognizedPageCount === pages.length &&
            ocrResult.successfulPages.length === pages.length;
        if (!hasEveryPage) {
            showAlert('May pahinang hindi nabasa', 'Kunan ulit ang pahinang may error.', 'warning', [{ text: 'OK' }]);
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
                'Pindutin ulit ang Ipa-check sa AI para mabasa ang bagong larawan.',
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        const originals = partitionDocumentPages(ocrResult.successfulPages, starts);
        const batchId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const prepared: Array<{
            historyId: string;
            pageNumbers: number[];
            ocr: BatchOcrResult;
            safe: ReturnType<typeof buildSanitizedDocumentForAI>;
            scanPages: ScanPage[];
        }> = [];

        try {
            for (const [index, group] of originals.entries()) {
                const groupOcr = makeGroupResult(group);
                const historyId = originals.length === 1
                    ? draftIdRef.current || batchId
                    : `${batchId}_${index + 1}`;
                const safe = buildSanitizedDocumentForAI(
                    historyId,
                    groupOcr.successfulPages
                );
                if (safe.blocked) {
                    throw new Error(
                        `Dokumento ${index + 1}: Kulang o may hindi nalinis na text sa pahina ${safe.blockedPageNumbers.join(', ')}. Kunan ulit ang pahina.`
                    );
                }
                prepared.push({
                    historyId,
                    pageNumbers: group.map((page) => page.pageNumber),
                    ocr: groupOcr,
                    safe,
                    scanPages: group.map((page) => pages[page.pageNumber - 1]),
                });
            }
        } catch (error) {
            showAlert(
                'Hindi maipagpatuloy',
                getErrorMessage(error, 'Hindi maihanda ang mga dokumento.'),
                'warning',
                [{ text: 'OK' }]
            );
            return;
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
        // Save all document records before leaving or starting the network call.
        // Keep the original draft until every group is safely indexed.
        try {
            for (const [index, item] of prepared.entries()) {
                await savePendingScan(
                    item.historyId,
                    item.scanPages,
                    documentSource,
                    item.ocr.combinedText,
                    item.safe.combinedText,
                    `Dokumento ${index + 1} · pahina ${item.pageNumbers.join(', ')}`
                );
                if (!hasInternet) await markScanNeedsRetry(item.historyId);
            }
            if (
                originals.length > 1 &&
                draftIdRef.current &&
                !prepared.some((item) => item.historyId === draftIdRef.current)
            ) {
                await deleteScans([draftIdRef.current]);
                draftIdRef.current = '';
            }
        } catch (error) {
            showAlert(
                'Hindi na-save ang document',
                getErrorMessage(error, 'Subukang muli. Nasa phone pa rin ang iyong mga pahina.'),
                'error',
                [{ text: 'OK' }]
            );
            return;
        }
        if (!hasInternet) {
            showAlert(
                'Walang Internet',
                'Na-save nang hiwalay ang mga dokumento sa Recent Files. Kailangan ng internet para sa AI analysis.',
                'info',
                [
                    {
                        text: 'Tingnan ang Text',
                        onPress: () =>
                            openSanitizedPreview(
                                prepared[0].safe.combinedText,
                                prepared[0].scanPages.length
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
            async (signal: AbortSignal, reportProgress: (value: number) => void) => {
                const documents = [];
                let completed = 0;
                try {
                for (const [index, item] of prepared.entries()) {
                    if (signal.aborted) throw new Error('Analysis cancelled');
                    try {
                        const response = await analyzeSanitizedDocument(
                            item.safe.apiPayload, signal
                        );
                        if (!response || response.status !== 'success') {
                            throw new Error('Hindi natapos ang AI analysis.');
                        }
                        if (
                            response.data.analysisOutcome === 'mixed_documents' ||
                            response.data.ocrQuality?.status === 'analysis_blocked'
                        ) {
                            throw new Error('May OCR o grouping na kailangang ayusin sa dokumentong ito.');
                        }
                        const analysisResult = {
                            ...response.data,
                            sanitizedText: item.safe.combinedText,
                            inputMeta: response.inputMeta,
                        };
                        await completeScan(
                            item.historyId, analysisResult,
                            item.ocr.combinedText, item.safe.combinedText
                        );
                        completed += 1;
                        documents.push({
                            pageNumbers: item.pageNumbers,
                            historyId: item.historyId,
                            analysisResult,
                        });
                    } catch (error) {
                        if (signal.aborted) throw error;
                        await markScanNeedsRetry(item.historyId);
                        documents.push({
                            pageNumbers: item.pageNumbers,
                            historyId: item.historyId,
                            retryPayload: item.safe.apiPayload,
                            analysisResult: {
                                documentTitle: `Dokumento ${index + 1}`,
                                analysisOutcome: 'inconclusive_analysis',
                                score: null,
                                findings: [],
                                keyClauses: [],
                                sanitizedText: item.safe.combinedText,
                                failureMessage: getErrorMessage(error, 'Hindi natapos ang analysis ng dokumentong ito.'),
                            },
                        });
                    }
                    reportProgress(((index + 1) / prepared.length) * 100);
                }
                } finally {
                    if (signal.aborted) {
                        await Promise.all(prepared.map((item) =>
                            markScanNeedsRetry(item.historyId)
                        ));
                    }
                }
                if (completed === 0) {
                    throw new Error('Walang dokumentong natapos ang AI analysis. Nasa Recent Files ang hiwa-hiwalay na OCR.');
                }
                return documents.length === 1
                    ? documents[0].analysisResult
                    : { batchDocuments: documents };
            },
            prepared.length === 1 ? prepared[0].historyId : undefined
        );
    };
    const requestAiAnalysis = async (result: BatchOcrResult): Promise<void> => {
        try {
            if (await AsyncStorage.getItem(AI_NOTICE_KEY)) {
                await beginAiAnalysis(result, suggestDocumentStarts(result.successfulPages));
            } else {
                setPendingNotice(result);
            }
        } catch (error) {
            showAlert('Hindi maipagpatuloy', getErrorMessage(error, 'Hindi ma-save ang AI notice.'), 'error', [{ text: 'OK' }]);
        }
    };
    const acceptAiNotice = async (): Promise<void> => {
        const result = pendingNotice;
        if (!result || noticeSubmittingRef.current) return;
        noticeSubmittingRef.current = true;
        try {
            await AsyncStorage.setItem(AI_NOTICE_KEY, 'seen');
            setPendingNotice(null);
            await beginAiAnalysis(result, suggestDocumentStarts(result.successfulPages));
        } catch (error) {
            showAlert('Hindi maipagpatuloy', getErrorMessage(error, 'Subukan ulit.'), 'error', [{ text: 'OK' }]);
        } finally {
            noticeSubmittingRef.current = false;
        }
    };
    const readPages = async (analyzeAfter: boolean): Promise<void> => {
        if (pages.length === 0 || isBusy || analysisRequestRef.current) {
            return;
        }
        if (analyzeAfter && isGlobalProcessing) {
            showAlert(
                'May document pang sinusuri',
                'Hintayin munang matapos o i-cancel ang kasalukuyang AI analysis.',
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        analysisRequestRef.current = true;
        const reviewStillMatches = reviewResult?.isComplete &&
            reviewResult.successfulPages.length === pages.length &&
            reviewResult.successfulPages.every((item, index) =>
                item.pageId === pages[index].id &&
                item.sessionId === pages[index].sessionId &&
                item.sourceUri === pages[index].editedUri
            );
        if (reviewStillMatches) {
            try {
                if (analyzeAfter) await requestAiAnalysis(reviewResult);
            } finally {
                analysisRequestRef.current = false;
            }
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
                abortController.signal,
                reviewResult ?? undefined
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
                            ocrSourceUri: successfulPage.sourceUri,
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
                setReviewResult(result);
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
                if (analyzeAfter) showAlert(
                    'May pahinang hindi nabasa',
                    `Kunan ulit ang pahina ${failedPageNumbers || 'na may error'}, saka pindutin ulit ang Ipa-check sa AI. Hindi na muling babasahin ang maayos na pahina.`,
                    'warning', [{ text: 'OK' }]
                );
                return;
            }
            setReviewResult(result);
            if (analyzeAfter) await requestAiAnalysis(result);
        } catch (error: unknown) {
            if (!analyzeAfter) {
                // The page badge and retry button carry the error in the editor.
            } else if (isOcrCancelledError(error)) {
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
            analysisRequestRef.current = false;
            ocrAbortControllerRef.current = null;
            setIsOcrRunning(false);
            setOcrProgress({ current: 0, total: 0 });
        }
    };
    const handleAnalyze = (): void => { void readPages(true); };
    useEffect(() => {
        if (!pageSignature) return;
        void readPages(false);
        return () => { ocrAbortControllerRef.current?.abort(); };
        // Reread only when a page or its image changes, not for progress/status updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageSignature]);
    const handleCancelOcr = (): void => {
        ocrAbortControllerRef.current?.abort();
    };
    const handleBack = (): void => {
        if (isAiAnalyzing) {
            navigation.navigate('Main', { screen: 'Scan' });
            return;
        }
        ocrAbortControllerRef.current?.abort();
        const current = latestPagesRef.current;
        if (!draftIdRef.current || current.length === 0) {
            navigation.navigate('Main', { screen: 'Scan' });
            return;
        }
        void saveScanDraft(draftIdRef.current, current, documentSource)
            .then(() => navigation.navigate('Main', { screen: 'Scan' }))
            .catch((error) => showAlert(
                'Hindi na-save ang mga pahina',
                getErrorMessage(error, 'Subukan ulit bago umalis.'),
                'error',
                [{ text: 'OK' }]
            ));
    };
    useFocusEffect(
        React.useCallback(() => {
            const subscription = BackHandler.addEventListener(
                'hardwareBackPress',
                () => { handleBack(); return true; }
            );
            return () => subscription.remove();
        }, [documentSource, isAiAnalyzing, navigation, showAlert])
    );
    useEffect(() => {
        let allowRemoval = false;
        return navigation.addListener('beforeRemove', (event: any) => {
            if (allowRemoval || !draftIdRef.current || latestPagesRef.current.length === 0) return;
            event.preventDefault();
            void saveScanDraft(
                draftIdRef.current,
                latestPagesRef.current,
                documentSource
            ).then(() => {
                allowRemoval = true;
                navigation.dispatch(event.data.action);
            }).catch((error) => showAlert(
                'Hindi na-save ang mga pahina',
                getErrorMessage(error, 'Subukan ulit bago umalis.'),
                'error',
                [{ text: 'OK' }]
            ));
        });
    }, [navigation, documentSource, showAlert]);
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
                    isSelected && { borderColor: T.brand },
                ]}
                onPress={() => scrollToPage(index)}
                disabled={isAiAnalyzing}
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
                            { backgroundColor: T.success },
                        ]}
                    >
                        <Ionicons
                            name="checkmark"
                            size={12}
                            color={T.card}
                        />
                    </View>
                )}
                {item.status === 'error' && (
                    <View
                        style={[
                            styles.thumbnailStatus,
                            { backgroundColor: T.danger },
                        ]}
                    >
                        <Ionicons
                            name="alert"
                            size={12}
                            color={T.card}
                        />
                    </View>
                )}
            </TouchableOpacity>
        );
    };
    if (isAiAnalyzing) {
        return (
            <SafeAreaView
                style={[styles.processingScreen, { backgroundColor: T.bg }]}
                edges={['top', 'bottom']}
            >
                <StatusBar
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                    backgroundColor={T.bg}
                />
                <View style={[styles.processingHeader, { borderBottomColor: T.ink }]}>
                    {/* Geometric brand accent — same pair ng ScreenLayout */}
                    <View style={styles.titleMarker}>
                        <View style={[styles.markerSquareInk, { backgroundColor: T.ink, borderColor: T.ink }]} />
                        <View style={[styles.markerSquareBrand, { backgroundColor: T.brand, borderColor: T.ink }]} />
                    </View>
                    <Text style={[styles.processingHeaderTitle, { color: T.text }]}>
                        Sinusuri ang Document
                    </Text>
                </View>
                <View style={styles.processingBody}>
                    <Animated.View
                        style={[
                            styles.processingIconBox,
                            {
                                backgroundColor: T.brandSoft,
                                borderColor: T.ink,
                                transform: [
                                    { scale: processingPulseScale },
                                ],
                                opacity: processingPulseOpacity,
                            },
                        ]}
                    >
                        <Ionicons
                            name="document-text-outline"
                            size={30}
                            color={T.brand}
                        />
                    </Animated.View>
                    <Text style={[styles.processingTitle, { color: T.text }]}>
                        Sinusuri ang lahat ng pahina
                    </Text>
                    <Text style={[styles.processingMessage, { color: T.subText }]}>
                        Tinitingnan ang mga clause at posibleng panganib.
                    </Text>

                    {/* Lagging spinner — halatang gumagawa pa rin ang app
                        kahit wala pang na-rereport na porsyento */}
                    <View
                        pointerEvents="none"
                        style={styles.processingSpinner}
                    >
                        <ActivityIndicator
                            size="small"
                            color={T.brand}
                        />
                    </View>

                    {/* RESPONSIVE PROGRESS — laging nakikita habang
                        nag-aanalyze: indeterminate sweep (gumagalaw na
                        segment) habang 0% pa, tapos animated na fill
                        papunta sa totoong porsyento kapag may report na */}
                    <View
                        accessible
                        accessibilityRole="progressbar"
                        accessibilityLabel="Progreso ng analysis"
                        accessibilityValue={{
                            min: 0,
                            max: 100,
                            now: safeAnalysisProgress,
                            text: `${safeAnalysisProgress} porsyento`,
                        }}
                        style={[
                            styles.processingProgressCard,
                            {
                                backgroundColor: T.card,
                                borderColor: T.ink,
                            },
                        ]}
                    >
                        <View style={styles.processingProgressHead}>
                            <Text
                                style={[
                                    styles.processingProgressLabel,
                                    { color: T.subText },
                                ]}
                            >
                                Progreso ng analysis
                            </Text>
                            <Text
                                style={[
                                    styles.processingProgressValue,
                                    { color: T.brand },
                                ]}
                            >
                                {safeAnalysisProgress}%
                            </Text>
                        </View>
                        <View
                            onLayout={handleTrackLayout}
                            style={[
                                styles.processingProgressTrack,
                                { backgroundColor: T.border },
                            ]}
                        >
                            {isProgressDeterminate ? (
                                <Animated.View
                                    style={[
                                        styles.processingProgressFill,
                                        {
                                            width: progressFillAnim.interpolate({
                                                inputRange: [0, 100],
                                                outputRange: ['0%', '100%'],
                                            }),
                                            backgroundColor: T.brand,
                                        },
                                    ]}
                                />
                            ) : (
                                <Animated.View
                                    style={[
                                        styles.processingProgressSweep,
                                        {
                                            backgroundColor: T.brand,
                                            transform: [
                                                {
                                                    translateX: progressSweepRange,
                                                },
                                            ],
                                        },
                                    ]}
                                />
                            )}
                        </View>
                    </View>

                    {/* Privacy note — bordered chip na, hindi maluwag na
                        nakakalat na teksto */}
                    <View
                        style={[
                            styles.processingInfoRow,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={14}
                            color={T.success}
                        />
                        <Text style={[styles.processingInfoText, { color: T.subText }]}>
                            Nilinis na text lamang ang ipinadala. Hindi kasama ang larawan.
                        </Text>
                    </View>
                </View>
                <View style={styles.processingFooter}>
                    {/* SPLIT CTA — purple main + black arrow square (focal) */}
                    <SplitCta
                        label="Ipagpatuloy sa Background"
                        icon="arrow-undo-outline"
                        arrowIcon="arrow-redo-outline"
                        onPress={() =>
                            navigation.navigate('Main', {
                                screen: 'Scan',
                            })
                        }
                        colors={T}
                        sink={sink}
                    />
                    {/* Destructive secondary — bordered danger outline,
                        hindi na bare na pulang teksto */}
                    <TouchableOpacity
                        style={[
                            styles.processingCancelButton,
                            { borderColor: T.danger },
                        ]}
                        onPress={cancelProcess}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.processingCancelText, { color: T.danger }]}>
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
            <SafeAreaView style={[styles.container, { backgroundColor: T.bg }]}>
                <StatusBar
                    barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                    backgroundColor={T.bg}
                />
                <View style={styles.emptyState}>
                    <Ionicons
                        name="documents-outline"
                        size={48}
                        color={T.subText}
                    />
                    <Text style={[styles.emptyTitle, { color: T.text }]}>
                        Walang document page
                    </Text>
                    <Text style={[styles.emptyMessage, { color: T.subText }]}>
                        Kumuha muna ng kahit isang malinaw na pahina.
                    </Text>
                    <View style={styles.emptyCtaWrap}>
                        <SplitCta
                            label="Buksan ang Camera"
                            icon="camera-outline"
                            onPress={() =>
                                navigation.replace(
                                    'ScannerScreen'
                                )
                            }
                            colors={T}
                            sink={sink}
                        />
                    </View>
                </View>
                <AlertRender />
            </SafeAreaView>
        );
    }
    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: T.bg }]}
            edges={['top', 'bottom']}
            testID="batch-edit-screen-v5"
        >
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
                backgroundColor={T.bg}
            />
            {/* APP BAR — editor header, kapareho ng ScreenLayout look:
                2px ink rule sa ilalim + ALL-CAPS title + square pair */}
            <View style={[styles.header, { borderBottomColor: T.ink }]}>
                <NeoIconButton
                    icon="arrow-back"
                    onPress={handleBack}
                    disabled={isBusy}
                    size={40}
                    iconSize={20}
                    accessibilityLabel="Bumalik"
                />
                <View style={styles.headerCenter}>
                    <View style={styles.headerTitleRow}>
                        <View style={styles.titleMarker}>
                            <View style={[styles.markerSquareInk, { backgroundColor: T.ink, borderColor: T.ink }]} />
                            <View style={[styles.markerSquareBrand, { backgroundColor: T.brand, borderColor: T.ink }]} />
                        </View>
                        <Text
                            style={[styles.headerTitle, { color: T.text }]}
                            numberOfLines={1}
                        >
                            Suriin ang mga Pahina
                        </Text>
                    </View>
                    <Text style={[styles.headerHint, { color: T.subText }]}>
                        {isOcrRunning ? 'Binabasa ang mga pahina…' : 'I-swipe para makita ang iba'}
                    </Text>
                </View>
                <View style={[styles.pageCounter, { backgroundColor: T.card, borderColor: T.ink }]}>
                    <Text style={[styles.pageCounterText, { color: T.text }]}>
                        {currentIndex + 1}/{pages.length}
                    </Text>
                </View>
            </View>
            {isOcrRunning && (
                <View
                    style={[styles.readingBanner, { backgroundColor: T.card, borderBottomColor: T.ink }]}
                    accessibilityLiveRegion="polite"
                >
                    <ActivityIndicator size="small" color={T.brand} />
                    <View style={styles.readingCopy}>
                        <Text style={[styles.readingTitle, { color: T.text }]}>
                            Binabasa ang pahina {ocrProgress.current} sa {ocrProgress.total}
                        </Text>
                        <Text style={[styles.readingSubtext, { color: T.subText }]}>
                            Sa phone muna ito. Wala pang ipinapadala sa AI.
                        </Text>
                    </View>
                </View>
            )}
            {/* DOCUMENT CANVAS — sadyang madilim (media canvas) */}
            <View style={styles.viewerSection}>
                <FlatList
                    ref={mainListRef}
                    data={pages}
                    horizontal
                    pagingEnabled
                    scrollEnabled={!isAiAnalyzing}
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
            <View style={[styles.thumbnailSection, { backgroundColor: T.bg, borderTopColor: T.ink }]}>
                <View style={styles.thumbnailHeader}>
                    <Text style={[styles.thumbnailHeaderText, { color: T.subText }]}>
                        MGA PAHINA
                    </Text>
                    <Text style={[styles.thumbnailCountText, { color: T.brand }]}>
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
            <View style={[styles.toolBar, { backgroundColor: T.bg, borderTopColor: T.ink }]}>
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
                        color={T.brand}
                    />
                    <Text style={[styles.toolButtonText, { color: T.subText }]}>
                        Dagdag
                    </Text>
                </TouchableOpacity>
                <View style={[styles.toolDivider, { backgroundColor: T.border }]} />
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
                        color={T.brand}
                    />
                    <Text style={[styles.toolButtonText, { color: T.subText }]}>
                        Camera
                    </Text>
                </TouchableOpacity>
                <View style={[styles.toolDivider, { backgroundColor: T.border }]} />
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
                        color={T.danger}
                    />
                    <Text
                        style={[
                            styles.toolButtonText,
                            { color: T.danger },
                        ]}
                    >
                        Alisin
                    </Text>
                </TouchableOpacity>
            </View>
            <View style={[styles.bottomActionArea, { backgroundColor: T.bg, borderTopColor: T.ink }]}>
                <TouchableOpacity
                    style={styles.ocrPreviewButton}
                    onPress={previewReadText}
                    disabled={isBusy}
                    accessibilityRole="button"
                    accessibilityLabel="Tingnan ang text na nabasa sa phone"
                >
                    <Ionicons name="document-text-outline" size={16} color={T.brand} />
                    <Text style={[styles.ocrPreviewLabel, { color: T.brand }]}>Tingnan ang nabasang text</Text>
                </TouchableOpacity>
                <Text style={[styles.privacyNote, { color: T.subText }]}>
                    {isOcrRunning
                        ? `Binabasa sa phone ang pahina ${ocrProgress.current}/${ocrProgress.total}…`
                        : reviewResult?.failedPages.length
                          ? `Hindi nabasa ang pahina ${reviewResult.failedPages.map((item) => item.pageNumber).join(', ')}. Kunan ulit ito.`
                          : 'Sa phone muna babasahin at lilinisin ang text.'}
                </Text>
                {/* HERO CTA — split-button, may 2px hard shadow + sink */}
                <SplitCta
                    label={isOcrRunning ? 'Binabasa ang mga pahina…' : `Ipa-check sa AI (${pages.length})`}
                    icon="shield-checkmark-outline"
                    onPress={handleAnalyze}
                    disabled={isBusy}
                    busy={isOcrRunning}
                    colors={T}
                    sink={sink}
                    height={48}
                />
            </View>
            {/* AI NOTICE MODAL — focal surface: 2px outline + 2px hard shadow */}
            <Modal
                visible={pendingNotice !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setPendingNotice(null)}
            >
                <View style={[styles.noticeBackdrop, { backgroundColor: T.overlay }]}>
                    <View
                        style={[
                            styles.noticeCard,
                            {
                                backgroundColor: T.card,
                                borderColor: T.ink,
                            },
                            getNeoShadow(T, 'sm'),
                        ]}
                    >
                        <NeoIconButton
                            icon="close"
                            size={34}
                            iconSize={19}
                            style={styles.noticeClose}
                            onPress={() => setPendingNotice(null)}
                            accessibilityLabel="Isara ang paalala"
                        />
                        <Ionicons name="shield-checkmark-outline" size={28} color={T.brand} />
                        <Text style={[styles.noticeTitle, { color: T.text }]}>Bago suriin sa AI</Text>
                        <Text style={[styles.noticeBody, { color: T.subText }]}>
                            Nilinis na text lang ang ipapadala sa AI, hindi ang larawan. Gabay sa pag-unawa ang resulta; hindi ito legal advice. Tingnan pa rin ang orihinal na dokumento bago magdesisyon.
                        </Text>
                        <Pressable
                            onPress={() => { void acceptAiNotice(); }}
                            accessibilityRole="button"
                        >
                            {({ pressed }) => (
                                <View
                                    style={[
                                        styles.noticeProceed,
                                        { backgroundColor: T.brandVivid, borderColor: T.ink },
                                        sink(pressed, 'sm'),
                                    ]}
                                >
                                    <Text style={[styles.noticeProceedText, { color: T.brandText }]}>Naiintindihan ko, suriin sa AI</Text>
                                </View>
                            )}
                        </Pressable>
                    </View>
                </View>
            </Modal>
            <AlertRender />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    // --- SHARED: geometric brand accent (same ng ScreenLayout) ---
    titleMarker: {
        width: 15,
        height: 15,
        marginRight: 9,
    },
    markerSquareInk: {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 9,
        height: 9,
        borderWidth: BORDER.thin,
    },
    markerSquareBrand: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 9,
        height: 9,
        borderWidth: BORDER.thin,
    },

    // --- SHARED: split CTA (purple main + black arrow square — spec) ---
    splitCta: {
        flexDirection: 'row',
        alignItems: 'stretch',
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.md,
        overflow: 'hidden',
    },
    splitCtaMain: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        paddingHorizontal: 14,
    },
    splitCtaText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    splitCtaArrow: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledButton: {
        opacity: 0.5,
    },

    // --- CONTAINERS ---
    container: {
        flex: 1,
    },
    processingScreen: {
        flex: 1,
    },

    // --- PROCESSING (AI analyzing) STATE ---
    processingHeader: {
        height: 62,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        borderBottomWidth: BORDER.thick,
    },
    processingHeaderTitle: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    processingBody: {
        flex: 1,
        paddingHorizontal: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    processingIconBox: {
        width: 58,
        height: 58,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: BORDER.thin,
    },
    processingTitle: {
        fontSize: 20,
        lineHeight: 26,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 18,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    processingMessage: {
        maxWidth: 320,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
        marginTop: 8,
    },
    processingSpinner: {
        marginTop: 18,
    },
    processingProgressCard: {
        alignSelf: 'stretch',
        marginTop: 18,
        paddingVertical: 11,
        paddingHorizontal: 13,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
    },
    processingProgressHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    processingProgressLabel: {
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },
    processingProgressValue: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
    processingProgressTrack: {
        width: '100%',
        height: 8,
        marginTop: 8,
        borderRadius: 2,
        overflow: 'hidden',
    },
    processingProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    processingProgressSweep: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        // PIXELS, hindi '%': nasa pixels na rin ang translateX ng sweep,
        // para consistent ang unit at walang Android cast crash.
        width: PROGRESS_SWEEP_WIDTH,
        borderRadius: 2,
        opacity: 0.85,
    },
    processingInfoRow: {
        maxWidth: 340,
        marginTop: 20,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        flexDirection: 'row',
        alignItems: 'center',
    },
    processingInfoText: {
        flexShrink: 1,
        fontSize: 11,
        lineHeight: 16,
        marginLeft: 8,
    },
    processingFooter: {
        width: '100%',
        maxWidth: 360,
        alignSelf: 'center',
        paddingHorizontal: 22,
        paddingBottom: 18,
    },
    processingCancelButton: {
        height: 42,
        marginTop: 10,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    processingCancelText: {
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '800',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
    },

    // --- EDITOR APP BAR (kapareho ng ScreenLayout: 2px ink rule) ---
    header: {
        height: 66,
        paddingHorizontal: SPACING.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderBottomWidth: BORDER.thick,
    },
    headerCenter: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '900',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        flexShrink: 1,
    },
    headerHint: {
        fontSize: 10,
        lineHeight: 13,
        marginTop: 2,
    },
    pageCounter: {
        minWidth: 44,
        height: 36,
        paddingHorizontal: 7,
        borderRadius: RADIUS.sm,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageCounterText: {
        fontSize: 12,
        fontWeight: '900',
    },

    // --- READING BANNER (flat card, brand spinner — progreso per spec) ---
    readingBanner: {
        minHeight: 62,
        paddingHorizontal: 17,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: BORDER.thin,
    },
    readingCopy: {
        flex: 1,
        marginLeft: 12,
    },
    readingTitle: {
        fontSize: 13,
        fontWeight: '800',
    },
    readingSubtext: {
        fontSize: 11,
        marginTop: 3,
    },

    // --- DOCUMENT CANVAS (media — sadyang madilim, hindi themed) ---
    viewerSection: {
        flex: 1,
        minHeight: 160,
        backgroundColor: CANVAS.black,
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
        borderRadius: RADIUS.sm,
        backgroundColor: CANVAS.black,
        borderWidth: 1,
        borderColor: CANVAS.border,
    },
    documentImage: {
        width: '100%',
        height: '100%',
    },

    // --- THUMBNAIL STRIP (2px ink rule sa taas — mirror ng app bar) ---
    thumbnailSection: {
        height: 84,
        paddingTop: 7,
        borderTopWidth: BORDER.thick,
    },
    thumbnailHeader: {
        height: 18,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
    },
    thumbnailHeaderText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.9,
    },
    thumbnailCountText: {
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
        borderRadius: RADIUS.sm,
        borderWidth: 2,
        borderColor: 'transparent',
        backgroundColor: CANVAS.black,
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    // Number badge: media overlay sa ibabaw ng thumbnail photo
    thumbnailNumber: {
        position: 'absolute',
        left: 3,
        bottom: 3,
        minWidth: 19,
        height: 19,
        paddingHorizontal: 4,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
    },
    thumbnailNumberText: {
        color: '#FFFFFF',
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

    // --- TOOL BAR (2px ink rule sa taas) ---
    toolBar: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: BORDER.thick,
    },
    toolButton: {
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toolButtonText: {
        fontSize: 11,
        fontWeight: '800',
        marginTop: 4,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    toolDivider: {
        width: 1,
        height: 28,
    },

    // --- BOTTOM ACTION AREA (2px ink rule sa taas) ---
    bottomActionArea: {
        minHeight: 96,
        paddingHorizontal: 14,
        paddingTop: 8,
        paddingBottom: 10,
        borderTopWidth: BORDER.thick,
    },
    ocrPreviewButton: {
        minHeight: 34,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    ocrPreviewLabel: {
        fontWeight: '800',
        fontSize: 11,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    privacyNote: {
        fontSize: 10,
        lineHeight: 14,
        textAlign: 'center',
        marginBottom: 8,
    },

    // --- AI NOTICE MODAL (focal: 2px outline + 2px hard shadow) ---
    noticeBackdrop: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    noticeCard: {
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.lg,
        padding: 22,
    },
    noticeClose: {
        position: 'absolute',
        right: 12,
        top: 12,
        zIndex: 1,
    },
    noticeTitle: {
        fontSize: 19,
        lineHeight: 24,
        fontWeight: '900',
        marginTop: 14,
        marginBottom: 8,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    noticeBody: {
        fontSize: 14,
        lineHeight: 21,
        marginBottom: 22,
    },
    noticeProceed: {
        minHeight: 50,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    noticeProceedText: {
        fontWeight: '800',
        textAlign: 'center',
        fontSize: 13,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },

    // --- EMPTY STATE ---
    emptyState: {
        flex: 1,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 20,
        lineHeight: 25,
        fontWeight: '900',
        marginTop: 16,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    emptyMessage: {
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
        marginTop: 8,
    },
    emptyCtaWrap: {
        alignSelf: 'stretch',
        maxWidth: 320,
        marginTop: 22,
    },

    // --- LEGACY (hindi na ginagamit sa JSX — naka-keep lang) ---
    analyzeButtonReading: {
        opacity: 0.85,
    },
});