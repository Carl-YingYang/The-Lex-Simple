import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { postEndpoint } from '../../../services/AiEngine';

const CATEGORIES = [
  { id: 'all', label: 'All Terms', keywords: [] },
  { id: 'contracts', label: 'Contracts', keywords: ['contract', 'agreement', 'void', 'consent', 'breach', 'obligation', 'party', 'terms', 'stipulation'] },
  { id: 'loans', label: 'Loans & Debt', keywords: ['loan', 'debt', 'interest', 'usury', 'mortgage', 'pledge', 'pay', 'credit', 'finance', 'lending', 'creditor', 'borrower', 'installment'] },
  { id: 'rent', label: 'Rent & Lease', keywords: ['rent', 'lease', 'tenant', 'landlord', 'eviction', 'deposit', 'lessor', 'lessee', 'property'] },
];

const ITEMS_PER_PAGE = 20;

export default function DictionaryDetailScreen({ route }: any) {
  const { dictionaryData } = route.params || { dictionaryData: [] };
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedItems, setExpandedItems] = useState<number[]>([]);

  const [visibleData, setVisibleData] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [loadingAi, setLoadingAi] = useState<Record<number, boolean>>({});
  const [aiExplanations, setAiExplanations] = useState<Record<number, any>>({});
  const [activeAiIndex, setActiveAiIndex] = useState<number | null>(null);
  const [isFetchingAi, setIsFetchingAi] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T } = useTheme(); // 🚀 GLOBAL THEME

  const filteredData = useMemo(() => {
    if (activeCategory === 'all') return dictionaryData;
    const cat = CATEGORIES.find(c => c.id === activeCategory);
    if (!cat) return dictionaryData;

    return dictionaryData.filter((item: any) => {
      const text = String(item.term || '') + " " + String(item.definition || '');
      return cat.keywords.some(kw => text.toLowerCase().includes(kw));
    });
  }, [dictionaryData, activeCategory]);

  useEffect(() => {
    setCurrentPage(1);
    setActiveAiIndex(null);
    setIsFetchingAi(false);
    setVisibleData(filteredData.slice(0, ITEMS_PER_PAGE));
  }, [filteredData]);

  const loadMoreItems = () => {
    const currentLength = visibleData.length;
    const nextBatch = filteredData.slice(currentLength, currentLength + ITEMS_PER_PAGE);
    if (nextBatch.length > 0) {
      setVisibleData(prev => [...prev, ...nextBatch]);
      setCurrentPage(prev => prev + 1);
    }
  };

  const toggleExpand = (index: number) => {
    if (expandedItems.includes(index)) {
      setExpandedItems(expandedItems.filter(i => i !== index));
    } else {
      setExpandedItems([...expandedItems, index]);
    }
  };

  const handleExplainAI = async (index: number, term: string, rawText: string) => {
    if (activeAiIndex === index) {
      setActiveAiIndex(null);
      return;
    }

    if (isFetchingAi) {
      showAlert("Sandali lang", "Nagpoproseso pa ang AI ng isang article. Isa-isa lang muna.");
      return;
    }

    setActiveAiIndex(index);

    if (aiExplanations[index]) {
      return;
    }

    setLoadingAi(prev => ({ ...prev, [index]: true }));
    setIsFetchingAi(true);

    try {
      const data = await postEndpoint('/explain', { title: term, raw_text: rawText });

      if (data && data.status === 'success') {
        // 🚀 FIX: Kunin ang 'definition' mula sa 'data' object ng response
        const explanationText = data.data?.definition || data.definition || "No explanation available.";
        setAiExplanations(prev => ({ ...prev, [index]: { definition: explanationText } }));
      } else {
        showAlert("AI Busy", "Medyo marami lang iniisip si Lex-Simple. Pakisubukan ulit mamaya.");
        setActiveAiIndex(null);
      }
    } catch (error) {
      console.error(error);
      showAlert("Connection Error", "Hindi maka-connect sa server. Check mo kung naka-run ang backend mo.");
      setActiveAiIndex(null);
    } finally {
      setLoadingAi(prev => ({ ...prev, [index]: false }));
      setIsFetchingAi(false);
    }
  };

  const renderDictionaryCard = ({ item, index }: any) => {
    const isExpanded = expandedItems.includes(index);
    const defText = String(item.definition || '');
    const shouldTruncate = defText.length > 250;
    const displayText = (!isExpanded && shouldTruncate) ? defText.substring(0, 250) + '...' : defText;

    const isLoading = loadingAi[index];
    const isAiOpen = activeAiIndex === index;
    const aiData = aiExplanations[index];

    return (
      <View style={[uiStyles.card, { backgroundColor: T.card, borderColor: T.border }]}>
        <View>
          <Text style={[uiStyles.termTitle, { color: T.text }]}>{item.term || 'Unknown Term'}</Text>
          <Text style={[uiStyles.basisText, { color: COLORS.primaryLight }]} numberOfLines={2}>
            {item.legal_basis || 'RA 386: Civil Code of the Philippines'}
          </Text>
        </View>

        <View style={[uiStyles.divider, { backgroundColor: T.border }]} />

        <View>
          <Text style={[uiStyles.contentTitle, { color: T.subText }]}>RAW LEGAL PROVISION</Text>
          <View style={[uiStyles.innerBox, { backgroundColor: T.bg, borderColor: T.border }]}>
            <Text style={[uiStyles.chunkText, { color: T.text }]}>"{displayText}"</Text>

            <View style={uiStyles.actionButtonsContainer}>
              {shouldTruncate && (
                <TouchableOpacity onPress={() => toggleExpand(index)} style={uiStyles.expandBtn}>
                  <Text style={uiStyles.expandBtnText}>{isExpanded ? 'Show Less' : 'Read Full Text'}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => handleExplainAI(index, item.term, defText)}
                style={[
                  uiStyles.aiButton,
                  isAiOpen ? { backgroundColor: '#3B0764' } : null,
                  (isFetchingAi && !isLoading) ? { opacity: 0.5 } : null
                ]}
                disabled={isFetchingAi && !isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={isAiOpen ? "close-circle" : "sparkles"} size={14} color="#fff" style={{ marginRight: 5 }} />
                    <Text style={uiStyles.aiButtonText}>{isAiOpen ? 'Close AI' : 'Explain via AI'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {isAiOpen && aiData && (
          <View style={[uiStyles.aiResultBox, { backgroundColor: T.bg, borderColor: COLORS.primaryLight }]}>
            <View style={uiStyles.aiHeaderRow}>
              <Ionicons name="bulb" size={16} color={COLORS.warning} />
              <Text style={uiStyles.aiResultTitle}>Explanation</Text>
            </View>
            <Text style={[uiStyles.aiDefinitionText, { color: T.text }]}>{aiData.definition}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenLayout title="Offline Dictionary" noPadding={true}>
      <View style={{ flex: 1, backgroundColor: T.bg, paddingTop: 10 }}>

        {/* CATEGORIES */}
        <View style={{ marginBottom: 16 }}>
          <FlatList
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            data={CATEGORIES}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  uiStyles.categoryBtn,
                  { backgroundColor: T.card, borderColor: activeCategory === item.id ? COLORS.primary : T.border },
                  activeCategory === item.id && { backgroundColor: COLORS.primary }
                ]}
                onPress={() => setActiveCategory(item.id)}
              >
                <Text style={[uiStyles.categoryBtnText, { color: activeCategory === item.id ? '#fff' : T.subText }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* LIST */}
        <FlatList
          data={visibleData}
          keyExtractor={(item, index) => String(index)}
          renderItem={renderDictionaryCard}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMoreItems}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={uiStyles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={40} color={T.subText} />
              <Text style={[uiStyles.emptyText, { color: T.subText }]}>Walang nahanap.</Text>
            </View>
          }
          ListFooterComponent={
            visibleData.length > 0 ? (
              <View style={uiStyles.footerContainer}>
                {visibleData.length < filteredData.length ? (
                  <ActivityIndicator size="small" color={COLORS.primaryLight} />
                ) : (
                  <Text style={[uiStyles.endOfListText, { color: T.subText }]}>Nasa pinakadulo ka na.</Text>
                )}
              </View>
            ) : null
          }
        />
      </View>
      <AlertRender />
    </ScreenLayout>
  );
}

// 🎨 SLEEK & SHARP UI STYLES
const uiStyles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  termTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  basisText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  contentTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  innerBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  chunkText: {
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  expandBtn: {
    paddingVertical: 4,
  },
  expandBtnText: {
    color: COLORS.primaryLight,
    fontSize: 12,
    fontWeight: 'bold',
  },
  aiButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12
  },
  aiResultBox: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6
  },
  aiResultTitle: {
    fontWeight: 'bold',
    color: COLORS.warning,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  aiDefinitionText: {
    fontSize: 13,
    lineHeight: 22
  },
  categoryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 10,
  },
  categoryBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    marginTop: 15,
    fontWeight: 'bold',
    fontSize: 14,
  },
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  endOfListText: {
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '500'
  }
});