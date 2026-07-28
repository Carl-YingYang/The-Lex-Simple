import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { globalStyles, COLORS } from '../../../theme/globalStyles';

// 🛠️ IMPORT ANG LAYOUT AT CUSTOM ALERT HOOK
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';

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

  // 🤖 AI STATES 
  const [loadingAi, setLoadingAi] = useState<Record<number, boolean>>({});
  const [aiExplanations, setAiExplanations] = useState<Record<number, any>>({});
  const [activeAiIndex, setActiveAiIndex] = useState<number | null>(null); 
  const [isFetchingAi, setIsFetchingAi] = useState(false); // 💡 BAGONG LOCK: Para bawal magsabay-sabay

  const { showAlert, AlertRender } = useCustomAlert();

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

  // 🤖 AI FETCHER (MAY ANTI-SPAM LOCK AT AUTO-CLOSE)
  const handleExplainAI = async (index: number, term: string, rawText: string) => {
    // 1. Kapag pinindot ulit yung nakabukas na, i-close lang natin.
    if (activeAiIndex === index) {
      setActiveAiIndex(null);
      return;
    }

    // 2. 💡 ANTI-SPAM LOCK: Kung may naglo-load pa, wag pansinin ang bagong click
    if (isFetchingAi) {
      showAlert("Sandali lang", "Nagpoproseso pa ang AI ng isang article. Isa-isa lang muna.");
      return;
    }

    // 3. I-set siya as the active tab (auto-close sa iba)
    setActiveAiIndex(index);

    // 4. Kung na-fetch na natin 'to dati, wag na tumawag sa API. I-open na lang.
    if (aiExplanations[index]) {
      return;
    }

    // 5. Fetch sa Backend
    setLoadingAi(prev => ({ ...prev, [index]: true }));
    setIsFetchingAi(true); // I-lock ang ibang buttons

    try {
      const response = await fetch('https://presuppurative-unconceitedly-peyton.ngrok-free.dev/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ title: term, raw_text: rawText })
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();
      
      if (data && data.status === 'success') {
        setAiExplanations(prev => ({ ...prev, [index]: data }));
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
      setIsFetchingAi(false); // I-unlock na
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
      <View style={globalStyles.dictDetail_card}>
        <View>
          <Text style={globalStyles.dictDetail_termTitle}>{item.term || 'Unknown Term'}</Text>
          <Text style={globalStyles.dictDetail_basisText} numberOfLines={2}>
            {item.legal_basis || 'RA 386: Civil Code of the Philippines'}
          </Text>
        </View>

        <View style={globalStyles.dictDetail_divider} />

        <View>
          <Text style={globalStyles.dictDetail_contentTitle}>RAW LEGAL PROVISION</Text>
          <View style={globalStyles.dictDetail_exampleBox}>
            <Text style={globalStyles.dictDetail_chunkText}>"{displayText}"</Text>
            
            <View style={styles.actionButtonsContainer}>
              {shouldTruncate && (
                <TouchableOpacity onPress={() => toggleExpand(index)} style={globalStyles.dictDetail_expandBtn}>
                  <Text style={globalStyles.dictDetail_expandBtnText}>{isExpanded ? 'Show Less' : 'Read Full Text'}</Text>
                </TouchableOpacity>
              )}

              {/* 🤖 AI BUTTON */}
              <TouchableOpacity 
                onPress={() => handleExplainAI(index, item.term, defText)} 
                style={[
                  styles.aiButton, 
                  isAiOpen ? {backgroundColor: '#3B0764'} : null,
                  (isFetchingAi && !isLoading) ? {opacity: 0.5} : null // Medyo dim kapag may ibang naglo-load
                ]}
                disabled={isFetchingAi && !isLoading} // Bawal pindutin kung may ibang naglo-load
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name={isAiOpen ? "close-circle" : "sparkles"} size={14} color="#fff" style={{marginRight: 5}} />
                    <Text style={styles.aiButtonText}>{isAiOpen ? 'Close AI' : 'Explain via AI'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 🤖 AI RESULT BOX */}
        {isAiOpen && aiData && (
          <View style={styles.aiResultBox}>
            <View style={styles.aiHeaderRow}>
              <Ionicons name="bulb" size={16} color="#FCD34D" />
              <Text style={styles.aiResultTitle}>Explanation</Text>
            </View>
            <Text style={styles.aiDefinitionText}>{aiData.definition}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenLayout title="Offline Dictionary" noPadding={true}>
      <View style={globalStyles.dictDetail_safeTopPadding}>
        <View style={globalStyles.dictCategoriesWrapper}>
          <FlatList 
            horizontal={true}
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={globalStyles.dictCategoriesList}
            data={CATEGORIES}
            keyExtractor={(item) => item.id}
            renderItem={({item}) => (
              <TouchableOpacity 
                style={[globalStyles.dictDetail_categoryBtn, activeCategory === item.id ? globalStyles.dictDetail_categoryBtnActive : null]}
                onPress={() => setActiveCategory(item.id)}
              >
                <Text style={[globalStyles.dictDetail_categoryBtnText, activeCategory === item.id ? globalStyles.dictDetail_categoryBtnTextActive : null]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        <FlatList
          data={visibleData} 
          keyExtractor={(item, index) => String(index)}
          renderItem={renderDictionaryCard}
          contentContainerStyle={globalStyles.dictReadingList}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMoreItems}
          onEndReachedThreshold={0.5} 
          ListEmptyComponent={
            <View style={globalStyles.dictDetail_emptyContainer}>
              <Ionicons name="folder-open-outline" size={40} color={COLORS.textMuted} />
              <Text style={globalStyles.dictDetail_emptyText}>Walang nahanap.</Text>
            </View>
          }
          // 💡 BAGONG LAZY LOAD FOOTER
          ListFooterComponent={
            visibleData.length > 0 ? (
              <View style={styles.footerContainer}>
                {visibleData.length < filteredData.length ? (
                  <ActivityIndicator size="small" color={COLORS.primary || '#6D28D9'} />
                ) : (
                  <Text style={styles.endOfListText}>✨ Nasa pinakadulo ka na.</Text>
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

const styles = StyleSheet.create({
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  aiButton: {
    backgroundColor: COLORS.primary || '#6D28D9',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 6, 
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  aiResultBox: {
    marginTop: 12,
    backgroundColor: '#161622', 
    borderWidth: 1,
    borderColor: '#334155', 
    borderRadius: 6, 
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
    color: '#FCD34D', 
    fontSize: 12, 
    letterSpacing: 0.8, 
    textTransform: 'uppercase' 
  },
  aiDefinitionText: { 
    color: '#E2E8F0', 
    fontSize: 13, 
    lineHeight: 22 
  },
  // 💡 STYLES PARA SA FOOTER
  footerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30, // Para hindi matakpan ng safe area ang pinakababa
  },
  endOfListText: {
    color: '#64748B', // Muted slate color
    fontSize: 12,
    fontStyle: 'italic',
    fontWeight: '500'
  }
});