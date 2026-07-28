import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import ImageViewer from 'react-native-image-zoom-viewer';
import { postEndpoint, postFileEndpoint } from '../../../services/AiEngine';

// 🛠️ IMPORTS
import { globalStyles, COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert } from '../../../components/CustomAlert';
import ClauseCard from '../../../components/ClauseCard';
import { sanitizeLocalText } from '../../../utils/sanitizer';

interface AnalysisResult {
  score: number;
  riskLevel: string;
  documentTitle?: string;
  findings: Array<{
    title: string;
    description: string;
    advice: string;
    foundText: string;
    confidence?: string;
  }>;
  rag_context_used?: string;
  sanitizedText?: string;
}

export default function OfflineDetailScreen({ route, navigation }: any) {
  const { scanItem } = route.params;

  const isScanned = scanItem.status === 'scanned';
  const result: AnalysisResult = scanItem.analysisResult || { score: 100, riskLevel: 'Very Safe', findings: [] };

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDbInfo, setSelectedDbInfo] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);

  const [scoreInfoModalVisible, setScoreInfoModalVisible] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();

  const LOADING_MESSAGES = [
    "Extracting text offline...",
    "Sanitizing sensitive data locally...",
    "Connecting to Lex-Simple AI...",
    "Analyzing legal terms...",
    "Simplifying..."
  ];

  const getRiskConfig = (score: number) => {
    if (score >= 90) return { mainColor: COLORS.success, icon: 'shield-checkmark', label: 'VERY SAFE' };
    if (score >= 70) return { mainColor: COLORS.info, icon: 'thumbs-up', label: 'ACCEPTABLE' };
    if (score >= 50) return { mainColor: COLORS.warning, icon: 'warning', label: 'RISKY' };
    return { mainColor: COLORS.danger, icon: 'alert-circle', label: 'HIGH RISK' };
  };

  const themeConfig = getRiskConfig(result.score);

  const totalLostPoints = 100 - result.score;
  const baseDeduction = result.findings.length > 0 ? Math.floor(totalLostPoints / result.findings.length) : 0;
  const remainderDeduction = result.findings.length > 0 ? totalLostPoints % result.findings.length : 0;

  const showFullInfo = (item: any) => {
    setActiveTitle(item.title);
    if (!result.rag_context_used || result.rag_context_used.trim() === "") {
      setSelectedDbInfo("No matching statutory provision found in the local database.");
      setModalVisible(true);
      return;
    }

    const chunks = result.rag_context_used.split('\n---\n').map((c: string) => c.trim()).filter((c: string) => c.length > 0);
    const extractKeywords = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const findingKeywords = extractKeywords(`${item.title} ${item.description} ${item.foundText}`);

    let bestChunk = null; let highestScore = 0;
    chunks.forEach((chunk: string) => {
      const chunkLower = chunk.toLowerCase(); let score = 0;
      findingKeywords.forEach(word => { if (chunkLower.includes(word)) score++; });
      if (score > highestScore) { highestScore = score; bestChunk = chunk; }
    });

    if (bestChunk && highestScore > 0) setSelectedDbInfo(`⚖️ Statutory Provision:\n\n${bestChunk}`);
    else setSelectedDbInfo("No matching statutory provision found in the local database.");

    setModalVisible(true);
  };

  const handleFullDocDeepDive = () => {
    let fullContextData = `MGA DETALYE NG BUONG DOKUMENTO:\nComplexity Score: ${result.score}/100\nRisk Level: ${result.riskLevel}\n\nMGA NAKITANG FINDINGS:\n`;
    if (result.findings && result.findings.length > 0) {
      result.findings.forEach((f: any, i: number) => {
        fullContextData += `\n${i + 1}. ${f.title}\n   - Paliwanag: ${f.description}\n   - Payo: ${f.advice}\n`;
      });
    } else {
      fullContextData += "Walang nakitang high-risk na clauses.";
    }
    navigation.navigate('AskAiScreen', {
      attachedFile: { name: "Full Document Analysis", data: fullContextData },
      suggestedPrompts: ["Paki-summarize ang buong kontrata.", "Anong mga clauses ang pinaka-risky dito?", "Sino ang lugi sa kontratang ito?", "Ano ang mga karapatan ko rito?"]
    });
  };

  const handleClauseDeepDive = (item: any, initialPrompt?: string, dynamicPrompts?: string[], legalBasis?: string) => {
    let clauseData = `MGA DETALYE NG KLAUSULA:\n\nPamagat: ${item.title}\n\nPaliwanag ng AI: ${item.description}\n\nLegal na Payo: ${item.advice}\n\nOrihinal na Teksto:\n"${item.foundText}"`;

    if (legalBasis) {
      clauseData += `\n\nLEGAL BASIS (MULA SA DATABASE):\n${legalBasis}`;
    }

    navigation.navigate('AskAiScreen', {
      attachedFile: { name: `Clause: ${item.title}`, data: clauseData },
      initialPrompt: initialPrompt,
      suggestedPrompts: dynamicPrompts || ["Bakit ito considered risky?", "Pwede ko ba itong ipatanggal?", "Ano ang worst-case scenario dito?", "Paliwanag mo nga sa mas simpleng salita."]
    });
  };

  const getDisplayTitle = () => {
    let finalTitle = scanItem.title;
    if (isScanned && result.documentTitle) finalTitle = result.documentTitle;
    else if (isScanned && scanItem.ocrText && (scanItem.title === 'Camera Scan' || scanItem.title === 'Gallery Upload')) {
      const lines = scanItem.ocrText.split('\n').filter((line: { trim: () => { (): any; new(): any; length: number; }; }) => line.trim().length > 4);
      if (lines.length > 0) finalTitle = lines[0].trim();
    }
    return finalTitle.length > 20 ? finalTitle.substring(0, 20) + '...' : finalTitle;
  };

  const handleDelete = async () => {
    showAlert("Delete File", "Sigurado ka bang gusto mong burahin ito?", "warning", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
          if (existingHistory) {
            const historyArray = JSON.parse(existingHistory).filter((item: any) => item.id !== scanItem.id);
            await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
            navigation.goBack();
          }
        }
      }
    ]);
  };

  const handleAnalyzeOfflineFile = async () => {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) {
      showAlert("Offline Pa Rin", "Wala pa ring internet connection. Subukan ulit mamaya.", "warning");
      return;
    }

    setIsAnalyzing(true);

    try {
      if (scanItem.type === 'document') {
        const formData = new FormData();
        formData.append('file', { uri: scanItem.uri, name: scanItem.title || 'document.txt', type: 'application/octet-stream' } as any);

        // 🆕 GUMAMIT NG CENTRALIZED FILE API ENGINE
        const data = await postFileEndpoint('/simplify_file', formData);

        if (data.status === 'success') {
          setIsAnalyzing(false);
          const combinedAnalysisResult = { ...data.data, rag_context_used: data.rag_context_used, ocrText: data.extractedText || scanItem.title, sanitizedText: data.sanitizedText };

          const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
          if (existingHistory) {
            const historyArray = JSON.parse(existingHistory).map((item: any) => {
              if (item.id === scanItem.id) return { ...item, status: 'scanned', analysisResult: combinedAnalysisResult, ocrText: data.extractedText || scanItem.title };
              return item;
            });
            await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
          }
          navigation.replace('OfflineDetailScreen', { scanItem: { ...scanItem, status: 'scanned', analysisResult: combinedAnalysisResult, ocrText: data.extractedText || scanItem.title } });
        } else { throw new Error(data.message || "Failed to connect to AI."); }
      }
      else {
        const formattedUri = scanItem.uri.startsWith('file://') ? scanItem.uri : `file://${scanItem.uri}`;
        const ocrResult = await TextRecognition.recognize(formattedUri);
        if (!ocrResult.text || ocrResult.text.trim().length < 20) throw new Error("Masyadong malabo ang image para basahin ng AI.");

        const locallySanitizedText = sanitizeLocalText(ocrResult.text);

        // 🆕 GUMAMIT NG CENTRALIZED API ENGINE
        const data = await postEndpoint('/simplify', { text: locallySanitizedText });

        if (data.status === 'success') {
          setIsAnalyzing(false);
          const combinedAnalysisResult = { ...data.data, rag_context_used: data.rag_context_used, ocrText: ocrResult.text, sanitizedText: locallySanitizedText };

          const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
          if (existingHistory) {
            const historyArray = JSON.parse(existingHistory).map((item: any) => {
              if (item.id === scanItem.id) return { ...item, status: 'scanned', analysisResult: combinedAnalysisResult, ocrText: ocrResult.text };
              return item;
            });
            await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
          }
          navigation.replace('OfflineDetailScreen', { scanItem: { ...scanItem, status: 'scanned', analysisResult: combinedAnalysisResult, ocrText: ocrResult.text } });
        } else { throw new Error(data.message || "Failed to connect to AI."); }
      }
    } catch (error: any) {
      setIsAnalyzing(false);
      showAlert("Error", error.message || "Hindi ma-process ang file.", "error");
    }
  };

  if (isAnalyzing) {
    return (
      <ScreenLayout title="Processing..." showBackButton={false}>
        <ProcessingLoader title="Analyzing Document" messages={LOADING_MESSAGES} />
      </ScreenLayout>
    );
  }

  // ====================================================
  // 🟢 SCANNED UI
  // ====================================================
  if (isScanned) {
    return (
      <ScreenLayout title="Scan Results" noPadding={true}>
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
          <ScrollView contentContainerStyle={styles.sharpScrollContent} showsVerticalScrollIndicator={false}>

            <View style={[globalStyles.result_noticeBox, { marginTop: 10, marginBottom: 16 }]}>
              <Ionicons name="information-circle" size={20} color={COLORS.primaryLight} style={{ marginRight: 10 }} />
              <Text style={globalStyles.result_noticeText}>
                <Text style={{ fontWeight: 'bold', color: 'white' }}>UPL Notice: </Text> Ang Lex-Simple ay isang AI Legal Literacy Tool at hindi pamalit sa payo ng abogado.
              </Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} onPress={() => setScoreInfoModalVisible(true)} style={[globalStyles.result_scoreCard, { borderColor: themeConfig.mainColor, marginBottom: 16 }]}>
              <View style={globalStyles.result_scoreHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={globalStyles.result_scoreLabel}>COMPLEXITY SCORE</Text>
                  <View style={{ paddingLeft: 6, paddingRight: 8 }}>
                    <Ionicons name="information-circle-outline" size={16} color={COLORS.textMuted} />
                  </View>
                </View>
                <View style={[globalStyles.result_riskBadge, { backgroundColor: themeConfig.mainColor }]}>
                  <Ionicons name={themeConfig.icon as any} size={12} color="white" style={{ marginRight: 4 }} />
                  <Text style={globalStyles.result_riskBadgeText}>{themeConfig.label}</Text>
                </View>
              </View>
              <View style={globalStyles.result_scoreCircleWrapper}>
                <Text style={[globalStyles.result_scoreNumber, { color: themeConfig.mainColor }]}>{result.score}</Text>
                <Text style={globalStyles.result_scoreMax}>/100</Text>
              </View>
              <Text style={globalStyles.result_scoreDesc}>
                May nakita kaming <Text style={{ fontWeight: 'bold', color: themeConfig.mainColor }}>{result.findings.length} finding/s</Text> na nakaapekto sa iyong complexity score.
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tap to view score breakdown</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[globalStyles.result_noticeBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', marginBottom: 20 }]}
              onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: result.sanitizedText })}
            >
              <Ionicons name="shield-checkmark" size={28} color={COLORS.success} style={{ marginRight: 15 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>DPA Compliant Pipeline</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, lineHeight: 16 }}>Tap to view the sanitized OCR data sent to the AI.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.success} />
            </TouchableOpacity>

            <Text style={globalStyles.result_sectionTitle}>CLAUSE ANALYSIS</Text>

            {result.findings.length === 0 ? (
              <View style={[globalStyles.result_emptyStateBox, { marginTop: 10 }]}>
                <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
                <Text style={globalStyles.result_emptyStateText}>Napakaganda ng kontrata! Walang nakitang kahina-hinalang clause ang system.</Text>
              </View>
            ) : (
              result.findings.map((item, index) => (
                <View key={index} style={{ marginBottom: 16 }}>
                  <ClauseCard
                    item={item}
                    themeConfig={themeConfig}
                    ragContext={result.rag_context_used}
                    onShowLegalBasis={showFullInfo}
                    onAskAiDeepDive={handleClauseDeepDive}
                  />
                </View>
              ))
            )}
          </ScrollView>
        </View>

        <TouchableOpacity style={styles.fabButton} onPress={handleFullDocDeepDive}>
          <Ionicons name="sparkles" size={26} color="white" />
        </TouchableOpacity>

        <Modal animationType="fade" transparent={true} visible={scoreInfoModalVisible} onRequestClose={() => setScoreInfoModalVisible(false)} statusBarTranslucent>
          <View style={globalStyles.result_modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setScoreInfoModalVisible(false)} />

            <View style={[globalStyles.result_modalCenterBox, { maxHeight: '85%' }]}>
              <View style={globalStyles.result_modalHeaderArea}>
                <View style={globalStyles.result_modalHeaderTitleArea}>
                  <Ionicons name="receipt" size={20} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
                  <Text style={globalStyles.result_modalTitleText} numberOfLines={1}>Score Breakdown</Text>
                </View>
                <TouchableOpacity onPress={() => setScoreInfoModalVisible(false)} style={globalStyles.detailModal_closeBtn}>
                  <Ionicons name="close" size={18} color="white" />
                </TouchableOpacity>
              </View>
              <ScrollView style={globalStyles.result_modalBodyArea} showsVerticalScrollIndicator={true}>
                <View style={{ backgroundColor: '#0a0a0a', padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e293b', paddingBottom: 15, marginBottom: 15 }}>
                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Starting Score</Text>
                    <Text style={{ color: COLORS.success, fontWeight: '900', fontSize: 16 }}>100</Text>
                  </View>
                  {result.findings.length > 0 ? (
                    result.findings.map((f, i) => {
                      const itemDeduction = baseDeduction + (i === 0 ? remainderDeduction : 0);
                      return (
                        <View key={i} style={{ marginBottom: 18 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Text style={{ color: '#cbd5e1', fontSize: 13, fontWeight: 'bold', flex: 1, paddingRight: 10, lineHeight: 20 }}>{f.title}</Text>
                            <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: '900' }}>-{itemDeduction}</Text>
                          </View>
                          <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4, lineHeight: 18 }} numberOfLines={3}>
                            Bakit: {f.description}
                          </Text>
                        </View>
                      )
                    })
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} style={{ marginRight: 6 }} />
                      <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: 'bold' }}>Walang nakitang penalty points.</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 15, borderTopWidth: 1, borderTopColor: '#1e293b', marginTop: 5 }}>
                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>Final Score</Text>
                    <Text style={{ color: themeConfig.mainColor, fontWeight: '900', fontSize: 22 }}>{result.score}</Text>
                  </View>
                </View>
                <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 10, paddingBottom: 30, lineHeight: 16 }}>
                  Ang computation na ito ay base sa AI analysis.
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)} statusBarTranslucent>
          <View style={globalStyles.result_modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
            <View style={[globalStyles.result_modalCenterBox, { maxHeight: '85%' }]}>
              <View style={globalStyles.result_modalHeaderArea}>
                <View style={globalStyles.result_modalHeaderTitleArea}>
                  <Ionicons name="document-text" size={20} color={themeConfig.mainColor} style={{ marginRight: 8 }} />
                  <Text style={globalStyles.result_modalTitleText} numberOfLines={1}>{activeTitle}</Text>
                </View>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={globalStyles.detailModal_closeBtn}>
                  <Ionicons name="close" size={18} color="white" />
                </TouchableOpacity>
              </View>
              <ScrollView style={globalStyles.result_modalBodyArea} showsVerticalScrollIndicator={true}>
                <View style={styles.documentPaper}>
                  <Text style={[styles.justifiedText, selectedDbInfo?.includes("No matching") ? globalStyles.result_errorItalicText : undefined]}>
                    {selectedDbInfo}
                  </Text>
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </Modal>

        <AlertRender />
      </ScreenLayout>
    );
  }

  // ====================================================
  // 🔴 UN-SCANNED UI 
  // ====================================================
  return (
    <ScreenLayout title="File Details" noPadding={true}>
      <ScrollView contentContainerStyle={styles.sharpScrollContent} showsVerticalScrollIndicator={false}>

        {scanItem.type === 'document' ? (
          <TouchableOpacity
            style={styles.sharpDocWrapper}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: sanitizeLocalText(scanItem.ocrText || ""), isOfflinePreview: true })}
          >
            <View style={globalStyles.offline_docIconBox}>
              <Ionicons name="document-text" size={40} color={COLORS.primaryLight} />
            </View>
            <View style={globalStyles.offline_docInfoBox}>
              <Text style={globalStyles.offline_docNameText} numberOfLines={1}>{getDisplayTitle()}</Text>
              <Text style={globalStyles.offline_docDescText}>Tap to preview sanitized content</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.sharpImageWrapper} activeOpacity={0.9} onPress={() => setFullscreenImage(scanItem.uri)}>
            <Image source={{ uri: scanItem.uri }} style={globalStyles.offline_image} resizeMode="cover" />
            <View style={globalStyles.offline_fullscreenIconOverlay}><Ionicons name="expand" size={20} color="white" /></View>
          </TouchableOpacity>
        )}

        <View style={styles.sharpHeader}>
          <View style={globalStyles.offline_badgeUnscanned}>
            <Text style={globalStyles.offline_badgeText}>UN-SCANNED FILE</Text>
          </View>
          <Text style={globalStyles.offline_title}>{getDisplayTitle()}</Text>
          <View style={globalStyles.offline_tagsRow}>
            <View style={globalStyles.offline_tagPill}>
              <Ionicons name="scan-circle-outline" size={14} color={COLORS.textMuted} />
              <Text style={globalStyles.offline_tagText}>{scanItem.type.toUpperCase()}</Text>
            </View>
            <View style={globalStyles.offline_tagPill}>
              <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
              <Text style={globalStyles.offline_tagText}>{scanItem.date.split(',')[0]}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[globalStyles.result_noticeBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', marginTop: 10, paddingVertical: 18 }]}
          onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: sanitizeLocalText(scanItem.ocrText || ""), isOfflinePreview: true })}
        >
          <Ionicons name="shield-checkmark" size={28} color={COLORS.success} style={{ marginRight: 15 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>DPA Compliant Pipeline</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 11, lineHeight: 16 }}>Tap to see how your device cleans sensitive info before sending it online.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.success} />
        </TouchableOpacity>

        <View style={[globalStyles.offline_offlineNoticeBox, { marginTop: 16, marginBottom: 24 }]}>
          <Ionicons name="cloud-offline" size={24} color={COLORS.warning} style={{ marginRight: 12 }} />
          <Text style={globalStyles.offline_offlineNoticeText}>
            Ang file na ito ay naka-save nang offline. I-connect sa internet at i-tap ang Analyze Now para ipasa kay Lex-Simple AI.
          </Text>
        </View>

        <View style={styles.sharpActionRow}>
          <TouchableOpacity style={globalStyles.offline_actionBtnPrimary} onPress={handleAnalyzeOfflineFile}>
            <Ionicons name="sparkles" size={20} color="white" style={{ marginRight: 8 }} />
            <Text style={globalStyles.offline_btnText}>Analyze Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={globalStyles.offline_actionBtnDanger} onPress={handleDelete}>
            <Ionicons name="trash" size={20} color={COLORS.danger} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      <Modal visible={!!fullscreenImage} transparent={true} animationType="fade" onRequestClose={() => setFullscreenImage(null)} statusBarTranslucent>
        <View style={styles.fullscreenDarkOverlay}>
          <TouchableOpacity style={styles.fullscreenCloseBtn} onPress={() => setFullscreenImage(null)}>
            <Ionicons name="close" size={26} color="white" />
          </TouchableOpacity>
          {fullscreenImage && (
            <ImageViewer
              imageUrls={[{ url: fullscreenImage }]}
              enableSwipeDown={true}
              onSwipeDown={() => setFullscreenImage(null)}
              renderIndicator={() => <View />}
              backgroundColor="transparent"
            />
          )}
        </View>
      </Modal>

      <AlertRender />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  sharpScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  sharpImageWrapper: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  sharpDocWrapper: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  sharpHeader: {
    marginBottom: 12,
  },
  sharpActionRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  fullscreenDarkOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center'
  },
  fullscreenCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 999,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 25
  },
  fabButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: COLORS.primaryLight,
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 999
  },
  documentPaper: {
    backgroundColor: '#1E1E2E',
    padding: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginVertical: 15
  },
  justifiedText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'left',
    letterSpacing: 0,
  }
});