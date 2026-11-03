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
import { BORDER, RADIUS } from '../../../theme/tokens';

// SANITIZED OCR SCREEN VERSION: 7.0.0 — PURPLE NEO-BRUTALISM SPEC
// (UI lang ang binago; copy/cleanup/logic 1:1 pa rin. UI-only build:
// walang karagdagang native module o Android rebuild na kailangan.)
// Spec: purple system (zero na ang asul/berde/dilaw/gold/orange), 1.5px
// standard borders, 2–6px radius (squared), predominantly FLAT — walang
// hard shadow sa buong screen (hindi ito CTA/modal; outline ang nagdadala
// ng hierarchy at accent lang ang purple).
// Pagbabago sa UI (v7.0.0):
//   - Binura ang PRIMARY/PRIMARY_SOFT/SUCCESS/WARNING constants — tokens
//     lahat (T.brand / T.brandSoft / T.brandDeep / T.brandLight +
//     BORDER/RADIUS).
//   - Summary card, stats row, copy button, privacy note, document paper,
//     empty state: 1.5px ink outlines + squared 3–6px radius.
//   - Copy button: idle = ink outline + purple accent; kapag nakopya =
//     brandSoft fill + brand border + brandDeep na teksto (dating berde).
//   - Privacy note: lavender na may brand border (dating amber/dilaw na
//     BAWAL na sa purple spec); [REDACTED] = brandDeep.
//   - "SA PHONE" badge: squared chip na (dating pill), neutral na gray.
//   - Stat labels: uppercase + 0.8 letterSpacing (meta label spec).
LogBox.ignoreLogs([
    'Clipboard has been extracted from react-native core',
]);

type RouteParams = {
    sanitizedText?: unknown;
    isOfflinePreview?: boolean;
    unreadPageCount?: number;
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
                {isOfflinePreview && Number(params.unreadPageCount) > 0 && (
                    <Text style={{ color: T.subText, marginBottom: 12 }}>
                        May {Number(params.unreadPageCount)} pahinang hindi pa nababasa. Ang mga nabasa pa lang ang ipinapakita.
                    </Text>
                )}
                <View
                    style={[
                        styles.summaryCard,
                        {
                            backgroundColor: T.card,
                            borderColor: T.ink,
                        },
                    ]}
                >
                    <View style={styles.summaryTopRow}>
                        <View style={styles.summaryIdentity}>
                            <View
                                style={[
                                    styles.shieldBox,
                                    { backgroundColor: T.brandSoft },
                                ]}
                            >
                                <Ionicons
                                    name="shield-checkmark-outline"
                                    size={23}
                                    color={T.brand}
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
                                        ? T.brandSoft
                                        : T.bg,
                                    borderColor: copied
                                        ? T.brand
                                        : T.ink,
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
                                color={copied ? T.brandDeep : T.brand}
                            />
                            <Text
                                style={[
                                    styles.copyButtonText,
                                    {
                                        color: copied
                                            ? T.brandDeep
                                            : T.brand,
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
                                    borderColor: T.ink,
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
                            backgroundColor: T.brandSoft,
                            borderColor: T.brand,
                        },
                    ]}
                >
                    <Ionicons
                        name="lock-closed-outline"
                        size={19}
                        color={T.brand}
                    />
                    <Text
                        style={[
                            styles.privacyNoteText,
                            { color: T.text },
                        ]}
                    >
                        Ang mga natukoy na pangalan, contact details, ID,
                        at address ay pinapalitan ng{' '}
                        <Text
                            style={[
                                styles.redactedText,
                                { color: T.brandDeep },
                            ]}
                        >
                            [REDACTED]
                        </Text>.
                        Suriin pa rin ang text bago ito ibahagi.
                    </Text>
                </View>

                <View style={styles.documentSection}>
                    <View style={styles.documentHeader}>
                        <View style={styles.documentHeaderLeft}>
                            <Ionicons
                                name="document-text-outline"
                                size={18}
                                color={T.brand}
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
                                        borderColor: T.ink,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="phone-portrait-outline"
                                    size={12}
                                    color={T.subText}
                                />
                                <Text
                                    style={[
                                        styles.offlineBadgeText,
                                        { color: T.subText },
                                    ]}
                                >
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
                                    borderColor: T.ink,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.documentText,
                                    { color: T.text },
                                ]}
                                selectable
                                selectionColor={T.brandLight}
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
                                    borderColor: T.ink,
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
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
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
        borderRadius: RADIUS.sm,
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
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
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
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
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
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    statDivider: {
        width: StyleSheet.hairlineWidth,
        height: 29,
    },
    privacyNote: {
        marginTop: 12,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
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
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    offlineBadgeText: {
        fontSize: 8,
        lineHeight: 11,
        fontWeight: '900',
        letterSpacing: 0.8,
    },
    documentPaper: {
        minHeight: 210,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
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
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIconBox: {
        width: 54,
        height: 54,
        borderRadius: RADIUS.sm,
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