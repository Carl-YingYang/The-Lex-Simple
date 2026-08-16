import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, SafeAreaView, StatusBar, Dimensions, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS } from '../../../theme/globalStyles';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert } from '../../../components/CustomAlert';

const { width } = Dimensions.get('window');

export default function BatchEditScreen({ route, navigation }: any) {
    const rawPages = route?.params?.pages;
    const pages = Array.isArray(rawPages) ? rawPages : [];

    const [currentIndex, setCurrentIndex] = useState(0);
    const [activeMenu, setActiveMenu] = useState<'main' | 'crop' | 'adjust' | 'filters'>('main');

    // VISUAL STATES (Ipapadala sa backend)
    const [pageFilters, setPageFilters] = useState<Record<number, string>>({});
    const [pageRotations, setPageRotations] = useState<Record<number, number>>({});
    const [pageCrops, setPageCrops] = useState<Record<number, any>>({});

    const flatListRef = useRef<FlatList>(null);
    const { isProcessing, triggerBackgroundProcess } = useBackgroundProcessScreen('BatchEditScreen');
    const { showAlert, AlertRender } = useCustomAlert();

    const onViewRef = useRef(({ viewableItems }: any) => {
        if (viewableItems.length > 0) {
            setCurrentIndex(viewableItems[0].index);
        }
    });
    const viewConfigRef = useRef({ itemVisiblePercentThreshold: 50 });

    // ==========================================================
    // 🚀 TOTOONG BACKEND CONNECTION LOGIC
    // ==========================================================
    const handleAnalyze = async () => {
        if (pages.length === 0) return;

        // 1. I-save muna sa Recent History bago mag-process
        try {
            const newId = Date.now().toString();
            const newItem = {
                id: newId,
                uri: pages[0],
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

        // 2. Trigger Background Loader & Send to Python API
        triggerBackgroundProcess(async (signal: AbortSignal) => {
            const formData = new FormData();

            // Ilagay lahat ng images
            pages.forEach((uri: string, index: number) => {
                const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
                formData.append('files', {
                    uri: fileUri,
                    name: `scan_page_${index + 1}.jpg`,
                    type: 'image/jpeg'
                } as any);
            });

            // Ipadala sa Python yung instructions (Rotate, Filter, Crop)
            formData.append('instructions', JSON.stringify({
                rotations: pageRotations,
                filters: pageFilters,
                crops: pageCrops
            }));

            // Call Backend
            const { postBatchFileEndpoint } = require('../../../services/AiEngine');
            const data = await postBatchFileEndpoint('/simplify_batch', formData);

            if (data && data.status === 'success') {
                // I-force natin na laging array ang i-return
                if (!data.results) data.results = [];
                return data;
            } else {
                throw new Error(data?.message || "Server batch processing failed.");
            }
        });
    };

    const scrollToIndex = (index: number) => {
        if (index >= 0 && index < pages.length) {
            flatListRef.current?.scrollToIndex({ index, animated: true });
            setCurrentIndex(index);
        }
    };

    // VISUAL ROTATION ONLY
    const handleVisualRotate = () => {
        setPageRotations(prev => {
            const currentRot = prev[currentIndex] || 0;
            return { ...prev, [currentIndex]: (currentRot + 90) % 360 };
        });
    };

    // VISUAL CROP CONFIRMATION ONLY
    const handleVisualCropDone = () => {
        setPageCrops(prev => ({ ...prev, [currentIndex]: true }));
        setActiveMenu('main');
    };

    const renderPage = ({ item, index }: any) => {
        const currentFilter = pageFilters[index] || 'original';
        const currentRotation = pageRotations[index] || 0;
        const isCropped = pageCrops[index] || false;

        return (
            <View style={styles.pageWrapper}>
                <View style={[
                    styles.imageCanvas,
                    isCropped && { padding: 20, backgroundColor: '#000' }
                ]}>
                    <Image
                        source={{ uri: item }}
                        style={[
                            styles.previewImage,
                            { transform: [{ rotate: `${currentRotation}deg` }] },
                            currentFilter === 'grayscale' && { tintColor: '#888888', opacity: 0.8 },
                            currentFilter === 'bw' && { tintColor: '#444444', opacity: 0.9 }
                        ]}
                        resizeMode="contain"
                    />

                    {activeMenu === 'crop' && index === currentIndex && (
                        <View style={styles.cropOverlay}>
                            <View style={styles.cropBorder}>
                                <View style={[styles.cropHandle, styles.topLeft]} />
                                <View style={[styles.cropHandle, styles.topRight]} />
                                <View style={[styles.cropHandle, styles.bottomLeft]} />
                                <View style={[styles.cropHandle, styles.bottomRight]} />
                                <View style={[styles.cropHandleBar, styles.topMid]} />
                                <View style={[styles.cropHandleBar, styles.bottomMid]} />
                                <View style={[styles.cropHandleBar, styles.leftMid]} />
                                <View style={[styles.cropHandleBar, styles.rightMid]} />
                            </View>
                        </View>
                    )}

                    {currentFilter !== 'original' && activeMenu !== 'crop' && (
                        <View style={styles.filterBadge}>
                            <Text style={styles.filterBadgeText}>
                                {currentFilter === 'magic' ? 'Magic Color' : currentFilter === 'grayscale' ? 'Grayscale' : 'B&W'}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    if (isProcessing) {
        return (
            <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
                <ProcessingLoader title="Analyzing Documents" messages={["Sending to Lex-Simple AI...", "Applying filters & rotation...", "Extracting text..."]} onCancel={() => navigation.goBack()} />
                <AlertRender />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#121212" />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.navigate('Main')} style={styles.headerIcon}>
                    <Ionicons name="home" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Lex-Simple Scan</Text>
                    <View style={styles.headerTitleUnderline} />
                </View>
                <TouchableOpacity style={styles.headerIcon}>
                    <Ionicons name="document-text-outline" size={24} color="#FFF" />
                </TouchableOpacity>
            </View>

            <View style={styles.mainViewer}>
                <FlatList
                    ref={flatListRef}
                    data={pages}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(_, i) => i.toString()}
                    renderItem={renderPage}
                    onViewableItemsChanged={onViewRef.current}
                    viewabilityConfig={viewConfigRef.current}
                    scrollEnabled={activeMenu === 'main'}
                />

                {currentIndex > 0 && activeMenu === 'main' && (
                    <TouchableOpacity style={styles.arrowLeft} onPress={() => scrollToIndex(currentIndex - 1)}>
                        <Ionicons name="chevron-back-circle" size={40} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                )}

                {currentIndex < pages.length - 1 && activeMenu === 'main' && (
                    <TouchableOpacity style={styles.arrowRight} onPress={() => scrollToIndex(currentIndex + 1)}>
                        <Ionicons name="chevron-forward-circle" size={40} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                )}
            </View>

            {/* SUB-MENUS */}
            {activeMenu === 'filters' && (
                <View style={styles.subMenuContainer}>
                    <View style={styles.subMenuHeader}>
                        <Text style={styles.subMenuTitle}>Filters</Text>
                        <TouchableOpacity onPress={() => setActiveMenu('main')}>
                            <Ionicons name="close-circle" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.filterOptionsRow}>
                        {['original', 'magic', 'grayscale', 'bw'].map((filter) => {
                            const isActive = pageFilters[currentIndex] === filter || (!pageFilters[currentIndex] && filter === 'original');
                            return (
                                <TouchableOpacity
                                    key={filter}
                                    style={styles.filterItem}
                                    onPress={() => setPageFilters(prev => ({ ...prev, [currentIndex]: filter }))}
                                >
                                    <View style={[styles.filterThumb, isActive && styles.filterThumbActive]}>
                                        <Image source={{ uri: pages[currentIndex] }} style={styles.filterThumbImg} />
                                    </View>
                                    <Text style={[styles.filterText, isActive && { color: '#4880FF' }]}>
                                        {filter === 'original' ? 'Original' : filter === 'magic' ? 'Auto-color' : filter === 'grayscale' ? 'Grayscale' : 'B&W'}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>
            )}

            {activeMenu === 'adjust' && (
                <View style={styles.subMenuContainer}>
                    <View style={styles.subMenuHeader}>
                        <Text style={styles.subMenuTitle}>Adjust</Text>
                        <TouchableOpacity onPress={() => setActiveMenu('main')}>
                            <Ionicons name="close-circle" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.adjustOptionsRow}>
                        <TouchableOpacity style={styles.adjustBtn}><Ionicons name="sunny" size={24} color="#4880FF" /><Text style={styles.adjustText}>Brightness</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.adjustBtn}><Ionicons name="contrast" size={24} color="#FFF" /><Text style={styles.adjustText}>Contrast</Text></TouchableOpacity>
                    </View>
                    <Text style={styles.helperText}>*Fine-tuning will be applied in backend.</Text>
                </View>
            )}

            {activeMenu === 'crop' && (
                <View style={styles.subMenuContainer}>
                    <View style={styles.cropOptionsRow}>
                        <TouchableOpacity style={styles.cropActionBtn}><Ionicons name="scan-outline" size={20} color="#4880FF" /><Text style={styles.cropActionText}>Auto-detect</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.cropActionBtn}><Ionicons name="grid-outline" size={20} color="#4880FF" /><Text style={styles.cropActionText}>Straighten</Text></TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.cropDoneBtn} onPress={handleVisualCropDone}>
                        <Ionicons name="checkmark" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            )}

            {/* MAIN TOOLBAR */}
            {activeMenu === 'main' && (
                <View style={styles.toolbar}>
                    <TouchableOpacity style={styles.toolBtn} onPress={() => navigation.navigate({ name: 'ScannerScreen', params: { existingPages: pages }, merge: true })}>
                        <Ionicons name="camera-reverse-outline" size={24} color="#FFF" />
                        <Text style={styles.toolText}>Retake</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => setActiveMenu('crop')}>
                        <Ionicons name="crop" size={24} color="#FFF" />
                        <Text style={styles.toolText}>Crop</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={handleVisualRotate}>
                        <Ionicons name="refresh" size={24} color="#FFF" />
                        <Text style={styles.toolText}>Rotate</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => setActiveMenu('adjust')}>
                        <Ionicons name="options-outline" size={24} color="#FFF" />
                        <Text style={styles.toolText}>Adjust</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolBtn} onPress={() => setActiveMenu('filters')}>
                        <Ionicons name="color-filter-outline" size={24} color="#4880FF" />
                        <Text style={[styles.toolText, { color: '#4880FF' }]}>Filters</Text>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.keepScanningBtn}
                    onPress={() => navigation.navigate({ name: 'ScannerScreen', params: { existingPages: pages }, merge: true })}
                >
                    <Text style={styles.keepScanningText}>Keep scanning</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveBtn} onPress={handleAnalyze}>
                    <Text style={styles.saveBtnText}>Analyze ({pages.length})</Text>
                    <Ionicons name="chevron-up" size={20} color="#FFF" style={{ marginLeft: 5 }} />
                </TouchableOpacity>
            </View>

            <AlertRender />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 15 },
    headerIcon: { padding: 5 },
    headerTitleContainer: { alignItems: 'center' },
    headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    headerTitleUnderline: { width: '80%', height: 2, backgroundColor: 'gray', marginTop: 4, borderStyle: 'dashed' },
    mainViewer: { flex: 1, backgroundColor: '#1E1E1E', position: 'relative' },
    pageWrapper: { width: width, height: '100%', justifyContent: 'center', alignItems: 'center', padding: 20 },
    imageCanvas: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    previewImage: { width: '100%', height: '100%' },
    arrowLeft: { position: 'absolute', left: 10, top: '45%', zIndex: 10 },
    arrowRight: { position: 'absolute', right: 10, top: '45%', zIndex: 10 },
    filterBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(72,128,255,0.9)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    filterBadgeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
    cropOverlay: { position: 'absolute', top: '10%', bottom: '10%', left: '5%', right: '5%', borderWidth: 2, borderColor: '#4880FF' },
    cropBorder: { flex: 1, position: 'relative' },
    cropHandle: { position: 'absolute', width: 24, height: 24, borderRadius: 12, backgroundColor: '#4880FF', borderWidth: 2, borderColor: '#FFF' },
    topLeft: { top: -12, left: -12 }, topRight: { top: -12, right: -12 }, bottomLeft: { bottom: -12, left: -12 }, bottomRight: { bottom: -12, right: -12 },
    cropHandleBar: { position: 'absolute', backgroundColor: '#4880FF', borderWidth: 1, borderColor: '#FFF' },
    topMid: { top: -6, left: '45%', width: 30, height: 12, borderRadius: 6 }, bottomMid: { bottom: -6, left: '45%', width: 30, height: 12, borderRadius: 6 },
    leftMid: { left: -6, top: '45%', width: 12, height: 30, borderRadius: 6 }, rightMid: { right: -6, top: '45%', width: 12, height: 30, borderRadius: 6 },
    toolbar: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#121212', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },
    toolBtn: { alignItems: 'center', justifyContent: 'center', width: 60 },
    toolText: { color: '#FFF', fontSize: 11, marginTop: 5 },
    subMenuContainer: { backgroundColor: '#1E1E1E', padding: 15, borderBottomWidth: 1, borderBottomColor: '#2C2C2C' },
    subMenuHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    subMenuTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    filterOptionsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    filterItem: { alignItems: 'center' },
    filterThumb: { width: 60, height: 80, borderWidth: 2, borderColor: 'transparent', borderRadius: 8, overflow: 'hidden', marginBottom: 8 },
    filterThumbActive: { borderColor: '#4880FF' },
    filterThumbImg: { width: '100%', height: '100%', opacity: 0.7 },
    filterText: { color: '#FFF', fontSize: 12 },
    adjustOptionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginVertical: 10 },
    adjustBtn: { alignItems: 'center' },
    adjustText: { color: '#FFF', marginTop: 8, fontSize: 14 },
    helperText: { color: 'gray', fontSize: 12, textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
    cropOptionsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 15 },
    cropActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(72,128,255,0.2)', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    cropActionText: { color: '#4880FF', marginLeft: 8, fontWeight: 'bold' },
    cropDoneBtn: { alignSelf: 'center', backgroundColor: '#4880FF', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
    bottomBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000', paddingHorizontal: 20, paddingVertical: 15, paddingBottom: 30 },
    keepScanningBtn: { padding: 10 },
    keepScanningText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
    saveBtn: { flexDirection: 'row', backgroundColor: '#0052CC', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, alignItems: 'center' },
    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});