// LIBRARY SCREEN VERSION: 7.0.0 — PURPLE NEO-BRUTALISM SPEC
// (UI lang ang nagbago; walang binagong logic/state/network)
// Spec: purple system (zero na ang dilaw/gold/orange), 1.5px standard
// borders, 2px sa CTA, 2–6px radius (squared), predominantly FLAT —
// 2px hard shadow lang sa focal na search CTA.
// Header: unified ScreenLayout app bar (ALL-CAPS title + ink/purple
// square pair + sync icon button sa kanan) — tanggal na ang sariling
// header; ang "{n} legal terms" subtitle ay pumunta sa search section.

import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Fuse from 'fuse.js';
import * as FileSystem from 'expo-file-system/legacy';

import defaultDictionary from '../../../data/legal_dictionary.json';
import { useCustomAlert } from '../../../components/CustomAlert';
import ScreenLayout from '../../../components/ScreenLayout';
import { NeoBadge, NeoButton, getNeoShadow } from '../../../components/Neo';
import { useTheme } from '../../../theme/ThemeContext';
import { BORDER, RADIUS, SHADOW, SPACING, type ThemeColors } from '../../../theme/tokens';
import { explainLegalEntry, explanationErrorMessage, legalEntryKey, legalText } from '../../../services/legalDictionaryService';
import { getApiIdentityHeaders } from '../../../services/installId';

/**
 * Hard-shadow press helper ("sink into paper") — pareho ng helper ng
 * ProfileScreen. Para lang sa mga focal element na may 2px hard shadow
 * (dito: search CTA lang). Flat surfaces ay simpleng dim press.
 */
function makeSink(colors: ThemeColors) {
    return (pressed: boolean, level: 'sm' | 'md' | 'lg'): ViewStyle => {
        if (!pressed) return getNeoShadow(colors, level);
        const offset = SHADOW[level].ios.shadowOffset;
        return {
            elevation: 0,
            transform: [
                { translateX: offset.width },
                { translateY: offset.height },
            ],
        };
    };
}

type DictionaryItem = {
    id?: number;
    term?: string;
    definition?: string;
    raw_text?: string;
    legal_basis?: string;
    example?: string;
    [key: string]: unknown;
};

type ResultTab = 'basis' | 'ai' | 'example';

type ResultCardProps = {
    item: DictionaryItem;
    T: any;
};

const ResultCard = ({
    item,
    T,
}: ResultCardProps) => {
    const [activeTab, setActiveTab] = useState<ResultTab>('basis');
    const [explanation, setExplanation] = useState('');
    const [explanationError, setExplanationError] = useState('');
    const [explaining, setExplaining] = useState(false);
    const [isTextExpanded, setIsTextExpanded] = useState(false);

    useEffect(() => {
        setActiveTab('basis');
        setExplanation('');
        setExplanationError('');
    }, [item]);

    const changeTab = (tab: ResultTab): void => {
        setActiveTab(tab);
        setIsTextExpanded(false);
        if (tab === 'ai' && !explanation && !explaining) {
            setExplaining(true);
            setExplanationError('');
            void explainLegalEntry(item)
                .then(setExplanation)
                .catch((error) => setExplanationError(explanationErrorMessage(error)))
                .finally(() => setExplaining(false));
        }
    };

    const getActiveText = (): string => {
        if (activeTab === 'basis') {
            return legalText(item) || 'Walang legal text na available.';
        }

        if (activeTab === 'example') {
            return String(
                item.example || 'Walang halimbawa na available.'
            );
        }

        return String(
            explanation || explanationError || 'Kumukuha ng paliwanag…'
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
                    borderColor: T.ink,
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
                style={[styles.legalBasis, { color: T.brand }]}
                numberOfLines={2}
            >
                {item.legal_basis || 'Philippine legal reference'}
            </Text>

            <View
                style={[
                    styles.tabBar,
                    {
                        backgroundColor: T.bg,
                        borderColor: T.ink,
                    },
                ]}
            >
                {(
                    [
                        ['ai', 'Paliwanag'],
                        ['basis', 'Batayan'],
                        ...(item.example ? [['example', 'Halimbawa'] as const] : []),
                    ] as const
                ).map(([value, label]) => {
                    const selected = activeTab === value;

                    return (
                        <TouchableOpacity
                            key={value}
                            style={[
                                styles.tabButton,
                                selected && {
                                    backgroundColor: T.brand,
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
                                            ? T.brandText
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

            <View
                style={[
                    styles.resultTextBox,
                    {
                        backgroundColor: T.bg,
                        borderColor: T.ink,
                    },
                ]}
            >
                {activeTab === 'ai' && explaining && <ActivityIndicator size="small" color={T.brand} />}
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
                        <Text style={[styles.readMoreText, { color: T.brand }]}>
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
    const { colors: T } = useTheme();

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
                        ...(await getApiIdentityHeaders()),
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

        if (query.length < 2 || loading) {
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
                        ...(await getApiIdentityHeaders()),
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
    const searchDisabled = searchQuery.trim().length < 2 || loading;
    const sink = makeSink(T);

    return (
        <ScreenLayout
            title="Lex-Library"
            showBackButton={false}
            noPadding
            rightIcon="cloud-download-outline"
            rightIconColor={T.text}
            onRightPress={() => {
                if (!isSyncing) void syncDatabase();
            }}
        >
            <View style={[styles.screen, { backgroundColor: T.bg }]}>
                <View style={styles.searchSection}>
                    <Text
                        style={[styles.metaText, { color: T.subText }]}
                        numberOfLines={1}
                    >
                        {isSyncing
                            ? 'Nag-i-sync ang dictionary…'
                            : `${dictionaryData.length} legal terms`}
                    </Text>

                    <Text style={[styles.searchHeading, { color: T.text }]}>
                        Anong legal term ang hahanapin mo?
                    </Text>

                    <View style={styles.searchRow}>
                        <View
                            style={[
                                styles.searchBox,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
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

                        {/* SEARCH CTA — split-button (spec: purple main
                            section + hiwalay na black square na may puting
                            right-arrow). Focal element kaya may 2px hard
                            shadow na bumabagsak kapag pinindot. */}
                        <Pressable
                            onPress={() => void handleSearch()}
                            disabled={searchDisabled}
                            accessibilityRole="button"
                            accessibilityLabel="Hanapin"
                            accessibilityState={{ disabled: searchDisabled }}
                        >
                            {({ pressed }) => (
                                <View
                                    style={[
                                        styles.searchCta,
                                        searchDisabled
                                            ? styles.disabledButton
                                            : sink(pressed, 'sm'),
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.searchCtaMain,
                                            { backgroundColor: T.brand },
                                        ]}
                                    >
                                        {loading ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={T.brandText}
                                            />
                                        ) : (
                                            <Text
                                                style={[
                                                    styles.searchCtaText,
                                                    { color: T.brandText },
                                                ]}
                                            >
                                                Hanapin
                                            </Text>
                                        )}
                                    </View>
                                    <View
                                        style={[
                                            styles.searchCtaArrow,
                                            { backgroundColor: T.ink },
                                        ]}
                                    >
                                        <Ionicons
                                            name="arrow-forward"
                                            size={16}
                                            color={T.card}
                                        />
                                    </View>
                                </View>
                            )}
                        </Pressable>
                    </View>
                </View>

                {error !== '' && !loading && (
                    <View style={styles.messageState}>
                        <View
                            style={[
                                styles.messageIcon,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                            ]}
                        >
                            <Ionicons
                                name="search-outline"
                                size={27}
                                color={T.danger}
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
                                    borderColor: T.ink,
                                },
                            ]}
                        >
                            <Ionicons
                                name="book-outline"
                                size={32}
                                color={T.brand}
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

                        <NeoButton
                            label="Tingnan ang offline dictionary"
                            variant="secondary"
                            size="sm"
                            icon="library-outline"
                            style={styles.browseButton}
                            onPress={() =>
                                navigation.navigate(
                                    'DictionaryDetailScreen',
                                    { dictionaryData }
                                )
                            }
                        />
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

                            {isOfflineMode ? (
                                <NeoBadge
                                    label="Offline"
                                    variant="neutral"
                                    icon="cloud-offline-outline"
                                />
                            ) : (
                                <NeoBadge
                                    label="Online"
                                    variant="success"
                                    icon="cloud-done-outline"
                                />
                            )}
                        </View>

                        {isOfflineMode && (
                            <View
                                style={[
                                    styles.offlineNotice,
                                    {
                                        backgroundColor: T.brandSoft,
                                        borderColor: T.ink,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="information-circle-outline"
                                    size={18}
                                    color={T.brand}
                                />
                                <Text
                                    style={[
                                        styles.offlineNoticeText,
                                        { color: T.brandDeep },
                                    ]}
                                >
                                    Offline ang legal text. Kailangan ng internet para sa paliwanag ng AI.
                                </Text>
                            </View>
                        )}

                        {results.map((item, index) => (
                            <ResultCard
                                key={`${legalEntryKey(item)}-${index}`}
                                item={item}
                                T={T}
                            />
                        ))}
                    </ScrollView>
                )}

                <AlertRender />
            </View>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },

    // --- SEARCH SECTION (unified na ang header — dito na rin ang dating
    //     "{n} legal terms" subtitle mula sa lumang header) ---
    searchSection: {
        paddingHorizontal: SPACING.lg,
        paddingTop: 12,
        paddingBottom: SPACING.lg,
    },
    metaText: {
        marginBottom: 8,
        fontSize: 10,
        lineHeight: 13,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    searchHeading: {
        marginBottom: 10,
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '900',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    searchRow: {
        flexDirection: 'row',
        gap: SPACING.sm,
    },
    searchBox: {
        flex: 1,
        minWidth: 0,
        height: 48,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
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

    // --- SEARCH CTA (split-button: purple main + black arrow square —
    //     focal, kaya 2px border + 2px hard shadow; flat kapag disabled) ---
    searchCta: {
        height: 48,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.md,
        overflow: 'hidden',
    },
    searchCtaMain: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
    },
    searchCtaText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    searchCtaArrow: {
        width: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledButton: {
        opacity: 0.45,
    },

    // --- MESSAGE / EMPTY STATES (flat, 1.5px ink outlines, walang shadow) ---
    messageState: {
        flex: 1,
        paddingHorizontal: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    messageIcon: {
        width: 58,
        height: 58,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 13,
    },
    messageTitle: {
        fontSize: 17,
        fontWeight: '900',
        marginBottom: 6,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
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
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 13,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 6,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    emptyBody: {
        maxWidth: 310,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginBottom: SPACING.lg,
    },
    browseButton: {
        minWidth: 220,
    },

    // --- RESULTS LIST ---
    resultsContent: {
        paddingHorizontal: SPACING.lg,
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
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },

    // --- OFFLINE NOTICE (pale lavender — spec: informational surfaces) ---
    offlineNotice: {
        minHeight: 44,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        paddingHorizontal: 11,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
        marginBottom: 10,
    },
    offlineNoticeText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '600',
    },

    // --- RESULT CARD (flat — list item, walang shadow per spec;
    //     focal-only ang shadows, hindi sa bawat card) ---
    resultCard: {
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
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
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        padding: 3,
        flexDirection: 'row',
        gap: 3,
    },
    tabButton: {
        flex: 1,
        minHeight: 34,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    tabText: {
        fontSize: 11,
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    resultTextBox: {
        marginTop: 10,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
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
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
});