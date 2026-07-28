import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Clipboard, LogBox } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';

// 💡 THE FIX: Papatayin nito ang yellow warning na "Clipboard has been extracted..." sa screen mo!
LogBox.ignoreLogs(['Clipboard has been extracted from react-native core']);

export default function SanitizedOcrScreen({ route }: any) {
    const { sanitizedText, isOfflinePreview } = route.params || {};
    const [copied, setCopied] = useState(false);

    const handleCopyText = () => {
        try {
            Clipboard.setString(sanitizedText || "");
            setCopied(true);
            Alert.alert('Success', 'Text copied to clipboard', [{ text: 'OK' }]);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            Alert.alert('Error', 'Failed to copy text');
        }
    };

    const textContent = sanitizedText || "Sanitized text is not available for this record.";
    const charCount = textContent.length;
    const wordCount = textContent.trim().split(/\s+/).length;

    return (
        <ScreenLayout title={isOfflinePreview ? "Local Sanitization Preview" : "Sanitized OCR Data"} noPadding={true}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
            >
                {/* HEADER CARD WITH COPY BUTTON */}
                <View style={styles.headerCard}>
                    <View style={styles.headerContent}>
                        <View style={styles.headerTextBox}>
                            <View style={styles.titleRow}>
                                <Ionicons name="shield-half" size={24} color={COLORS.success} />
                                <Text style={styles.headerTitle}>Data Privacy Compliant</Text>
                            </View>
                            <Text style={styles.headerSubtitle}>
                                {isOfflinePreview
                                    ? "Local device sanitization preview"
                                    : "Exact text processed by AI"}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.copyBtn, copied && styles.copyBtnActive]}
                            onPress={handleCopyText}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name={copied ? "checkmark" : "copy"}
                                size={18}
                                color={copied ? COLORS.success : COLORS.primaryLight}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* INFO STATS */}
                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>Characters</Text>
                            <Text style={styles.statValue}>{charCount.toLocaleString()}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                            <Text style={styles.statLabel}>Words</Text>
                            <Text style={styles.statValue}>{wordCount.toLocaleString()}</Text>
                        </View>
                    </View>
                </View>

                {/* REDACTION WARNING */}
                <View style={styles.warningBox}>
                    <View style={styles.warningIcon}>
                        <Ionicons name="information-circle" size={20} color={COLORS.warning} />
                    </View>
                    <View style={styles.warningContent}>
                        <Text style={styles.warningTitle}>Sensitive Data Redacted</Text>
                        <Text style={styles.warningText}>
                            {isOfflinePreview
                                ? "Naka-[REDACTED] na ang mga sensitibong impormasyon bago ipadala sa internet."
                                : "Names, dates, amounts, and contact info replaced with [REDACTED] tags."}
                        </Text>
                    </View>
                </View>

                {/* DOCUMENT CONTENT */}
                <View style={styles.documentContainer}>
                    <View style={styles.documentHeader}>
                        <Ionicons name="document-text" size={18} color={COLORS.primaryLight} />
                        <Text style={styles.documentTitle}>Processed Text</Text>
                    </View>
                    <View style={styles.documentPaper}>
                        <Text style={styles.justifiedText}>
                            {textContent}
                        </Text>
                    </View>
                </View>

                {/* BOTTOM SPACING */}
                <View style={{ height: 30 }} />
            </ScrollView>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 20,
    },

    // HEADER CARD
    headerCard: {
        backgroundColor: '#0f172a',
        borderRadius: 16,
        padding: 18,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.2)',
        elevation: 2,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    headerTextBox: {
        flex: 1,
        marginRight: 12,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '900',
        color: COLORS.success,
        marginLeft: 10,
        letterSpacing: 0.5,
    },
    headerSubtitle: {
        fontSize: 12,
        color: COLORS.textMuted,
        lineHeight: 18,
    },
    copyBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(129, 140, 248, 0.3)',
    },
    copyBtnActive: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },

    // STATS
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(129, 140, 248, 0.05)',
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 11,
        color: COLORS.textMuted,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '900',
        color: COLORS.primaryLight,
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(129, 140, 248, 0.2)',
        marginHorizontal: 8,
    },

    // WARNING BOX
    warningBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(245, 158, 11, 0.08)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 22,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.25)',
    },
    warningIcon: {
        marginRight: 12,
        marginTop: 2,
    },
    warningContent: {
        flex: 1,
    },
    warningTitle: {
        fontSize: 12,
        fontWeight: '900',
        color: COLORS.warning,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    warningText: {
        fontSize: 12,
        color: '#e2e8f0',
        lineHeight: 18,
    },

    // DOCUMENT
    documentContainer: {
        marginBottom: 16,
    },
    documentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    documentTitle: {
        fontSize: 13,
        fontWeight: '900',
        color: COLORS.textMuted,
        marginLeft: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    documentPaper: {
        backgroundColor: '#1E1E2E',
        padding: 18,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        minHeight: 200,
    },
    justifiedText: {
        color: '#E2E8F0',
        fontSize: 15,
        lineHeight: 26,
        textAlign: 'left',
        letterSpacing: 0.3,
    }
});