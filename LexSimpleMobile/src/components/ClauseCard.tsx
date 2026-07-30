import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../theme/globalStyles';

interface ClauseCardProps {
  item: {
    title: string;
    description: string;
    advice: string;
    foundText: string;
    confidence?: string;
  };
  themeConfig: { mainColor: string; icon: string; label: string };
  ragContext?: string; // 💡 NEW: Tinatanggap na niya ang buong database extract!
  onShowLegalBasis: (item: any) => void;
  // 💡 NEW: Nagpasa na tayo ng 4th parameter para sa nakuhang Legal Basis
  onAskAiDeepDive: (item: any, initialPrompt?: string, suggestedPrompts?: string[], legalBasis?: string) => void;
}

export default function ClauseCard({ item, themeConfig, ragContext, onShowLegalBasis, onAskAiDeepDive }: ClauseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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

  // 💡 THE MAGIC: Si Clause Card na mismo ang hahanap ng Article sa Database!
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
    <View style={globalStyles.result_findingCard}>
      {/* ── HEADER ── */}
      <View style={globalStyles.result_findingHeader}>
        <Ionicons name="alert-circle" size={22} color={themeConfig.mainColor} />
        <Text style={globalStyles.result_findingTitle}>{item.title}</Text>
      </View>

      <View style={globalStyles.result_aiTagBox}>
        <Ionicons name="analytics" size={12} color={COLORS.primaryLight} />
        <Text style={globalStyles.result_aiTagText}>AI Confidence: {item.confidence || '90%'}</Text>
      </View>

      <Text style={globalStyles.result_label}>Explanation:</Text>
      <Text style={globalStyles.result_descText}>{item.description}</Text>

      <View style={[globalStyles.result_adviceBox, { borderLeftColor: themeConfig.mainColor }]}>
        <Text style={[globalStyles.result_adviceTitle, { color: themeConfig.mainColor }]}>💡 Practical Advice:</Text>
        <Text style={globalStyles.result_adviceText}>{item.advice}</Text>
      </View>

      <Text style={globalStyles.result_label}>Original Clause (OCR):</Text>
      <View style={globalStyles.result_snippetBox}>
        <Text style={globalStyles.result_snippetText}>"{displaySnippet}"</Text>
        {shouldTruncate && (
          <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} style={globalStyles.result_expandBtn}>
            <Text style={globalStyles.result_expandBtnText}>{isExpanded ? 'Show Less' : 'Read More'}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={globalStyles.result_dbButton} onPress={() => onShowLegalBasis(item)}>
        <Ionicons name="library" size={16} color={COLORS.primaryLight} />
        <Text style={globalStyles.result_dbButtonText}>View Legal Basis</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primaryLight} />
      </TouchableOpacity>

      {/* ── PREMIUM REDIRECT UI ── */}
      <View style={{ marginTop: 25, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#1e293b' }}>
        <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Ask AI About This Clause
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
          {dynamicPrompts.map((prompt, i) => (
            <TouchableOpacity
              key={i}
              // 💡 IPINAPASA NA NATIN ANG LEGAL BASIS (ARTICLE) SA ON-CLICK!
              onPress={() => onAskAiDeepDive(item, prompt, dynamicPrompts, extractLegalBasis() || undefined)}
              style={{ backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#334155' }}
            >
              <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 'bold' }}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity
          style={{ flexDirection: 'row', backgroundColor: 'rgba(129, 140, 248, 0.1)', paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.3)' }}
          // 💡 IPINAPASA NA NATIN ANG LEGAL BASIS (ARTICLE) SA ON-CLICK!
          onPress={() => onAskAiDeepDive(item, undefined, dynamicPrompts, extractLegalBasis() || undefined)}
        >
          <Ionicons name="chatbubbles" size={18} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
          <Text style={{ color: COLORS.primaryLight, fontSize: 14, fontWeight: 'bold' }}>Discuss in Ask AI</Text>
          <Ionicons name="arrow-forward" size={16} color={COLORS.primaryLight} style={{ position: 'absolute', right: 15 }} />
        </TouchableOpacity>
      </View>

    </View>
  );
}