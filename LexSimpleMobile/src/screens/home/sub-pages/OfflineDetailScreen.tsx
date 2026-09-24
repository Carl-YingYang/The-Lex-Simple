import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import ImageViewer from 'react-native-image-zoom-viewer';

import { postEndpoint, postFileEndpoint } from '../../../services/AiEngine';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import ClauseCard from '../../../components/ClauseCard';
import { sanitizeLocalText } from '../../../utils/sanitizer';
import { useTheme } from '../../../theme/ThemeContext';

const HISTORY_STORAGE_KEY = '@lex_scan_history';
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const DANGER = '#EF4444';

type Finding = {
    title: string;
    description: string;
    advice: string;
    foundText: string;
    confidence?: string;
};

interface AnalysisResult {
    score: number | null;
    riskLevel: string;
    documentTitle?: string;
    findings: Finding[];
    rag_context_used?: string;
    sanitizedText?: string;
    ocrText?: string;
}

type ScanItem = {
    id: string;
    uri?: string;
    images?: string[];
    pageUris?: string[];
    title?: string;
    date?: string;
    type?: 'camera' | 'gallery' | 'document';
    status?: 'unscanned' | 'scanned';
    analysisResult?: Partial<AnalysisResult>;
    ocrText?: string;
    sanitizedText?: string;
};

type RiskConfig = {
    color: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
};

const normalizeUriForOcr = (uri: string): string => {
    const trimmed = uri.trim();

    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return `file://${trimmed}`;
};

const getImagePages = (item?: ScanItem): string[] => {
    if (!item || item.type === 'document') {
        return [];
    }

    const candidates = item.pageUris?.length
        ? item.pageUris
        : item.images?.length
          ? item.images
          : item.uri
            ? [item.uri]
            : [];

    return candidates.filter(
        (uri): uri is string =>
            typeof uri === 'string' && uri.trim().length > 0
    );
};

const getRiskConfig = (score: number | null): RiskConfig => {
    if (score === null) {
        return {
            color: PRIMARY_SOFT,
            icon: 'information-circle-outline',
            label: 'REVIEW NEEDED',
        };
    }
    if (score >= 90) {
        return {
            color: SUCCESS,
            icon: 'shield-checkmark-outline',
            label: 'VERY SAFE',
        };
    }

    if (score >= 70) {
        return {
            color: PRIMARY_SOFT,
            icon: 'checkmark-circle-outline',
            label: 'ACCEPTABLE',
        };
    }

    if (score >= 50) {
        return {
            color: WARNING,
            icon: 'warning-outline',
            label: 'RISKY',
        };
    }

    return {
        color: DANGER,
        icon: 'alert-circle-outline',
        label: 'HIGH RISK',
    };
};

const normalizeAnalysisResult = (
    response: any,
    ocrText: string,
    sanitizedText: string
): AnalysisResult => {
    const payload =
        response?.data?.data ?? response?.data ?? response ?? {};
    const findings = Array.isArray(payload.findings)
        ? payload.findings
        : Array.isArray(payload.clauses)
          ? payload.clauses
          : [];
    const scoreCandidate = payload.score ?? payload.safety_score;
    const rawScore = Number(scoreCandidate);
    const score = Number.isFinite(rawScore)
        && scoreCandidate !== null && scoreCandidate !== undefined
        && findings.length > 0
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : null;

    return {
        ...payload,
        score,
        riskLevel: score === null
            ? 'No findings detected'
            : payload.riskLevel || getRiskConfig(score).label,
        findings,
        rag_context_used:
            payload.rag_context_used ??
            response?.data?.rag_context_used ??
            response?.rag_context_used,
        ocrText:
            payload.ocrText ||
            response?.extractedText ||
            ocrText,
        sanitizedText:
            payload.sanitizedText ||
            response?.data?.sanitizedText ||
            response?.sanitizedText ||
            sanitizedText,
    };
};

type ExpandableFindingProps = {
    finding: Finding;
    deduction: number;
    T: any;
};

const ExpandableFinding = ({
    finding,
    deduction,
    T,
}: ExpandableFindingProps) => {
    const [expanded, setExpanded] = useState(false);
    const description = String(finding.description || '');
    const isLong = description.length > 120;

    return (
        <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
                <Text
                    style={[styles.breakdownTitle, { color: T.text }]}
                >
                    {finding.title || 'Finding'}
                </Text>
                <Text style={styles.deductionText}>-{deduction}</Text>
            </View>
            <Text
                style={[styles.breakdownBody, { color: T.subText }]}
                numberOfLines={expanded ? undefined : 3}
            >
                {description}
            </Text>
            {isLong && (
                <TouchableOpacity
                    style={styles.readMoreButton}
                    onPress={() => setExpanded((current) => !current)}
                >
                    <Text style={styles.readMoreText}>
                        {expanded ? 'Paikliin' : 'Basahin lahat'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

export default function OfflineDetailScreen({
    route,
    navigation,
}: any) {
    const scanItem: ScanItem | undefined = route?.params?.scanItem;
    const { showAlert, AlertRender } = useCustomAlert();
    const { isDarkMode, colors: T } = useTheme();

    const [activePageIndex, setActivePageIndex] = useState(0);
    const [fullscreenVisible, setFullscreenVisible] = useState(false);
    const [brokenImages, setBrokenImages] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState('');
    const [legalModalVisible, setLegalModalVisible] = useState(false);
    const [scoreModalVisible, setScoreModalVisible] = useState(false);
    const [selectedLegalTitle, setSelectedLegalTitle] = useState('');
    const [selectedLegalText, setSelectedLegalText] = useState('');

    const imagePages = useMemo(
        () => getImagePages(scanItem),
        [scanItem]
    );

    useEffect(() => {
        if (activePageIndex >= imagePages.length) {
            setActivePageIndex(0);
        }
    }, [activePageIndex, imagePages.length]);

    const isScanned = scanItem?.status === 'scanned';
    const rawResult = scanItem?.analysisResult;
    const savedFindings = Array.isArray(rawResult?.findings)
        ? rawResult.findings : [];
    const scoreValue = Number(rawResult?.score);
    const safeScore = savedFindings.length > 0
        && rawResult?.score !== null
        && rawResult?.score !== undefined
        && Number.isFinite(scoreValue)
        ? Math.max(0, Math.min(100, Math.round(scoreValue)))
        : null;
    const result: AnalysisResult = {
        score: safeScore,
        riskLevel: safeScore === null
            ? 'No findings detected'
            : String(rawResult?.riskLevel || '') ||
              getRiskConfig(safeScore).label,
        documentTitle: rawResult?.documentTitle,
        findings: savedFindings,
        rag_context_used: rawResult?.rag_context_used,
        sanitizedText:
            rawResult?.sanitizedText || scanItem?.sanitizedText,
        ocrText: rawResult?.ocrText || scanItem?.ocrText,
    };
    const riskConfig = getRiskConfig(result.score);

    const getDisplayTitle = (): string => {
        let title = String(scanItem?.title || 'Saved Document').trim();

        if (isScanned && result.documentTitle?.trim()) {
            title = result.documentTitle.trim();
        } else if (
            isScanned &&
            scanItem?.ocrText &&
            ['Camera Scan', 'Gallery Upload', 'Document Scan'].includes(
                title
            )
        ) {
            const firstUsefulLine = scanItem.ocrText
                .split('\n')
                .map((line) => line.trim())
                .find(
                    (line) =>
                        line.length > 4 &&
                        !line.startsWith('--- Page')
                );

            if (firstUsefulLine) {
                title = firstUsefulLine;
            }
        }

        return title.length > 45
            ? `${title.slice(0, 45).trim()}...`
            : title;
    };

    const getDateLabel = (): string => {
        const rawDate = String(scanItem?.date || '').trim();
        return rawDate ? rawDate.split(',')[0] : 'Walang petsa';
    };

    const markImageAsBroken = (uri: string): void => {
        setBrokenImages((current) =>
            current.includes(uri) ? current : [...current, uri]
        );
    };

    const openSanitizedText = (): void => {
        const text =
            result.sanitizedText ||
            scanItem?.sanitizedText ||
            sanitizeLocalText(scanItem?.ocrText || '');

        if (!text.trim()) {
            showAlert(
                'Wala pang text',
                'Ipa-check muna ang document para makagawa ng sanitized text.',
                'info'
            );
            return;
        }

        navigation.navigate('SanitizedOcrScreen', {
            sanitizedText: text,
            isOfflinePreview: !isScanned,
        });
    };

    const handleDelete = (): void => {
        if (!scanItem) {
            return;
        }

        showAlert(
            'Burahin ang file?',
            'Hindi na maibabalik ang file na ito sa recent files.',
            'warning',
            [
                { text: 'Kanselahin', style: 'cancel' },
                {
                    text: 'Burahin',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const storedHistory =
                                await AsyncStorage.getItem(
                                    HISTORY_STORAGE_KEY
                                );
                            const parsed = storedHistory
                                ? JSON.parse(storedHistory)
                                : [];
                            const history = Array.isArray(parsed)
                                ? parsed
                                : [];
                            const updatedHistory = history.filter(
                                (item: ScanItem) =>
                                    item.id !== scanItem.id
                            );

                            await AsyncStorage.setItem(
                                HISTORY_STORAGE_KEY,
                                JSON.stringify(updatedHistory)
                            );
                            navigation.goBack();
                        } catch (error) {
                            console.error(
                                '[OfflineDetail] Delete failed:',
                                error
                            );
                            showAlert(
                                'Hindi nabura',
                                'Subukan ulit ang pagbura ng file.',
                                'error'
                            );
                        }
                    },
                },
            ]
        );
    };

    const saveAnalysisToHistory = async (
        analysis: AnalysisResult
    ): Promise<void> => {
        if (!scanItem) {
            return;
        }

        const storedHistory = await AsyncStorage.getItem(
            HISTORY_STORAGE_KEY
        );
        const parsed = storedHistory ? JSON.parse(storedHistory) : [];
        const history = Array.isArray(parsed) ? parsed : [];
        const updatedHistory = history.map((item: ScanItem) =>
            item.id === scanItem.id
                ? {
                      ...item,
                      status: 'scanned',
                      analysisResult: analysis,
                      ocrText: analysis.ocrText,
                      sanitizedText: analysis.sanitizedText,
                  }
                : item
        );

        await AsyncStorage.setItem(
            HISTORY_STORAGE_KEY,
            JSON.stringify(updatedHistory)
        );
    };

    const analyzeImagePages = async (): Promise<{
        ocrText: string;
        sanitizedText: string;
    }> => {
        if (imagePages.length === 0) {
            throw new Error('Walang image page na pwedeng basahin.');
        }

        const successfulPages: Array<{
            pageNumber: number;
            text: string;
        }> = [];

        for (let index = 0; index < imagePages.length; index += 1) {
            const pageNumber = index + 1;
            setAnalysisProgress(
                `Binabasa ang pahina ${pageNumber} sa ${imagePages.length}`
            );

            try {
                const recognition = await TextRecognition.recognize(
                    normalizeUriForOcr(imagePages[index])
                );
                const pageText = String(recognition?.text || '').trim();

                if (pageText.length >= 10) {
                    successfulPages.push({ pageNumber, text: pageText });
                }
            } catch (error) {
                console.warn(
                    `[OfflineDetail] OCR failed on page ${pageNumber}:`,
                    error
                );
            }
        }

        if (successfulPages.length === 0) {
            throw new Error(
                'Walang malinaw na text na nabasa sa mga pahina.'
            );
        }

        const combinedText = successfulPages
            .map(
                (page) =>
                    `--- Page ${page.pageNumber} ---\n${page.text}`
            )
            .join('\n\n');
        const sanitizedText = sanitizeLocalText(combinedText);

        if (sanitizedText.trim().length < 20) {
            throw new Error(
                'Masyadong kaunti ang text para masuri nang maayos.'
            );
        }

        return {
            ocrText: combinedText,
            sanitizedText,
        };
    };

    const handleAnalyze = async (): Promise<void> => {
        if (!scanItem || isAnalyzing) {
            return;
        }

        try {
            const networkState = await Network.getNetworkStateAsync();
            if (
                networkState.isConnected === false ||
                networkState.isInternetReachable === false
            ) {
                showAlert(
                    'Walang internet',
                    'Naka-save ang file sa phone. Kumonekta muna bago ito ipa-check.',
                    'warning'
                );
                return;
            }

            setIsAnalyzing(true);
            setAnalysisProgress('Inihahanda ang document');

            let analysis: AnalysisResult;

            if (scanItem.type === 'document') {
                const documentUri = scanItem.uri?.trim();
                if (!documentUri) {
                    throw new Error('Hindi mahanap ang document file.');
                }

                setAnalysisProgress('Ina-upload ang document');
                const formData = new FormData();
                formData.append('file', {
                    uri: documentUri,
                    name: scanItem.title || 'document',
                    type: 'application/octet-stream',
                } as any);

                const response = await postFileEndpoint(
                    '/simplify_file',
                    formData
                );

                if (response?.status !== 'success') {
                    throw new Error(
                        response?.message ||
                            'Hindi na-process ang document.'
                    );
                }

                analysis = normalizeAnalysisResult(
                    response,
                    String(response.extractedText || scanItem.ocrText || ''),
                    String(response.sanitizedText || '')
                );
            } else {
                const localText = await analyzeImagePages();

                setAnalysisProgress('Sinusuri ang document');
                const response = await postEndpoint('/simplify', {
                    text: localText.sanitizedText,
                });

                if (response?.status !== 'success') {
                    throw new Error(
                        response?.message ||
                            'Hindi nakumpleto ang analysis.'
                    );
                }

                analysis = normalizeAnalysisResult(
                    response,
                    localText.ocrText,
                    localText.sanitizedText
                );
            }

            setAnalysisProgress('Sine-save ang resulta');
            await saveAnalysisToHistory(analysis);

            navigation.replace('ResultScreen', {
                analysisResult: analysis,
            });
        } catch (error: any) {
            console.error('[OfflineDetail] Analysis failed:', error);
            showAlert(
                'Hindi nakumpleto',
                error?.message || 'Subukan ulit ang document.',
                'error'
            );
        } finally {
            setIsAnalyzing(false);
            setAnalysisProgress('');
        }
    };

    const showLegalBasis = (finding: Finding): void => {
        setSelectedLegalTitle(finding.title || 'Legal Basis');

        const context = String(result.rag_context_used || '').trim();
        if (!context) {
            setSelectedLegalText(
                'Walang matching statutory provision sa local database.'
            );
            setLegalModalVisible(true);
            return;
        }

        const chunks = context
            .split('\n---\n')
            .map((chunk) => chunk.trim())
            .filter(Boolean);
        const keywords = `${finding.title} ${finding.description} ${finding.foundText}`
            .toLocaleLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter((word) => word.length > 3);
        let bestChunk = '';
        let bestScore = 0;

        chunks.forEach((chunk) => {
            const normalizedChunk = chunk.toLocaleLowerCase();
            const matchScore = keywords.reduce(
                (score, keyword) =>
                    normalizedChunk.includes(keyword)
                        ? score + 1
                        : score,
                0
            );

            if (matchScore > bestScore) {
                bestScore = matchScore;
                bestChunk = chunk;
            }
        });

        setSelectedLegalText(
            bestChunk ||
                'Walang matching statutory provision sa local database.'
        );
        setLegalModalVisible(true);
    };

    const askLexieAboutDocument = (): void => {
        const findingsText = result.findings.length
            ? result.findings
                  .map(
                      (finding, index) =>
                          `${index + 1}. ${finding.title}\nPaliwanag: ${finding.description}\nPayo: ${finding.advice}`
                  )
                  .join('\n\n')
            : 'Walang high-risk finding sa available text.';

        navigation.navigate('AskAiScreen', {
            attachedFile: {
                name: getDisplayTitle(),
                data: `DOCUMENT ANALYSIS\nScore: ${result.score === null ? 'Hindi ibinigay (walang na-flag)' : `${result.score}/100`}\nRisk: ${result.riskLevel}\n\n${findingsText}`,
            },
            suggestedPrompts: [
                'I-summarize ang document.',
                'Ano ang kailangan kong bantayan?',
                'Ipaliwanag ang pinakamahalagang clause.',
                'Ano ang maaari kong itanong sa abogado?',
            ],
        });
    };

    const askLexieAboutClause = (
        finding: Finding,
        initialPrompt?: string,
        dynamicPrompts?: string[],
        legalBasis?: string
    ): void => {
        const clauseContext = [
            `CLAUSE: ${finding.title}`,
            `Paliwanag: ${finding.description}`,
            `Practical guidance: ${finding.advice}`,
            `Original text: ${finding.foundText}`,
            legalBasis ? `Legal basis: ${legalBasis}` : '',
        ]
            .filter(Boolean)
            .join('\n\n');

        navigation.navigate('AskAiScreen', {
            attachedFile: {
                name: `Clause: ${finding.title}`,
                data: clauseContext,
            },
            initialPrompt,
            suggestedPrompts:
                dynamicPrompts || [
                    'Bakit kailangan ko itong bantayan?',
                    'Ipaliwanag ito sa simpleng Taglish.',
                    'Ano ang maaari kong itanong sa abogado?',
                ],
        });
    };

    if (!scanItem) {
        return (
            <ScreenLayout title="File Details">
                <View
                    style={[
                        styles.missingState,
                        { backgroundColor: T.bg },
                    ]}
                >
                    <Ionicons
                        name="document-outline"
                        size={36}
                        color={T.subText}
                    />
                    <Text
                        style={[styles.missingTitle, { color: T.text }]}
                    >
                        Hindi mahanap ang file
                    </Text>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.backButtonText}>Bumalik</Text>
                    </TouchableOpacity>
                </View>
            </ScreenLayout>
        );
    }

    if (isAnalyzing) {
        return (
            <ScreenLayout title="Sinusuri" showBackButton={false}>
                <View
                    style={[
                        styles.processingState,
                        { backgroundColor: T.bg },
                    ]}
                >
                    <ActivityIndicator size="large" color={PRIMARY} />
                    <Text
                        style={[
                            styles.processingTitle,
                            { color: T.text },
                        ]}
                    >
                        Sinusuri ang document
                    </Text>
                    <Text
                        style={[
                            styles.processingText,
                            { color: T.subText },
                        ]}
                    >
                        {analysisProgress}
                    </Text>
                </View>
            </ScreenLayout>
        );
    }

    const totalLostPoints = result.score === null
        ? 0 : Math.max(0, 100 - result.score);
    const baseDeduction = result.findings.length
        ? Math.floor(totalLostPoints / result.findings.length)
        : 0;
    const remainderDeduction = result.findings.length
        ? totalLostPoints % result.findings.length
        : 0;

    if (isScanned) {
        return (
            <ScreenLayout title="Scan Results" noPadding>
                <StatusBar
                    barStyle={
                        isDarkMode ? 'light-content' : 'dark-content'
                    }
                />
                <ScrollView
                    style={{ backgroundColor: T.bg }}
                    contentContainerStyle={styles.resultContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View
                        style={[
                            styles.noticeCard,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="information-circle-outline"
                            size={18}
                            color={PRIMARY_SOFT}
                        />
                        <Text
                            style={[
                                styles.noticeText,
                                { color: T.subText },
                            ]}
                        >
                            Para sa pag-unawa lamang. Hindi ito legal advice
                            o kapalit ng abogado.
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.scoreCard,
                            {
                                backgroundColor: T.card,
                                borderColor: riskConfig.color,
                            },
                        ]}
                        onPress={() => setScoreModalVisible(true)}
                        activeOpacity={0.85}
                    >
                        <View style={styles.scoreHeader}>
                            <Text
                                style={[
                                    styles.scoreLabel,
                                    { color: T.subText },
                                ]}
                            >
                                Finding check
                            </Text>
                            <View
                                style={[
                                    styles.riskBadge,
                                    { backgroundColor: riskConfig.color },
                                ]}
                            >
                                <Ionicons
                                    name={riskConfig.icon}
                                    size={13}
                                    color="#FFFFFF"
                                />
                                <Text style={styles.riskBadgeText}>
                                    {riskConfig.label}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.scoreValueRow}>
                            <Text
                                style={[
                                    styles.scoreValue,
                                    { color: riskConfig.color },
                                ]}
                            >
                                {result.score === null ? '—' : result.score}
                            </Text>
                            {result.score !== null && (
                                <Text
                                    style={[
                                        styles.scoreMaximum,
                                        { color: T.subText },
                                    ]}
                                >
                                    /100
                                </Text>
                            )}
                        </View>
                        <Text
                            style={[
                                styles.scoreDescription,
                                { color: T.subText },
                            ]}
                        >
                            {result.score === null
                                ? 'Walang na-flag sa OCR text. Hindi ito patunay na ligtas ang dokumento.'
                                : `${result.findings.length} finding(s) ang nakita sa available document text.`}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.utilityButton,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                        onPress={openSanitizedText}
                    >
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={20}
                            color={SUCCESS}
                        />
                        <View style={styles.utilityCopy}>
                            <Text
                                style={[
                                    styles.utilityTitle,
                                    { color: T.text },
                                ]}
                            >
                                Sanitized OCR text
                            </Text>
                            <Text
                                style={[
                                    styles.utilityDescription,
                                    { color: T.subText },
                                ]}
                            >
                                Tingnan ang text na nilinis bago ipinasa.
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <Text
                        style={[styles.sectionTitle, { color: T.text }]}
                    >
                        Clause analysis
                    </Text>

                    {result.findings.length === 0 ? (
                        <View
                            style={[
                                styles.emptyFindingCard,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Ionicons
                                name="checkmark-circle-outline"
                                size={34}
                                color={SUCCESS}
                            />
                            <Text
                                style={[
                                    styles.emptyFindingText,
                                    { color: T.subText },
                                ]}
                            >
                                Walang na-flag sa available OCR text.
                                I-check pa rin ang scan at buong dokumento.
                            </Text>
                        </View>
                    ) : (
                        result.findings.map((finding, index) => (
                            <View
                                key={`${finding.title}-${index}`}
                                style={styles.clauseWrapper}
                            >
                                <ClauseCard
                                    item={finding}
                                    themeConfig={{
                                        mainColor: riskConfig.color,
                                        icon: riskConfig.icon,
                                        label: riskConfig.label,
                                    }}
                                    ragContext={result.rag_context_used}
                                    onShowLegalBasis={showLegalBasis}
                                    onAskAiDeepDive={askLexieAboutClause}
                                />
                            </View>
                        ))
                    )}

                    <TouchableOpacity
                        style={styles.askLexieButton}
                        onPress={askLexieAboutDocument}
                    >
                        <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={19}
                            color="#FFFFFF"
                        />
                        <Text style={styles.askLexieText}>
                            Magtanong kay Lexie
                        </Text>
                    </TouchableOpacity>
                </ScrollView>

                <Modal
                    visible={scoreModalVisible}
                    transparent
                    animationType="fade"
                    statusBarTranslucent
                    onRequestClose={() => setScoreModalVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setScoreModalVisible(false)}
                        />
                        <View
                            style={[
                                styles.modalCard,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <View style={styles.modalHeader}>
                                <Text
                                    style={[
                                        styles.modalTitle,
                                        { color: T.text },
                                    ]}
                                >
                                    {result.score === null
                                        ? 'Bakit walang score?'
                                        : 'Score breakdown'}
                                </Text>
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={() =>
                                        setScoreModalVisible(false)
                                    }
                                >
                                    <Ionicons
                                        name="close"
                                        size={20}
                                        color={T.text}
                                    />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                            >
                                {result.score === null ? (
                                    <Text
                                        style={[
                                            styles.emptyFindingText,
                                            { color: T.subText },
                                        ]}
                                    >
                                        Walang na-flag sa available OCR text,
                                        kaya walang safety score. Hindi nito
                                        kinukumpirma na ligtas ang dokumento.
                                        Suriin ang scan at orihinal na clauses.
                                    </Text>
                                ) : (
                                    <>
                                <View style={styles.totalScoreRow}>
                                    <Text
                                        style={[
                                            styles.totalScoreLabel,
                                            { color: T.text },
                                        ]}
                                    >
                                        Starting score
                                    </Text>
                                    <Text style={styles.startingScore}>
                                        100
                                    </Text>
                                </View>
                                {result.findings.map((finding, index) => (
                                    <ExpandableFinding
                                        key={`${finding.title}-${index}`}
                                        finding={finding}
                                        deduction={
                                            baseDeduction +
                                            (index === 0
                                                ? remainderDeduction
                                                : 0)
                                        }
                                        T={T}
                                    />
                                ))}
                                <View
                                    style={[
                                        styles.finalScoreRow,
                                        { borderTopColor: T.border },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.finalScoreLabel,
                                            { color: T.text },
                                        ]}
                                    >
                                        Final score
                                    </Text>
                                    <Text
                                        style={[
                                            styles.finalScoreValue,
                                            { color: riskConfig.color },
                                        ]}
                                    >
                                        {result.score}
                                    </Text>
                                </View>
                                    </>
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <Modal
                    visible={legalModalVisible}
                    transparent
                    animationType="fade"
                    statusBarTranslucent
                    onRequestClose={() => setLegalModalVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setLegalModalVisible(false)}
                        />
                        <View
                            style={[
                                styles.modalCard,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <View style={styles.modalHeader}>
                                <Text
                                    style={[
                                        styles.modalTitle,
                                        { color: T.text },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {selectedLegalTitle}
                                </Text>
                                <TouchableOpacity
                                    style={styles.modalCloseButton}
                                    onPress={() =>
                                        setLegalModalVisible(false)
                                    }
                                >
                                    <Ionicons
                                        name="close"
                                        size={20}
                                        color={T.text}
                                    />
                                </TouchableOpacity>
                            </View>
                            <ScrollView
                                showsVerticalScrollIndicator={false}
                            >
                                <Text
                                    style={[
                                        styles.legalModalText,
                                        { color: T.text },
                                    ]}
                                    selectable
                                >
                                    {selectedLegalText}
                                </Text>
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <AlertRender />
            </ScreenLayout>
        );
    }

    const activePageUri = imagePages[activePageIndex];
    const activePageBroken = activePageUri
        ? brokenImages.includes(activePageUri)
        : false;

    return (
        <ScreenLayout title="File Details" noPadding>
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            />
            <ScrollView
                style={{ backgroundColor: T.bg }}
                contentContainerStyle={styles.offlineContent}
                showsVerticalScrollIndicator={false}
            >
                {scanItem.type === 'document' ? (
                    <View
                        style={[
                            styles.documentPreview,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <View style={styles.documentIcon}>
                            <Ionicons
                                name="document-text-outline"
                                size={28}
                                color={PRIMARY_SOFT}
                            />
                        </View>
                        <View style={styles.documentCopy}>
                            <Text
                                style={[
                                    styles.documentName,
                                    { color: T.text },
                                ]}
                                numberOfLines={2}
                            >
                                {getDisplayTitle()}
                            </Text>
                            <Text
                                style={[
                                    styles.documentType,
                                    { color: T.subText },
                                ]}
                            >
                                Document file
                            </Text>
                        </View>
                    </View>
                ) : imagePages.length > 0 ? (
                    <View>
                        <TouchableOpacity
                            style={[
                                styles.imagePreview,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                            activeOpacity={0.9}
                            onPress={() => setFullscreenVisible(true)}
                        >
                            {activePageUri && !activePageBroken ? (
                                <Image
                                    source={{ uri: activePageUri }}
                                    style={styles.mainImage}
                                    resizeMode="contain"
                                    onError={() =>
                                        markImageAsBroken(activePageUri)
                                    }
                                />
                            ) : (
                                <View style={styles.brokenImageState}>
                                    <Ionicons
                                        name="image-outline"
                                        size={34}
                                        color={T.subText}
                                    />
                                    <Text
                                        style={[
                                            styles.brokenImageText,
                                            { color: T.subText },
                                        ]}
                                    >
                                        Hindi ma-preview ang pahinang ito
                                    </Text>
                                </View>
                            )}

                            <View style={styles.pageBadge}>
                                <Text style={styles.pageBadgeText}>
                                    {activePageIndex + 1} /{' '}
                                    {imagePages.length}
                                </Text>
                            </View>
                            <View style={styles.expandBadge}>
                                <Ionicons
                                    name="expand-outline"
                                    size={16}
                                    color="#FFFFFF"
                                />
                            </View>
                        </TouchableOpacity>

                        {imagePages.length > 1 && (
                            <View style={styles.thumbnailSection}>
                                <Text
                                    style={[
                                        styles.thumbnailLabel,
                                        { color: T.text },
                                    ]}
                                >
                                    Mga pahina
                                </Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={
                                        styles.thumbnailContent
                                    }
                                >
                                    {imagePages.map((uri, index) => {
                                        const selected =
                                            index === activePageIndex;
                                        const broken =
                                            brokenImages.includes(uri);

                                        return (
                                            <TouchableOpacity
                                                key={`${uri}-${index}`}
                                                style={[
                                                    styles.thumbnailButton,
                                                    {
                                                        backgroundColor:
                                                            T.card,
                                                        borderColor: selected
                                                            ? PRIMARY
                                                            : T.border,
                                                    },
                                                ]}
                                                onPress={() =>
                                                    setActivePageIndex(index)
                                                }
                                                accessibilityRole="button"
                                                accessibilityLabel={`Pahina ${
                                                    index + 1
                                                }`}
                                            >
                                                {!broken ? (
                                                    <Image
                                                        source={{ uri }}
                                                        style={
                                                            styles.thumbnailImage
                                                        }
                                                        resizeMode="cover"
                                                        onError={() =>
                                                            markImageAsBroken(
                                                                uri
                                                            )
                                                        }
                                                    />
                                                ) : (
                                                    <Ionicons
                                                        name="image-outline"
                                                        size={21}
                                                        color={T.subText}
                                                    />
                                                )}
                                                <View
                                                    style={
                                                        styles.thumbnailNumber
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.thumbnailNumberText
                                                        }
                                                    >
                                                        {index + 1}
                                                    </Text>
                                                </View>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                ) : (
                    <View
                        style={[
                            styles.noPreviewCard,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="images-outline"
                            size={32}
                            color={T.subText}
                        />
                        <Text
                            style={[
                                styles.noPreviewText,
                                { color: T.subText },
                            ]}
                        >
                            Walang image na naka-save para sa file na ito.
                        </Text>
                    </View>
                )}

                <View style={styles.fileHeader}>
                    <View
                        style={[
                            styles.offlineBadge,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="phone-portrait-outline"
                            size={13}
                            color={WARNING}
                        />
                        <Text style={styles.offlineBadgeText}>
                            NAKA-SAVE SA PHONE
                        </Text>
                    </View>
                    <Text
                        style={[styles.fileTitle, { color: T.text }]}
                    >
                        {getDisplayTitle()}
                    </Text>
                    <Text
                        style={[styles.fileMeta, { color: T.subText }]}
                    >
                        {scanItem.type === 'document'
                            ? 'File'
                            : scanItem.type === 'gallery'
                              ? 'Gallery'
                              : 'Camera'}
                        {'  ·  '}
                        {getDateLabel()}
                        {imagePages.length > 1
                            ? `  ·  ${imagePages.length} pahina`
                            : ''}
                    </Text>
                </View>

                {(scanItem.ocrText || scanItem.sanitizedText) && (
                    <TouchableOpacity
                        style={[
                            styles.utilityButton,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                        onPress={openSanitizedText}
                    >
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={20}
                            color={SUCCESS}
                        />
                        <View style={styles.utilityCopy}>
                            <Text
                                style={[
                                    styles.utilityTitle,
                                    { color: T.text },
                                ]}
                            >
                                Tingnan ang nalinis na text
                            </Text>
                            <Text
                                style={[
                                    styles.utilityDescription,
                                    { color: T.subText },
                                ]}
                            >
                                Preview lang ito at nasa phone pa rin.
                            </Text>
                        </View>
                    </TouchableOpacity>
                )}

                <View
                    style={[
                        styles.offlineNotice,
                        {
                            backgroundColor: T.card,
                            borderColor: T.border,
                        },
                    ]}
                >
                    <Ionicons
                        name="cloud-offline-outline"
                        size={19}
                        color={WARNING}
                    />
                    <Text
                        style={[
                            styles.offlineNoticeText,
                            { color: T.subText },
                        ]}
                    >
                        Nasa phone ang file. Kailangan lang ng internet kapag
                        ipapa-check na ito.
                    </Text>
                </View>

                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={styles.analyzeButton}
                        onPress={() => void handleAnalyze()}
                    >
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={19}
                            color="#FFFFFF"
                        />
                        <Text style={styles.analyzeButtonText}>
                            Ipa-check ang document
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={handleDelete}
                        accessibilityRole="button"
                        accessibilityLabel="Burahin ang file"
                    >
                        <Ionicons
                            name="trash-outline"
                            size={20}
                            color={DANGER}
                        />
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <Modal
                visible={fullscreenVisible}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setFullscreenVisible(false)}
            >
                <View style={styles.viewerBackdrop}>
                    <TouchableOpacity
                        style={styles.viewerCloseButton}
                        onPress={() => setFullscreenVisible(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Isara"
                    >
                        <Ionicons
                            name="close"
                            size={22}
                            color="#FFFFFF"
                        />
                    </TouchableOpacity>
                    {imagePages.length > 0 && (
                        <ImageViewer
                            imageUrls={imagePages.map((uri) => ({
                                url: uri,
                            }))}
                            index={activePageIndex}
                            enableSwipeDown
                            onSwipeDown={() => setFullscreenVisible(false)}
                            onChange={(index) => {
                                if (typeof index === 'number') {
                                    setActivePageIndex(index);
                                }
                            }}
                            renderIndicator={(current, total) => (
                                <View style={styles.viewerIndicator}>
                                    <Text
                                        style={styles.viewerIndicatorText}
                                    >
                                        {current} / {total}
                                    </Text>
                                </View>
                            )}
                            backgroundColor="transparent"
                            saveToLocalByLongPress={false}
                        />
                    )}
                </View>
            </Modal>

            <AlertRender />
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    missingState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    missingTitle: {
        marginTop: 12,
        marginBottom: 16,
        fontSize: 16,
        fontWeight: '900',
    },
    backButton: {
        minHeight: 44,
        borderRadius: 7,
        backgroundColor: PRIMARY,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
    processingState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
    },
    processingTitle: {
        marginTop: 16,
        fontSize: 17,
        fontWeight: '900',
    },
    processingText: {
        marginTop: 7,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    offlineContent: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 40,
    },
    imagePreview: {
        width: '100%',
        height: 330,
        borderRadius: 7,
        borderWidth: 1,
        overflow: 'hidden',
        position: 'relative',
    },
    mainImage: {
        width: '100%',
        height: '100%',
    },
    brokenImageState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    brokenImageText: {
        marginTop: 9,
        fontSize: 11,
        fontWeight: '700',
        textAlign: 'center',
    },
    pageBadge: {
        position: 'absolute',
        top: 9,
        left: 9,
        minHeight: 28,
        borderRadius: 5,
        backgroundColor: 'rgba(0,0,0,0.72)',
        paddingHorizontal: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pageBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
    },
    expandBadge: {
        position: 'absolute',
        right: 9,
        bottom: 9,
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.72)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbnailSection: {
        marginTop: 12,
        marginBottom: 4,
    },
    thumbnailLabel: {
        marginBottom: 8,
        fontSize: 12,
        fontWeight: '900',
    },
    thumbnailContent: {
        gap: 8,
        paddingRight: 16,
    },
    thumbnailButton: {
        width: 58,
        height: 74,
        borderRadius: 6,
        borderWidth: 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    thumbnailNumber: {
        position: 'absolute',
        left: 4,
        bottom: 4,
        minWidth: 20,
        height: 20,
        borderRadius: 4,
        backgroundColor: 'rgba(0,0,0,0.75)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbnailNumberText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
    },
    documentPreview: {
        minHeight: 88,
        borderRadius: 7,
        borderWidth: 1,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    documentIcon: {
        width: 54,
        height: 54,
        borderRadius: 7,
        backgroundColor: 'rgba(102,160,255,0.10)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    documentCopy: {
        flex: 1,
        minWidth: 0,
        marginLeft: 11,
    },
    documentName: {
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '900',
    },
    documentType: {
        marginTop: 3,
        fontSize: 10,
        fontWeight: '700',
    },
    noPreviewCard: {
        minHeight: 180,
        borderRadius: 7,
        borderWidth: 1,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noPreviewText: {
        maxWidth: 260,
        marginTop: 10,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '700',
        textAlign: 'center',
    },
    fileHeader: {
        paddingTop: 16,
        paddingBottom: 13,
    },
    offlineBadge: {
        alignSelf: 'flex-start',
        minHeight: 28,
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 8,
        marginBottom: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    offlineBadgeText: {
        color: WARNING,
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.35,
    },
    fileTitle: {
        fontSize: 19,
        lineHeight: 24,
        fontWeight: '900',
    },
    fileMeta: {
        marginTop: 5,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '700',
    },
    utilityButton: {
        minHeight: 58,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginBottom: 10,
    },
    utilityCopy: {
        flex: 1,
        minWidth: 0,
    },
    utilityTitle: {
        fontSize: 12,
        fontWeight: '900',
    },
    utilityDescription: {
        marginTop: 2,
        fontSize: 10,
        lineHeight: 14,
    },
    offlineNotice: {
        minHeight: 52,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginTop: 4,
        marginBottom: 14,
    },
    offlineNoticeText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 16,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    analyzeButton: {
        flex: 1,
        minHeight: 48,
        borderRadius: 7,
        backgroundColor: PRIMARY,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    analyzeButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
    deleteButton: {
        width: 48,
        height: 48,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.35)',
        backgroundColor: 'rgba(239,68,68,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewerBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.96)',
    },
    viewerCloseButton: {
        position: 'absolute',
        top: 48,
        right: 16,
        zIndex: 20,
        width: 40,
        height: 40,
        borderRadius: 7,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewerIndicator: {
        position: 'absolute',
        top: 52,
        alignSelf: 'center',
        zIndex: 20,
        minHeight: 32,
        borderRadius: 6,
        backgroundColor: 'rgba(0,0,0,0.70)',
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewerIndicatorText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
    },
    resultContent: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 40,
    },
    noticeCard: {
        minHeight: 48,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    noticeText: {
        flex: 1,
        fontSize: 10,
        lineHeight: 15,
    },
    scoreCard: {
        borderRadius: 7,
        borderWidth: 1,
        padding: 14,
        marginBottom: 10,
    },
    scoreHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    scoreLabel: {
        fontSize: 11,
        fontWeight: '900',
    },
    riskBadge: {
        minHeight: 27,
        borderRadius: 5,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    riskBadgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
    },
    scoreValueRow: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'center',
    },
    scoreValue: {
        fontSize: 58,
        lineHeight: 67,
        fontWeight: '900',
    },
    scoreMaximum: {
        marginLeft: 4,
        fontSize: 21,
        fontWeight: '900',
    },
    scoreDescription: {
        fontSize: 11,
        lineHeight: 16,
        textAlign: 'center',
    },
    sectionTitle: {
        marginTop: 9,
        marginBottom: 9,
        fontSize: 14,
        fontWeight: '900',
    },
    emptyFindingCard: {
        minHeight: 130,
        borderRadius: 7,
        borderWidth: 1,
        padding: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    emptyFindingText: {
        maxWidth: 280,
        marginTop: 9,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    clauseWrapper: {
        marginBottom: 10,
    },
    askLexieButton: {
        minHeight: 48,
        borderRadius: 7,
        backgroundColor: PRIMARY,
        paddingHorizontal: 12,
        marginTop: 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    askLexieText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.66)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
    },
    modalCard: {
        width: '100%',
        maxWidth: 430,
        maxHeight: '78%',
        borderRadius: 8,
        borderWidth: 1,
        padding: 15,
    },
    modalHeader: {
        minHeight: 42,
        paddingBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    modalTitle: {
        flex: 1,
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
    },
    modalCloseButton: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    legalModalText: {
        fontSize: 13,
        lineHeight: 21,
    },
    totalScoreRow: {
        minHeight: 42,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    totalScoreLabel: {
        fontSize: 12,
        fontWeight: '900',
    },
    startingScore: {
        color: SUCCESS,
        fontSize: 16,
        fontWeight: '900',
    },
    breakdownItem: {
        marginBottom: 13,
    },
    breakdownHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 8,
    },
    breakdownTitle: {
        flex: 1,
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '900',
    },
    deductionText: {
        color: DANGER,
        fontSize: 12,
        fontWeight: '900',
    },
    breakdownBody: {
        marginTop: 4,
        fontSize: 11,
        lineHeight: 17,
    },
    readMoreButton: {
        alignSelf: 'flex-start',
        minHeight: 30,
        justifyContent: 'center',
    },
    readMoreText: {
        color: PRIMARY_SOFT,
        fontSize: 10,
        fontWeight: '900',
    },
    finalScoreRow: {
        minHeight: 50,
        borderTopWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    finalScoreLabel: {
        fontSize: 14,
        fontWeight: '900',
    },
    finalScoreValue: {
        fontSize: 22,
        fontWeight: '900',
    },
});
