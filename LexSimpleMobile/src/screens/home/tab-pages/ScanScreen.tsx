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
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageViewer from 'react-native-image-zoom-viewer';

import { globalStyles, COLORS } from '../../../theme/globalStyles';
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

export default function ScanScreen({ navigation }: any) {
  const [historyItems, setHistoryItems] = useState<ScanHistoryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'scanned' | 'unscanned'>('all');

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [itemToRename, setItemToRename] = useState<ScanHistoryItem | null>(null);
  const [newTitle, setNewTitle] = useState("");

  const ITEMS_PER_PAGE = 5;
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();

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
    return finalTitle.length > 20 ? finalTitle.substring(0, 20) + '...' : finalTitle;
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
        style: "destructive",
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
    <View style={globalStyles.home_container}>
      <ScrollView
        contentContainerStyle={globalStyles.home_scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* HEADER */}
        <View style={globalStyles.home_header}>
          <Text style={globalStyles.home_headerTitle}>Lex-Simple</Text>
          <TouchableOpacity style={globalStyles.home_settingsBtn} onPress={showLegalInfo}>
            <Ionicons name="information-circle-outline" size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* DISCLAIMER */}
        <View style={globalStyles.home_disclaimerBox}>
          <Ionicons name="shield-checkmark" size={20} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
          <Text style={globalStyles.home_disclaimerText}><Text style={{ fontWeight: 'bold', color: 'white' }}>UPL Notice: </Text>Legal Literacy Tool lang ito. Hindi pamalit sa abogado.</Text>
        </View>

        {/* GRID ACTIONS */}
        <View style={globalStyles.home_gridContainer}>
          <TouchableOpacity style={[globalStyles.home_gridItem, globalStyles.home_gridItemScan]} onPress={() => navigation.navigate('ScannerScreen')}>
            <View style={globalStyles.home_iconWrapperAsk}><Ionicons name="scan" size={24} color="white" /></View>
            <Text style={globalStyles.home_gridTitleWhite}>Scan</Text>
            <Text style={globalStyles.home_gridSubtitleWhite}>Camera & Docs</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[globalStyles.home_gridItem, globalStyles.home_gridItemUpload]} onPress={() => navigation.navigate('UploadImageScreen')}>
            <View style={globalStyles.home_iconWrapperUpload}><Ionicons name="image-outline" size={22} color="#60a5fa" /></View>
            <Text style={globalStyles.home_gridTitle}>Upload</Text>
            <Text style={globalStyles.home_gridSubtitle}>Photos & Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[globalStyles.home_gridItem, globalStyles.home_gridItemConvert]} onPress={() => navigation.navigate('ConvertScreen')}>
            <View style={globalStyles.home_iconWrapperConvert}><Ionicons name="document-text-outline" size={22} color="#a78bfa" /></View>
            <Text style={globalStyles.home_gridTitle}>Convert</Text>
            <Text style={globalStyles.home_gridSubtitle}>PDF, Word, TXT</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[globalStyles.home_gridItem, globalStyles.home_gridItemAsk]} onPress={() => navigation.navigate('AskAiScreen')}>
            <View style={globalStyles.home_iconWrapperAsk}><Ionicons name="hardware-chip-outline" size={22} color="#2dd4bf" /></View>
            <Text style={globalStyles.home_gridTitle}>Ask AI</Text>
            <Text style={globalStyles.home_gridSubtitle}>Chat & Analyze</Text>
          </TouchableOpacity>
        </View>

        <Text style={globalStyles.home_sectionTitle}>RECENT FILES</Text>

        {/* FILTER CHIPS */}
        <View style={globalStyles.home_filterRow}>
          <TouchableOpacity style={[globalStyles.home_filterChip, activeFilter === 'all' && globalStyles.home_filterChipActive]} onPress={() => setActiveFilter('all')}>
            <Text style={[globalStyles.home_filterText, activeFilter === 'all' && globalStyles.home_filterTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[globalStyles.home_filterChip, activeFilter === 'scanned' && globalStyles.home_filterChipActive]} onPress={() => setActiveFilter('scanned')}>
            <Text style={[globalStyles.home_filterText, activeFilter === 'scanned' && globalStyles.home_filterTextActive]}>Scanned</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[globalStyles.home_filterChip, activeFilter === 'unscanned' && globalStyles.home_filterChipActive]} onPress={() => setActiveFilter('unscanned')}>
            <Text style={[globalStyles.home_filterText, activeFilter === 'unscanned' && globalStyles.home_filterTextActive]}>Unscanned</Text>
          </TouchableOpacity>
        </View>

        {/* HISTORY LIST */}
        <View style={globalStyles.home_historyListWrapper}>
          {filteredHistory.length === 0 ? (
            <View style={{ alignItems: 'center', padding: 30, opacity: 0.5 }}>
              <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
              <Text style={{ color: COLORS.textMuted, marginTop: 10, fontSize: 14 }}>No recent files found.</Text>
            </View>
          ) : (
            displayedHistory.map((item) => (
              <View key={item.id} style={globalStyles.home_historyCard}>

                <TouchableOpacity
                  style={[globalStyles.home_imageContainer, styles.thumbnailFixed]}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (item.type === 'document') {
                      // 💡 THE FIX: Navigate sa Text Viewer Screen imbes na Modal! (DRY Principle)
                      navigation.navigate('SanitizedOcrScreen', {
                        sanitizedText: item.ocrText || "Walang text content.",
                        customTitle: getDisplayTitle(item),
                        isDocumentView: true // Itatago yung DPA Redaction Warning
                      });
                    } else {
                      setSelectedImage(item.uri);
                    }
                  }}
                >
                  {item.type === 'document' ? (
                    <View style={styles.docPlaceholder}>
                      <Ionicons name="document-text" size={20} color={COLORS.primaryLight} />
                      <Text style={globalStyles.home_docThumbText}>DOC</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: item.uri }} style={styles.thumbnailImg} resizeMode="cover" />
                  )}
                </TouchableOpacity>

                <View style={globalStyles.home_historyTextContent}>
                  <View style={globalStyles.home_titleRow}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => handleCardPress(item)} activeOpacity={0.7}>
                      <Text style={globalStyles.home_historyName} numberOfLines={1}>{getDisplayTitle(item)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openRenameModal(item)} style={globalStyles.home_renameIconBtn}>
                      <Ionicons name="pencil" size={12} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={() => handleCardPress(item)} activeOpacity={0.7}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Ionicons name={item.type === 'camera' ? 'camera' : item.type === 'gallery' ? 'images' : 'document'} size={10} color={COLORS.textMuted} />
                      <Text style={globalStyles.home_historyDate}> Source: {item.type.toUpperCase()} • {item.date.split(',')[0]}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={globalStyles.home_historyActions}>
                    <TouchableOpacity
                      style={[globalStyles.home_historyMiniBtn, item.status === 'scanned' ? { backgroundColor: 'rgba(129, 140, 248, 0.15)', borderColor: COLORS.primaryLight } : { backgroundColor: COLORS.primary, borderWidth: 0 }]}
                      onPress={() => handleCardPress(item)}
                    >
                      <Ionicons name={item.status === 'scanned' ? "document-text" : "sparkles"} size={12} color={item.status === 'scanned' ? COLORS.primaryLight : 'white'} />
                      <Text style={[globalStyles.home_historyMiniBtnText, { color: item.status === 'scanned' ? COLORS.primaryLight : 'white' }]}>
                        {item.status === 'scanned' ? 'View Results' : 'Analyze'}
                      </Text>
                    </TouchableOpacity>

                    {item.status === 'scanned' && (
                      <TouchableOpacity style={globalStyles.home_iconOnlyBtn} onPress={() => handleAskAi(item)}>
                        <Ionicons name="hardware-chip" size={14} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={globalStyles.home_iconOnlyBtn} onPress={() => handleDelete(item.id)}>
                      <Ionicons name="trash" size={14} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={globalStyles.home_badgeWrapper}>
                    <View style={[globalStyles.home_statusBadge, item.status === 'scanned' ? globalStyles.home_badgeScanned : globalStyles.home_badgePending]}>
                      <Text style={[globalStyles.home_badgeText, item.status === 'scanned' ? { color: COLORS.success } : { color: COLORS.warning }]}>{item.status === 'scanned' ? 'SCANNED' : 'UN-SCANNED'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {isLoadingMore && (
          <View style={styles.loadingMoreBox}>
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
            <Text style={styles.loadingMoreText}>Loading more items...</Text>
          </View>
        )}

        {!isLoadingMore && displayedHistory.length > 0 && visibleCount >= filteredHistory.length && (
          <View style={styles.bottomReachedBox}>
            <Text style={styles.bottomReachedText}>You are already at the bottom.</Text>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* 🖼️ IMAGE VIEWER MODAL ONLY (Tinanggal na ang Text Preview Modal) */}
      <Modal visible={!!selectedImage} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)} statusBarTranslucent>
        <View style={styles.viewerContainer}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedImage(null)}>
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
        <KeyboardAvoidingView style={globalStyles.home_modalBackground} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={globalStyles.home_renameBox}>
            <Text style={globalStyles.home_renameTitle}>Rename File</Text>
            <TextInput style={globalStyles.home_renameInput} value={newTitle} onChangeText={setNewTitle} placeholder="Enter new name" placeholderTextColor={COLORS.textMuted} autoFocus />
            <View style={globalStyles.home_renameActionRow}>
              <TouchableOpacity style={globalStyles.home_renameCancelBtn} onPress={() => setRenameModalVisible(false)}><Text style={globalStyles.home_renameCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={globalStyles.home_renameSaveBtn} onPress={saveRenamedTitle}><Text style={globalStyles.home_renameSaveText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AlertRender />
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnailFixed: {
    width: 80,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1e293b'
  },
  thumbnailImg: {
    width: '100%',
    height: '100%'
  },
  docPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)'
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 99,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 30
  },
  loadingMoreBox: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingMoreText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 8
  },
  bottomReachedBox: {
    paddingVertical: 15,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bottomReachedText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontStyle: 'italic'
  }
});