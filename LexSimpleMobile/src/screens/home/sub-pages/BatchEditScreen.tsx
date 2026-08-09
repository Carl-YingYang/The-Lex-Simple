import React, { useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import ProcessingLoader from '../../../components/ProcessingLoader';

export default function BatchEditScreen({ route, navigation }: any) {
    const { pages } = route.params || { pages: [] };
    const { colors: T, isDarkMode } = useTheme();
    const { showAlert, AlertRender } = useCustomAlert();
    const { isProcessing, triggerBackgroundProcess } = useBackgroundProcessScreen('BatchEditScreen');

    const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null);
    const [pageFilters, setPageFilters] = useState<Record<number, string>>({}); // Store filter per page

    const handleAnalyze = async () => {
        if (pages.length === 0) return;

        triggerBackgroundProcess(async (signal: AbortSignal) => {
            let fullExtractedText = "";

            for (let i = 0; i < pages.length; i++) {
                const uri = pages[i].startsWith('file://') ? pages[i] : `file://${pages[i]}`;
                try {
                    const result = await TextRecognition.recognize(uri);
                    fullExtractedText += result.text + `\n\n--- PAGE ${i + 1} ---\n\n`;
                } catch (e) {
                    console.error(`OCR Error on page ${i + 1}`, e);
                }
            }

            if (!fullExtractedText.trim()) {
                throw new Error("Walang text na na-extract sa mga larawan.");
            }

            const { postEndpoint } = require('../../../services/AiEngine');
            const data = await postEndpoint('/simplify', { text: fullExtractedText }, signal);

            if (data && data.status === 'success') {
                return data;
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
            style={styles.pageContainer}
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

            {/* Filter Label */}
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
                        onPress={() => navigation.navigate('ScannerScreen')}
                    >
                        <Ionicons name="camera-outline" size={24} color="#fff" />
                        <Text style={styles.btnText}>Add More</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.analyzeBtn} onPress={handleAnalyze}>
                        <Ionicons name="sparkles" size={24} color="#fff" />
                        <Text style={styles.btnText}>Analyze ({pages.length})</Text>
                    </TouchableOpacity>
                </View>

                {/* 🚀 FILTER & EDIT MODAL */}
                <Modal
                    visible={selectedPageIndex !== null}
                    transparent={true}
                    animationType="slide"
                    onRequestClose={() => setSelectedPageIndex(null)}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Edit Page {selectedPageIndex !== null ? selectedPageIndex + 1 : ''}</Text>

                            {selectedPageIndex !== null && (
                                <Image
                                    source={{ uri: pages[selectedPageIndex] }}
                                    style={styles.previewImage}
                                    resizeMode="contain"
                                />
                            )}

                            {/* FILTER BUTTONS */}
                            <View style={styles.filterRow}>
                                <TouchableOpacity
                                    style={styles.filterBtn}
                                    onPress={() => {
                                        setPageFilters(prev => ({ ...prev, [selectedPageIndex!]: 'magic' }));
                                    }}
                                >
                                    <Text style={{ color: pageFilters[selectedPageIndex!] === 'magic' ? '#fff' : '#000', fontWeight: 'bold' }}>Magic Color</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.filterBtn}
                                    onPress={() => {
                                        setPageFilters(prev => ({ ...prev, [selectedPageIndex!]: 'grayscale' }));
                                    }}
                                >
                                    <Text style={{ color: pageFilters[selectedPageIndex!] === 'grayscale' ? '#fff' : '#000', fontWeight: 'bold' }}>Grayscale</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.filterBtn}
                                    onPress={() => {
                                        setPageFilters(prev => ({ ...prev, [selectedPageIndex!]: 'bw' }));
                                    }}
                                >
                                    <Text style={{ color: pageFilters[selectedPageIndex!] === 'bw' ? '#fff' : '#000', fontWeight: 'bold' }}>B&W</Text>
                                </TouchableOpacity>
                            </View>

                            {/* DONE BUTTON */}
                            <TouchableOpacity
                                style={styles.doneBtn}
                                onPress={() => setSelectedPageIndex(null)}
                            >
                                <Text style={styles.doneBtnText}>Done</Text>
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
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1E1E1E', width: '90%', padding: 20, borderRadius: 16, alignItems: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    previewImage: { width: '100%', height: 300, borderRadius: 8, marginBottom: 20, backgroundColor: '#000' },
    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    filterBtn: { backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8 },
    doneBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 8 },
    doneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});