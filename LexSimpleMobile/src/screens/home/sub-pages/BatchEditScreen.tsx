import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { sanitizeLocalText } from '../../../utils/sanitizer';

export default function BatchEditScreen({ route, navigation }: any) {
    const pages = route.params?.pages || [];
    const { colors: T, isDarkMode } = useTheme();
    const { showAlert, AlertRender } = useCustomAlert();
    const { isProcessing, triggerBackgroundProcess } = useBackgroundProcessScreen('BatchEditScreen');

    const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
    const [pageFilters, setPageFilters] = useState<Record<number, string>>({});

    const handleAnalyze = async () => {
        if (pages.length === 0) return;

        // 🚀 SAVE TO RECENT FILES HISTORY FIRST
        try {
            const newId = Date.now().toString();
            const newItem = {
                id: newId,
                uri: pages[0], // Use first page as thumbnail cover
                title: `Batch Scan (${pages.length} pages)`,
                date: new Date().toLocaleString(),
                type: 'camera',
                status: 'unscanned'
            };

            const storedHistory = await AsyncStorage.getItem('@lex_scan_history');
            const historyArray = storedHistory ? JSON.parse(storedHistory) : [];
            await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));
        } catch (e) {
            console.error("Failed to save batch to history", e);
        }

        // 🚀 THRESHOLD: 4 pages or less = Local ML Kit. More than 4 = Backend Batch.
        const USE_LOCAL_OCR_THRESHOLD = 4;

        triggerBackgroundProcess(async (signal: AbortSignal) => {

            // ==========================================================
            // PATH A: LOCAL ML KIT (For small batches - Fast & Secure)
            // ==========================================================
            if (pages.length <= USE_LOCAL_OCR_THRESHOLD) {
                let fullExtractedText = "";

                for (let i = 0; i < pages.length; i++) {
                    const uri = pages[i].startsWith('file://') ? pages[i] : `file://${pages[i]}`;
                    try {
                        const result = await TextRecognition.recognize(uri);
                        fullExtractedText += result.text + `\n\n--- PAGE ${i + 1} ---\n\n`;
                    } catch (e) {
                        console.error(`Local OCR Error on page ${i + 1}`, e);
                    }
                }

                if (!fullExtractedText.trim()) {
                    throw new Error("Walang text na na-extract sa mga larawan.");
                }

                // Local Sanitization (DPA Compliant)
                const sanitizedText = sanitizeLocalText(fullExtractedText);

                // Send sanitized text to /simplify
                const { postEndpoint } = require('../../../services/AiEngine');
                const data = await postEndpoint('/simplify', { text: sanitizedText }, signal);

                if (data && data.status === 'success') return data;
                else throw new Error(data?.message || "Server processing failed.");
            }

            // ==========================================================
            // PATH B: BACKEND BATCH (For large batches - Powerful & Auto-Clean)
            // ==========================================================
            else {
                const formData = new FormData();
                pages.forEach((uri: string, index: number) => {
                    const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
                    formData.append('files', {
                        uri: fileUri,
                        name: `scan_page_${index + 1}.jpg`,
                        type: 'image/jpeg'
                    } as any);
                });

                // Send raw images to /simplify_batch
                const { postBatchFileEndpoint } = require('../../../services/AiEngine');
                const data = await postBatchFileEndpoint('/simplify_batch', formData);

                if (data && data.status === 'success') return data;
                else throw new Error(data?.message || "Server batch processing failed.");
            }
        });
    };

    if (isProcessing) {
        return (
            <ScreenLayout title="Processing" showBackButton={false}>
                <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
                    <ProcessingLoader
                        title="Analyzing Documents"
                        messages={["Extracting text from all pages...", "Connecting to Lex-Simple AI...", "Simplifying for you..."]}
                        onMinimize={() => navigation.navigate('Main', { screen: 'Scan' })}
                        onCancel={() => navigation.goBack()}
                    />
                    <AlertRender />
                </View>
            </ScreenLayout>
        );
    }

    const renderItem = ({ item, index }: any) => (
        <TouchableOpacity
            style={[styles.pageContainer, { backgroundColor: T.card, borderColor: T.border }]}
            onPress={() => setSelectedPageIndex(index)}
        >
            <Image
                source={{ uri: item }}
                style={[
                    styles.pageImage,
                    pageFilters[index] === 'grayscale' && { tintColor: 'gray' },
                    pageFilters[index] === 'bw' && { tintColor: 'black' }
                ]}
                resizeMode="cover"
            />
            <View style={styles.pageBadge}>
                <Text style={styles.pageBadgeText}>Page {index + 1}</Text>
            </View>

            {pageFilters[index] && (
                <View style={styles.filterLabel}>
                    <Text style={styles.filterLabelText}>
                        {pageFilters[index] === 'magic' ? 'Magic' :
                            pageFilters[index] === 'grayscale' ? 'Grayscale' : 'B&W'}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );

    return (
        <ScreenLayout title="Review Pages" noPadding={true}>
            <View style={{ flex: 1, backgroundColor: T.bg }}>
                <FlatList
                    data={pages}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={renderItem}
                    numColumns={2}
                    contentContainerStyle={{ padding: 16 }}
                    ListEmptyComponent={
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ color: T.text }}>No pages captured.</Text>
                        </View>
                    }
                />

                <View style={[styles.bottomBar, { backgroundColor: T.card, borderTopColor: T.border }]}>
                    <TouchableOpacity
                        style={[styles.retakeBtn, { backgroundColor: T.bg, borderColor: T.border }]}
                        onPress={() => navigation.navigate({
                            name: 'ScannerScreen',
                            params: { existingPages: pages },
                            merge: true
                        })}
                    >
                        <Ionicons name="camera-outline" size={22} color={T.text} />
                        <Text style={[styles.btnText, { color: T.text }]}>Add More</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
                        <Ionicons name="sparkles" size={22} color="#FFFFFF" />
                        <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Analyze ({pages.length})</Text>
                    </TouchableOpacity>
                </View>

                <Modal
                    visible={selectedPageIndex !== null}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setSelectedPageIndex(null)}
                >
                    <View style={styles.modalContainer}>
                        <View style={[styles.modalContent, { backgroundColor: T.card, borderColor: T.border }]}>
                            <Text style={[styles.modalTitle, { color: T.text }]}>
                                Edit Page {selectedPageIndex !== null ? selectedPageIndex + 1 : ''}
                            </Text>

                            {selectedPageIndex !== null && (
                                <Image
                                    source={{ uri: pages[selectedPageIndex] }}
                                    style={styles.previewImage}
                                    resizeMode="contain"
                                />
                            )}

                            <View style={styles.filterRow}>
                                {['magic', 'grayscale', 'bw'].map((f) => {
                                    const isSelected = pageFilters[selectedPageIndex!] === f;
                                    return (
                                        <TouchableOpacity
                                            key={f}
                                            style={[
                                                styles.filterBtn,
                                                {
                                                    backgroundColor: isSelected ? COLORS.primary : T.bg,
                                                    borderColor: isSelected ? COLORS.primary : T.border
                                                }
                                            ]}
                                            onPress={() => setPageFilters(prev => ({ ...prev, [selectedPageIndex!]: f }))}
                                        >
                                            <Text style={{
                                                color: isSelected ? '#FFFFFF' : T.text,
                                                fontWeight: 'bold',
                                                fontSize: 13
                                            }}>
                                                {f === 'magic' ? 'Magic Color' : f === 'grayscale' ? 'Grayscale' : 'B&W'}
                                            </Text>
                                        </TouchableOpacity>
                                    )
                                })}
                            </View>

                            <Text style={[styles.helperText, { color: T.subText }]}>
                                *Filters and auto-cropping will be applied via AI backend.
                            </Text>

                            <TouchableOpacity
                                style={styles.doneBtn}
                                onPress={() => setSelectedPageIndex(null)}
                            >
                                <Text style={styles.doneBtnText}>Save & Close</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

            </View>
            <AlertRender />
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    pageContainer: {
        flex: 1,
        margin: 6,
        aspectRatio: 1,
        borderRadius: 10, // Sharp corner
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1
    },
    pageImage: { width: '100%', height: '100%' },
    pageBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    pageBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    filterLabel: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(72, 128, 255, 0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    filterLabelText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    bottomBar: { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
    retakeBtn: { flex: 1, flexDirection: 'row', padding: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 1 },
    analyzeBtn: { flex: 2, flexDirection: 'row', backgroundColor: COLORS.primary, padding: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    btnText: { fontWeight: 'bold', marginLeft: 8 },
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '90%', padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 1 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
    previewImage: { width: '100%', height: 300, borderRadius: 10, marginBottom: 20, backgroundColor: '#000' },
    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 15, width: '100%', justifyContent: 'center' },
    filterBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
    helperText: { fontSize: 12, fontStyle: 'italic', marginBottom: 20, textAlign: 'center' },
    doneBtn: { backgroundColor: COLORS.primary, width: '100%', paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
    doneBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 }
});