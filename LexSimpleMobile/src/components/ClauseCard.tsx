import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../theme/globalStyles';
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
    if (t.match(/payment|fee|interest|rent|bayad|price|cost|penalty/)) {
      return ["May hidden charges ba rito?", "Ano mangyayari kung ma-late ako ng bayad?", "Pwede ba itong i-negotiate?"];
    }
    if (t.match(/terminate|cancel|end|alis|evict|rescind/)) {
      return ["May penalty ba kung i-cancel ko ito?", "Ilang days ang kailangang notice?", "Paano ko ito tatapusin nang legal?"];
    }
    if (t.match(/liability|damage|risk|sira|indemnify|responsibility/)) {
      return ["Sino ang magbabayad kapag may nasira?", "Ano ang worst-case scenario rito?", "Paano ko lilimitahan ang risk ko?"];
    }
    if (t.match(/confidential|data|privacy|secret/)) {
      return ["Ligtas ba ang personal info ko rito?", "Kanino nila pwedeng i-share ang data ko?", "Pwede ko ba itong ipabura?"];
    }
    if (t.match(/default|breach|violation|labag|entry|access/)) {
      return ["Ano ang mangyayari kung lumabag ako rito?", "Legal ba ang ginagawa nilang ito?", "Paano ko ito maiiwasan?"];
    }
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
    <View style={[globalStyles.result_findingCard, { backgroundColor: T.card, borderColor: T.border, borderRadius: 12 }]}>
      {/* ── HEADER ── */}
      <View style={[globalStyles.result_findingHeader, { marginBottom: 8 }]}>
        <Ionicons name="alert-circle" size={20} color={themeConfig.mainColor} />
        <Text style={[globalStyles.result_findingTitle, { color: T.text, fontSize: 16 }]}>{item.title}</Text>
      </View>

      <View style={[globalStyles.result_aiTagBox, { backgroundColor: 'rgba(167, 139, 250, 0.1)', borderColor: 'rgba(167, 139, 250, 0.2)', borderRadius: 6, marginBottom: 12 }]}>
        <Ionicons name="analytics" size={12} color={COLORS.primaryLight} />
        <Text style={[globalStyles.result_aiTagText, { color: COLORS.primaryLight }]}>AI Confidence: {item.confidence || '90%'}</Text>
      </View>

      <Text style={[globalStyles.result_label, { color: T.subText, marginBottom: 4 }]}>Explanation:</Text>
      <Text style={[globalStyles.result_descText, { color: T.text, marginBottom: 12 }]}>{item.description}</Text>

      <View style={[globalStyles.result_adviceBox, { borderLeftColor: themeConfig.mainColor, backgroundColor: T.bg, borderRadius: 8, marginBottom: 16 }]}>
        <Text style={[globalStyles.result_adviceTitle, { color: themeConfig.mainColor, marginBottom: 4 }]}>💡 Practical Advice:</Text>
        <Text style={[globalStyles.result_adviceText, { color: T.text }]}>{item.advice}</Text>
      </View>

      <Text style={[globalStyles.result_label, { color: T.subText, marginBottom: 4 }]}>Original Clause (OCR):</Text>
      <View style={[globalStyles.result_snippetBox, { backgroundColor: T.bg, borderColor: T.border, borderRadius: 8, marginBottom: 16 }]}>
        <Text style={[globalStyles.result_snippetText, { color: T.subText }]}>"{displaySnippet}"</Text>
        {shouldTruncate && (
          <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={globalStyles.result_expandBtn}>
            <Text style={[globalStyles.result_expandBtnText, { color: COLORS.primaryLight }]}>{isExpanded ? 'Show Less' : 'Read More'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={[globalStyles.result_dbButton, { backgroundColor: T.bg, borderColor: T.border, borderRadius: 8 }]} onPress={() => onShowLegalBasis(item)}>
        <Ionicons name="library" size={16} color={COLORS.primaryLight} />
        <Text style={[globalStyles.result_dbButtonText, { color: COLORS.primaryLight }]}>View Legal Basis</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primaryLight} />
      </TouchableOpacity>

      {/* ── PREMIUM REDIRECT UI ── */}
      <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: T.border }}>
        <Text style={{ color: T.subText, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Ask AI About This Clause
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {dynamicPrompts.map((prompt, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => onAskAiDeepDive(item, prompt, dynamicPrompts, extractLegalBasis() || undefined)}
              style={{ backgroundColor: T.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: T.border }}
            >
              <Text style={{ color: T.text, fontSize: 12, fontWeight: 'bold' }}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={{ flexDirection: 'row', backgroundColor: 'rgba(167, 139, 250, 0.1)', paddingVertical: 12, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(167, 139, 250, 0.3)' }}
          onPress={() => onAskAiDeepDive(item, undefined, dynamicPrompts, extractLegalBasis() || undefined)}
        >
          <Ionicons name="chatbubbles" size={16} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
          <Text style={{ color: COLORS.primaryLight, fontSize: 13, fontWeight: 'bold' }}>Discuss in Ask AI</Text>
          <Ionicons name="arrow-forward" size={14} color={COLORS.primaryLight} style={{ position: 'absolute', right: 12 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}