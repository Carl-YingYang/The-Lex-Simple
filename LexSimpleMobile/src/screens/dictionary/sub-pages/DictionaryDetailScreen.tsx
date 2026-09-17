import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { postEndpoint } from '../../../services/AiEngine';

const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const WARNING = '#F59E0B';
const ITEMS_PER_PAGE = 20;

type DictionaryItem = {
    term?: string;
    definition?: string;
    legal_basis?: string;
    [key: string]: unknown;
};

type Category = {
    id: string;
    label: string;
    keywords: string[];
};

const CATEGORIES: Category[] = [
    {
        id: 'all',
        label: 'Lahat',
        keywords: [],
    },
    {
        id: 'contracts',
        label: 'Kontrata',
        keywords: [
            'contract',
            'agreement',
            'void',
            'consent',
            'breach',
            'obligation',
            'party',
            'terms',
            'stipulation',
        ],
    },
    {
        id: 'loans',
        label: 'Utang',
        keywords: [
            'loan',
            'debt',
            'interest',
            'usury',
            'mortgage',
            'pledge',
            'pay',
            'credit',
            'finance',
            'lending',
            'creditor',
            'borrower',
            'installment',
        ],
    },
    {
        id: 'rent',
        label: 'Upa',
        keywords: [
            'rent',
            'lease',
            'tenant',
            'landlord',
            'eviction',
            'deposit',
            'lessor',
            'lessee',
            'property',
        ],
    },
];

const getItemKey = (
    item: DictionaryItem,
    index: number
): string => {
    const term = String(item.term || 'legal-term')
        .trim()
        .toLocaleLowerCase();

    return `${term}-${index}`;
};

export default function DictionaryDetailScreen({ route }: any) {
    const routeData = route?.params?.dictionaryData;
    const dictionaryData: DictionaryItem[] = Array.isArray(routeData)
        ? routeData
        : [];

    const [activeCategory, setActiveCategory] = useState('all');
    const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
    const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
    const [loadingAiKey, setLoadingAiKey] = useState<string | null>(
        null
    );
    const [aiExplanations, setAiExplanations] = useState<
        Record<string, string>
    >({});
    const [activeAiKey, setActiveAiKey] = useState<string | null>(null);

    const { showAlert, AlertRender } = useCustomAlert();
    const { colors: T } = useTheme();

    const filteredData = useMemo(() => {
        if (activeCategory === 'all') {
            return dictionaryData;
        }

        const category = CATEGORIES.find(
            (item) => item.id === activeCategory
        );

        if (!category) {
            return dictionaryData;
        }

        return dictionaryData.filter((item) => {
            const searchableText = `${String(
                item.term || ''
            )} ${String(item.definition || '')}`.toLocaleLowerCase();

            return category.keywords.some((keyword) =>
                searchableText.includes(keyword)
            );
        });
    }, [activeCategory, dictionaryData]);

    const visibleData = useMemo(
        () => filteredData.slice(0, visibleCount),
        [filteredData, visibleCount]
    );

    useEffect(() => {
        setVisibleCount(ITEMS_PER_PAGE);
        setExpandedKeys([]);
        setActiveAiKey(null);
        setLoadingAiKey(null);
    }, [activeCategory]);

    const loadMoreItems = (): void => {
        if (visibleCount >= filteredData.length) {
            return;
        }

        setVisibleCount((current) =>
            Math.min(current + ITEMS_PER_PAGE, filteredData.length)
        );
    };

    const toggleExpanded = (itemKey: string): void => {
        setExpandedKeys((current) =>
            current.includes(itemKey)
                ? current.filter((key) => key !== itemKey)
                : [...current, itemKey]
        );
    };

    const handleExplainAI = async (
        itemKey: string,
        term: string,
        rawText: string
    ): Promise<void> => {
        if (activeAiKey === itemKey) {
            setActiveAiKey(null);
            return;
        }

        if (loadingAiKey && loadingAiKey !== itemKey) {
            showAlert(
                'Sandali lang',
                'May isang paliwanag pang ginagawa. Hintayin muna itong matapos.',
                'info'
            );
            return;
        }

        setActiveAiKey(itemKey);

        if (aiExplanations[itemKey]) {
            return;
        }

        setLoadingAiKey(itemKey);

        try {
            const data = await postEndpoint('/explain', {
                title: term,
                raw_text: rawText,
            });

            if (data?.status !== 'success') {
                throw new Error(
                    data?.message || 'AI explanation failed.'
                );
            }

            const explanation =
                data.data?.definition ||
                data.definition ||
                'Walang paliwanag na available.';

            setAiExplanations((current) => ({
                ...current,
                [itemKey]: String(explanation),
            }));
        } catch (error) {
            console.error('[Dictionary] AI explanation failed:', error);
            setActiveAiKey(null);
            showAlert(
                'Hindi makakuha ng paliwanag',
                'Suriin ang internet at backend, pagkatapos ay subukan ulit.',
                'error'
            );
        } finally {
            setLoadingAiKey(null);
        }
    };

    const renderDictionaryCard = ({
        item,
        index,
    }: {
        item: DictionaryItem;
        index: number;
    }) => {
        const itemKey = getItemKey(item, index);
        const isExpanded = expandedKeys.includes(itemKey);
        const isLoading = loadingAiKey === itemKey;
        const isAiOpen = activeAiKey === itemKey;
        const explanation = aiExplanations[itemKey];
        const definition = String(
            item.definition || 'Walang legal text na available.'
        );
        const shouldTruncate = definition.length > 350;
        const displayText =
            !isExpanded && shouldTruncate
                ? `${definition.slice(0, 350).trim()}...`
                : definition;

        return (
            <View
                style={[
                    styles.card,
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
                    style={[styles.basisText, { color: PRIMARY_SOFT }]}
                    numberOfLines={2}
                >
                    {item.legal_basis ||
                        'Philippine legal reference'}
                </Text>

                <View
                    style={[
                        styles.legalTextBox,
                        {
                            backgroundColor: T.bg,
                            borderColor: T.border,
                        },
                    ]}
                >
                    <Text
                        style={[
                            styles.legalTextLabel,
                            { color: T.subText },
                        ]}
                    >
                        Legal text
                    </Text>
                    <Text
                        style={[styles.legalText, { color: T.text }]}
                        selectable
                    >
                        {displayText}
                    </Text>

                    <View style={styles.actionRow}>
                        {shouldTruncate ? (
                            <TouchableOpacity
                                style={styles.textButton}
                                onPress={() => toggleExpanded(itemKey)}
                                accessibilityRole="button"
                            >
                                <Text style={styles.textButtonLabel}>
                                    {isExpanded
                                        ? 'Paikliin'
                                        : 'Basahin lahat'}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View />
                        )}

                        <TouchableOpacity
                            style={[
                                styles.aiButton,
                                isAiOpen && styles.aiButtonOpen,
                                loadingAiKey &&
                                    loadingAiKey !== itemKey &&
                                    styles.disabledButton,
                            ]}
                            onPress={() =>
                                void handleExplainAI(
                                    itemKey,
                                    String(item.term || 'Legal Term'),
                                    definition
                                )
                            }
                            disabled={
                                Boolean(loadingAiKey) &&
                                loadingAiKey !== itemKey
                            }
                            accessibilityRole="button"
                            accessibilityLabel={
                                isAiOpen
                                    ? 'Isara ang paliwanag'
                                    : 'Ipaliwanag gamit ang AI'
                            }
                        >
                            {isLoading ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#FFFFFF"
                                />
                            ) : (
                                <>
                                    <Ionicons
                                        name={
                                            isAiOpen
                                                ? 'close-outline'
                                                : 'chatbubble-ellipses-outline'
                                        }
                                        size={16}
                                        color="#FFFFFF"
                                    />
                                    <Text style={styles.aiButtonText}>
                                        {isAiOpen
                                            ? 'Isara'
                                            : 'Ipaliwanag'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                {isAiOpen && explanation && (
                    <View
                        style={[
                            styles.aiResultBox,
                            {
                                backgroundColor: T.bg,
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <View style={styles.aiResultHeader}>
                            <Ionicons
                                name="sparkles-outline"
                                size={16}
                                color={WARNING}
                            />
                            <Text
                                style={[
                                    styles.aiResultTitle,
                                    { color: T.text },
                                ]}
                            >
                                Simpleng paliwanag
                            </Text>
                        </View>
                        <Text
                            style={[
                                styles.aiResultText,
                                { color: T.text },
                            ]}
                            selectable
                        >
                            {explanation}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <ScreenLayout title="Offline Dictionary" noPadding>
            <View style={[styles.screen, { backgroundColor: T.bg }]}> 
                <View style={styles.summaryRow}>
                    <View style={styles.summaryCopy}>
                        <Text
                            style={[
                                styles.summaryTitle,
                                { color: T.text },
                            ]}
                        >
                            Pumili ng paksa
                        </Text>
                        <Text
                            style={[
                                styles.summaryText,
                                { color: T.subText },
                            ]}
                        >
                            {filteredData.length} legal terms
                        </Text>
                    </View>
                </View>

                <View style={styles.categorySection}>
                    <FlatList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        data={CATEGORIES}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.categoryContent}
                        renderItem={({ item }) => {
                            const selected = activeCategory === item.id;

                            return (
                                <TouchableOpacity
                                    style={[
                                        styles.categoryButton,
                                        {
                                            backgroundColor: selected
                                                ? PRIMARY
                                                : T.card,
                                            borderColor: selected
                                                ? PRIMARY
                                                : T.border,
                                        },
                                    ]}
                                    onPress={() =>
                                        setActiveCategory(item.id)
                                    }
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                >
                                    <Text
                                        style={[
                                            styles.categoryButtonText,
                                            {
                                                color: selected
                                                    ? '#FFFFFF'
                                                    : T.subText,
                                            },
                                        ]}
                                    >
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>

                <FlatList
                    data={visibleData}
                    keyExtractor={(item, index) =>
                        getItemKey(item, index)
                    }
                    renderItem={renderDictionaryCard}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    onEndReached={loadMoreItems}
                    onEndReachedThreshold={0.4}
                    ListEmptyComponent={
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
                                    size={29}
                                    color={T.subText}
                                />
                            </View>
                            <Text
                                style={[
                                    styles.emptyTitle,
                                    { color: T.text },
                                ]}
                            >
                                Walang term sa category na ito
                            </Text>
                        </View>
                    }
                    ListFooterComponent={
                        visibleData.length > 0 ? (
                            <Text
                                style={[
                                    styles.footerText,
                                    { color: T.subText },
                                ]}
                            >
                                {visibleData.length} sa{' '}
                                {filteredData.length} terms
                            </Text>
                        ) : null
                    }
                />
            </View>

            <AlertRender />
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    summaryRow: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 9,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    summaryCopy: {
        flex: 1,
    },
    summaryTitle: {
        fontSize: 14,
        fontWeight: '900',
    },
    summaryText: {
        marginTop: 2,
        fontSize: 11,
        fontWeight: '700',
    },
    categorySection: {
        paddingBottom: 12,
    },
    categoryContent: {
        paddingHorizontal: 16,
        gap: 7,
    },
    categoryButton: {
        minHeight: 36,
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryButtonText: {
        fontSize: 11,
        fontWeight: '800',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
        flexGrow: 1,
    },
    card: {
        borderRadius: 7,
        borderWidth: 1,
        padding: 14,
        marginBottom: 10,
    },
    termTitle: {
        fontSize: 18,
        lineHeight: 23,
        fontWeight: '900',
    },
    basisText: {
        marginTop: 3,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '700',
    },
    legalTextBox: {
        marginTop: 12,
        borderRadius: 7,
        borderWidth: 1,
        padding: 12,
    },
    legalTextLabel: {
        marginBottom: 6,
        fontSize: 10,
        fontWeight: '900',
    },
    legalText: {
        fontSize: 13,
        lineHeight: 20,
    },
    actionRow: {
        minHeight: 36,
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    textButton: {
        minHeight: 34,
        paddingRight: 8,
        justifyContent: 'center',
    },
    textButtonLabel: {
        color: PRIMARY_SOFT,
        fontSize: 11,
        fontWeight: '900',
    },
    aiButton: {
        minWidth: 105,
        minHeight: 36,
        borderRadius: 6,
        paddingHorizontal: 11,
        backgroundColor: PRIMARY,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    aiButtonOpen: {
        backgroundColor: '#475569',
    },
    aiButtonText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
    },
    disabledButton: {
        opacity: 0.45,
    },
    aiResultBox: {
        marginTop: 10,
        borderRadius: 7,
        borderWidth: 1,
        padding: 12,
    },
    aiResultHeader: {
        marginBottom: 7,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    aiResultTitle: {
        fontSize: 12,
        fontWeight: '900',
    },
    aiResultText: {
        fontSize: 13,
        lineHeight: 20,
    },
    emptyState: {
        flex: 1,
        minHeight: 260,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyIcon: {
        width: 58,
        height: 58,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 14,
        fontWeight: '900',
        textAlign: 'center',
    },
    footerText: {
        paddingVertical: 18,
        textAlign: 'center',
        fontSize: 10,
        fontWeight: '700',
    },
});
