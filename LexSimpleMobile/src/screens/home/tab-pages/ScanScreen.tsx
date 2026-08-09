import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput, Image, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet, Dimensions, StatusBar, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageViewer from 'react-native-image-zoom-viewer';

import { COLORS } from '../../../theme/globalStyles';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import FloatingProcessIndicator from '../../../components/FloatingProcessIndicator';
import { useBackgroundProcess } from '../../../context/BackgroundProcessContext';

// 🚀 IMPORT ANG MGA CUSTOM ICONS
const AskAiGridIcon = require('../../../../assets/icons/chat_ai.png');
const AskAiListIcon = require('../../../../assets/icons/message_ai.png');
const DocFileIcon = require('../../../../assets/icons/files.png');

export interface ScanHistoryItem {
  id: string;
  uri?: string;
  images?: string[]; // 🚀 ADDED: Suporta para sa array of images mula sa Batch Edit
  title: string;
  date: string;
  type: 'camera' | 'gallery' | 'document';
  status: 'unscanned' | 'scanned';
  analysisResult?: any;
  ocrText?: string;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 32 - 12) / 2;

export default function ScanScreen({ navigation }: any) {
  const [historyItems, setHistoryItems] = useState<ScanHistoryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'scanned' | 'unscanned'>('all');

  const { isDarkMode, toggleTheme, colors: T } = useTheme();
  const { isProcessing: isGlobalProcessing, activeFileId, processRoute } = useBackgroundProcess();

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [itemToRename, setItemToRename] = useState<ScanHistoryItem | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [visibleCount, setVisibleCount] = useState(5);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();

  useFocusEffect(useCallback(() => { loadHistory(); }, []));
  useEffect(() => { setVisibleCount(5); }, [activeFilter, historyItems.length]);

  const loadHistory = async () => {
    try {
      const storedHistory = await AsyncStorage.getItem('@lex_scan_history');
      if (storedHistory) {
        const historyArray = JSON.parse(storedHistory);
        historyArray.sort((a: any, b: any) => parseInt(b.id) - parseInt(a.id));
        setHistoryItems(historyArray);
      }
    } catch (error) { console.error("Failed to load history", error); }
  };

  const showLegalInfo = () => {
    showAlert("Legal Literacy Tool", "Ang Lex-Simple ay isang AI Legal Literacy Tool at hindi pamalit sa pormal na payo ng isang lisensyadong abogado.", "info", [{ text: "Naintindihan ko", style: "default" }]);
  };

  const handleGridPress = (screen: string) => {
    if (isGlobalProcessing) {
      showAlert("May Proseso Pa", "May kasalukuyang nag-aanalyze pa. Hintayin matapos o i-cancel muna ito.", "warning");
      return;
    }
    navigation.navigate(screen);
  };

  const handleCardPress = (item: ScanHistoryItem) => {
    if (item.status === 'scanned' && item.analysisResult) {
      navigation.navigate('ResultScreen', { analysisResult: item.analysisResult, historyItem: item });
    } else {
      navigation.navigate('OfflineDetailScreen', { scanItem: item });
    }
  };

  const getDisplayTitle = (item: ScanHistoryItem) => {
    let finalTitle = item.title;
    if (item.title === 'Camera Scan' || item.title === 'Gallery Upload' || item.title === 'Document File' || item.title.includes('pages)')) {
      if (item.status === 'scanned' && item.analysisResult?.documentTitle) finalTitle = item.analysisResult.documentTitle;
      else if (item.ocrText) {
        const lines = item.ocrText.split('\n').filter(line => line.trim().length > 4);
        if (lines.length > 0) finalTitle = lines[0].trim();
      }
    }
    return finalTitle.length > 25 ? finalTitle.substring(0, 25) + '...' : finalTitle;
  };

  const openRenameModal = (item: ScanHistoryItem) => { setItemToRename(item); setNewTitle(getDisplayTitle(item)); setRenameModalVisible(true); };

  const saveRenamedTitle = async () => {
    if (!itemToRename || !newTitle.trim()) return;
    try {
      const updatedHistory = historyItems.map(item => item.id === itemToRename.id ? { ...item, title: newTitle.trim() } : item);
      setHistoryItems(updatedHistory);
      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(updatedHistory));
      setRenameModalVisible(false);
    } catch (error) { showAlert("Error", "Hindi ma-save ang bagong pangalan.", "error", [{ text: "OK" }]); }
  };

  const handleAskAi = (item: ScanHistoryItem) => {
    if (!item.analysisResult) return;
    const res = item.analysisResult;
    const riskConfig = res.score >= 90 ? 'VERY SAFE' : res.score >= 70 ? 'ACCEPTABLE' : res.score >= 50 ? 'RISKY' : 'HIGH RISK';
    let fullContextData = `MGA DETALYE NG DOKUMENTO:\nTitle: ${getDisplayTitle(item)}\nComplexity Score: ${res.score}/100\nRisk Level: ${riskConfig}\n\nMGA NAKITANG FINDINGS:\n`;
    if (res.findings && res.findings.length > 0) res.findings.forEach((f: any, i: number) => { fullContextData += `\n${i + 1}. ${f.title}\n   - Paliwanag: ${f.description}\n   - Payo: ${f.advice}\n   - Orihinal na text: "${f.foundText}"\n`; });
    else fullContextData += "Walang nakitang high-risk na clauses.";
    navigation.navigate('AskAiScreen', { attachedFile: { name: getDisplayTitle(item), data: fullContextData } });
  };

  const handleDelete = async (id: string) => {
    showAlert("Delete File", "Sigurado ka bang gusto mong burahin ito?", "warning", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          const newHistory = historyItems.filter(item => item.id !== id);
          setHistoryItems(newHistory);
          await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(newHistory));
        }
      }
    ]);
  };

  const filteredHistory = historyItems.filter(item => activeFilter === 'all' ? true : item.status === activeFilter);
  const displayedHistory = filteredHistory.slice(0, visibleCount);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;
    if (isCloseToBottom && !isLoadingMore && visibleCount < filteredHistory.length) {
      setIsLoadingMore(true);
      setTimeout(() => { setVisibleCount(prev => prev + 5); setIsLoadingMore(false); }, 800);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <FloatingProcessIndicator />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 20 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={localStyles.header}>
          <View>
            <Text style={[localStyles.greeting, { color: T.subText }]}>Welcome back,</Text>
            <Text style={[localStyles.headerTitle, { color: T.text }]}>Lex-Simple</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={[localStyles.themeBtn, { backgroundColor: T.card, borderColor: T.border }]} onPress={() => toggleTheme()}>
              <Ionicons name={isDarkMode ? "moon" : "sunny"} size={20} color={T.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[localStyles.themeBtn, { backgroundColor: T.card, borderColor: T.border }]} onPress={showLegalInfo}>
              <Ionicons name="information-circle-outline" size={20} color={T.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[localStyles.disclaimerBox, { backgroundColor: T.card, borderColor: T.border }]}>
          <Ionicons name="shield-checkmark" size={18} color={COLORS.success} style={{ marginRight: 8 }} />
          <Text style={[localStyles.disclaimerText, { color: T.subText }]}>
            <Text style={{ fontWeight: 'bold', color: T.text }}>UPL Notice: </Text>Legal Literacy Tool lang ito. Hindi pamalit sa abogado.
          </Text>
        </View>

        <View style={localStyles.gridContainer}>
          <TouchableOpacity style={[localStyles.gridCard, { backgroundColor: T.card, borderLeftWidth: 5, borderColor: '#6D28D9', opacity: isGlobalProcessing ? 0.5 : 1 }]} onPress={() => handleGridPress('ScannerScreen')} disabled={isGlobalProcessing}>
            <Ionicons name="scan" size={26} color="#6D28D9" style={{ marginBottom: 10 }} />
            <Text style={[localStyles.cardTitle, { color: T.text }]}>Scan</Text>
            <Text style={[localStyles.cardSubtitle, { color: T.subText }]}>Camera & Docs</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[localStyles.gridCard, { backgroundColor: T.card, borderLeftWidth: 5, borderColor: '#3B82F6', opacity: isGlobalProcessing ? 0.5 : 1 }]} onPress={() => handleGridPress('UploadImageScreen')} disabled={isGlobalProcessing}>
            <Ionicons name="image-outline" size={26} color="#3B82F6" style={{ marginBottom: 10 }} />
            <Text style={[localStyles.cardTitle, { color: T.text }]}>Upload</Text>
            <Text style={[localStyles.cardSubtitle, { color: T.subText }]}>Photos & Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[localStyles.gridCard, { backgroundColor: T.card, borderLeftWidth: 5, borderColor: '#10B981', opacity: isGlobalProcessing ? 0.5 : 1 }]} onPress={() => handleGridPress('ConvertScreen')} disabled={isGlobalProcessing}>
            <Ionicons name="document-text-outline" size={26} color="#10B981" style={{ marginBottom: 10 }} />
            <Text style={[localStyles.cardTitle, { color: T.text }]}>Convert</Text>
            <Text style={[localStyles.cardSubtitle, { color: T.subText }]}>PDF, Word, TXT</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[localStyles.gridCard, { backgroundColor: T.card, borderLeftWidth: 5, borderColor: '#F59E0B', opacity: isGlobalProcessing ? 0.5 : 1 }]} onPress={() => handleGridPress('AskAiScreen')} disabled={isGlobalProcessing}>
            <Image source={AskAiGridIcon} style={[localStyles.gridIcon, { tintColor: '#F59E0B' }]} />
            <Text style={[localStyles.cardTitle, { color: T.text }]}>Ask AI</Text>
            <Text style={[localStyles.cardSubtitle, { color: T.subText }]}>Chat & Analyze</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 1, backgroundColor: T.border, marginVertical: 24 }} />

        <View style={localStyles.sectionHeader}>
          <Text style={[localStyles.sectionTitle, { color: T.text }]}>Recent Files</Text>
          <View style={localStyles.filterRow}>
            <TouchableOpacity style={[localStyles.filterChip, { backgroundColor: activeFilter === 'all' ? '#6D28D9' : T.card, borderColor: activeFilter === 'all' ? '#6D28D9' : T.border }]} onPress={() => setActiveFilter('all')}>
              <Text style={[localStyles.filterText, { color: activeFilter === 'all' ? '#fff' : T.subText }]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[localStyles.filterChip, { backgroundColor: activeFilter === 'scanned' ? '#6D28D9' : T.card, borderColor: activeFilter === 'scanned' ? '#6D28D9' : T.border }]} onPress={() => setActiveFilter('scanned')}>
              <Text style={[localStyles.filterText, { color: activeFilter === 'scanned' ? '#fff' : T.subText }]}>Scanned</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[localStyles.filterChip, { backgroundColor: activeFilter === 'unscanned' ? '#6D28D9' : T.card, borderColor: activeFilter === 'unscanned' ? '#6D28D9' : T.border }]} onPress={() => setActiveFilter('unscanned')}>
              <Text style={[localStyles.filterText, { color: activeFilter === 'unscanned' ? '#fff' : T.subText }]}>Unscanned</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={localStyles.historyList}>
          {filteredHistory.length === 0 ? (
            <View style={localStyles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color={T.subText} />
              <Text style={{ color: T.subText, marginTop: 12, fontSize: 16 }}>No recent files found.</Text>
            </View>
          ) : (
            displayedHistory.map((item) => {
              const isCurrentlyAnalyzing = isGlobalProcessing && activeFileId === item.id;

              return (
                <View key={item.id} style={[localStyles.historyCard, { backgroundColor: T.card, borderColor: T.border, opacity: isGlobalProcessing && !isCurrentlyAnalyzing ? 0.6 : 1 }]}>

                  {/* 🚀 SCROLLABLE THUMBNAIL IMPLEMENTATION */}
                  <View style={[localStyles.thumbnailWrapper, { backgroundColor: T.bg, borderWidth: 1, borderColor: T.border }]}>
                    {item.type === 'document' ? (
                      <TouchableOpacity
                        style={localStyles.thumbnailInner}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (isCurrentlyAnalyzing) return;
                          navigation.navigate('SanitizedOcrScreen', { sanitizedText: item.ocrText || "Walang text content.", customTitle: getDisplayTitle(item), isDocumentView: true });
                        }}
                      >
                        <Image source={DocFileIcon} style={{ width: 28, height: 28, resizeMode: 'contain' }} />
                      </TouchableOpacity>
                    ) : item.images && item.images.length > 0 ? (
                      <FlatList
                        data={item.images}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        pagingEnabled
                        keyExtractor={(img, imgIndex) => imgIndex.toString()}
                        renderItem={({ item: img }) => (
                          <TouchableOpacity
                            style={localStyles.thumbnailInner}
                            activeOpacity={0.8}
                            onPress={() => {
                              if (isCurrentlyAnalyzing) return;
                              setSelectedImage(img);
                            }}
                          >
                            <Image source={{ uri: img }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                          </TouchableOpacity>
                        )}
                      />
                    ) : (
                      <TouchableOpacity
                        style={localStyles.thumbnailInner}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (isCurrentlyAnalyzing || !item.uri) return;
                          setSelectedImage(item.uri);
                        }}
                      >
                        <Image source={{ uri: item.uri }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={localStyles.historyContent}>
                    <View style={localStyles.historyTopRow}>
                      <TouchableOpacity style={{ flex: 1 }} onPress={() => handleCardPress(item)} activeOpacity={0.7}>
                        <Text style={[localStyles.historyTitle, { color: T.text }]} numberOfLines={1}>{getDisplayTitle(item)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => openRenameModal(item)} disabled={isGlobalProcessing}>
                        <Ionicons name="pencil" size={14} color={T.subText} />
                      </TouchableOpacity>
                    </View>

                    <View style={localStyles.historyMetaRow}>
                      <Ionicons name={item.type === 'camera' ? 'camera' : item.type === 'gallery' ? 'images' : 'document'} size={12} color={T.subText} />
                      <Text style={[localStyles.historyMetaText, { color: T.subText }]}> {item.type.toUpperCase()} • {item.date.split(',')[0]}</Text>
                    </View>

                    <View style={localStyles.historyActionsRow}>
                      {isCurrentlyAnalyzing ? (
                        <View style={[localStyles.actionBtn, { backgroundColor: 'rgba(167, 139, 250, 0.1)' }]}>
                          <ActivityIndicator size="small" color={COLORS.primaryLight} style={{ marginRight: 6 }} />
                          <Text style={[localStyles.actionBtnText, { color: COLORS.primaryLight }]}>Analyzing...</Text>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[localStyles.actionBtn, { borderWidth: 1, borderColor: item.status === 'scanned' ? COLORS.primaryLight : 'transparent', backgroundColor: item.status === 'scanned' ? 'transparent' : '#6D28D9' }]}
                            onPress={() => handleCardPress(item)}
                          >
                            <Ionicons name={item.status === 'scanned' ? "document-text" : "sparkles"} size={12} color={item.status === 'scanned' ? '#A78BFA' : '#fff'} />
                            <Text style={[localStyles.actionBtnText, { color: item.status === 'scanned' ? '#A78BFA' : '#fff' }]}>
                              {item.status === 'scanned' ? 'View Results' : 'Analyze'}
                            </Text>
                          </TouchableOpacity>

                          {item.status === 'scanned' && (
                            <TouchableOpacity style={[localStyles.iconBtnSmall, { borderWidth: 1, borderColor: T.border }]} onPress={() => handleAskAi(item)} disabled={isGlobalProcessing}>
                              <Image source={AskAiListIcon} style={{ width: 16, height: 16, tintColor: '#F59E0B' }} resizeMode="contain" />
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity style={[localStyles.iconBtnSmall, { borderWidth: 1, borderColor: T.border }]} onPress={() => handleDelete(item.id)} disabled={isGlobalProcessing}>
                            <Ionicons name="trash" size={14} color="#EF4444" />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {isLoadingMore && (
          <View style={localStyles.loadingMoreBox}>
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
            <Text style={[localStyles.loadingMoreText, { color: T.subText }]}>Loading more...</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectedImage} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)} statusBarTranslucent>
        <View style={localStyles.viewerContainer}>
          <TouchableOpacity style={localStyles.viewerCloseBtn} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={26} color="white" />
          </TouchableOpacity>
          {selectedImage && (
            <ImageViewer imageUrls={[{ url: selectedImage }]} enableSwipeDown={true} onSwipeDown={() => setSelectedImage(null)} renderIndicator={() => <View />} backgroundColor="transparent" />
          )}
        </View>
      </Modal>

      <Modal visible={renameModalVisible} transparent={true} animationType="slide" onRequestClose={() => setRenameModalVisible(false)} statusBarTranslucent>
        <KeyboardAvoidingView style={localStyles.modalBackground} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[localStyles.renameBox, { backgroundColor: T.card }]}>
            <Text style={[localStyles.renameTitle, { color: T.text }]}>Rename File</Text>
            <TextInput style={[localStyles.renameInput, { backgroundColor: T.bg, color: T.text, borderColor: T.border }]} value={newTitle} onChangeText={setNewTitle} placeholder="Enter new name" placeholderTextColor={T.subText} autoFocus />
            <View style={localStyles.renameActionRow}>
              <TouchableOpacity style={[localStyles.renameCancelBtn, { backgroundColor: T.bg }]} onPress={() => setRenameModalVisible(false)}>
                <Text style={{ color: T.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={localStyles.renameSaveBtn} onPress={saveRenamedTitle}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AlertRender />
    </View>
  );
}

const localStyles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  greeting: { fontSize: 14, marginBottom: 2 },
  headerTitle: { fontSize: 28, fontWeight: 'bold' },
  themeBtn: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  disclaimerBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 14, marginBottom: 20, borderWidth: 1 },
  disclaimerText: { fontSize: 14, lineHeight: 20, flex: 1 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: { width: CARD_WIDTH, borderRadius: 8, padding: 16, marginBottom: 12, borderWidth: 1, height: 110, justifyContent: 'center', alignItems: 'flex-start' },
  gridIcon: { width: 28, height: 28, marginBottom: 10, resizeMode: 'contain' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 0 },
  cardSubtitle: { fontSize: 14, marginTop: 4 },
  sectionHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1 },
  filterText: { fontSize: 14, fontWeight: '600' },
  historyList: {},
  historyCard: { flexDirection: 'row', borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, alignItems: 'center' },
  thumbnailWrapper: { width: 56, height: 56, borderRadius: 8, marginRight: 14, overflow: 'hidden' },
  thumbnailInner: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  historyContent: { flex: 1, justifyContent: 'center' },
  historyTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historyTitle: { fontSize: 15, fontWeight: 'bold' },
  historyMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  historyMetaText: { fontSize: 12 },
  historyActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, gap: 4 },
  actionBtnText: { fontSize: 12, fontWeight: 'bold' },
  iconBtnSmall: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(128,128,128,0.1)', justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', padding: 40, opacity: 0.5 },
  loadingMoreBox: { paddingVertical: 20, alignItems: 'center' },
  loadingMoreText: { fontSize: 14, marginTop: 8 },
  viewerContainer: { flex: 1, backgroundColor: '#000' },
  viewerCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 99, padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 30 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  renameBox: { width: '100%', borderRadius: 12, padding: 24 },
  renameTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  renameInput: { borderRadius: 8, padding: 14, marginBottom: 20, borderWidth: 1, fontSize: 16 },
  renameActionRow: { flexDirection: 'row', gap: 12 },
  renameCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  renameSaveBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#6D28D9', alignItems: 'center' }
});