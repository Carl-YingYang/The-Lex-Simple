import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import * as FileSystem from 'expo-file-system/legacy';

import defaultDictionary from '../../../data/legal_dictionary.json';
import { COLORS, globalStyles } from '../../../theme/globalStyles';
import LoadingSpinner from '../../../components/LoadingSpinner';

// 💡 IMPORT ANG CUSTOM ALERT HOOK NATIN
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';

// =====================================================================
// 💡 REUSABLE RESULT CARD (Flat UI, Walang Dropdown, May Tabs at Read More)
// =====================================================================
const ResultCard = ({ item, isOfflineMode, getRawText }: { item: any, isOfflineMode: boolean, getRawText: (item: any) => string }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'basis' | 'example'>(isOfflineMode ? 'basis' : 'ai');
  const [isTextExpanded, setIsTextExpanded] = useState(false);

  const renderExpandableText = (text: string, isItalic: boolean = false) => {
    const shouldTruncate = text.length > 250;
    const displayText = (!isTextExpanded && shouldTruncate) ? text.substring(0, 250) + '...' : text;

    return (
      <View>
        <Text style={[globalStyles.lib_chunkText, { fontStyle: isItalic ? 'italic' : 'normal', fontSize: 14, color: '#e2e8f0', lineHeight: 24 }]}>
          {isItalic ? `"${displayText}"` : displayText}
        </Text>
        {shouldTruncate && (
          <TouchableOpacity onPress={() => setIsTextExpanded(!isTextExpanded)} style={{ marginTop: 12 }}>
            <Text style={{ color: COLORS.primaryLight, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {isTextExpanded ? 'Show Less' : 'Read Full Text'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[globalStyles.lib_contentBox, { marginBottom: 20, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' }]}>
      
      {/* 🔹 MALAKING TITLE AT LEGAL BASIS */}
      <View style={{ marginBottom: 15 }}>
        <Text style={[globalStyles.lib_termTitle, { fontSize: 24, marginBottom: 4, lineHeight: 30 }]}>{item.term}</Text>
        <Text style={[globalStyles.lib_basisText, { fontSize: 13, color: COLORS.primaryLight, fontWeight: 'bold' }]} numberOfLines={2}>
          {item.legal_basis || 'Philippine Law Database'}
        </Text>
      </View>

      {/* 💡 DIVIDER LINE PARA MAS MALINIS ANG GROUPING */}
      <View style={{ height: 1, backgroundColor: '#1e293b', marginBottom: 15 }} />

      {/* 🔹 TABS (Itatago kapag offline) */}
      {!isOfflineMode && (
        <View style={[globalStyles.lib_tabsWrapper, { marginBottom: 15, borderRadius: 8 }]}>
          <TouchableOpacity style={[globalStyles.lib_tabBtn, { borderRadius: 6 }, activeTab === 'basis' && globalStyles.lib_tabBtnActive]} onPress={() => { setActiveTab('basis'); setIsTextExpanded(false); }}>
            <Text style={[globalStyles.lib_tabBtnText, activeTab === 'basis' && globalStyles.lib_tabBtnTextActive]}>Legal Basis</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[globalStyles.lib_tabBtn, { borderRadius: 6 }, activeTab === 'ai' && globalStyles.lib_tabBtnActive]} onPress={() => { setActiveTab('ai'); setIsTextExpanded(false); }}>
            <Text style={[globalStyles.lib_tabBtnText, activeTab === 'ai' && globalStyles.lib_tabBtnTextActive]}>AI Summary</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[globalStyles.lib_tabBtn, { borderRadius: 6 }, activeTab === 'example' && globalStyles.lib_tabBtnActive]} onPress={() => { setActiveTab('example'); setIsTextExpanded(false); }}>
            <Text style={[globalStyles.lib_tabBtnText, activeTab === 'example' && globalStyles.lib_tabBtnTextActive]}>Example</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 🔹 CONSISTENT DYNAMIC CONTENT UI (Nasa loob ng Box pare-pareho) */}
      {isOfflineMode || activeTab === 'basis' ? (
        <View>
          <Text style={globalStyles.lib_contentTitle}>RAW LEGAL PROVISION</Text>
          <View style={[globalStyles.lib_exampleBox, { padding: 16, marginTop: 8, borderRadius: 8 }]}>
            {renderExpandableText(isOfflineMode ? item.definition : getRawText(item), true)}
          </View>
        </View>
      ) : activeTab === 'ai' ? (
        <View>
          <View style={[globalStyles.lib_aiHeaderRow, { marginBottom: 8 }]}>
            <Ionicons name="sparkles" size={14} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
            <Text style={globalStyles.lib_contentTitle}>AI SIMPLIFIED EXPLANATION</Text>
          </View>
          <View style={[globalStyles.lib_exampleBox, { padding: 16, marginTop: 8, borderRadius: 8 }]}>
            {renderExpandableText(item.definition, false)}
          </View>
        </View>
      ) : (
        <View>
          <Text style={globalStyles.lib_contentTitle}>REAL-WORLD APPLICATION</Text>
          <View style={[globalStyles.lib_exampleBox, { padding: 16, marginTop: 8, borderRadius: 8 }]}>
            {renderExpandableText(item.example || 'Walang halimbawa na naibigay.', false)}
          </View>
        </View>
      )}
    </View>
  );
};


export default function LibraryScreen({ navigation }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [error, setError] = useState('');

  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [dictionaryData, setDictionaryData] = useState<any[]>(defaultDictionary);
  const [isSyncing, setIsSyncing] = useState(false);

  // 💡 THE MAGIC HOOK: Eto na lang ang kailangan imbes na mahabang state!
  const { showAlert, AlertRender } = useCustomAlert();

  const API_BASE_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev';
  const localFileUri = FileSystem.documentDirectory + 'lex_offline_db.json';

  useEffect(() => {
    loadLocalDatabase();
  }, []);

  const loadLocalDatabase = async () => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localFileUri);
      if (fileInfo.exists) {
        const fileContent = await FileSystem.readAsStringAsync(localFileUri);
        setDictionaryData(JSON.parse(fileContent));
      }
    } catch {
      console.log('Using bundled default database.');
    }
  };

  const syncDatabase = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/dictionary/sync`, {
        method: 'GET',
        headers: {
          'ngrok-skip-browser-warning': 'true',
          Accept: 'application/json',
        },
      });
      const json = await response.json();
      if (json.status === 'success') {
        await FileSystem.writeAsStringAsync(localFileUri, JSON.stringify(json.data));
        setDictionaryData(json.data);
        
        // 💡 GINAMIT ANG HOOK PARA SA SUCCESS
        showAlert("Update Complete", "The offline dictionary has been successfully synced.", "success");
      }
    } catch {
      // 💡 GINAMIT ANG HOOK PARA SA ERROR
      showAlert("Network Error", "An internet connection is required to update the database.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const fuse = new Fuse(dictionaryData, {
    keys: ['definition', 'term'],
    threshold: 0.3,
  });

  const normalizeQuery = (q: string) => {
    let str = q.toLowerCase().trim();
    str = str.replace(/^art\.?\s+/i, 'article ');
    str = str.replace(/^sec\.?\s+/i, 'section ');
    return str;
  };

  // 💡 FIX: INAYOS ANG LOGIC PARA MAHANAP YUNG RAW TEXT KAHIT BINA-GO NG AI YUNG TITLE
  const fetchRawTextFromLocal = (item: any): string => {
    const termSearch = normalizeQuery(item.term || '');
    const basisSearch = normalizeQuery(item.legal_basis || '');

    // 1. Hanapin gamit ang exact term
    let exactMatch = dictionaryData.find((d: any) => d.term && d.term.toLowerCase().trim() === termSearch);
    if (exactMatch) return exactMatch.definition ?? '';

    // 2. Hanapin gamit ang Legal Basis (Dahil madalas ito yung "Article 3")
    exactMatch = dictionaryData.find((d: any) => d.term && d.term.toLowerCase().trim() === basisSearch);
    if (exactMatch) return exactMatch.definition ?? '';

    // 3. Fallback sa Fuzzy Search
    let fuzzyResults = fuse.search(termSearch);
    if (fuzzyResults.length > 0) return fuzzyResults[0].item.definition ?? '';
    
    fuzzyResults = fuse.search(basisSearch);
    if (fuzzyResults.length > 0) return fuzzyResults[0].item.definition ?? '';

    return 'Exact statutory text is not available in the local database. Please refer to official legal documents.';
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    const queryStr = searchQuery.trim();
    const normalizedQ = normalizeQuery(queryStr);

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const response = await fetch(
        `${API_BASE_URL}/dictionary/search?query=${encodeURIComponent(queryStr)}`,
        {
          method: 'GET',
          headers: {
            'ngrok-skip-browser-warning': 'true',
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        setError(errData?.detail || errData?.message || 'Server error occurred.');
        setIsOfflineMode(false);
        return;
      }

      const json = await response.json();

      if (json.status !== 'success') {
        setError(json.message || 'Term not found in the online database.');
        setIsOfflineMode(false);
        return;
      }

      const payload = json.data || json;
      let finalResults = [];

      if (payload.results && Array.isArray(payload.results)) {
        finalResults = payload.results;
      } else if (Array.isArray(payload)) {
        finalResults = payload;
      } else if (payload.term) {
        finalResults = [payload];
      }

      if (finalResults.length > 0) {
        setResults(finalResults);
        setIsOfflineMode(false);
      } else {
        setError('Term not found in the online database.');
      }

    } catch (networkError) {
      console.log('Network Error: Falling back to Offline Mode.');

      const exactMatches = dictionaryData.filter(
        (item: any) => item.term && item.term.toLowerCase().trim().includes(normalizedQ)
      );

      if (exactMatches.length > 0) {
        setResults(exactMatches.slice(0, 10)); 
        setIsOfflineMode(true);
      } else {
        const fuzzyResults = fuse.search(normalizedQ);
        if (fuzzyResults.length > 0) {
          setResults(fuzzyResults.slice(0, 10).map(f => f.item));
          setIsOfflineMode(true);
        } else {
          setError('No internet connection and no offline records found for this search.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setResults([]);
    setError('');
  };

  return (
    <View style={globalStyles.lib_container}>

      <View style={globalStyles.lib_header}>
        <View>
          <Text style={globalStyles.lib_headerTitle}>Lex-Library</Text>
          <Text style={[globalStyles.lib_headerSubtitle, { letterSpacing: 1.5, fontSize: 11, color: '#64748b', fontWeight: '800' }]}>
            {dictionaryData.length} INDEXED LAWS
          </Text>
        </View>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#1e293b',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#334155'
          }}
          onPress={syncDatabase}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <ActivityIndicator size="small" color={COLORS.primaryLight} style={{ marginRight: 8 }} />
              <Text style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>UPDATING</Text>
            </>
          ) : (
            <>
              <Ionicons name="sync" size={14} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
              <Text style={{ color: 'white', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>UPDATE</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={globalStyles.lib_searchArea}>
        <View style={[globalStyles.lib_searchWrapper, { borderRadius: 10 }]}>
          <Ionicons name="search" size={20} color={COLORS.textMuted} />
          <TextInput
            style={globalStyles.lib_searchInput}
            placeholder="Search legal term or Article..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={{ padding: 5 }}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && <LoadingSpinner message="Searching Lex-Simple Engine..." />}

      {error !== '' && !loading && (
        <View style={globalStyles.lib_centerMessage}>
          <Ionicons name="warning-outline" size={48} color={COLORS.danger} style={{ marginBottom: 15 }} />
          <Text style={globalStyles.lib_errorText}>{error}</Text>
        </View>
      )}

      {results.length === 0 && !loading && error === '' && (
        <View style={globalStyles.lib_emptyStateContainer}>
          <View style={globalStyles.lib_emptyStateIconBg}>
            <Ionicons name="library" size={48} color={COLORS.primaryLight} />
          </View>
          <Text style={globalStyles.lib_emptyStateTitle}>Search the Lexicon</Text>
          <Text style={globalStyles.lib_emptyStateSub}>
            Search for general concepts (e.g. "Usury") or specific laws (e.g. "Article 13") to get AI-simplified explanations.
          </Text>

          <TouchableOpacity
            style={[globalStyles.lib_browseBtn, { borderRadius: 10, marginTop: 10 }]}
            onPress={() => navigation.navigate('DictionaryDetailScreen', { dictionaryData })}
          >
            <Ionicons name="list" size={18} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
            <Text style={globalStyles.lib_browseBtnText}>Browse Offline Dictionary</Text>
          </TouchableOpacity>
        </View>
      )}

      {results.length > 0 && !loading && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={globalStyles.lib_resultScrollContent}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 }}>
            
            <Text style={[globalStyles.lib_feedbackText, { marginBottom: 0, paddingHorizontal: 0, flex: 1, paddingRight: 10 }]}>
              Showing results for <Text style={globalStyles.lib_highlightText}>"{searchQuery}"</Text>
            </Text>
            
            <View style={[globalStyles.lib_statusBadge, { borderRadius: 6, marginBottom: 0, backgroundColor: isOfflineMode ? '#1e293b' : 'rgba(16, 185, 129, 0.15)', borderColor: isOfflineMode ? '#334155' : COLORS.success }]}>
              <Ionicons name={isOfflineMode ? 'cloud-offline' : 'checkmark-circle'} size={12} color={isOfflineMode ? '#cbd5e1' : COLORS.success} style={{ marginRight: 6 }} />
              <Text style={[globalStyles.lib_statusBadgeText, { color: isOfflineMode ? '#cbd5e1' : COLORS.success }]}>
                {isOfflineMode ? 'OFFLINE MATCH' : 'AI VERIFIED'}
              </Text>
            </View>
          </View>

          {isOfflineMode && (
            <View style={[globalStyles.lib_offlineWarningBox, { marginHorizontal: 20, borderRadius: 8 }]}>
              <Ionicons name="cloud-offline" size={18} color="#fcd34d" style={{ marginRight: 8 }} />
              <Text style={globalStyles.lib_offlineWarningText}>
                Viewing in Offline Mode. Connect to the internet for AI-simplified explanations.
              </Text>
            </View>
          )}

          <View style={{ paddingHorizontal: 20 }}>
            {results.map((item, index) => (
              <ResultCard key={index} item={item} isOfflineMode={isOfflineMode} getRawText={fetchRawTextFromLocal} />
            ))}
            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      )}

      {/* 💡 ALERT RENDERER PARA SA POP-UPS NG SCREEN NA ITO */}
      <AlertRender />
    </View>
  );
}