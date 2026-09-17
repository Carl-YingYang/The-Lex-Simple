import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import * as FileSystem from 'expo-file-system/legacy';

import defaultDictionary from '../../../data/legal_dictionary.json';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';
const DANGER = '#EF4444';

type DictionaryItem = {
    term?: string;
    definition?: string;
    legal_basis?: string;
    example?: string;
    [key: string]: unknown;
};

type ResultTab = 'ai' | 'basis' | 'example';

type ResultCardProps = {
    item: DictionaryItem;
    isOfflineMode: boolean;
    getRawText: (item: DictionaryItem) => string;
    T: any;
};

const ResultCard = ({
    item,
    isOfflineMode,
    getRawText,
    T,
}: ResultCardProps) => {
    const [activeTab, setActiveTab] = useState<ResultTab>(
        isOfflineMode ? 'basis' : 'ai'
    );
    const [isTextExpanded, setIsTextExpanded] = useState(false);

    const changeTab = (tab: ResultTab): void => {
        setActiveTab(tab);
        setIsTextExpanded(false);
    };

    const getActiveText = (): string => {
        if (isOfflineMode || activeTab === 'basis') {
            return isOfflineMode
                ? String(item.definition || '')
                : getRawText(item);
        }

        if (activeTab === 'example') {
            return String(
                item.example || 'Walang halimbawa na available.'
            );
        }

        return String(
            item.definition || 'Walang paliwanag na available.'
        );
    };

    const activeText = getActiveText();
    const shouldTruncate = activeText.length > 350;
    const displayText =
        !isTextExpanded && shouldTruncate
            ? `${activeText.slice(0, 350).trim()}...`
            : activeText;

    return (
        <View
            style={[
                styles.resultCard,
                {
                    backgroundColor: T.card,
                    borderColor: T.border,
                },
            ]}
        >
            <Text
                style={[styles.termTitle, { color: T.text }]}
                selectable
            >
                {item.term || 'Legal Term'}
            </Text>

            <Text
                style={[styles.legalBasis, { color: PRIMARY_SOFT }]}
                numberOfLines={2}
            >
                {item.legal_basis || 'Philippine legal reference'}
            </Text>

            {!isOfflineMode && (
                <View
                    style={[
                        styles.tabBar,
                        {
                            backgroundColor: T.bg,
                            borderColor: T.border,
                        },
                    ]}
                >
                    {(
                        [
                            ['ai', 'Paliwanag'],
                            ['basis', 'Batayan'],
                            ['example', 'Halimbawa'],
                        ] as const
                    ).map(([value, label]) => {
                        const selected = activeTab === value;

                        return (
                            <TouchableOpacity
                                key={value}
                                style={[
                                    styles.tabButton,
                                    selected && {
                                        backgroundColor: PRIMARY,
                                    },
                                ]}
                                onPress={() => changeTab(value)}
                                accessibilityRole="tab"
                                accessibilityState={{ selected }}
                            >
                                <Text
                                    style={[
                                        styles.tabText,
                                        {
                                            color: selected
                                                ? '#FFFFFF'
                                                : T.subText,
                                        },
                                    ]}
                                >
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            )}

            <View
                style={[
                    styles.resultTextBox,
                    {
                        backgroundColor: T.bg,
                        borderColor: T.border,
                    },
                ]}
            >
                <Text
                    style={[styles.resultText, { color: T.text }]}
                    selectable
                >
                    {displayText}
                </Text>

                {shouldTruncate && (
                    <TouchableOpacity
                        style={styles.readMoreButton}
                        onPress={() =>
                            setIsTextExpanded((current) => !current)
                        }
                        accessibilityRole="button"
                    >
                        <Text style={styles.readMoreText}>
                            {isTextExpanded
                                ? 'Paikliin'
                                : 'Basahin lahat'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

export default function LibraryScreen({ navigation }: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<DictionaryItem[]>([]);
    const [error, setError] = useState('');
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [dictionaryData, setDictionaryData] = useState<
        DictionaryItem[]
    >(defaultDictionary as DictionaryItem[]);
    const [isSyncing, setIsSyncing] = useState(false);

    const { showAlert, AlertRender } = useCustomAlert();
    const { colors: T, isDarkMode } = useTheme();

    const API_BASE_URL =
        process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
    const localFileUri = `${FileSystem.documentDirectory}lex_offline_db.json`;

    const fuse = useMemo(
        () =>
            new Fuse(dictionaryData, {
                keys: ['definition', 'term', 'legal_basis'],
                threshold: 0.3,
            }),
        [dictionaryData]
    );

    useEffect(() => {
        const loadLocalDatabase = async (): Promise<void> => {
            try {
                const fileInfo = await FileSystem.getInfoAsync(
                    localFileUri
                );

                if (!fileInfo.exists) {
                    return;
                }

                const fileContent =
                    await FileSystem.readAsStringAsync(localFileUri);
                const parsed = JSON.parse(fileContent);

                if (Array.isArray(parsed)) {
                    setDictionaryData(parsed);
                }
            } catch (loadError) {
                console.log(
                    '[Library] Using bundled dictionary:',
                    loadError
                );
            }
        };

        void loadLocalDatabase();
    }, [localFileUri]);

    const normalizeQuery = (query: string): string => {
        let normalized = query.toLocaleLowerCase().trim();
        normalized = normalized.replace(/^art\.?\s+/i, 'article ');
        normalized = normalized.replace(/^sec\.?\s+/i, 'section ');
        return normalized;
    };

    const fetchRawTextFromLocal = (
        item: DictionaryItem
    ): string => {
        const termSearch = normalizeQuery(String(item.term || ''));
        const basisSearch = normalizeQuery(
            String(item.legal_basis || '')
        );

        const exactTerm = dictionaryData.find(
            (entry) =>
                normalizeQuery(String(entry.term || '')) === termSearch
        );

        if (exactTerm?.definition) {
            return String(exactTerm.definition);
        }

        const exactBasis = dictionaryData.find(
            (entry) =>
                normalizeQuery(String(entry.term || '')) === basisSearch
        );

        if (exactBasis?.definition) {
            return String(exactBasis.definition);
        }

        const fuzzyTerm = fuse.search(termSearch)[0]?.item;
        if (fuzzyTerm?.definition) {
            return String(fuzzyTerm.definition);
        }

        const fuzzyBasis = fuse.search(basisSearch)[0]?.item;
        if (fuzzyBasis?.definition) {
            return String(fuzzyBasis.definition);
        }

        return 'Walang eksaktong legal text sa offline dictionary. Tingnan ang opisyal na legal source para makasiguro.';
    };

    const syncDatabase = async (): Promise<void> => {
        if (isSyncing) {
            return;
        }

        setIsSyncing(true);

        try {
            const response = await fetch(
                `${API_BASE_URL}/dictionary/sync`,
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'ngrok-skip-browser-warning': 'true',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const json = await response.json();

            if (json.status !== 'success' || !Array.isArray(json.data)) {
                throw new Error('Invalid dictionary response.');
            }

            await FileSystem.writeAsStringAsync(
                localFileUri,
                JSON.stringify(json.data)
            );
            setDictionaryData(json.data);

            showAlert(
                'Updated na',
                'Naka-save na sa phone ang pinakabagong dictionary.',
                'success'
            );
        } catch (syncError) {
            console.error('[Library] Sync failed:', syncError);
            showAlert(
                'Hindi ma-update',
                'Kailangan ng internet para ma-update ang dictionary.',
                'error'
            );
        } finally {
            setIsSyncing(false);
        }
    };

    const searchOffline = (normalizedQuery: string): void => {
        const exactMatches = dictionaryData.filter((item) =>
            normalizeQuery(String(item.term || '')).includes(
                normalizedQuery
            )
        );

        if (exactMatches.length > 0) {
            setResults(exactMatches.slice(0, 10));
            setIsOfflineMode(true);
            return;
        }

        const fuzzyMatches = fuse.search(normalizedQuery);
        if (fuzzyMatches.length > 0) {
            setResults(
                fuzzyMatches.slice(0, 10).map((result) => result.item)
            );
            setIsOfflineMode(true);
            return;
        }

        setError(
            'Walang nakitang tugma sa offline dictionary. Subukan ang mas maikling salita.'
        );
    };

    const handleSearch = async (): Promise<void> => {
        const query = searchQuery.trim();

        if (!query || loading) {
            return;
        }

        setLoading(true);
        setError('');
        setResults([]);

        try {
            const response = await fetch(
                `${API_BASE_URL}/dictionary/search?query=${encodeURIComponent(query)}`,
                {
                    method: 'GET',
                    headers: {
                        Accept: 'application/json',
                        'ngrok-skip-browser-warning': 'true',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Server Error: ${response.status}`);
            }

            const json = await response.json();
            if (json.status !== 'success') {
                throw new Error(json.message || 'Search failed.');
            }

            const payload = json.data || json;
            let onlineResults: DictionaryItem[] = [];

            if (Array.isArray(payload.results)) {
                onlineResults = payload.results;
            } else if (Array.isArray(payload)) {
                onlineResults = payload;
            } else if (payload.term) {
                onlineResults = [payload];
            }

            if (onlineResults.length === 0) {
                setError(
                    'Walang nakitang resulta. Subukan ang ibang termino.'
                );
                return;
            }

            setResults(onlineResults);
            setIsOfflineMode(false);
        } catch (searchError) {
            console.log(
                '[Library] Online search unavailable; using offline dictionary:',
                searchError
            );
            searchOffline(normalizeQuery(query));
        } finally {
            setLoading(false);
        }
    };

    const clearSearch = (): void => {
        setSearchQuery('');
        setResults([]);
        setError('');
        setIsOfflineMode(false);
    };

    const hasResults = results.length > 0 && !loading;
    const showEmptyState =
        results.length === 0 && !loading && error === '';

    return (
        <View style={[styles.screen, { backgroundColor: T.bg }]}> 
            <StatusBar
                barStyle={
                    isDarkMode ? 'light-content' : 'dark-content'
                }
                backgroundColor={T.bg}
            />

            <View style={styles.header}>
                <View style={styles.headerCopy}>
                    <Text style={[styles.headerTitle, { color: T.text }]}> 
                        Lex-Library
                    </Text>
                    <Text
                        style={[
                            styles.headerSubtitle,
                            { color: T.subText },
                        ]}
                    >
                        {dictionaryData.length} legal terms
                    </Text>
                </View>

                <TouchableOpacity
                    style={[
                        styles.headerButton,
                        {
                            backgroundColor: T.card,
                            borderColor: T.border,
                        },
                    ]}
                    onPress={() => void syncDatabase()}
                    disabled={isSyncing}
                    accessibilityRole="button"
                    accessibilityLabel="I-update ang offline dictionary"
                >
                    {isSyncing ? (
                        <ActivityIndicator
                            size="small"
                            color={PRIMARY_SOFT}
                        />
                    ) : (
                        <Ionicons
                            name="cloud-download-outline"
                            size={21}
                            color={T.text}
                        />
                    )}
                </TouchableOpacity>
            </View>

            <View style={styles.searchSection}>
                <Text style={[styles.searchHeading, { color: T.text }]}> 
                    Anong legal term ang hahanapin mo?
                </Text>

                <View style={styles.searchRow}>
                    <View
                        style={[
                            styles.searchBox,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="search-outline"
                            size={19}
                            color={T.subText}
                        />
                        <TextInput
                            style={[
                                styles.searchInput,
                                { color: T.text },
                            ]}
                            placeholder="Hal. Usury o Article 13"
                            placeholderTextColor={T.subText}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={() => void handleSearch()}
                            returnKeyType="search"
                            autoCapitalize="none"
                            autoCorrect={false}
                            accessibilityLabel="Legal term"
                        />

                        {searchQuery.length > 0 && (
                            <TouchableOpacity
                                style={styles.clearButton}
                                onPress={clearSearch}
                                accessibilityRole="button"
                                accessibilityLabel="Burahin ang search"
                            >
                                <Ionicons
                                    name="close-circle"
                                    size={19}
                                    color={T.subText}
                                />
                            </TouchableOpacity>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[
                            styles.searchButton,
                            (!searchQuery.trim() || loading) &&
                                styles.disabledButton,
                        ]}
                        onPress={() => void handleSearch()}
                        disabled={!searchQuery.trim() || loading}
                        accessibilityRole="button"
                        accessibilityLabel="Hanapin"
                    >
                        {loading ? (
                            <ActivityIndicator
                                size="small"
                                color="#FFFFFF"
                            />
                        ) : (
                            <Text style={styles.searchButtonText}>
                                Hanapin
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {error !== '' && !loading && (
                <View style={styles.messageState}>
                    <View
                        style={[
                            styles.messageIcon,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="search-outline"
                            size={27}
                            color={DANGER}
                        />
                    </View>
                    <Text style={[styles.messageTitle, { color: T.text }]}> 
                        Walang resulta
                    </Text>
                    <Text
                        style={[
                            styles.messageBody,
                            { color: T.subText },
                        ]}
                    >
                        {error}
                    </Text>
                </View>
            )}

            {showEmptyState && (
                <View style={styles.emptyState}>
                    <View
                        style={[
                            styles.emptyIcon,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="book-outline"
                            size={32}
                            color={PRIMARY_SOFT}
                        />
                    </View>

                    <Text style={[styles.emptyTitle, { color: T.text }]}> 
                        Legal dictionary
                    </Text>
                    <Text
                        style={[
                            styles.emptyBody,
                            { color: T.subText },
                        ]}
                    >
                        Maghanap ng legal term o tingnan ang naka-save na
                        dictionary.
                    </Text>

                    <TouchableOpacity
                        style={[
                            styles.browseButton,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                        onPress={() =>
                            navigation.navigate(
                                'DictionaryDetailScreen',
                                { dictionaryData }
                            )
                        }
                        accessibilityRole="button"
                    >
                        <Ionicons
                            name="library-outline"
                            size={19}
                            color={PRIMARY_SOFT}
                        />
                        <Text
                            style={[
                                styles.browseButtonText,
                                { color: T.text },
                            ]}
                        >
                            Tingnan ang offline dictionary
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {hasResults && (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.resultsContent}
                >
                    <View style={styles.resultsHeader}>
                        <Text
                            style={[
                                styles.resultsCount,
                                { color: T.text },
                            ]}
                        >
                            {results.length} resulta
                        </Text>

                        <View
                            style={[
                                styles.modeBadge,
                                {
                                    backgroundColor: T.card,
                                    borderColor: isOfflineMode
                                        ? T.border
                                        : SUCCESS,
                                },
                            ]}
                        >
                            <Ionicons
                                name={
                                    isOfflineMode
                                        ? 'cloud-offline-outline'
                                        : 'cloud-done-outline'
                                }
                                size={13}
                                color={
                                    isOfflineMode ? T.subText : SUCCESS
                                }
                            />
                            <Text
                                style={[
                                    styles.modeBadgeText,
                                    {
                                        color: isOfflineMode
                                            ? T.subText
                                            : SUCCESS,
                                    },
                                ]}
                            >
                                {isOfflineMode ? 'Offline' : 'Online'}
                            </Text>
                        </View>
                    </View>

                    {isOfflineMode && (
                        <View
                            style={[
                                styles.offlineNotice,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Ionicons
                                name="information-circle-outline"
                                size={18}
                                color={WARNING}
                            />
                            <Text
                                style={[
                                    styles.offlineNoticeText,
                                    { color: T.subText },
                                ]}
                            >
                                Offline result ito. Kumonekta para sa AI
                                explanation.
                            </Text>
                        </View>
                    )}

                    {results.map((item, index) => (
                        <ResultCard
                            key={`${String(item.term || 'term')}-${index}`}
                            item={item}
                            isOfflineMode={isOfflineMode}
                            getRawText={fetchRawTextFromLocal}
                            T={T}
                        />
                    ))}
                </ScrollView>
            )}

            <AlertRender />
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    header: {
        minHeight: 70,
        paddingHorizontal: 16,
        paddingTop:
            Platform.OS === 'android'
                ? (StatusBar.currentHeight || 24) + 8
                : 48,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerCopy: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 25,
        fontWeight: '900',
        letterSpacing: -0.4,
    },
    headerSubtitle: {
        marginTop: 2,
        fontSize: 11,
        fontWeight: '700',
    },
    headerButton: {
        width: 42,
        height: 42,
        borderRadius: 7,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchSection: {
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: 16,
    },
    searchHeading: {
        marginBottom: 10,
        fontSize: 14,
        fontWeight: '900',
    },
    searchRow: {
        flexDirection: 'row',
        gap: 8,
    },
    searchBox: {
        flex: 1,
        minWidth: 0,
        height: 48,
        borderRadius: 7,
        borderWidth: 1,
        paddingLeft: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
        height: '100%',
        paddingHorizontal: 9,
        fontSize: 13,
    },
    clearButton: {
        width: 38,
        height: 46,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchButton: {
        minWidth: 82,
        height: 48,
        borderRadius: 7,
        paddingHorizontal: 12,
        backgroundColor: PRIMARY,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '900',
    },
    disabledButton: {
        opacity: 0.45,
    },
    messageState: {
        flex: 1,
        paddingHorizontal: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageIcon: {
        width: 58,
        height: 58,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 13,
    },
    messageTitle: {
        fontSize: 17,
        fontWeight: '900',
        marginBottom: 6,
    },
    messageBody: {
        maxWidth: 300,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    emptyState: {
        flex: 1,
        paddingHorizontal: 28,
        paddingBottom: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIcon: {
        width: 62,
        height: 62,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 13,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 6,
    },
    emptyBody: {
        maxWidth: 310,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: 16,
    },
    browseButton: {
        minHeight: 46,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    browseButtonText: {
        fontSize: 12,
        fontWeight: '900',
    },
    resultsContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    resultsHeader: {
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    resultsCount: {
        fontSize: 14,
        fontWeight: '900',
    },
    modeBadge: {
        minHeight: 28,
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 9,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    modeBadgeText: {
        fontSize: 10,
        fontWeight: '900',
    },
    offlineNotice: {
        minHeight: 44,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 11,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    offlineNoticeText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 16,
    },
    resultCard: {
        borderRadius: 7,
        borderWidth: 1,
        padding: 14,
        marginBottom: 10,
    },
    termTitle: {
        fontSize: 19,
        lineHeight: 24,
        fontWeight: '900',
    },
    legalBasis: {
        marginTop: 3,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '700',
    },
    tabBar: {
        marginTop: 13,
        borderRadius: 7,
        borderWidth: 1,
        padding: 3,
        flexDirection: 'row',
        gap: 3,
    },
    tabButton: {
        flex: 1,
        minHeight: 34,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    tabText: {
        fontSize: 11,
        fontWeight: '800',
        textAlign: 'center',
    },
    resultTextBox: {
        marginTop: 10,
        borderRadius: 7,
        borderWidth: 1,
        padding: 12,
    },
    resultText: {
        fontSize: 13,
        lineHeight: 20,
    },
    readMoreButton: {
        alignSelf: 'flex-start',
        minHeight: 32,
        justifyContent: 'center',
        marginTop: 5,
    },
    readMoreText: {
        color: PRIMARY_SOFT,
        fontSize: 11,
        fontWeight: '900',
    },
});
