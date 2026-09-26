import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

// CLAUSE CARD VERSION: 6.2.3
const ConfidenceIcon = require('../../assets/icons/confidence_chart.png');
const LibraryIcon = require('../../assets/icons/library.png');
const MessageAiIcon = require('../../assets/icons/message_ai.png');

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
  const hasRelatedContext = Boolean(ragContext?.trim() && !ragContext.includes('NO VERIFIED LEGAL CONTEXT FOUND'));
  const confidence = typeof item.confidence === 'string' && /^(?:100|[1-9]?\d)%$/.test(item.confidence.trim())
    ? item.confidence.trim()
    : null;
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
    return [`Ano ang ibig sabihin ng ${item.title}?`, "Ano ang dapat kong linawin?", "Paki-explain nang mas simple."];
  }, [item.title]);

  return (
    <View style={[styles.card, { backgroundColor: T.card, borderColor: T.border }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <Ionicons name="alert-circle" size={20} color={themeConfig.mainColor} />
        <Text style={[styles.title, { color: T.text }]}>{item.title}</Text>
      </View>

      {confidence && (
        <View style={[styles.tagContainer, { backgroundColor: T.bg, borderColor: T.border }]}>
          <Image source={ConfidenceIcon} style={styles.tagIcon} resizeMode="contain" />
          <Text style={[styles.tagText, { color: T.text }]}>AI estimate: {confidence}</Text>
        </View>
      )}

      <Text style={[styles.label, { color: T.subText }]}>Explanation</Text>
      <Text style={[styles.description, { color: T.text }]}>{item.description}</Text>

      {/* ADVICE BOX */}
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

      {hasRelatedContext && (
        <TouchableOpacity
          style={[styles.basisBtn, { backgroundColor: T.bg, borderColor: T.border }]}
          onPress={() => onShowLegalBasis(item)}
          accessibilityRole="button"
        >
          <Image source={LibraryIcon} style={styles.btnIcon} resizeMode="contain" />
          <Text style={[styles.basisBtnText, { color: T.text }]}>Kaugnay na sanggunian</Text>
          <Ionicons name="chevron-forward" size={16} color={T.text} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      )}

      {/* ASK AI SECTION */}
      <View style={[styles.askAiSection, { borderTopColor: T.border }]}>
        <Text style={[styles.askAiLabel, { color: T.subText }]}>Ask Lexie About This Clause</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promptsScroll}>
          {dynamicPrompts.map((prompt, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => onAskAiDeepDive(item, prompt, dynamicPrompts)}
              style={[styles.promptChip, { backgroundColor: T.bg, borderColor: T.border }]}
            >
              <Text style={[styles.promptText, { color: T.text }]}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 🚀 CUSTOM ICON: DISCUSS IN ASK AI (TINT COLOR WHITE) */}
        <TouchableOpacity
          style={[styles.discussBtn, { borderColor: COLORS.primaryLight }]}
          onPress={() => onAskAiDeepDive(item, undefined, dynamicPrompts)}
        >
          <Image source={MessageAiIcon} style={[styles.btnIcon, { tintColor: '#FFFFFF' }]} resizeMode="contain" />
          <Text style={[styles.discussBtnText, { color: '#FFFFFF' }]}>Discuss in Lexie Insight</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
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
  tagIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
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
    borderWidth: 1,
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
  btnIcon: {
    width: 16,
    height: 16,
    marginRight: 8,
  },
  basisBtnText: {
    fontSize: 14,
    fontWeight: '600',
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
    backgroundColor: COLORS.primary
  },
  discussBtnText: {
    fontSize: 14,
    fontWeight: '700',
  }
});