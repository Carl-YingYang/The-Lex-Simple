import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Clipboard, LogBox, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useTheme } from '../../../theme/ThemeContext';

LogBox.ignoreLogs(['Clipboard has been extracted from react-native core']);

export default function SanitizedOcrScreen({ route }: any) {
    const { sanitizedText, isOfflinePreview } = route.params || {};
    const [copied, setCopied] = useState(false);

    const { isDarkMode, colors: T } = useTheme();

    const handleCopyText = () => {
        try {
            Clipboard.setString(sanitizedText || "");
            setCopied(true);
            Alert.alert('Success', 'Nakopya na ang text!', [{ text: 'OK' }]);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            Alert.alert('Error', 'Hindi makopya ang text.');
        }
    };

    const textContent = sanitizedText || "Walang available na text para sa record na ito.";
    const charCount = textContent.length;
    const wordCount = textContent.trim().split(/\s+/).length;

    return (
        <ScreenLayout title={isOfflinePreview ? "Preview ng Linis na Text" : "Linis na OCR Data"} noPadding={true}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <ScrollView
                style={{ flex: 1, backgroundColor: T.bg }}
                contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
                showsVerticalScrollIndicator={false}
            >
                {/* HEADER CARD WITH COPY BUTTON */}
                <View style={[uiStyles.headerCard, { backgroundColor: T.card, borderColor: T.border }]}>
                    <View style={uiStyles.headerContent}>
                        <View style={uiStyles.headerTextBox}>
                            <View style={uiStyles.titleRow}>
                                <Ionicons name="shield-checkmark" size={22} color={COLORS.success} />
                                <Text style={[uiStyles.headerTitle, { color: COLORS.success }]}>Ligtas ang Data Mo</Text>
                            </View>
                            <Text style={[uiStyles.headerSubtitle, { color: T.subText }]}>
                                {isOfflinePreview
                                    ? "Ito ang preview ng linis na text sa phone mo."
                                    : "Ito yung eksaktong text na na-process ng AI."}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={[uiStyles.copyBtn, { backgroundColor: T.bg, borderColor: T.border }, copied && { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: COLORS.success }]}
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
                    <View style={[uiStyles.statsRow, { backgroundColor: T.bg }]}>
                        <View style={uiStyles.statBox}>
                            <Text style={[uiStyles.statLabel, { color: T.subText }]}>Characters</Text>
                            <Text style={[uiStyles.statValue, { color: COLORS.primaryLight }]}>{charCount.toLocaleString()}</Text>
                        </View>
                        <View style={[uiStyles.statDivider, { backgroundColor: T.border }]} />
                        <View style={uiStyles.statBox}>
                            <Text style={[uiStyles.statLabel, { color: T.subText }]}>Words</Text>
                            <Text style={[uiStyles.statValue, { color: COLORS.primaryLight }]}>{wordCount.toLocaleString()}</Text>
                        </View>
                    </View>
                </View>

                {/* REDACTION WARNING */}
                <View style={[uiStyles.warningBox, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
                    <View style={uiStyles.warningIcon}>
                        <Ionicons name="lock-closed" size={20} color={COLORS.warning} />
                    </View>
                    <View style={uiStyles.warningContent}>
                        <Text style={[uiStyles.warningTitle, { color: COLORS.warning }]}>Text na ginamit ng AI</Text>
                        <Text style={[uiStyles.warningText, { color: T.text }]}>
                            Pinalitan ng <Text style={{ fontWeight: 'bold' }}>[REDACTED]</Text> ang mga pangalan, numero, at address para protektado ka bago ipadala sa internet.
                        </Text>
                    </View>
                </View>

                {/* DOCUMENT CONTENT */}
                <View style={uiStyles.documentContainer}>
                    <View style={uiStyles.documentHeader}>
                        <Ionicons name="document-text" size={16} color={COLORS.primaryLight} />
                        <Text style={[uiStyles.documentTitle, { color: T.subText }]}>Linis na Dokumento</Text>
                    </View>
                    <View style={[uiStyles.documentPaper, { backgroundColor: T.bg, borderColor: T.border }]}>
                        <Text style={[uiStyles.justifiedText, { color: T.text }]}>
                            {textContent}
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </ScreenLayout>
    );
}

const uiStyles = StyleSheet.create({
    headerCard: {
        borderRadius: 10, // Sharp corner
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 14,
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
        fontSize: 15,
        fontWeight: '900',
        marginLeft: 8,
        letterSpacing: 0.3,
    },
    headerSubtitle: {
        fontSize: 12,
        lineHeight: 18,
    },
    copyBtn: {
        width: 40,
        height: 40,
        borderRadius: 8, // Sharp corner
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
    },

    // STATS
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8, // Sharp corner
        paddingVertical: 12,
        paddingHorizontal: 12,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '900',
    },
    statDivider: {
        width: 1,
        height: 24,
        marginHorizontal: 8,
    },

    // WARNING BOX
    warningBox: {
        flexDirection: 'row',
        borderRadius: 10, // Sharp corner
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
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
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    warningText: {
        fontSize: 13,
        lineHeight: 19,
    },

    // DOCUMENT
    documentContainer: {
        marginBottom: 16,
    },
    documentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    documentTitle: {
        fontSize: 12,
        fontWeight: '900',
        marginLeft: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    documentPaper: {
        padding: 16,
        borderRadius: 10, // Sharp corner
        borderWidth: 1,
        minHeight: 200,
    },
    justifiedText: {
        fontSize: 14,
        lineHeight: 24,
        textAlign: 'left',
        letterSpacing: 0.2,
    }
});