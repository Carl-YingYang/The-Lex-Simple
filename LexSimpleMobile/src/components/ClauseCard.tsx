import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

interface ClauseCardProps {
  item: {
    title: string;
    description: string;
    advice: string;
    foundText: string;
    confidence?: string;
  };
  themeConfig: { mainColor: string; icon: string; label: string };
  ragContext?: string;
  onShowLegalBasis: (item: any) => void;
  onAskAiDeepDive: (item: any, initialPrompt?: string, suggestedPrompts?: string[], legalBasis?: string) => void;
}

export default function ClauseCard({ item, themeConfig, ragContext, onShowLegalBasis, onAskAiDeepDive }: ClauseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { colors: T } = useTheme();

  const shouldTruncate = item.foundText.length > 120;
  const displaySnippet = (!isExpanded && shouldTruncate)
    ? item.foundText.substring(0, 120) + '...'
    : item.foundText;

  const dynamicPrompts = useMemo(() => {
    const t = item.title.toLowerCase();
    if (t.match(/payment|fee|interest|rent|bayad|price|cost|penalty/)) return ["May hidden charges ba rito?", "Ano mangyayari kung ma-late ako ng bayad?", "Pwede ba itong i-negotiate?"];
    if (t.match(/terminate|cancel|end|alis|evict|rescind/)) return ["May penalty ba kung i-cancel ko ito?", "Ilang days ang kailangang notice?", "Paano ko ito tatapusin nang legal?"];
    if (t.match(/liability|damage|risk|sira|indemnify|responsibility/)) return ["Sino ang magbabayad kapag may nasira?", "Ano ang worst-case scenario rito?", "Paano ko lilimitahan ang risk ko?"];
    if (t.match(/confidential|data|privacy|secret/)) return ["Ligtas ba ang personal info ko rito?", "Kanino nila pwedeng i-share ang data ko?", "Pwede ko ba itong ipabura?"];
    if (t.match(/default|breach|violation|labag|entry|access/)) return ["Ano ang mangyayari kung lumabag ako rito?", "Legal ba ang ginagawa nilang ito?", "Paano ko ito maiiwasan?"];
    return [`Bakit risky ang ${item.title}?`, "Pwede ko ba itong ipatanggal?", "Paki-explain nang mas simple."];
  }, [item.title]);

  const extractLegalBasis = () => {
    if (!ragContext || ragContext.trim() === "") return null;
    const chunks = ragContext.split('\n---\n').map(c => c.trim()).filter(c => c.length > 0);
    const extractKeywords = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const findingKeywords = extractKeywords(`${item.title} ${item.description} ${item.foundText}`);

    let bestChunk = null; let highestScore = 0;
    chunks.forEach((chunk: string) => {
      const chunkLower = chunk.toLowerCase(); let score = 0;
      findingKeywords.forEach(word => { if (chunkLower.includes(word)) score++; });
      if (score > highestScore) { highestScore = score; bestChunk = chunk; }
    });
    return highestScore > 0 ? bestChunk : null;
  };

  return (
    <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <Ionicons name="alert-circle" size={20} color={themeConfig.mainColor} />
        <Text style={[styles.title, { color: T.text }]}>{item.title}</Text>
      </View>

      <View style={[styles.tagContainer, { backgroundColor: T.bg, borderColor: T.border }]}>
        <Ionicons name="analytics" size={12} color={COLORS.primaryLight} />
        <Text style={[styles.tagText, { color: COLORS.primaryLight }]}>AI Confidence: {item.confidence || '90%'}</Text>
      </View>

      <Text style={[styles.label, { color: T.subText }]}>Explanation</Text>
      <Text style={[styles.description, { color: T.text }]}>{item.description}</Text>

      {/* 🚀 EVEN BORDER AROUND ALL SIDES WITH THEME COLOR */}
      <View style={[styles.adviceBox, { backgroundColor: T.bg, borderColor: themeConfig.mainColor }]}>
        <Text style={[styles.adviceLabel, { color: themeConfig.mainColor }]}>Practical Advice</Text>
        <Text style={[styles.adviceText, { color: T.text }]}>{item.advice}</Text>
      </View>

      <Text style={[styles.label, { color: T.subText }]}>Original Clause (OCR)</Text>
      <View style={[styles.snippetBox, { backgroundColor: T.bg, borderColor: T.border }]}>
        <Text style={[styles.snippetText, { color: T.subText }]}>"{displaySnippet}"</Text>
        {shouldTruncate && (
          <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={styles.expandBtn}>
            <Text style={[styles.expandBtnText, { color: COLORS.primaryLight }]}>{isExpanded ? 'Show Less' : 'Read More'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.basisBtn, { backgroundColor: T.bg, borderColor: T.border }]}
        onPress={() => onShowLegalBasis(item)}
      >
        <Ionicons name="library" size={16} color={COLORS.primaryLight} />
        <Text style={[styles.basisBtnText, { color: COLORS.primaryLight }]}>View Legal Basis</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primaryLight} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {/* ASK AI SECTION */}
      <View style={[styles.askAiSection, { borderTopColor: T.border }]}>
        <Text style={[styles.askAiLabel, { color: T.subText }]}>Ask AI About This Clause</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promptsScroll}>
          {dynamicPrompts.map((prompt, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => onAskAiDeepDive(item, prompt, dynamicPrompts, extractLegalBasis() || undefined)}
              style={[styles.promptChip, { backgroundColor: T.bg, borderColor: T.border }]}
            >
              <Text style={[styles.promptText, { color: T.text }]}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={[styles.discussBtn, { borderColor: COLORS.primaryLight }]}
          onPress={() => onAskAiDeepDive(item, undefined, dynamicPrompts, extractLegalBasis() || undefined)}
        >
          <Ionicons name="chatbubbles" size={16} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
          <Text style={[styles.discussBtnText, { color: COLORS.primaryLight }]}>Discuss in Ask AI</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
    flex: 1,
  },
  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 16,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 16,
  },
  adviceBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5, // 🚀 Clean uniform border
    marginBottom: 16,
  },
  adviceLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  adviceText: {
    fontSize: 14,
    lineHeight: 20,
  },
  snippetBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  snippetText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  expandBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  expandBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  basisBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  basisBtnText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  askAiSection: {
    paddingTop: 16,
    borderTopWidth: 1,
  },
  askAiLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  promptsScroll: {
    marginBottom: 12,
  },
  promptChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  promptText: {
    fontSize: 12,
    fontWeight: '600',
  },
  discussBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(167, 139, 250, 0.05)'
  },
  discussBtnText: {
    fontSize: 14,
    fontWeight: '700',
  }
});