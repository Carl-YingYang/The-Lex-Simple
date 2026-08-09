import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import ProcessingLoader from '../../../components/ProcessingLoader';

export default function BatchEditScreen({ route, navigation }: any) {
    const pages = route.params?.pages || [];
    const { colors: T, isDarkMode } = useTheme();
    const { showAlert, AlertRender } = useCustomAlert();
    const { isProcessing, triggerBackgroundProcess } = useBackgroundProcessScreen('BatchEditScreen');

    const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
    const [pageFilters, setPageFilters] = useState<Record<number, string>>({});

    const handleAnalyze = async () => {
        if (pages.length === 0) return;

        triggerBackgroundProcess(async (signal: AbortSignal) => {
            const formData = new FormData();

            // 1. I-loop ang lahat ng images at idagdag sa formData
            pages.forEach((uri: string, index: number) => {
                const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
                formData.append('files', {
                    uri: fileUri,
                    name: `page_${index}.jpg`,
                    type: 'image/jpeg'
                } as any);
            });

            // 2. Kunin ang mga filters na pinili at ipadala as JSON string
            const filterArray = pages.map((_: any, index: number) => pageFilters[index] || 'none');
            formData.append('filters', JSON.stringify(filterArray));

            // 3. I-post sa backend endpoint na /simplify_batch (DITO GAGANA ANG OPENCV AT TESSERACT)
            const { postFileEndpoint } = require('../../../services/AiEngine');
            const data = await postFileEndpoint('/simplify_batch', formData, signal);

            // 4. I-SAVE ANG RESULTA SA TAMANG FORMAT PARA SA HISTORY
            if (data && (data.status === 'success' || data.score !== undefined)) {

                // Kunin yung actual analysis object
                const finalResult = data.data ? data.data : data;

                try {
                    const newHistoryItem = {
                        id: Date.now().toString(),
                        title: `Scanned Document (${pages.length} pages)`,
                        date: new Date().toLocaleString(),
                        type: 'camera', // 🚀 TAMA NA ANG TYPE
                        status: 'scanned', // 🚀 IDINAGDAG PARA PUMASOK SA FILTER
                        images: pages,
                        analysisResult: finalResult, // 🚀 TAMA NA ANG KEY NAME
                        ocrText: finalResult.original_text || "Text extracted by AI"
                    };

                    const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
                    const historyArray = existingHistory ? JSON.parse(existingHistory) : [];
                    historyArray.unshift(newHistoryItem);
                    await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
                } catch (error) {
                    console.error("Failed to save history", error);
                }

                return finalResult;
            } else {
                throw new Error(data?.message || "Server processing failed.");
            }
        });
    };

    if (isProcessing) {
        return (
            <ScreenLayout title="Processing" showBackButton={false}>
                <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
                    <ProcessingLoader
                        title="Analyzing Documents"
                        messages={["Uploading images to Lex-Simple...", "Applying OpenCV image filters...", "Extracting text via Tesseract OCR...", "Analyzing legal context..."]}
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
            style={styles.pageContainer}
            onPress={() => setSelectedPageIndex(index)}
        >
            <Image
                source={{ uri: item }}
                style={styles.pageImage}
                resizeMode="cover"
            />
            <View style={styles.pageBadge}>
                <Text style={styles.pageBadgeText}>Page {index + 1}</Text>
            </View>

            {pageFilters[index] && (
                <View style={styles.filterLabel}>
                    <Text style={styles.filterLabelText}>
                        {pageFilters[index] === 'magic' ? 'Magic Color' :
                            pageFilters[index] === 'grayscale' ? 'Grayscale' :
                                'B&W'}
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

                <View style={styles.bottomBar}>
                    <TouchableOpacity
                        style={styles.retakeBtn}
                        onPress={() => navigation.navigate({
                            name: 'ScannerScreen',
                            params: { existingPages: pages },
                            merge: true
                        })}
                    >
                        <Ionicons name="camera-outline" size={24} color="#fff" />
                        <Text style={styles.btnText}>Add More</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
                        <Ionicons name="sparkles" size={24} color="#fff" />
                        <Text style={styles.btnText}>Analyze ({pages.length})</Text>
                    </TouchableOpacity>
                </View>

                <Modal
                    visible={selectedPageIndex !== null}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setSelectedPageIndex(null)}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>
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
                                                isSelected && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }
                                            ]}
                                            onPress={() => setPageFilters(prev => ({ ...prev, [selectedPageIndex!]: f }))}
                                        >
                                            <Text style={{
                                                color: isSelected ? '#ffffff' : '#333333',
                                                fontWeight: 'bold',
                                                fontSize: 14
                                            }}>
                                                {f === 'magic' ? 'Magic Color' : f === 'grayscale' ? 'Grayscale' : 'B&W'}
                                            </Text>
                                        </TouchableOpacity>
                                    )
                                })}
                            </View>

                            <Text style={styles.helperText}>
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
    pageContainer: { flex: 1, margin: 8, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    pageImage: { width: '100%', height: '100%' },
    pageBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    pageBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    filterLabel: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(72, 128, 255, 0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    filterLabelText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    bottomBar: { flexDirection: 'row', padding: 16, backgroundColor: COLORS.cardBg, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
    retakeBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#334155', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    analyzeBtn: { flex: 2, flexDirection: 'row', backgroundColor: COLORS.primary, padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: 'bold', marginLeft: 8 },
    previewImage: { width: '100%', height: 300, borderRadius: 8, marginBottom: 20, backgroundColor: '#000' },
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1E1E1E', width: '90%', padding: 24, borderRadius: 16, alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20, color: '#ffffff' },
    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 15, width: '100%', justifyContent: 'center' },
    filterBtn: { flex: 1, backgroundColor: '#ffffff', paddingVertical: 12, borderRadius: 8, borderWidth: 2, borderColor: '#cccccc', alignItems: 'center' },
    helperText: { color: '#aaaaaa', fontSize: 12, fontStyle: 'italic', marginBottom: 20, textAlign: 'center' },
    doneBtn: { backgroundColor: COLORS.primary, width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    doneBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 }
});