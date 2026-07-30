import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageViewer from 'react-native-image-zoom-viewer';

import { COLORS } from '../../../theme/globalStyles';
import { useCustomAlert } from '../../../components/CustomAlert';

export interface ScanHistoryItem {
  id: string;
  uri: string;
  title: string;
  date: string;
  type: 'camera' | 'gallery' | 'document';
  status: 'unscanned' | 'scanned';
  analysisResult?: any;
  ocrText?: string;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 32 - 12) / 2; // 2 columns, 12px gap

export default function ScanScreen({ navigation }: any) {
  const [historyItems, setHistoryItems] = useState<ScanHistoryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'scanned' | 'unscanned'>('all');

  // 🆕 THEME TOGGLE STATE
  const [isDarkMode, setIsDarkMode] = useState(true);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [itemToRename, setItemToRename] = useState<ScanHistoryItem | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const ITEMS_PER_PAGE = 5;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();

  // 🎨 DYNAMIC THEME COLORS (Solid & Easy on the eyes)
  const theme = {
    dark: {
      bg: '#000000',
      card: '#1C1C1E',
      text: '#FFFFFF',
      subText: '#8E8E93',
      border: '#2C2C2E',
    },
    light: {
      bg: '#F2F2F7',
      card: '#FFFFFF',
      text: '#000000',
      subText: '#3C3C43',
      border: '#D1D1D6',
    }
  };
  const currentTheme = isDarkMode ? theme.dark : theme.light;

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [activeFilter, historyItems.length]);

  const loadHistory = async () => {
    try {
      const storedHistory = await AsyncStorage.getItem('@lex_scan_history');
      if (storedHistory) setHistoryItems(JSON.parse(storedHistory));
    } catch (error) { console.error("Failed to load history", error); }
  };

  const showLegalInfo = () => {
    showAlert(
      "Legal Literacy Tool",
      "Ang Lex-Simple ay isang AI Legal Literacy Tool at hindi pamalit sa pormal na payo ng isang lisensyadong abogado.",
      "info",
      [{ text: "Naintindihan ko", style: "default" }]
    );
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
    if (item.title === 'Camera Scan' || item.title === 'Gallery Upload' || item.title === 'Document File') {
      if (item.status === 'scanned' && item.analysisResult?.documentTitle) {
        finalTitle = item.analysisResult.documentTitle;
      } else if (item.ocrText) {
        const lines = item.ocrText.split('\n').filter(line => line.trim().length > 4);
        if (lines.length > 0) finalTitle = lines[0].trim();
      }
    }
    return finalTitle.length > 25 ? finalTitle.substring(0, 25) + '...' : finalTitle;
  };

  const openRenameModal = (item: ScanHistoryItem) => {
    setItemToRename(item);
    setNewTitle(getDisplayTitle(item));
    setRenameModalVisible(true);
  };

  const saveRenamedTitle = async () => {
    if (!itemToRename || !newTitle.trim()) return;
    try {
      const updatedHistory = historyItems.map(item =>
        item.id === itemToRename.id ? { ...item, title: newTitle.trim() } : item
      );
      setHistoryItems(updatedHistory);
      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(updatedHistory));
      setRenameModalVisible(false);
    } catch (error) {
      showAlert("Error", "Hindi ma-save ang bagong pangalan.", "error", [{ text: "OK" }]);
    }
  };

  const handleAskAi = (item: ScanHistoryItem) => {
    if (!item.analysisResult) return;
    const res = item.analysisResult;
    const riskConfig = res.score >= 90 ? 'VERY SAFE' : res.score >= 70 ? 'ACCEPTABLE' : res.score >= 50 ? 'RISKY' : 'HIGH RISK';

    let fullContextData = `MGA DETALYE NG DOKUMENTO:\nTitle: ${getDisplayTitle(item)}\nComplexity Score: ${res.score}/100\nRisk Level: ${riskConfig}\n\nMGA NAKITANG FINDINGS:\n`;
    if (res.findings && res.findings.length > 0) {
      res.findings.forEach((f: any, i: number) => {
        fullContextData += `\n${i + 1}. ${f.title}\n   - Paliwanag: ${f.description}\n   - Payo: ${f.advice}\n   - Orihinal na text: "${f.foundText}"\n`;
      });
    } else {
      fullContextData += "Walang nakitang high-risk na clauses.";
    }

    navigation.navigate('AskAiScreen', {
      attachedFile: { name: getDisplayTitle(item), data: fullContextData }
    });
  };

  const handleDelete = async (id: string) => {
    showAlert("Delete File", "Sigurado ka bang gusto mong burahin ito?", "warning", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive", // 🚀 FIX: Corrected quote mark
        onPress: async () => {
          const newHistory = historyItems.filter(item => item.id !== id);
          setHistoryItems(newHistory);
          await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(newHistory));
        }
      }
    ]);
  };

  const filteredHistory = historyItems.filter(item => {
    if (activeFilter === 'all') return true;
    return item.status === activeFilter;
  });

  const displayedHistory = filteredHistory.slice(0, visibleCount);

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 50;

    if (isCloseToBottom && !isLoadingMore && visibleCount < filteredHistory.length) {
      setIsLoadingMore(true);
      setTimeout(() => {
        setVisibleCount(prev => prev + ITEMS_PER_PAGE);
        setIsLoadingMore(false);
      }, 800);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: currentTheme.bg }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 40,
          paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 20
        }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* 🚀 HEADER WITH THEME TOGGLE */}
        <View style={localStyles.header}>
          <View>
            <Text style={[localStyles.greeting, { color: currentTheme.subText }]}>Welcome back,</Text>
            <Text style={[localStyles.headerTitle, { color: currentTheme.text }]}>Lex-Simple</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={[localStyles.themeBtn, { backgroundColor: currentTheme.card, borderColor: currentTheme.border }]}
              onPress={() => setIsDarkMode(!isDarkMode)}
            >
              <Ionicons name={isDarkMode ? "moon" : "sunny"} size={20} color={currentTheme.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[localStyles.themeBtn, { backgroundColor: currentTheme.card, borderColor: currentTheme.border }]}
              onPress={showLegalInfo}
            >
              <Ionicons name="information-circle-outline" size={20} color={currentTheme.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 🚀 DISCLAIMER */}
        <View style={[localStyles.disclaimerBox, { backgroundColor: currentTheme.card, borderColor: currentTheme.border }]}>
          <Ionicons name="shield-checkmark" size={18} color={COLORS.success} style={{ marginRight: 8 }} />
          <Text style={[localStyles.disclaimerText, { color: currentTheme.subText }]}>
            <Text style={{ fontWeight: 'bold', color: currentTheme.text }}>UPL Notice: </Text>Legal Literacy Tool lang ito. Hindi pamalit sa abogado.
          </Text>
        </View>

        {/* 🚀 CONSISTENT GRID ACTIONS (All cards same style, different side border) */}
        <View style={localStyles.gridContainer}>
          {/* Scan Card - Purple Side Border */}
          <TouchableOpacity
            style={[localStyles.gridCard, { backgroundColor: currentTheme.card, borderLeftWidth: 5, borderColor: '#6D28D9' }]}
            onPress={() => navigation.navigate('ScannerScreen')}
          >
            <Ionicons name="scan" size={26} color="#6D28D9" />
            <Text style={[localStyles.cardTitle, { color: currentTheme.text }]}>Scan</Text>
            <Text style={[localStyles.cardSubtitle, { color: currentTheme.subText }]}>Camera & Docs</Text>
          </TouchableOpacity>

          {/* Upload Card - Blue Side Border */}
          <TouchableOpacity
            style={[localStyles.gridCard, { backgroundColor: currentTheme.card, borderLeftWidth: 5, borderColor: '#3B82F6' }]}
            onPress={() => navigation.navigate('UploadImageScreen')}
          >
            <Ionicons name="image-outline" size={26} color="#3B82F6" />
            <Text style={[localStyles.cardTitle, { color: currentTheme.text }]}>Upload</Text>
            <Text style={[localStyles.cardSubtitle, { color: currentTheme.subText }]}>Photos & Gallery</Text>
          </TouchableOpacity>

          {/* Convert Card - Green Side Border */}
          <TouchableOpacity
            style={[localStyles.gridCard, { backgroundColor: currentTheme.card, borderLeftWidth: 5, borderColor: '#10B981' }]}
            onPress={() => navigation.navigate('ConvertScreen')}
          >
            <Ionicons name="document-text-outline" size={26} color="#10B981" />
            <Text style={[localStyles.cardTitle, { color: currentTheme.text }]}>Convert</Text>
            <Text style={[localStyles.cardSubtitle, { color: currentTheme.subText }]}>PDF, Word, TXT</Text>
          </TouchableOpacity>

          {/* Ask AI Card - Orange Side Border */}
          <TouchableOpacity
            style={[localStyles.gridCard, { backgroundColor: currentTheme.card, borderLeftWidth: 5, borderColor: '#F59E0B' }]}
            onPress={() => navigation.navigate('AskAiScreen')}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={26} color="#F59E0B" />
            <Text style={[localStyles.cardTitle, { color: currentTheme.text }]}>Ask AI</Text>
            <Text style={[localStyles.cardSubtitle, { color: currentTheme.subText }]}>Chat & Analyze</Text>
          </TouchableOpacity>
        </View>

        {/* 🚀 DIVIDER BEFORE RECENT FILES */}
        <View style={{ height: 1, backgroundColor: currentTheme.border, marginVertical: 24 }} />

        {/* 🚀 RECENT FILES SECTION */}
        <View style={localStyles.sectionHeader}>
          <Text style={[localStyles.sectionTitle, { color: currentTheme.text }]}>Recent Files</Text>

          {/* Sharper Filter Chips */}
          <View style={localStyles.filterRow}>
            <TouchableOpacity
              style={[localStyles.filterChip, { backgroundColor: activeFilter === 'all' ? '#6D28D9' : currentTheme.card, borderColor: activeFilter === 'all' ? '#6D28D9' : currentTheme.border }]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[localStyles.filterText, { color: activeFilter === 'all' ? '#fff' : currentTheme.subText }]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.filterChip, { backgroundColor: activeFilter === 'scanned' ? '#6D28D9' : currentTheme.card, borderColor: activeFilter === 'scanned' ? '#6D28D9' : currentTheme.border }]}
              onPress={() => setActiveFilter('scanned')}
            >
              <Text style={[localStyles.filterText, { color: activeFilter === 'scanned' ? '#fff' : currentTheme.subText }]}>Scanned</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[localStyles.filterChip, { backgroundColor: activeFilter === 'unscanned' ? '#6D28D9' : currentTheme.card, borderColor: activeFilter === 'unscanned' ? '#6D28D9' : currentTheme.border }]}
              onPress={() => setActiveFilter('unscanned')}
            >
              <Text style={[localStyles.filterText, { color: activeFilter === 'unscanned' ? '#fff' : currentTheme.subText }]}>Unscanned</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 🚀 LEGIBLE HISTORY LIST (Bigger Fonts, Side Borders on Thumbnails) */}
        <View style={localStyles.historyList}>
          {filteredHistory.length === 0 ? (
            <View style={localStyles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color={currentTheme.subText} />
              <Text style={{ color: currentTheme.subText, marginTop: 12, fontSize: 16 }}>No recent files found.</Text>
            </View>
          ) : (
            displayedHistory.map((item) => (
              <View key={item.id} style={[localStyles.historyCard, { backgroundColor: currentTheme.card, borderColor: currentTheme.border }]}>

                {/* Thumbnail with Side Border */}
                <View style={[
                  localStyles.thumbnailWrapper,
                  {
                    backgroundColor: currentTheme.bg,
                    borderWidth: 1,
                    borderColor: currentTheme.border,
                    borderLeftWidth: 4,
                    borderLeftColor: item.status === 'scanned' ? '#6D28D9' : currentTheme.border
                  }
                ]}>
                  <TouchableOpacity
                    style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
                    activeOpacity={0.8}
                    onPress={() => {
                      if (item.type === 'document') {
                        navigation.navigate('SanitizedOcrScreen', {
                          sanitizedText: item.ocrText || "Walang text content.",
                          customTitle: getDisplayTitle(item),
                          isDocumentView: true
                        });
                      } else {
                        setSelectedImage(item.uri);
                      }
                    }}
                  >
                    {item.type === 'document' ? (
                      <Ionicons name="document-text" size={28} color={COLORS.primaryLight} />
                    ) : (
                      <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    )}
                  </TouchableOpacity>
                </View>

                {/* Content */}
                <View style={localStyles.historyContent}>
                  <View style={localStyles.historyTopRow}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => handleCardPress(item)} activeOpacity={0.7}>
                      <Text style={[localStyles.historyTitle, { color: currentTheme.text }]} numberOfLines={1}>{getDisplayTitle(item)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openRenameModal(item)} style={{ padding: 4 }}>
                      <Ionicons name="pencil" size={16} color={currentTheme.subText} />
                    </TouchableOpacity>
                  </View>

                  <View style={localStyles.historyMetaRow}>
                    <Ionicons name={item.type === 'camera' ? 'camera' : item.type === 'gallery' ? 'images' : 'document'} size={14} color={currentTheme.subText} />
                    <Text style={[localStyles.historyMetaText, { color: currentTheme.subText }]}> {item.type.toUpperCase()} • {item.date.split(',')[0]}</Text>
                  </View>

                  <View style={localStyles.historyActionsRow}>
                    <TouchableOpacity
                      style={[
                        localStyles.actionBtn,
                        item.status === 'scanned'
                          ? { backgroundColor: 'rgba(109, 40, 217, 0.1)' }
                          : { backgroundColor: '#6D28D9' }
                      ]}
                      onPress={() => handleCardPress(item)}
                    >
                      <Ionicons name={item.status === 'scanned' ? "document-text" : "sparkles"} size={14} color={item.status === 'scanned' ? '#A78BFA' : '#fff'} />
                      <Text style={[localStyles.actionBtnText, { color: item.status === 'scanned' ? '#A78BFA' : '#fff' }]}>
                        {item.status === 'scanned' ? 'View Results' : 'Analyze'}
                      </Text>
                    </TouchableOpacity>

                    {item.status === 'scanned' && (
                      <TouchableOpacity style={localStyles.iconBtn} onPress={() => handleAskAi(item)}>
                        <Ionicons name="chatbubble-ellipses" size={18} color="#F59E0B" />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={localStyles.iconBtn} onPress={() => handleDelete(item.id)}>
                      <Ionicons name="trash" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {isLoadingMore && (
          <View style={localStyles.loadingMoreBox}>
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
            <Text style={[localStyles.loadingMoreText, { color: currentTheme.subText }]}>Loading more...</Text>
          </View>
        )}

      </ScrollView>

      {/* IMAGE VIEWER MODAL */}
      <Modal visible={!!selectedImage} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)} statusBarTranslucent>
        <View style={localStyles.viewerContainer}>
          <TouchableOpacity style={localStyles.viewerCloseBtn} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={26} color="white" />
          </TouchableOpacity>
          {selectedImage && (
            <ImageViewer
              imageUrls={[{ url: selectedImage }]}
              enableSwipeDown={true}
              onSwipeDown={() => setSelectedImage(null)}
              renderIndicator={() => <View />}
              backgroundColor="transparent"
            />
          )}
        </View>
      </Modal>

      {/* RENAME MODAL */}
      <Modal visible={renameModalVisible} transparent={true} animationType="slide" onRequestClose={() => setRenameModalVisible(false)} statusBarTranslucent>
        <KeyboardAvoidingView style={localStyles.modalBackground} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[localStyles.renameBox, { backgroundColor: currentTheme.card }]}>
            <Text style={[localStyles.renameTitle, { color: currentTheme.text }]}>Rename File</Text>
            <TextInput
              style={[localStyles.renameInput, { backgroundColor: currentTheme.bg, color: currentTheme.text, borderColor: currentTheme.border }]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Enter new name"
              placeholderTextColor={currentTheme.subText}
              autoFocus
            />
            <View style={localStyles.renameActionRow}>
              <TouchableOpacity style={[localStyles.renameCancelBtn, { backgroundColor: currentTheme.bg }]} onPress={() => setRenameModalVisible(false)}>
                <Text style={{ color: currentTheme.text, fontWeight: '600' }}>Cancel</Text>
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

// 🎨 SHARP & SOLID STYLES (Joyride Vibe)
const localStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 8, // Sharp
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8, // Sharp
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
  },
  disclaimerText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: CARD_WIDTH,
    borderRadius: 8, // Sharp
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    height: 110,
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6, // 🚀 SHARPER CORNERS
    borderWidth: 1,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyList: {},
  historyCard: {
    flexDirection: 'row',
    borderRadius: 8, // Sharp
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  thumbnailWrapper: {
    width: 70,
    height: 70,
    borderRadius: 8,
    marginRight: 14,
    overflow: 'hidden',
  },
  historyContent: {
    flex: 1,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyTitle: {
    fontSize: 17, // 🚀 BIGGER FOR READABILITY
    fontWeight: 'bold',
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyMetaText: {
    fontSize: 13, // 🚀 BIGGER
  },
  historyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6, // Sharp
    gap: 6,
  },
  actionBtnText: {
    fontSize: 14, // 🚀 BIGGER
    fontWeight: 'bold',
  },
  iconBtn: {
    width: 40, // 🚕 BIGGER TOUCH TARGET
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    opacity: 0.5,
  },
  loadingMoreBox: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  loadingMoreText: {
    fontSize: 14,
    marginTop: 8,
  },

  // MODAL STYLES
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 99,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 30,
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  renameBox: {
    width: '100%',
    borderRadius: 12,
    padding: 24,
  },
  renameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  renameInput: {
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    fontSize: 16,
  },
  renameActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  renameCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  renameSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
  }
});