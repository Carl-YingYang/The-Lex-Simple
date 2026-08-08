import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Platform, StatusBar, ActivityIndicator, StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import * as FileSystem from 'expo-file-system/legacy';

import defaultDictionary from '../../../data/legal_dictionary.json';
import { COLORS } from '../../../theme/globalStyles';
import LoadingSpinner from '../../../components/LoadingSpinner';
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

// 🚀 REUSABLE RESULT CARD (Sleek UI)
const ResultCard = ({ item, isOfflineMode, getRawText, T }: any) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'basis' | 'example'>(isOfflineMode ? 'basis' : 'ai');
  const [isTextExpanded, setIsTextExpanded] = useState(false);

  const renderExpandableText = (text: string, isItalic: boolean = false) => {
    const shouldTruncate = text.length > 250;
    const displayText = (!isTextExpanded && shouldTruncate) ? text.substring(0, 250) + '...' : text;

    return (
      <View>
        <Text style={[uiStyles.chunkText, { fontStyle: isItalic ? 'italic' : 'normal', color: T.text }]}>
          {isItalic ? `"${displayText}"` : displayText}
        </Text>
        {shouldTruncate && (
          <TouchableOpacity onPress={() => setIsTextExpanded(!isTextExpanded)} style={{ marginTop: 12 }}>
            <Text style={uiStyles.readMoreBtn}>
              {isTextExpanded ? 'Show Less' : 'Read Full Text'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[uiStyles.contentBox, { backgroundColor: T.bg, borderColor: T.border }]}>

      {/* TITLE AT LEGAL BASIS */}
      <View style={{ marginBottom: 15 }}>
        <Text style={[uiStyles.termTitle, { color: T.text }]}>{item.term}</Text>
        <Text style={[uiStyles.basisText, { color: COLORS.primaryLight }]} numberOfLines={2}>
          {item.legal_basis || 'Philippine Law Database'}
        </Text>
      </View>

      <View style={[uiStyles.divider, { backgroundColor: T.border }]} />

      {/* TABS (Itatago kapag offline) */}
      {!isOfflineMode && (
        <View style={[uiStyles.tabsWrapper, { backgroundColor: T.card, borderColor: T.border }]}>
          <TouchableOpacity style={[uiStyles.tabBtn, activeTab === 'basis' && { backgroundColor: COLORS.primary }]} onPress={() => { setActiveTab('basis'); setIsTextExpanded(false); }}>
            <Text style={[uiStyles.tabText, { color: activeTab === 'basis' ? '#fff' : T.subText }]}>Legal Basis</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[uiStyles.tabBtn, activeTab === 'ai' && { backgroundColor: COLORS.primary }]} onPress={() => { setActiveTab('ai'); setIsTextExpanded(false); }}>
            <Text style={[uiStyles.tabText, { color: activeTab === 'ai' ? '#fff' : T.subText }]}>AI Summary</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[uiStyles.tabBtn, activeTab === 'example' && { backgroundColor: COLORS.primary }]} onPress={() => { setActiveTab('example'); setIsTextExpanded(false); }}>
            <Text style={[uiStyles.tabText, { color: activeTab === 'example' ? '#fff' : T.subText }]}>Example</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* DYNAMIC CONTENT */}
      {isOfflineMode || activeTab === 'basis' ? (
        <View style={{ marginTop: 12 }}>
          <Text style={[uiStyles.contentTitle, { color: T.subText }]}>RAW LEGAL PROVISION</Text>
          <View style={[uiStyles.innerBox, { backgroundColor: T.card, borderColor: T.border }]}>
            {renderExpandableText(isOfflineMode ? item.definition : getRawText(item), true)}
          </View>
        </View>
      ) : activeTab === 'ai' ? (
        <View style={{ marginTop: 12 }}>
          <View style={uiStyles.aiHeaderRow}>
            <Ionicons name="sparkles" size={14} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
            <Text style={[uiStyles.contentTitle, { color: T.subText }]}>AI SIMPLIFIED EXPLANATION</Text>
          </View>
          <View style={[uiStyles.innerBox, { backgroundColor: T.card, borderColor: T.border }]}>
            {renderExpandableText(item.definition, false)}
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          <Text style={[uiStyles.contentTitle, { color: T.subText }]}>REAL-WORLD APPLICATION</Text>
          <View style={[uiStyles.innerBox, { backgroundColor: T.card, borderColor: T.border }]}>
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

  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T, isDarkMode } = useTheme(); // 🚀 GLOBAL THEME

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
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
        headers: { 'ngrok-skip-browser-warning': 'true', Accept: 'application/json' },
      });
      const json = await response.json();
      if (json.status === 'success') {
        await FileSystem.writeAsStringAsync(localFileUri, JSON.stringify(json.data));
        setDictionaryData(json.data);
        showAlert("Update Complete", "The offline dictionary has been successfully synced.", "success");
      }
    } catch {
      showAlert("Network Error", "An internet connection is required to update the database.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const fuse = new Fuse(dictionaryData, { keys: ['definition', 'term'], threshold: 0.3 });

  const normalizeQuery = (q: string) => {
    let str = q.toLowerCase().trim();
    str = str.replace(/^art\.?\s+/i, 'article ');
    str = str.replace(/^sec\.?\s+/i, 'section ');
    return str;
  };

  const fetchRawTextFromLocal = (item: any): string => {
    const termSearch = normalizeQuery(item.term || '');
    const basisSearch = normalizeQuery(item.legal_basis || '');

    let exactMatch = dictionaryData.find((d: any) => d.term && d.term.toLowerCase().trim() === termSearch);
    if (exactMatch) return exactMatch.definition ?? '';

    exactMatch = dictionaryData.find((d: any) => d.term && d.term.toLowerCase().trim() === basisSearch);
    if (exactMatch) return exactMatch.definition ?? '';

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
      const response = await fetch(`${API_BASE_URL}/dictionary/search?query=${encodeURIComponent(queryStr)}`, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true', Accept: 'application/json' },
      });

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

      const exactMatches = dictionaryData.filter((item: any) => item.term && item.term.toLowerCase().trim().includes(normalizedQ));

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
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* HEADER */}
      <View style={uiStyles.header}>
        <View>
          <Text style={[uiStyles.headerTitle, { color: T.text }]}>Lex-Library</Text>
          <Text style={[uiStyles.headerSubtitle, { color: T.subText }]}>
            {dictionaryData.length} INDEXED LAWS
          </Text>
        </View>

        <TouchableOpacity style={[uiStyles.syncBtn, { backgroundColor: T.card, borderColor: T.border }]} onPress={syncDatabase} disabled={isSyncing}>
          {isSyncing ? (
            <>
              <ActivityIndicator size="small" color={COLORS.primaryLight} style={{ marginRight: 8 }} />
              <Text style={[uiStyles.syncBtnText, { color: T.subText }]}>UPDATING</Text>
            </>
          ) : (
            <>
              <Ionicons name="sync" size={14} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
              <Text style={[uiStyles.syncBtnText, { color: T.text }]}>UPDATE</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR */}
      <View style={uiStyles.searchArea}>
        <View style={[uiStyles.searchWrapper, { backgroundColor: T.card, borderColor: T.border }]}>
          <Ionicons name="search" size={20} color={T.subText} />
          <TextInput
            style={[uiStyles.searchInput, { color: T.text }]}
            placeholder="Search legal term or Article..."
            placeholderTextColor={T.subText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={{ padding: 5 }}>
              <Ionicons name="close-circle" size={20} color={T.subText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* CONTENT */}
      {loading && <LoadingSpinner message="Searching Lex-Simple Engine..." />}

      {error !== '' && !loading && (
        <View style={uiStyles.centerMessage}>
          <Ionicons name="warning-outline" size={48} color={COLORS.danger} style={{ marginBottom: 15 }} />
          <Text style={[uiStyles.errorText, { color: T.text }]}>{error}</Text>
        </View>
      )}

      {results.length === 0 && !loading && error === '' && (
        <View style={uiStyles.emptyStateContainer}>
          <View style={[uiStyles.emptyStateIconBg, { backgroundColor: T.card, borderColor: T.border }]}>
            <Ionicons name="library" size={48} color={COLORS.primaryLight} />
          </View>
          <Text style={[uiStyles.emptyStateTitle, { color: T.text }]}>Search the Lexicon</Text>
          <Text style={[uiStyles.emptyStateSub, { color: T.subText }]}>
            Search for general concepts (e.g. "Usury") or specific laws (e.g. "Article 13") to get AI-simplified explanations.
          </Text>

          <TouchableOpacity style={[uiStyles.browseBtn, { borderColor: COLORS.primaryLight }]} onPress={() => navigation.navigate('DictionaryDetailScreen', { dictionaryData })}>
            <Ionicons name="list" size={18} color={COLORS.primaryLight} style={{ marginRight: 8 }} />
            <Text style={uiStyles.browseBtnText}>Browse Offline Dictionary</Text>
          </TouchableOpacity>
        </View>
      )}

      {results.length > 0 && !loading && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <Text style={[uiStyles.feedbackText, { color: T.subText }]}>
              Showing results for <Text style={{ color: T.text, fontWeight: 'bold' }}>"{searchQuery}"</Text>
            </Text>

            <View style={[uiStyles.statusBadge, { backgroundColor: isOfflineMode ? T.card : 'rgba(16, 185, 129, 0.15)', borderColor: isOfflineMode ? T.border : COLORS.success }]}>
              <Ionicons name={isOfflineMode ? 'cloud-offline' : 'checkmark-circle'} size={12} color={isOfflineMode ? T.subText : COLORS.success} style={{ marginRight: 6 }} />
              <Text style={[uiStyles.statusBadgeText, { color: isOfflineMode ? T.subText : COLORS.success }]}>
                {isOfflineMode ? 'OFFLINE MATCH' : 'AI VERIFIED'}
              </Text>
            </View>
          </View>

          {isOfflineMode && (
            <View style={[uiStyles.offlineWarningBox, { backgroundColor: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}>
              <Ionicons name="cloud-offline" size={18} color={COLORS.warning} style={{ marginRight: 8 }} />
              <Text style={[uiStyles.offlineWarningText, { color: T.text }]}>
                Viewing in Offline Mode. Connect to the internet for AI-simplified explanations.
              </Text>
            </View>
          )}

          <View>
            {results.map((item, index) => (
              <ResultCard key={index} item={item} isOfflineMode={isOfflineMode} getRawText={fetchRawTextFromLocal} T={T} />
            ))}
            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      )}

      <AlertRender />
    </View>
  );
}

// 🎨 SLEEK & SHARP UI STYLES
const uiStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16,
    // 🚀 AYOS: Nagdagdag ng safe area padding para hindi sumanib sa status bar
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 50,
    paddingBottom: 15,
  },
  headerTitle: { fontSize: 28, fontWeight: '900' },
  headerSubtitle: { letterSpacing: 1.5, fontSize: 11, fontWeight: '800', marginTop: 2 },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1,
  },
  syncBtnText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },

  searchArea: { paddingHorizontal: 16, marginBottom: 15 },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, height: 50,
  },
  searchInput: { flex: 1, fontSize: 15, marginLeft: 12 },

  centerMessage: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15, textAlign: 'center', fontWeight: '500' },

  emptyStateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyStateIconBg: { width: 80, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  emptyStateTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  emptyStateSub: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 30 },
  browseBtn: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 20, borderWidth: 1, backgroundColor: 'rgba(167, 139, 250, 0.05)'
  },
  browseBtnText: { color: COLORS.primaryLight, fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5 },

  feedbackText: { fontSize: 13, flex: 1, paddingRight: 10 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1 },
  statusBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  offlineWarningBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 20 },
  offlineWarningText: { flex: 1, fontSize: 12, lineHeight: 18 },

  // RESULT CARD STYLES
  contentBox: { borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1 },
  termTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 4, lineHeight: 28 },
  basisText: { fontSize: 13, fontWeight: 'bold' },
  divider: { height: 1, marginBottom: 15 },

  tabsWrapper: { flexDirection: 'row', borderRadius: 10, padding: 4, borderWidth: 1 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  tabText: { fontSize: 12, fontWeight: 'bold' },

  contentTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  innerBox: { padding: 14, borderRadius: 8, borderWidth: 1 },
  chunkText: { fontSize: 14, lineHeight: 22 },
  aiHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  readMoreBtn: { color: COLORS.primaryLight, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }
});