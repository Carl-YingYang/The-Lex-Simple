import React, { useEffect, useMemo, useState } from 'react';
import {
    BackHandler,
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

import ScreenLayout from '../../../components/ScreenLayout';
import ClauseCard from '../../../components/ClauseCard';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

// RESULT SCREEN VERSION: 3.0.0
// Floating Lexie Insight chat bubble build.
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
    scoreDeduction?: number;
};

type AnalysisResult = {
    score: number | null;
    riskLevel: string;
    documentTitle?: string;
    findings: Finding[];
    rag_context_used?: string;
    sanitizedText?: string;
    ocrText?: string;
};

type RiskConfig = {
    mainColor: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    shortLabel: string;
};

type BreakdownFindingProps = {
    finding: Finding;
    theme: any;
};

const clampScore = (value: unknown): number | null => {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return Math.max(0, Math.min(100, Math.round(parsed)));
};

const getRiskConfig = (score: number | null): RiskConfig => {
    if (score === null) {
        return {
            mainColor: PRIMARY_SOFT,
            icon: 'information-circle-outline',
            label: 'NO FINDINGS DETECTED',
            shortLabel: 'Kailangang suriin',
        };
    }
    if (score >= 90) {
        return {
            mainColor: SUCCESS,
            icon: 'shield-checkmark-outline',
            label: 'VERY SAFE',
            shortLabel: 'Mababang risk',
        };
    }

    if (score >= 70) {
        return {
            mainColor: PRIMARY_SOFT,
            icon: 'checkmark-circle-outline',
            label: 'ACCEPTABLE',
            shortLabel: 'Katanggap-tanggap',
        };
    }

    if (score >= 50) {
        return {
            mainColor: WARNING,
            icon: 'warning-outline',
            label: 'RISKY',
            shortLabel: 'May dapat suriin',
        };
    }

    return {
        mainColor: DANGER,
        icon: 'alert-circle-outline',
        label: 'HIGH RISK',
        shortLabel: 'Kailangang pag-ingatan',
    };
};

const normalizeFinding = (value: any): Finding | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const deductionValue = Number(
        value.scoreDeduction ??
            value.score_deduction ??
            value.deduction ??
            value.points_deducted
    );

    return {
        title: String(
            value.title ?? value.clause_title ?? 'Clause na dapat suriin'
        ).trim(),
        description: String(
            value.description ??
                value.explanation ??
                'Walang karagdagang paliwanag.'
        ).trim(),
        advice: String(
            value.advice ??
                value.practical_advice ??
                'Basahin itong mabuti bago pumirma.'
        ).trim(),
        foundText: String(
            value.foundText ??
                value.original_text ??
                value.text ??
                'Hindi available ang eksaktong text.'
        ).trim(),
        confidence: value.confidence
            ? String(value.confidence)
            : undefined,
        scoreDeduction: Number.isFinite(deductionValue)
            ? Math.max(0, Math.round(Math.abs(deductionValue)))
            : undefined,
    };
};

const normalizeAnalysisResult = (raw: any): AnalysisResult => {
    const payload = raw?.data?.data ?? raw?.data ?? raw ?? {};
    const rawFindings = Array.isArray(payload.findings)
        ? payload.findings
        : Array.isArray(payload.clauses)
          ? payload.clauses
          : [];
    const score = rawFindings.length > 0
        ? clampScore(payload.score ?? payload.safety_score)
        : null;

    return {
        score,
        riskLevel: score === null
            ? 'No findings detected'
            : String(
                  payload.riskLevel ??
                      payload.risk_level ??
                      getRiskConfig(score).label
              ),
        documentTitle: payload.documentTitle
            ? String(payload.documentTitle)
            : payload.document_title
              ? String(payload.document_title)
              : undefined,
        findings: rawFindings
            .map(normalizeFinding)
            .filter((item): item is Finding => item !== null),
        rag_context_used: String(
            payload.rag_context_used ??
                raw?.rag_context_used ??
                raw?.data?.rag_context_used ??
                ''
        ).trim(),
        sanitizedText: String(
            payload.sanitizedText ??
                payload.sanitized_text ??
                raw?.sanitizedText ??
                raw?.data?.sanitizedText ??
                ''
        ).trim(),
        ocrText: String(
            payload.ocrText ??
                payload.ocr_text ??
                raw?.ocrText ??
                ''
        ).trim(),
    };
};

const BreakdownFinding = ({
    finding,
    theme,
}: BreakdownFindingProps) => {
    const [expanded, setExpanded] = useState(false);
    const isLong = finding.description.length > 125;

    return (
        <View style={styles.breakdownFinding}>
            <View style={styles.breakdownFindingHeader}>
                <Text
                    style={[
                        styles.breakdownFindingTitle,
                        { color: theme.text },
                    ]}
                >
                    {finding.title}
                </Text>
                {typeof finding.scoreDeduction === 'number' && (
                    <Text style={styles.deductionText}>
                        -{finding.scoreDeduction}
                    </Text>
                )}
            </View>
            <Text
                style={[
                    styles.breakdownFindingBody,
                    { color: theme.subText },
                ]}
                numberOfLines={expanded ? undefined : 3}
            >
                {finding.description}
            </Text>
            {isLong && (
                <TouchableOpacity
                    style={styles.readMoreButton}
                    onPress={() => setExpanded((current) => !current)}
                    accessibilityRole="button"
                >
                    <Text style={styles.readMoreText}>
                        {expanded ? 'Paikliin' : 'Basahin lahat'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
};

export default function ResultScreen({ route, navigation }: any) {
    const { isDarkMode, colors: T } = useTheme();
    const { showAlert, AlertRender } = useCustomAlert();
    const [scoreModalVisible, setScoreModalVisible] = useState(false);
    const [legalModalVisible, setLegalModalVisible] = useState(false);
    const [selectedLegalTitle, setSelectedLegalTitle] = useState('');
    const [selectedLegalText, setSelectedLegalText] = useState('');

    const result = useMemo(
        () => normalizeAnalysisResult(route?.params?.analysisResult),
        [route?.params?.analysisResult]
    );
    const hasAnalysisResult = Boolean(route?.params?.analysisResult);
    const riskConfig = getRiskConfig(result.score);
    const totalDeduction = result.score === null
        ? 0
        : Math.max(0, 100 - result.score);
    const hasExplicitDeductions = result.findings.some(
        (finding) => typeof finding.scoreDeduction === 'number'
    );

    const goToMain = (): void => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
        });
    };

    useEffect(() => {
        const subscription = BackHandler.addEventListener(
            'hardwareBackPress',
            () => {
                goToMain();
                return true;
            }
        );

        return () => subscription.remove();
    }, [navigation]);

    if (!hasAnalysisResult) {
        return (
            <ScreenLayout title="Resulta" onBackPress={goToMain}>
                <View
                    style={[
                        styles.missingState,
                        { backgroundColor: T.bg },
                    ]}
                >
                    <View
                        style={[
                            styles.missingIconBox,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="document-outline"
                            size={29}
                            color={T.subText}
                        />
                    </View>
                    <Text
                        style={[
                            styles.missingTitle,
                            { color: T.text },
                        ]}
                    >
                        Walang resultang maipapakita
                    </Text>
                    <Text
                        style={[
                            styles.missingDescription,
                            { color: T.subText },
                        ]}
                    >
                        Buksan ulit ang saved document at piliing ipa-check.
                    </Text>
                    <TouchableOpacity
                        style={styles.missingButton}
                        onPress={goToMain}
                    >
                        <Text style={styles.missingButtonText}>
                            Bumalik sa Library
                        </Text>
                    </TouchableOpacity>
                </View>
                <AlertRender />
            </ScreenLayout>
        );
    }

    const openSanitizedText = (): void => {
        if (!result.sanitizedText) {
            showAlert(
                'Walang available na text',
                'Hindi naisama sa saved result ang sanitized OCR text ng document na ito.',
                'info'
            );
            return;
        }

        navigation.navigate('SanitizedOcrScreen', {
            sanitizedText: result.sanitizedText,
            isOfflinePreview: false,
        });
    };

    const findBestLegalContext = (finding: Finding): string => {
        const context = String(result.rag_context_used || '').trim();

        if (!context) {
            return 'Walang matching legal reference na na-save para sa finding na ito.';
        }

        const chunks = context
            .split(/\n\s*---\s*\n/g)
            .map((chunk) => chunk.trim())
            .filter(Boolean);
        const keywords = `${finding.title} ${finding.description} ${finding.foundText}`
            .toLocaleLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((word) => word.length > 3);

        let bestChunk = '';
        let bestScore = 0;

        chunks.forEach((chunk) => {
            const normalizedChunk = chunk.toLocaleLowerCase();
            const score = keywords.reduce(
                (total, keyword) =>
                    normalizedChunk.includes(keyword)
                        ? total + 1
                        : total,
                0
            );

            if (score > bestScore) {
                bestScore = score;
                bestChunk = chunk;
            }
        });

        return bestScore > 0
            ? bestChunk
            : 'Walang matching legal reference na na-save para sa finding na ito.';
    };

    const showLegalBasis = (finding: Finding): void => {
        setSelectedLegalTitle(finding.title || 'Legal reference');
        setSelectedLegalText(findBestLegalContext(finding));
        setLegalModalVisible(true);
    };

    const askLexieAboutDocument = (): void => {
        const findingsText = result.findings.length
            ? result.findings
                  .map(
                      (finding, index) =>
                          `${index + 1}. ${finding.title}\nPaliwanag: ${finding.description}\nPayo: ${finding.advice}\nNakitang text: ${finding.foundText}`
                  )
                  .join('\n\n')
            : 'Walang na-flag sa nabasang text. Hindi ito patunay na ligtas ang dokumento.';
        const safeDocumentText = result.sanitizedText
            ? result.sanitizedText.slice(0, 6000)
            : 'Hindi available ang sanitized document text.';

        navigation.navigate('AskAiScreen', {
            attachedFile: {
                name:
                    result.documentTitle?.trim() ||
                    'Document analysis',
                data: [
                    'DOCUMENT ANALYSIS',
                    result.score === null
                        ? 'Score: Hindi ibinigay (walang na-flag)'
                        : `Score: ${result.score}/100`,
                    `Risk: ${riskConfig.shortLabel}`,
                    '',
                    'FINDINGS',
                    findingsText,
                    '',
                    'SANITIZED DOCUMENT TEXT',
                    safeDocumentText,
                ].join('\n'),
            },
            suggestedPrompts: [
                'I-summarize ito sa simpleng Taglish.',
                'Ano ang pinakamahalagang dapat kong bantayan?',
                'Anong bahagi ang dapat kong linawin bago pumirma?',
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
        const savedLegalBasis =
            legalBasis || findBestLegalContext(finding);
        const context = [
            `CLAUSE: ${finding.title}`,
            `Paliwanag: ${finding.description}`,
            `Practical guidance: ${finding.advice}`,
            `Original text: ${finding.foundText}`,
            `Legal reference: ${savedLegalBasis}`,
        ].join('\n\n');

        navigation.navigate('AskAiScreen', {
            attachedFile: {
                name: `Clause: ${finding.title}`,
                data: context,
            },
            initialPrompt,
            suggestedPrompts:
                dynamicPrompts || [
                    'Ipaliwanag ito sa simpleng Taglish.',
                    'Bakit kailangan ko itong bantayan?',
                    'Ano ang maaari kong hilinging baguhin?',
                    'Ano ang maaari kong itanong sa abogado?',
                ],
        });
    };

    return (
        <ScreenLayout
            title="Resulta"
            noPadding
            onBackPress={goToMain}
        >
            <StatusBar
                barStyle={
                    isDarkMode ? 'light-content' : 'dark-content'
                }
            />

            <ScrollView
                testID="result-screen-v3"
                style={{ backgroundColor: T.bg }}
                contentContainerStyle={styles.content}
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
                        size={19}
                        color={PRIMARY_SOFT}
                    />
                    <Text
                        style={[
                            styles.noticeText,
                            { color: T.subText },
                        ]}
                    >
                        Gabay lang ito sa pag-unawa. Hindi ito legal
                        advice o kapalit ng abogado.
                    </Text>
                </View>

                {!!result.documentTitle?.trim() && (
                    <View style={styles.documentHeader}>
                        <Text
                            style={[
                                styles.documentEyebrow,
                                { color: T.subText },
                            ]}
                        >
                            DOCUMENT
                        </Text>
                        <Text
                            style={[
                                styles.documentTitle,
                                { color: T.text },
                            ]}
                            numberOfLines={2}
                        >
                            {result.documentTitle.trim()}
                        </Text>
                    </View>
                )}

                <TouchableOpacity
                    style={[
                        styles.scoreCard,
                        {
                            backgroundColor: T.card,
                            borderColor: riskConfig.mainColor,
                        },
                    ]}
                    activeOpacity={0.86}
                    onPress={() => setScoreModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Tingnan ang score breakdown"
                >
                    <View style={styles.scoreTopRow}>
                        <Text
                            style={[
                                styles.scoreLabel,
                                { color: T.subText },
                            ]}
                        >
                            FINDING CHECK
                        </Text>
                        <View
                            style={[
                                styles.riskBadge,
                                {
                                    backgroundColor:
                                        riskConfig.mainColor,
                                },
                            ]}
                        >
                            <Ionicons
                                name={riskConfig.icon}
                                size={13}
                                color="#FFFFFF"
                            />
                            <Text style={styles.riskBadgeText}>
                                {riskConfig.shortLabel}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.scoreRow}>
                        <Text
                            style={[
                                styles.scoreValue,
                                { color: riskConfig.mainColor },
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
                            styles.scoreSummary,
                            { color: T.subText },
                        ]}
                    >
                        {result.findings.length === 0
                            ? 'Walang na-flag sa nabasang text. Hindi ito patunay na ligtas ang dokumento.'
                            : `${result.findings.length} bahagi ang kailangan mong suriin.`}
                    </Text>

                    <Text style={styles.scoreActionText}>
                        {result.score === null
                            ? 'Bakit walang score?'
                            : 'Tingnan kung paano nakuha ang score'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[
                        styles.privacyCard,
                        {
                            backgroundColor: T.card,
                            borderColor: T.border,
                        },
                    ]}
                    onPress={openSanitizedText}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                >
                    <View style={styles.privacyIconBox}>
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={21}
                            color={SUCCESS}
                        />
                    </View>
                    <View style={styles.privacyCopy}>
                        <Text
                            style={[
                                styles.privacyTitle,
                                { color: T.text },
                            ]}
                        >
                            Privacy-protected text
                        </Text>
                        <Text
                            style={[
                                styles.privacyDescription,
                                { color: T.subText },
                            ]}
                        >
                            Tingnan ang sanitized OCR na ginamit sa
                            analysis.
                        </Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.sectionHeader}>
                    <Text
                        style={[
                            styles.sectionTitle,
                            { color: T.text },
                        ]}
                    >
                        Mga dapat suriin
                    </Text>
                    <Text
                        style={[
                            styles.sectionCount,
                            { color: T.subText },
                        ]}
                    >
                        {result.findings.length}
                    </Text>
                </View>

                {result.findings.length === 0 ? (
                    <View
                        style={[
                            styles.emptyCard,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <View style={styles.emptyIconBox}>
                            <Ionicons
                                name="checkmark"
                                size={24}
                                color={SUCCESS}
                            />
                        </View>
                        <Text
                            style={[
                                styles.emptyTitle,
                                { color: T.text },
                            ]}
                        >
                            Walang na-flag na clause
                        </Text>
                        <Text
                            style={[
                                styles.emptyDescription,
                                { color: T.subText },
                            ]}
                        >
                            May mga clause na maaaring hindi nabasa o na-flag.
                            I-check ang OCR at buong dokumento bago magdesisyon.
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
                                themeConfig={riskConfig}
                                ragContext={result.rag_context_used}
                                onShowLegalBasis={showLegalBasis}
                                onAskAiDeepDive={askLexieAboutClause}
                            />
                        </View>
                    ))
                )}

            </ScrollView>

            <TouchableOpacity
                style={styles.lexieButton}
                onPress={askLexieAboutDocument}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Buksan ang Lexie Insight"
            >
                <View style={styles.lexieIconBox}>
                    <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={19}
                        color="#FFFFFF"
                    />
                </View>
                <Text style={styles.lexieTitle}>Lexie Insight</Text>
            </TouchableOpacity>

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
                            <View style={styles.modalHeadingCopy}>
                                <Text
                                    style={[
                                        styles.modalTitle,
                                        { color: T.text },
                                    ]}
                                >
                                    {result.score === null
                                        ? 'Bakit walang score?'
                                        : 'Paano nakuha ang score?'}
                                </Text>
                                <Text
                                    style={[
                                        styles.modalSubtitle,
                                        { color: T.subText },
                                    ]}
                                >
                                    {result.score === null
                                        ? 'Walang na-flag sa nabasang text'
                                        : 'Buod ng mga nakitang bahagi'}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() =>
                                    setScoreModalVisible(false)
                                }
                                accessibilityLabel="Isara"
                            >
                                <Ionicons
                                    name="close"
                                    size={21}
                                    color={T.text}
                                />
                            </TouchableOpacity>
                        </View>

                        <ScrollView
                            contentContainerStyle={styles.modalBody}
                            showsVerticalScrollIndicator={false}
                        >
                            {result.score === null ? (
                                <Text
                                    style={[
                                        styles.noDeductionText,
                                        { color: T.subText },
                                    ]}
                                >
                                    Walang ibinigay na score dahil walang na-flag
                                    sa available OCR text. Hindi nito
                                    kinukumpirma na ligtas ang dokumento.
                                    Suriin ang scan at orihinal na clauses.
                                </Text>
                            ) : (
                            <View
                                style={[
                                    styles.scoreEquation,
                                    {
                                        backgroundColor: T.bg,
                                        borderColor: T.border,
                                    },
                                ]}
                            >
                                <View style={styles.equationItem}>
                                    <Text
                                        style={[
                                            styles.equationLabel,
                                            { color: T.subText },
                                        ]}
                                    >
                                        Simula
                                    </Text>
                                    <Text
                                        style={[
                                            styles.equationValue,
                                            { color: T.text },
                                        ]}
                                    >
                                        100
                                    </Text>
                                </View>
                                <Text
                                    style={[
                                        styles.equationOperator,
                                        { color: T.subText },
                                    ]}
                                >
                                    −
                                </Text>
                                <View style={styles.equationItem}>
                                    <Text
                                        style={[
                                            styles.equationLabel,
                                            { color: T.subText },
                                        ]}
                                    >
                                        Bawas
                                    </Text>
                                    <Text
                                        style={[
                                            styles.equationValue,
                                            { color: DANGER },
                                        ]}
                                    >
                                        {totalDeduction}
                                    </Text>
                                </View>
                                <Text
                                    style={[
                                        styles.equationOperator,
                                        { color: T.subText },
                                    ]}
                                >
                                    =
                                </Text>
                                <View style={styles.equationItem}>
                                    <Text
                                        style={[
                                            styles.equationLabel,
                                            { color: T.subText },
                                        ]}
                                    >
                                        Final
                                    </Text>
                                    <Text
                                        style={[
                                            styles.equationValue,
                                            {
                                                color:
                                                    riskConfig.mainColor,
                                            },
                                        ]}
                                    >
                                        {result.score}
                                    </Text>
                                </View>
                            </View>
                            )}

                            {result.findings.length > 0 ? (
                                <View style={styles.breakdownList}>
                                    {result.findings.map(
                                        (finding, index) => (
                                            <BreakdownFinding
                                                key={`${finding.title}-${index}`}
                                                finding={finding}
                                                theme={T}
                                            />
                                        )
                                    )}
                                </View>
                            ) : (
                                <Text
                                    style={[
                                        styles.noDeductionText,
                                        { color: T.subText },
                                    ]}
                                >
                                    Walang na-flag na clause sa available OCR text.
                                </Text>
                            )}

                            {!hasExplicitDeductions &&
                                result.findings.length > 0 && (
                                    <Text
                                        style={[
                                            styles.breakdownNote,
                                            { color: T.subText },
                                        ]}
                                    >
                                        Total deduction lang ang available sa
                                        saved result, kaya hindi naghahati ng
                                        gawa-gawang points ang screen sa bawat
                                        finding.
                                    </Text>
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
                            <View style={styles.modalHeadingCopy}>
                                <Text
                                    style={[
                                        styles.modalTitle,
                                        { color: T.text },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {selectedLegalTitle}
                                </Text>
                                <Text
                                    style={[
                                        styles.modalSubtitle,
                                        { color: T.subText },
                                    ]}
                                >
                                    Legal reference
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.modalCloseButton}
                                onPress={() =>
                                    setLegalModalVisible(false)
                                }
                                accessibilityLabel="Isara"
                            >
                                <Ionicons
                                    name="close"
                                    size={21}
                                    color={T.text}
                                />
                            </TouchableOpacity>
                        </View>
                        <ScrollView
                            contentContainerStyle={styles.modalBody}
                            showsVerticalScrollIndicator={false}
                        >
                            <Text
                                style={[
                                    styles.legalText,
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

const styles = StyleSheet.create({
    missingState: {
        flex: 1,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    missingIconBox: {
        width: 58,
        height: 58,
        borderWidth: 1,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    missingTitle: {
        marginTop: 14,
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
        textAlign: 'center',
    },
    missingDescription: {
        maxWidth: 300,
        marginTop: 6,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    missingButton: {
        minHeight: 44,
        marginTop: 18,
        borderRadius: 8,
        backgroundColor: PRIMARY,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    missingButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '900',
    },
    content: {
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 112,
    },
    noticeCard: {
        minHeight: 58,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 13,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    noticeText: {
        flex: 1,
        fontSize: 12,
        lineHeight: 18,
    },
    documentHeader: {
        paddingTop: 20,
        paddingHorizontal: 2,
    },
    documentEyebrow: {
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    documentTitle: {
        marginTop: 4,
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '900',
    },
    scoreCard: {
        marginTop: 18,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 18,
        paddingVertical: 17,
    },
    scoreTopRow: {
        minHeight: 28,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    scoreLabel: {
        flexShrink: 1,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '900',
        letterSpacing: 1,
    },
    riskBadge: {
        maxWidth: '58%',
        minHeight: 27,
        borderRadius: 14,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
    },
    riskBadgeText: {
        color: '#FFFFFF',
        flexShrink: 1,
        fontSize: 10,
        lineHeight: 13,
        fontWeight: '900',
    },
    scoreRow: {
        minHeight: 90,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'baseline',
        paddingTop: 5,
    },
    scoreValue: {
        fontSize: 68,
        lineHeight: 82,
        fontWeight: '900',
        letterSpacing: -3,
    },
    scoreMaximum: {
        marginLeft: 5,
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '800',
    },
    scoreSummary: {
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 19,
    },
    scoreActionText: {
        color: PRIMARY_SOFT,
        marginTop: 13,
        textAlign: 'center',
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '800',
    },
    privacyCard: {
        marginTop: 12,
        minHeight: 72,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 13,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    privacyIconBox: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    privacyCopy: {
        flex: 1,
        minWidth: 0,
        marginLeft: 12,
    },
    privacyTitle: {
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '800',
    },
    privacyDescription: {
        marginTop: 2,
        fontSize: 11,
        lineHeight: 16,
    },
    sectionHeader: {
        marginTop: 25,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
    },
    sectionCount: {
        fontSize: 13,
        fontWeight: '800',
    },
    clauseWrapper: {
        marginBottom: 12,
    },
    emptyCard: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 20,
        paddingVertical: 24,
        alignItems: 'center',
    },
    emptyIconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        marginTop: 12,
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
        textAlign: 'center',
    },
    emptyDescription: {
        maxWidth: 310,
        marginTop: 6,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    lexieButton: {
        position: 'absolute',
        right: 18,
        bottom: 22,
        minHeight: 54,
        borderRadius: 28,
        backgroundColor: '#5B21B6',
        paddingLeft: 8,
        paddingRight: 20,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.34)',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.28,
        shadowRadius: 7,
        elevation: 9,
        zIndex: 20,
    },
    lexieIconBox: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    lexieTitle: {
        color: '#FFFFFF',
        marginLeft: 9,
        fontSize: 15,
        lineHeight: 19,
        fontWeight: '900',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.66)',
        paddingHorizontal: 18,
        paddingVertical: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCard: {
        width: '100%',
        maxWidth: 430,
        maxHeight: '82%',
        borderWidth: 1,
        borderRadius: 12,
        overflow: 'hidden',
    },
    modalHeader: {
        minHeight: 68,
        paddingLeft: 16,
        paddingRight: 9,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(128,128,128,0.28)',
    },
    modalHeadingCopy: {
        flex: 1,
        minWidth: 0,
        paddingRight: 8,
    },
    modalTitle: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
    },
    modalSubtitle: {
        marginTop: 2,
        fontSize: 10,
        lineHeight: 14,
    },
    modalCloseButton: {
        width: 42,
        height: 42,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBody: {
        padding: 16,
    },
    scoreEquation: {
        minHeight: 94,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 10,
        paddingVertical: 13,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    equationItem: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
    },
    equationLabel: {
        fontSize: 9,
        lineHeight: 13,
        fontWeight: '700',
    },
    equationValue: {
        marginTop: 3,
        fontSize: 22,
        lineHeight: 28,
        fontWeight: '900',
    },
    equationOperator: {
        fontSize: 18,
        fontWeight: '700',
    },
    breakdownList: {
        marginTop: 18,
    },
    breakdownFinding: {
        marginBottom: 17,
    },
    breakdownFindingHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    breakdownFindingTitle: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '900',
    },
    deductionText: {
        color: DANGER,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '900',
    },
    breakdownFindingBody: {
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
    noDeductionText: {
        marginTop: 18,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    breakdownNote: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(128,128,128,0.3)',
        paddingTop: 13,
        fontSize: 10,
        lineHeight: 16,
        textAlign: 'center',
    },
    legalText: {
        fontSize: 13,
        lineHeight: 21,
    },
});
