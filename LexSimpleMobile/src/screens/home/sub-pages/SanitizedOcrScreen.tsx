import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Clipboard,
    LogBox,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ScreenLayout from '../../../components/ScreenLayout';
import { useTheme } from '../../../theme/ThemeContext';

// SANITIZED OCR SCREEN VERSION: 2.0.0
// UI-only build: no additional native module or Android rebuild required.
LogBox.ignoreLogs([
    'Clipboard has been extracted from react-native core',
]);
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';

type RouteParams = {
    sanitizedText?: unknown;
    isOfflinePreview?: boolean;
};

const normalizeText = (value: unknown): string => {
    if (typeof value !== 'string') {
        return '';
    }

    return value
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .trim();
};

const countWords = (text: string): number => {
    if (!text.trim()) {
        return 0;
    }

    return text.trim().split(/\s+/).filter(Boolean).length;
};

const countRedactions = (text: string): number => {
    return (
        text.match(/\[REDACTED(?:_[A-Z_]+)?\]/g)?.length ?? 0
    );
};

const countPages = (text: string): number => {
    const pageMarkers = text.match(/^--- Page \d+ ---$/gm)?.length ?? 0;

    if (!text.trim()) {
        return 0;
    }

    return Math.max(1, pageMarkers);
};

export default function SanitizedOcrScreen({ route }: any) {
    const { isDarkMode, colors: T } = useTheme();
    const params: RouteParams = route?.params ?? {};
    const isOfflinePreview = Boolean(params.isOfflinePreview);
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null
    );

    const sanitizedText = useMemo(
        () => normalizeText(params.sanitizedText),
        [params.sanitizedText]
    );
    const hasText = sanitizedText.length > 0;
    const wordCount = useMemo(
        () => countWords(sanitizedText),
        [sanitizedText]
    );
    const redactionCount = useMemo(
        () => countRedactions(sanitizedText),
        [sanitizedText]
    );
    const pageCount = useMemo(
        () => countPages(sanitizedText),
        [sanitizedText]
    );

    useEffect(() => {
        return () => {
            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
            }
        };
    }, []);

    const handleCopyText = async (): Promise<void> => {
        if (!hasText) {
            return;
        }

        try {
            Clipboard.setString(sanitizedText);
            setCopied(true);

            if (copyTimerRef.current) {
                clearTimeout(copyTimerRef.current);
            }

            copyTimerRef.current = setTimeout(() => {
                setCopied(false);
                copyTimerRef.current = null;
            }, 1800);
        } catch (error) {
            console.error('[SanitizedOcrScreen] Copy failed:', error);
            setCopied(false);
        }
    };

    return (
        <ScreenLayout
            title={isOfflinePreview ? 'Text Preview' : 'Sanitized Text'}
            noPadding
        >
            <StatusBar
                barStyle={
                    isDarkMode ? 'light-content' : 'dark-content'
                }
            />

            <ScrollView
                testID="sanitized-ocr-screen-v2"
                style={{ backgroundColor: T.bg }}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View
                    style={[
                        styles.summaryCard,
                        {
                            backgroundColor: T.card,
                            borderColor: T.border,
                        },
                    ]}
                >
                    <View style={styles.summaryTopRow}>
                        <View style={styles.summaryIdentity}>
                            <View style={styles.shieldBox}>
                                <Ionicons
                                    name="shield-checkmark-outline"
                                    size={23}
                                    color={SUCCESS}
                                />
                            </View>
                            <View style={styles.summaryCopy}>
                                <Text
                                    style={[
                                        styles.summaryTitle,
                                        { color: T.text },
                                    ]}
                                >
                                    Protected document text
                                </Text>
                                <Text
                                    style={[
                                        styles.summaryDescription,
                                        { color: T.subText },
                                    ]}
                                >
                                    {isOfflinePreview
                                        ? 'Preview ito ng text na nilinis sa phone.'
                                        : 'Ito ang sanitized text na ginamit sa analysis.'}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={[
                                styles.copyButton,
                                {
                                    backgroundColor: copied
                                        ? 'rgba(16,185,129,0.12)'
                                        : T.bg,
                                    borderColor: copied
                                        ? SUCCESS
                                        : T.border,
                                    opacity: hasText ? 1 : 0.45,
                                },
                            ]}
                            onPress={() => void handleCopyText()}
                            disabled={!hasText}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                            accessibilityLabel={
                                copied
                                    ? 'Nakopya na ang text'
                                    : 'Kopyahin ang sanitized text'
                            }
                        >
                            <Ionicons
                                name={
                                    copied
                                        ? 'checkmark'
                                        : 'copy-outline'
                                }
                                size={17}
                                color={copied ? SUCCESS : PRIMARY_SOFT}
                            />
                            <Text
                                style={[
                                    styles.copyButtonText,
                                    {
                                        color: copied
                                            ? SUCCESS
                                            : PRIMARY_SOFT,
                                    },
                                ]}
                            >
                                {copied ? 'Nakopya' : 'Kopyahin'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {hasText && (
                        <View
                            style={[
                                styles.statsRow,
                                {
                                    backgroundColor: T.bg,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <View style={styles.statItem}>
                                <Text
                                    style={[
                                        styles.statValue,
                                        { color: T.text },
                                    ]}
                                >
                                    {wordCount.toLocaleString()}
                                </Text>
                                <Text
                                    style={[
                                        styles.statLabel,
                                        { color: T.subText },
                                    ]}
                                >
                                    Salita
                                </Text>
                            </View>
                            <View
                                style={[
                                    styles.statDivider,
                                    { backgroundColor: T.border },
                                ]}
                            />
                            <View style={styles.statItem}>
                                <Text
                                    style={[
                                        styles.statValue,
                                        { color: T.text },
                                    ]}
                                >
                                    {redactionCount.toLocaleString()}
                                </Text>
                                <Text
                                    style={[
                                        styles.statLabel,
                                        { color: T.subText },
                                    ]}
                                >
                                    Tinakpan
                                </Text>
                            </View>
                            <View
                                style={[
                                    styles.statDivider,
                                    { backgroundColor: T.border },
                                ]}
                            />
                            <View style={styles.statItem}>
                                <Text
                                    style={[
                                        styles.statValue,
                                        { color: T.text },
                                    ]}
                                >
                                    {pageCount.toLocaleString()}
                                </Text>
                                <Text
                                    style={[
                                        styles.statLabel,
                                        { color: T.subText },
                                    ]}
                                >
                                    {pageCount === 1
                                        ? 'Pahina'
                                        : 'Mga pahina'}
                                </Text>
                            </View>
                        </View>
                    )}
                </View>

                <View
                    style={[
                        styles.privacyNote,
                        {
                            backgroundColor: isDarkMode
                                ? 'rgba(245,158,11,0.09)'
                                : 'rgba(245,158,11,0.07)',
                            borderColor: 'rgba(245,158,11,0.32)',
                        },
                    ]}
                >
                    <Ionicons
                        name="lock-closed-outline"
                        size={19}
                        color={WARNING}
                    />
                    <Text
                        style={[
                            styles.privacyNoteText,
                            { color: T.text },
                        ]}
                    >
                        Ang mga natukoy na pangalan, contact details, ID,
                        at address ay pinapalitan ng{' '}
                        <Text style={styles.redactedText}>[REDACTED]</Text>.
                        Suriin pa rin ang text bago ito ibahagi.
                    </Text>
                </View>

                <View style={styles.documentSection}>
                    <View style={styles.documentHeader}>
                        <View style={styles.documentHeaderLeft}>
                            <Ionicons
                                name="document-text-outline"
                                size={18}
                                color={PRIMARY_SOFT}
                            />
                            <Text
                                style={[
                                    styles.documentTitle,
                                    { color: T.text },
                                ]}
                            >
                                Document text
                            </Text>
                        </View>
                        {isOfflinePreview && (
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
                                    size={12}
                                    color={WARNING}
                                />
                                <Text style={styles.offlineBadgeText}>
                                    SA PHONE
                                </Text>
                            </View>
                        )}
                    </View>

                    {hasText ? (
                        <View
                            style={[
                                styles.documentPaper,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.documentText,
                                    { color: T.text },
                                ]}
                                selectable
                                selectionColor={PRIMARY_SOFT}
                            >
                                {sanitizedText}
                            </Text>
                        </View>
                    ) : (
                        <View
                            style={[
                                styles.emptyState,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.emptyIconBox,
                                    { backgroundColor: T.bg },
                                ]}
                            >
                                <Ionicons
                                    name="document-outline"
                                    size={28}
                                    color={T.subText}
                                />
                            </View>
                            <Text
                                style={[
                                    styles.emptyTitle,
                                    { color: T.text },
                                ]}
                            >
                                Walang available na text
                            </Text>
                            <Text
                                style={[
                                    styles.emptyDescription,
                                    { color: T.subText },
                                ]}
                            >
                                Maaaring hindi na-save ang OCR text o walang
                                malinaw na text na nabasa sa document.
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 18,
        paddingTop: 16,
        paddingBottom: 34,
    },
    summaryCard: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 14,
    },
    summaryTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
    },
    summaryIdentity: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    shieldBox: {
        width: 42,
        height: 42,
        borderRadius: 9,
        backgroundColor: 'rgba(16,185,129,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryCopy: {
        flex: 1,
        minWidth: 0,
        marginLeft: 11,
    },
    summaryTitle: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
    },
    summaryDescription: {
        marginTop: 3,
        fontSize: 11,
        lineHeight: 16,
    },
    copyButton: {
        minHeight: 40,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    copyButtonText: {
        fontSize: 11,
        fontWeight: '900',
    },
    statsRow: {
        minHeight: 62,
        marginTop: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 8,
        paddingVertical: 9,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statItem: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statValue: {
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
    },
    statLabel: {
        marginTop: 2,
        fontSize: 9,
        lineHeight: 12,
        fontWeight: '700',
        textAlign: 'center',
    },
    statDivider: {
        width: StyleSheet.hairlineWidth,
        height: 29,
    },
    privacyNote: {
        marginTop: 12,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 13,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    privacyNoteText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 17,
    },
    redactedText: {
        color: WARNING,
        fontWeight: '900',
    },
    documentSection: {
        marginTop: 23,
    },
    documentHeader: {
        minHeight: 34,
        marginBottom: 9,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
    },
    documentHeaderLeft: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    documentTitle: {
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '900',
    },
    offlineBadge: {
        minHeight: 26,
        borderWidth: 1,
        borderRadius: 13,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    offlineBadgeText: {
        color: WARNING,
        fontSize: 8,
        lineHeight: 11,
        fontWeight: '900',
        letterSpacing: 0.3,
    },
    documentPaper: {
        minHeight: 210,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    documentText: {
        fontSize: 14,
        lineHeight: 23,
        letterSpacing: 0.1,
    },
    emptyState: {
        minHeight: 240,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIconBox: {
        width: 54,
        height: 54,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        marginTop: 13,
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
        textAlign: 'center',
    },
    emptyDescription: {
        maxWidth: 300,
        marginTop: 6,
        fontSize: 11,
        lineHeight: 17,
        textAlign: 'center',
    },
});
