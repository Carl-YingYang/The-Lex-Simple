import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Pressable, StyleSheet, StatusBar, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, globalStyles } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ClauseCard from '../../../components/ClauseCard';
import { useTheme } from '../../../theme/ThemeContext';

// 🚀 IMPORT ANG CUSTOM ICON PARA SA FLOATING BUTTON
const MessageAiIcon = require('../../../../assets/icons/message_ai.png');

interface AnalysisResult {
  score: number;
  riskLevel: string;
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

// 🚀 EXPANDABLE FINDING COMPONENT
const ExpandableFinding = ({ f, index, itemDeduction, T }: any) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongText = f.description.length > 80;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text style={{ color: T.text, fontSize: 13, fontWeight: 'bold', flex: 1, paddingRight: 10, lineHeight: 18 }}>{f.title}</Text>
        <Text style={{ color: COLORS.danger, fontSize: 14, fontWeight: '900' }}>-{itemDeduction}</Text>
      </View>
      <Text style={{ color: T.subText, fontSize: 12, lineHeight: 18 }} numberOfLines={isExpanded ? undefined : 3}>
        {f.description}
      </Text>
      {isLongText && (
        <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
          <Text style={{ color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
            {isExpanded ? 'See Less' : 'See More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

export default function ResultScreen({ route, navigation }: any) {
  const { analysisResult } = route.params || {};

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDbInfo, setSelectedDbInfo] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState("");
  const [scoreInfoModalVisible, setScoreInfoModalVisible] = useState(false);

  const result: AnalysisResult = analysisResult || { score: 100, riskLevel: 'Very Safe', findings: [] };

  const { isDarkMode, colors: T } = useTheme();

  const memoizedSanitizedText = useMemo(() => {
    if (!result.sanitizedText) return "Sanitized text is not available for this record.";
    let safeText = result.sanitizedText;
    safeText = safeText.replace(/(\+?63|0)9\d{2}[.\s-]?\d{4}[.\s-]?\d{4}|09\d{9}/g, '[REDACTED_PHONE]');
    safeText = safeText.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]');
    return safeText;
  }, [result.sanitizedText]);

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

    let bestChunk = null;
    let highestScore = 0;

    chunks.forEach((chunk: string) => {
      const chunkLower = chunk.toLowerCase();
      let score = 0;
      findingKeywords.forEach(word => { if (chunkLower.includes(word)) score++; });
      if (score > highestScore) { highestScore = score; bestChunk = chunk; }
    });

    if (bestChunk && highestScore > 0) {
      setSelectedDbInfo(`Statutory Provision:\n\n${bestChunk}`);
    } else {
      setSelectedDbInfo("No matching statutory provision found in the local database.");
    }
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
      suggestedPrompts: [
        "Paki-summarize ang buong kontrata.",
        "Anong mga clauses ang pinaka-risky dito?",
        "Sino ang lugi sa kontratang ito?",
        "Ano ang mga karapatan ko rito?"
      ]
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
      suggestedPrompts: dynamicPrompts || [
        "Bakit ito considered risky?",
        "Pwede ko ba itong ipatanggal?",
        "Ano ang worst-case scenario dito?",
        "Paliwanag mo nga sa mas simpleng salita."
      ]
    });
  };

  return (
    <ScreenLayout title="Scan Results" noPadding={true}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        <ScrollView
          contentContainerStyle={[globalStyles.result_scrollContent, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* UPL NOTICE */}
          <View style={[globalStyles.result_noticeBox, { backgroundColor: T.card, borderColor: T.border }]}>
            <Ionicons name="information-circle" size={20} color={COLORS.primaryLight} style={{ marginRight: 10 }} />
            <Text style={[globalStyles.result_noticeText, { color: T.subText }]}>
              <Text style={{ fontWeight: 'bold', color: T.text }}>UPL Notice: </Text> Ang Lex-Simple ay isang AI Legal Literacy Tool at hindi pamalit sa pormal na payo ng isang abogado.
            </Text>
          </View>

          {/* SCORE CARD */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setScoreInfoModalVisible(true)}
            style={[globalStyles.result_scoreCard, { backgroundColor: T.card, borderColor: themeConfig.mainColor }]}
          >
            <View style={globalStyles.result_scoreHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[globalStyles.result_scoreLabel, { color: T.subText }]}>COMPLEXITY SCORE</Text>
                <View style={{ paddingLeft: 6, paddingRight: 8 }}>
                  <Ionicons name="information-circle-outline" size={16} color={T.subText} />
                </View>
              </View>
              <View style={[globalStyles.result_riskBadge, { backgroundColor: themeConfig.mainColor }]}>
                <Ionicons name={themeConfig.icon as any} size={12} color="white" style={{ marginRight: 4 }} />
                <Text style={globalStyles.result_riskBadgeText}>{themeConfig.label}</Text>
              </View>
            </View>

            <View style={globalStyles.result_scoreCircleWrapper}>
              <Text style={[globalStyles.result_scoreNumber, { color: themeConfig.mainColor }]}>{result.score}</Text>
              <Text style={[globalStyles.result_scoreMax, { color: T.subText }]}>/100</Text>
            </View>

            <Text style={[globalStyles.result_scoreDesc, { color: T.subText }]}>
              Mayroong <Text style={{ fontWeight: 'bold', color: themeConfig.mainColor }}>{result.findings.length} clause(s)</Text> na nagpababa sa iyong complexity score.
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tap to view score breakdown</Text>
            </View>
          </TouchableOpacity>

          {/* DPA PIPELINE BOX */}
          <TouchableOpacity
            style={[globalStyles.result_noticeBox, { backgroundColor: T.card, borderColor: T.border, marginTop: 5, paddingVertical: 14 }]}
            onPress={() => navigation.navigate('SanitizedOcrScreen', { sanitizedText: memoizedSanitizedText })}
          >
            <Ionicons name="shield-checkmark" size={24} color={COLORS.success} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: T.text, fontWeight: 'bold', fontSize: 14, marginBottom: 2 }}>DPA Compliant Pipeline</Text>
              <Text style={{ color: T.subText, fontSize: 11, lineHeight: 16 }}>Tap to view the sanitized OCR data sent to the AI.</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.success} />
          </TouchableOpacity>

          <Text style={[globalStyles.result_sectionTitle, { color: T.text }]}>CLAUSE ANALYSIS</Text>

          {result.findings.length === 0 ? (
            <View style={[globalStyles.result_emptyStateBox, { backgroundColor: T.card, borderColor: T.border }]}>
              <Ionicons name="shield-checkmark" size={48} color={COLORS.success} />
              <Text style={[globalStyles.result_emptyStateText, { color: T.subText }]}>Napakaganda ng kontrata! Walang nakitang high-risk clauses ang system.</Text>
            </View>
          ) : (
            result.findings.map((item, index) => (
              <ClauseCard
                key={index}
                item={item}
                themeConfig={themeConfig}
                ragContext={result.rag_context_used}
                onShowLegalBasis={showFullInfo}
                onAskAiDeepDive={handleClauseDeepDive}
              />
            ))
          )}
        </ScrollView>
      </View>

      {/* 🚀 FLOATING ASK AI BUTTON (Meta AI Style Pill) */}
      <TouchableOpacity style={localStyles.fabButton} onPress={handleFullDocDeepDive}>
        {/* 🚀 FULLY WHITE ICON */}
        <Image source={MessageAiIcon} style={[localStyles.fabIcon, { tintColor: '#FFFFFF' }]} resizeMode="contain" />
        <Text style={localStyles.fabText}>Ask AI</Text>
      </TouchableOpacity>

      {/* SCORE BREAKDOWN MODAL */}
      <Modal animationType="fade" transparent={true} visible={scoreInfoModalVisible} onRequestClose={() => setScoreInfoModalVisible(false)} statusBarTranslucent>
        <View style={globalStyles.result_modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setScoreInfoModalVisible(false)} />
          <View style={[globalStyles.result_modalCenterBox, { backgroundColor: T.card, borderColor: T.border, borderRadius: 12 }]}>
            <View style={[globalStyles.result_modalHeaderArea, { backgroundColor: T.bg, borderBottomColor: T.border }]}>
              <View style={globalStyles.result_modalHeaderTitleArea}>
                <Ionicons name="receipt" size={20} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
                <Text style={[globalStyles.result_modalTitleText, { color: T.text }]} numberOfLines={1}>Score Breakdown</Text>
              </View>
              <TouchableOpacity onPress={() => setScoreInfoModalVisible(false)} style={globalStyles.detailModal_closeBtn}>
                <Ionicons name="close" size={18} color={T.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={globalStyles.result_modalBodyArea} showsVerticalScrollIndicator={true}>
              <View style={[localStyles.scoreBreakdownBox, { backgroundColor: T.bg, borderColor: T.border }]}>
                <View style={[localStyles.scoreStartingRow, { borderBottomColor: T.border }]}>
                  <Text style={[localStyles.scoreLabelText, { color: T.text }]}>Starting Score</Text>
                  <Text style={localStyles.scoreValueSuccess}>100</Text>
                </View>

                {result.findings.length > 0 ? (
                  result.findings.map((f, i) => {
                    const itemDeduction = baseDeduction + (i === 0 ? remainderDeduction : 0);
                    return (
                      <ExpandableFinding
                        key={i}
                        f={f}
                        index={i}
                        itemDeduction={itemDeduction}
                        T={T}
                      />
                    )
                  })
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.success} style={{ marginRight: 6 }} />
                    <Text style={{ color: COLORS.success, fontSize: 13, fontWeight: 'bold' }}>Walang nakitang penalty points.</Text>
                  </View>
                )}

                <View style={[localStyles.scoreFinalRow, { borderTopColor: T.border }]}>
                  <Text style={[localStyles.scoreFinalLabel, { color: T.text }]}>Final Score</Text>
                  <Text style={[localStyles.scoreFinalValue, { color: themeConfig.mainColor }]}>{result.score}</Text>
                </View>
              </View>

              <Text style={[localStyles.disclaimerText, { color: T.subText }]}>
                Ang computation na ito ay base sa AI analysis kung saan hinahati ang ibinawas na points sa mga risky clauses na natagpuan.
              </Text>
              <View style={{ height: 20 }} />
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
              <View style={globalStyles.result_modalHeaderTitleArea}>
                <Ionicons name="document-text" size={20} color={themeConfig.mainColor} style={{ marginRight: 8 }} />
                <Text style={[globalStyles.result_modalTitleText, { color: T.text }]} numberOfLines={1}>{activeTitle}</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={globalStyles.detailModal_closeBtn}>
                <Ionicons name="close" size={18} color={T.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={globalStyles.result_modalBodyArea} showsVerticalScrollIndicator={true}>
              <View style={[localStyles.documentPaper, { backgroundColor: T.bg, borderColor: T.border }]}>
                <Text style={[localStyles.justifiedText, { color: T.text }, selectedDbInfo?.includes("No matching") && { fontStyle: 'italic', color: COLORS.warning }]}>
                  {selectedDbInfo}
                </Text>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

    </ScreenLayout>
  );
}

const localStyles = StyleSheet.create({
  fabButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4910bc', // Solid Purple
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 30, // Pill shape
    borderWidth: 2, // 🚀 Solid Border
    borderColor: '#FFFFFF', // 🚀 Solid White Border
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 999
  },
  fabIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  scoreBreakdownBox: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20
  },
  scoreStartingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 12
  },
  scoreLabelText: { fontWeight: 'bold', fontSize: 14 },
  scoreValueSuccess: { color: COLORS.success, fontWeight: '900', fontSize: 16 },
  scoreFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    marginTop: 4
  },
  scoreFinalLabel: { fontWeight: '900', fontSize: 16 },
  scoreFinalValue: { fontWeight: '900', fontSize: 22 },
  disclaimerText: {
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 10,
    paddingBottom: 20,
    lineHeight: 16
  },
  documentPaper: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 10
  },
  justifiedText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'left',
    letterSpacing: 0,
  }
});