import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView, Modal, Pressable, Platform, StyleSheet, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import ImageViewer from 'react-native-image-zoom-viewer';
import { postEndpoint, postFileEndpoint } from '../../../services/AiEngine';

import { COLORS, globalStyles } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert } from '../../../components/CustomAlert';
import ClauseCard from '../../../components/ClauseCard';
import { sanitizeLocalText } from '../../../utils/sanitizer';
import { useTheme } from '../../../theme/ThemeContext';

interface AnalysisResult {
  score: number;
  riskLevel: string;
  documentTitle?: string;
  findings: Array<{ title: string; description: string; advice: string; foundText: string; confidence?: string; }>;
  rag_context_used?: string;
  sanitizedText?: string;
}

// 🚀 EXPANDABLE FINDING COMPONENT
const ExpandableFinding = ({ f, itemDeduction, T }: any) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongText = f.description.length > 80;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ color: T.text, fontSize: 13, fontWeight: 'bold', flex: 1, paddingRight: 10, lineHeight: 20 }}>{f.title}</Text>
        <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: '900' }}>-{itemDeduction}</Text>
      </View>
      <Text style={{ color: T.subText, fontSize: 11, marginTop: 4, lineHeight: 18 }} numberOfLines={isExpanded ? undefined : 3}>
        Bakit: {f.description}
      </Text>
      {isLongText && (
        <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={{ marginTop: 4, alignSelf: 'flex-start' }}>
          <Text style={{ color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
            {isExpanded ? 'See Less' : 'See More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function OfflineDetailScreen({ route, navigation }: any) {
  // 🚀 SAFE CHECK: KUNG WALANG scanItem, IBALIK AGAD SA HOME PARA HINDI MAG-CRASH
  const scanItem = route?.params?.scanItem;

  if (!scanItem) {
    return (
      <ScreenLayout title="Error">
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
          <Text style={{ color: '#fff', marginBottom: 20 }}>Hindi mahanap ang file.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Main', { screen: 'Scan' })} style={{ backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Bumalik sa Home</Text>
          </TouchableOpacity>
        </View>
      </ScreenLayout>
    );
  }

  const isScanned = scanItem.status === 'scanned';
  const result: AnalysisResult = scanItem.analysisResult || { score: 100, riskLevel: 'Very Safe', findings: [] };

  // 🚀 LOCAL STATE NA LANG PARA HINDI MAG-FREEZE
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDbInfo, setSelectedDbInfo] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [scoreInfoModalVisible, setScoreInfoModalVisible] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const { isDarkMode, colors: T } = useTheme();

  const LOADING_MESSAGES = ["Extracting text offline...", "Sanitizing sensitive data locally...", "Connecting to Lex-Simple AI...", "Analyzing legal terms...", "Simplifying..."];

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
    if (bestChunk && highestScore > 0) setSelectedDbInfo(`Statutory Provision:\n\n${bestChunk}`);
    else setSelectedDbInfo("No matching statutory provision found in the local database.");
    setModalVisible(true);
  };

  const handleFullDocDeepDive = () => {
    let fullContextData = `MGA DETALYE NG BUONG DOKUMENTO:\nComplexity Score: ${result.score}/100\nRisk Level: ${result.riskLevel}\n\nMGA NAKITANG FINDINGS:\n`;
    if (result.findings && result.findings.length > 0) result.findings.forEach((f: any, i: number) => { fullContextData += `\n${i + 1}. ${f.title}\n   - Paliwanag: ${f.description}\n   - Payo: ${f.advice}\n`; });
    else fullContextData += "Walang nakitang high-risk na clauses.";
    navigation.navigate('AskAiScreen', { attachedFile: { name: "Full Document Analysis", data: fullContextData }, suggestedPrompts: ["Paki-summarize ang buong kontrata.", "Anong mga clauses ang pinaka-risky dito?", "Sino ang lugi sa kontratang ito?", "Ano ang mga karapatan ko rito?"] });
  };

  const handleClauseDeepDive = (item: any, initialPrompt?: string, dynamicPrompts?: string[], legalBasis?: string) => {
    let clauseData = `MGA DETALYE NG KLAUSULA:\n\nPamagat: ${item.title}\n\nPaliwanag ng AI: ${item.description}\n\nLegal na Payo: ${item.advice}\n\nOrihinal na Teksto:\n"${item.foundText}"`;
    if (legalBasis) clauseData += `\n\nLEGAL BASIS (MULA SA DATABASE):\n${legalBasis}`;
    navigation.navigate('AskAiScreen', { attachedFile: { name: `Clause: ${item.title}`, data: clauseData }, initialPrompt: initialPrompt, suggestedPrompts: dynamicPrompts || ["Bakit ito considered risky?", "Pwede ko ba itong ipatanggal?", "Ano ang worst-case scenario dito?", "Paliwanag mo nga sa mas simpleng salita."] });
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
        text: "Delete", style: "destructive", onPress: async () => {
          const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
          if (existingHistory) { const historyArray = JSON.parse(existingHistory).filter((item: any) => item.id !== scanItem.id); await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray)); navigation.goBack(); }
        }
      }
    ]);
  };

  const handleAnalyzeOfflineFile = async () => {
    const networkState = await Network.getNetworkStateAsync();
    if (!networkState.isConnected) { showAlert("Offline Pa Rin", "Wala pa ring internet connection. Subukan ulit mamaya.", "warning"); return; }

    setIsAnalyzing(true); // 🚀 LOCAL LOADING STATE LANG
    try {
      let combinedAnalysisResult: any = null;

      if (scanItem.type === 'document') {
        const formData = new FormData();
        formData.append('file', { uri: scanItem.uri, name: scanItem.title || 'document.txt', type: 'application/octet-stream' } as any);
        const data = await postFileEndpoint('/simplify_file', formData);

        if (data && data.status === 'success') {
          combinedAnalysisResult = { ...data.data, rag_context_used: data.rag_context_used, ocrText: data.extractedText || scanItem.title, sanitizedText: data.sanitizedText };
        } else {
          throw new Error(data?.message || "Failed to connect to AI.");
        }
      } else {
        const formattedUri = scanItem.uri.startsWith('file://') ? scanItem.uri : `file://${scanItem.uri}`;
        const ocrResult = await TextRecognition.recognize(formattedUri);
        if (!ocrResult.text || ocrResult.text.trim().length < 20) throw new Error("Masyadong malabo ang image para basahin ng AI.");

        const locallySanitizedText = sanitizeLocalText(ocrResult.text);
        const data = await postEndpoint('/simplify', { text: locallySanitizedText });

        if (data && data.status === 'success') {
          combinedAnalysisResult = { ...data.data, rag_context_used: data.rag_context_used, ocrText: ocrResult.text, sanitizedText: locallySanitizedText };
        } else {
          throw new Error(data?.message || "Failed to connect to AI.");
        }
      }

      // SAVE TO HISTORY
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      if (existingHistory) {
        const historyArray = JSON.parse(existingHistory).map((item: any) => {
          if (item.id === scanItem.id) return { ...item, status: 'scanned', analysisResult: combinedAnalysisResult, ocrText: combinedAnalysisResult.ocrText };
          return item;
        });
        await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
      }

      setIsAnalyzing(false);
      // 🚀 DIRECT REPLACE PARA HINDI NA BALIK SA OFFLINE SCREEN
      navigation.replace('ResultScreen', { analysisResult: combinedAnalysisResult });

    } catch (error: any) {
      setIsAnalyzing(false);
      showAlert("Error", error.message || "Hindi ma-process ang file.", "error");
    }
  };

  // 🟢 ANALYZING UI (LOCAL)
  if (isAnalyzing) {
    return (
      <ScreenLayout title="Processing..." showBackButton={false}>
        <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <ProcessingLoader
            title="Analyzing Document"
            messages={LOADING_MESSAGES}
          />
        </View>
      </ScreenLayout>
    );
  }

  // 🟢 SCANNED UI
  if (isScanned) {
    return (
      <ScreenLayout title="Scan Results" noPadding={true}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <View style={{ flex: 1, backgroundColor: T.bg }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

            <View style={[globalStyles.result_noticeBox, { backgroundColor: T.card, borderColor: T.border, marginBottom: 16 }]}>
              <Ionicons name="information-circle" size={20} color={COLORS.primaryLight} style={{ marginRight: 10 }} />
              <Text style={[globalStyles.result_noticeText, { color: T.subText }]}>
                <Text style={{ fontWeight: 'bold', color: T.text }}>UPL Notice: </Text> Ang Lex-Simple ay isang AI Legal Literacy Tool at hindi pamalit sa payo ng abogado.
              </Text>
            </View>

            <TouchableOpacity activeOpacity={0.8} onPress={() => setScoreInfoModalVisible(true)} style={[globalStyles.result_scoreCard, { backgroundColor: T.card, borderColor: themeConfig.mainColor, marginBottom: 16 }]}>
              <View style={globalStyles.result_scoreHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={[globalStyles.result_scoreLabel, { color: T.subText }]}>COMPLEXITY SCORE</Text>
                  <View style={{ paddingLeft: 6, paddingRight: 8 }}><Ionicons name="information-circle-outline" size={16} color={T.subText} /></View>
                </View>
                <View style={[globalStyles.result_riskBadge, { backgroundColor: themeConfig.mainColor }]}>
                  <Ionicons name={themeConfig.icon as any} size={12} color="white" style={{ marginRight: 4 }} /><Text style={globalStyles.result_riskBadgeText}>{themeConfig.label}</Text>
                </View>
              </View>
              <View style={globalStyles.result_scoreCircleWrapper}>
                <Text style={[globalStyles.result_scoreNumber, { color: themeConfig.mainColor }]}>{result.score}</Text>
                <Text style={[globalStyles.result_scoreMax, { color: T.subText }]}>/100</Text>
              </View>
              <Text style={[globalStyles.result_scoreDesc, { color: T.subText }]}>May nakita kaming <Text style={{ fontWeight: 'bold', color: themeConfig.mainColor }}>{result.findings.length} finding/s</Text> na nakaapekto sa iyong complexity score.</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tap to view score breakdown</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[globalStyles.result_noticeBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', marginBottom: 20 }]} onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: result.sanitizedText })}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: T.text, fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>DPA Compliant Pipeline</Text>
                <Text style={{ color: T.subText, fontSize: 11, lineHeight: 16 }}>Tap to view the sanitized OCR data sent to the AI.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.success} />
            </TouchableOpacity>

            <Text style={[globalStyles.result_sectionTitle, { color: T.text }]}>CLAUSE ANALYSIS</Text>

            {result.findings.length === 0 ? (
              <View style={[globalStyles.result_emptyStateBox, { backgroundColor: T.card, borderColor: T.border, marginTop: 10 }]}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />
                <Text style={[globalStyles.result_emptyStateText, { color: T.subText }]}>Napakaganda ng kontrata! Walang nakitang kahina-hinalang clause ang system.</Text>
              </View>
            ) : (
              result.findings.map((item, index) => (<View key={index} style={{ marginBottom: 12 }}><ClauseCard item={item} themeConfig={themeConfig} ragContext={result.rag_context_used} onShowLegalBasis={showFullInfo} onAskAiDeepDive={handleClauseDeepDive} /></View>))
            )}
          </ScrollView>
        </View>

        <TouchableOpacity style={uiStyles.fabButton} onPress={handleFullDocDeepDive}>
          <Ionicons name="sparkles" size={24} color="white" />
        </TouchableOpacity>

        {/* SCORE BREAKDOWN MODAL */}
        <Modal animationType="fade" transparent={true} visible={scoreInfoModalVisible} onRequestClose={() => setScoreInfoModalVisible(false)} statusBarTranslucent>
          <View style={globalStyles.result_modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setScoreInfoModalVisible(false)} />
            <View style={[globalStyles.result_modalCenterBox, { backgroundColor: T.card, borderColor: T.border, borderRadius: 12 }]}>
              <View style={[globalStyles.result_modalHeaderArea, { backgroundColor: T.bg, borderBottomColor: T.border }]}>
                <View style={globalStyles.result_modalHeaderTitleArea}><Ionicons name="receipt" size={20} color={COLORS.primaryLight} style={{ marginRight: 8 }} /><Text style={[globalStyles.result_modalTitleText, { color: T.text }]} numberOfLines={1}>Score Breakdown</Text></View>
                <TouchableOpacity onPress={() => setScoreInfoModalVisible(false)} style={globalStyles.detailModal_closeBtn}><Ionicons name="close" size={18} color={T.text} /></TouchableOpacity>
              </View>
              <ScrollView style={globalStyles.result_modalBodyArea} showsVerticalScrollIndicator={true}>
                <View style={{ backgroundColor: T.bg, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginBottom: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 12, marginBottom: 12 }}>
                    <Text style={{ color: T.text, fontWeight: 'bold', fontSize: 14 }}>Starting Score</Text>
                    <Text style={{ color: COLORS.success, fontWeight: '900', fontSize: 16 }}>100</Text>
                  </View>
                  {result.findings.length > 0 ? (
                    result.findings.map((f, i) => {
                      const itemDeduction = baseDeduction + (i === 0 ? remainderDeduction : 0);
                      return <ExpandableFinding key={i} f={f} itemDeduction={itemDeduction} T={T} />;
                    })
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}><Ionicons name="checkmark-circle" size={16} color={COLORS.success} style={{ marginRight: 6 }} /><Text style={{ color: COLORS.success, fontSize: 13, fontWeight: 'bold' }}>Walang nakitang penalty points.</Text></View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border, marginTop: 4 }}>
                    <Text style={{ color: T.text, fontWeight: '900', fontSize: 16 }}>Final Score</Text>
                    <Text style={{ color: themeConfig.mainColor, fontWeight: '900', fontSize: 22 }}>{result.score}</Text>
                  </View>
                </View>
                <Text style={{ color: T.subText, fontSize: 11, textAlign: 'center', fontStyle: 'italic', paddingHorizontal: 10, paddingBottom: 20, lineHeight: 16 }}>Ang computation na ito ay base sa AI analysis.</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* LEGAL BASIS MODAL */}
        <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)} statusBarTranslucent>
          <View style={globalStyles.result_modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
            <View style={[globalStyles.result_modalCenterBox, { backgroundColor: T.card, borderColor: T.border, borderRadius: 12 }]}>
              <View style={[globalStyles.result_modalHeaderArea, { backgroundColor: T.bg, borderBottomColor: T.border }]}>
                <View style={globalStyles.result_modalHeaderTitleArea}><Ionicons name="document-text" size={20} color={themeConfig.mainColor} style={{ marginRight: 8 }} /><Text style={[globalStyles.result_modalTitleText, { color: T.text }]} numberOfLines={1}>{activeTitle}</Text></View>
                <TouchableOpacity onPress={() => setModalVisible(false)} style={globalStyles.detailModal_closeBtn}><Ionicons name="close" size={18} color={T.text} /></TouchableOpacity>
              </View>
              <ScrollView style={globalStyles.result_modalBodyArea} showsVerticalScrollIndicator={true}>
                <View style={{ backgroundColor: T.bg, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: T.border, marginVertical: 10 }}>
                  <Text style={{ color: T.text, fontSize: 14, lineHeight: 22, textAlign: 'left' }} numberOfLines={selectedDbInfo?.includes("No matching") ? undefined : undefined}>
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

  // 🔴 UN-SCANNED UI
  return (
    <ScreenLayout title="File Details" noPadding={true}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {scanItem.type === 'document' ? (
          <TouchableOpacity style={{ width: '100%', borderRadius: 10, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, marginBottom: 16, flexDirection: 'row', alignItems: 'center', padding: 12 }} activeOpacity={0.8} onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: sanitizeLocalText(scanItem.ocrText || ""), isOfflinePreview: true })}>
            <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: 'rgba(167, 139, 250, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}><Ionicons name="document-text" size={24} color={COLORS.primaryLight} /></View>
            <View style={{ flex: 1 }}><Text style={{ color: T.text, fontSize: 15, fontWeight: 'bold', marginBottom: 2 }} numberOfLines={1}>{getDisplayTitle()}</Text><Text style={{ color: T.subText, fontSize: 11 }}>Tap to preview sanitized content</Text></View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={{ width: '100%', height: 200, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: T.border, marginBottom: 16 }} activeOpacity={0.9} onPress={() => setFullscreenImage(scanItem.uri)}>
            <Image source={{ uri: scanItem.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 }}><Ionicons name="expand" size={16} color="white" /></View>
          </TouchableOpacity>
        )}

        <View style={{ marginBottom: 12 }}>
          <View style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(245, 158, 11, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: COLORS.warning, marginBottom: 8 }}>
            <Text style={{ color: COLORS.warning, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 }}>UN-SCANNED FILE</Text>
          </View>
          <Text style={{ color: T.text, fontSize: 20, fontWeight: '900', marginBottom: 8 }}>{getDisplayTitle()}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 }}>
              <Ionicons name="scan-circle-outline" size={12} color={T.subText} /><Text style={{ color: '#CBD5E1', fontSize: 10, fontWeight: 'bold', marginLeft: 4 }}>{scanItem.type.toUpperCase()}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
              <Ionicons name="time-outline" size={12} color={T.subText} /><Text style={{ color: '#CBD5E1', fontSize: 10, fontWeight: 'bold', marginLeft: 4 }}>{scanItem.date.split(',')[0]}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[globalStyles.result_noticeBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', marginTop: 10, paddingVertical: 14 }]} onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: sanitizeLocalText(scanItem.ocrText || ""), isOfflinePreview: true })}>
          <Ionicons name="shield-checkmark" size={24} color={COLORS.success} style={{ marginRight: 12 }} />
          <View style={{ flex: 1 }}><Text style={{ color: T.text, fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>DPA Compliant Pipeline</Text><Text style={{ color: T.subText, fontSize: 11, lineHeight: 16 }}>Tap to see how your device cleans sensitive info before sending it online.</Text></View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.success} />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(245, 158, 11, 0.05)', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', alignItems: 'center', marginTop: 16, marginBottom: 24 }}>
          <Ionicons name="cloud-offline" size={20} color={COLORS.warning} style={{ marginRight: 10 }} />
          <Text style={{ flex: 1, color: T.text, fontSize: 12, lineHeight: 18 }}>Ang file na ito ay naka-save nang offline. I-connect sa internet at i-tap ang Analyze Now para ipasa kay Lex-Simple AI.</Text>
        </View>

        <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}
            onPress={handleAnalyzeOfflineFile}
          >
            <Ionicons name="sparkles" size={18} color="white" style={{ marginRight: 8 }} /><Text style={{ color: 'white', fontSize: 14, fontWeight: 'bold' }}>Analyze Now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ width: 48, height: 48, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' }} onPress={handleDelete}>
            <Ionicons name="trash" size={18} color={COLORS.danger} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={!!fullscreenImage} transparent={true} animationType="fade" onRequestClose={() => setFullscreenImage(null)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 50, right: 20, zIndex: 999, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20 }} onPress={() => setFullscreenImage(null)}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          {fullscreenImage && (<ImageViewer imageUrls={[{ url: fullscreenImage }]} enableSwipeDown={true} onSwipeDown={() => setFullscreenImage(null)} renderIndicator={() => <View />} backgroundColor="transparent" />)}
        </View>
      </Modal>

      <AlertRender />
    </ScreenLayout>
  );
}

const uiStyles = StyleSheet.create({
  fabButton: { position: 'absolute', bottom: 24, right: 16, backgroundColor: COLORS.primaryLight, width: 56, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, zIndex: 999 }
});