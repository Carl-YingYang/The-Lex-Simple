// DICTIONARY DETAIL SCREEN VERSION: 8.0.0 — PURPLE NEO-BRUTALISM SPEC
// (UI-flow lang ang nagbago; walang binagong AI/storage/network logic)
// Spec: purple system (zero na ang asul/dilaw/gold/orange), 1.5px standard
// borders, 2px sa CTA, 2–6px radius (squared), predominantly FLAT.
// Pagbabago sa UI (v8.0.0):
//   - "Simpleng paliwanag" (AI explanation) — dating inline box sa card,
//     NGAYON: centered modal (RN Modal transparent + scrim na T.overlay).
//     Sarado ito kapag tinap ang scrim, ang X button, o Android back.
//   - BAGONG CTA sa modal: "Itanong kay Lexie" — split-button (purple main
//     + black arrow square, signature pattern) na nagbubukas ng AskAiScreen
//     (Lexie AI) na may naka-attach na context ng term (attachedFile) at
//     term-specific na suggestedPrompts — pareho ng pattern ng
//     OfflineDetailScreen/ResultScreen papunta kay Lexie. Autosara ang
//     modal pagkatapos mag-navigate.
//   - Lahat ng AI caching/loading/alert logic ay 1:1 pa rin (activeAiKey
//     ang nagbubukas/magsasara ng modal; cached explanation = instant
//     modal; habang kumukuha pa, spinner pa rin ang nasa button).
// v7.0.0 (naio-retain):
//   - Binura ang PRIMARY/PRIMARY_SOFT/WARNING constants — tokens lahat.
//   - Category chips: squared, selected = purple fill + 2px border.
//   - Term cards: flat (1.5px ink border, 6px radius, walang shadow).
//   - AI result surfaces: Pale Lavender (brandSoft) + Deep Purple text.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { getNeoShadow } from '../../../components/Neo';
import { useTheme } from '../../../theme/ThemeContext';
import { BORDER, RADIUS, SPACING } from '../../../theme/tokens';
import { explainLegalEntry, explanationErrorMessage, legalEntryKey, legalText } from '../../../services/legalDictionaryService';

const ITEMS_PER_PAGE = 20;

type DictionaryItem = {
    id?: number;
    term?: string;
    definition?: string;
    raw_text?: string;
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

// Mga handa nang tanong sa Lexie pagkatapos ng paliwanag (term-specific
// na conversation starters — max 6 ang tatanggapin ng AskAiScreen).
const LEXIE_SUGGESTED_PROMPTS = [
    'Ipaliwanag ito nang mas simple.',
    'Magbigay ng halimbawa nito.',
    'Ano ang dapat kong bantayan dito?',
    'Paano ito makakaapekto sa akin?',
];

const getItemKey = (item: DictionaryItem): string => legalEntryKey(item);

export default function DictionaryDetailScreen({
    route,
    navigation,
}: any) {
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

    // Ang term na kasalukuyang may bukas na paliwanag modal — deribado
    // mula sa activeAiKey (walang bagong state).
    const activeAiItem = useMemo(() => {
        if (!activeAiKey) {
            return null;
        }

        return (
            dictionaryData.find(
                (item) => getItemKey(item) === activeAiKey
            ) ?? null
        );
    }, [activeAiKey, dictionaryData]);

    const activeExplanation = activeAiKey
        ? aiExplanations[activeAiKey]
        : undefined;

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
        item: DictionaryItem
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
            const explanation = await explainLegalEntry(item);

            setAiExplanations((current) => ({
                ...current,
                [itemKey]: explanation,
            }));
        } catch (error) {
            console.error('[Dictionary] AI explanation failed:', error);
            setActiveAiKey(null);
            showAlert(
                'Hindi makakuha ng paliwanag',
                explanationErrorMessage(error),
                'error'
            );
        } finally {
            setLoadingAiKey(null);
        }
    };

    const closeAiModal = useCallback((): void => {
        setActiveAiKey(null);
    }, []);

    // "Itanong kay Lexie" — bubuksan ang Lexie AI conversation na may
    // naka-attach na context ng term (attachedFile) + suggestedPrompts
    // (pareho ng param shape ng OfflineDetailScreen/ResultScreen), tapos
    // isasara ang modal para malinis na balikan ang listahan.
    const openAiModalInLexie = (): void => {
        if (!activeAiItem || !activeExplanation) {
            return;
        }

        const termLabel =
            activeAiItem.term || 'Legal Term';
        const basisLabel =
            activeAiItem.legal_basis || 'Philippine legal reference';
        const legalTextContent =
            legalText(activeAiItem) || 'Walang legal text na available.';

        navigation.navigate('AskAiScreen', {
            attachedFile: {
                name: `Term: ${termLabel}`,
                data: `LEGAL DICTIONARY TERM\nTerm: ${termLabel}\nLegal basis: ${basisLabel}\n\nLEGAL TEXT\n${legalTextContent}\n\nSIMPLENG PALIWANAG NG APP\n${activeExplanation}`,
            },
            suggestedPrompts: LEXIE_SUGGESTED_PROMPTS,
        });

        setActiveAiKey(null);
    };

    const renderDictionaryCard = ({
        item,
        index,
    }: {
        item: DictionaryItem;
        index: number;
    }) => {
        const itemKey = getItemKey(item);
        const isExpanded = expandedKeys.includes(itemKey);
        const isLoading = loadingAiKey === itemKey;
        const isAiOpen = activeAiKey === itemKey;
        const definition = legalText(item) || 'Walang legal text na available.';
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
                    style={[styles.basisText, { color: T.brand }]}
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
                            borderColor: T.ink,
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
                                <Text
                                    style={[
                                        styles.textButtonLabel,
                                        { color: T.brand },
                                    ]}
                                >
                                    {isExpanded
                                        ? 'Paikliin'
                                        : 'Basahin lahat'}
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View />
                        )}

                        {/* AI CTA — purple fill + itim na label (spec CTA,
                            2px ink border). Open state = ink fill na may
                            baligtad na kulay ng content. Loading =
                            spinner sa loob ng purple fill. Kapag may
                            laman na ang paliwanag, dito bumubukas ang
                            centered modal. */}
                        <TouchableOpacity
                            style={[
                                styles.aiButton,
                                {
                                    backgroundColor: isAiOpen
                                        ? T.ink
                                        : T.brand,
                                    borderColor: T.ink,
                                },
                                Boolean(loadingAiKey) &&
                                loadingAiKey !== itemKey
                                    ? styles.disabledButton
                                    : null,
                            ]}
                            onPress={() =>
                                void handleExplainAI(
                                    itemKey,
                                    item
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
                                    color={T.brandText}
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
                                        color={
                                            isAiOpen
                                                ? T.card
                                                : T.brandText
                                        }
                                    />
                                    <Text
                                        style={[
                                            styles.aiButtonText,
                                            {
                                                color: isAiOpen
                                                    ? T.card
                                                    : T.brandText,
                                            },
                                        ]}
                                    >
                                        {isAiOpen
                                            ? 'Isara'
                                            : 'Ipaliwanag'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <ScreenLayout title="Offline Dictionary" noPadding>
            <View style={[styles.screen, { backgroundColor: T.bg }]}>
                <View style={styles.introSection}>
                    <Text
                        style={[styles.metaText, { color: T.subText }]}
                        numberOfLines={1}
                    >
                        {filteredData.length} legal terms
                    </Text>
                    <Text
                        style={[styles.introHeading, { color: T.text }]}
                    >
                        Pumili ng paksa
                    </Text>
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
                                                ? T.brand
                                                : T.card,
                                            borderColor: T.ink,
                                        },
                                        selected &&
                                            styles.categoryButtonSelected,
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
                                                    ? T.brandText
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
                        `${getItemKey(item)}-${index}`
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
                                        borderColor: T.ink,
                                    },
                                ]}
                            >
                                <Ionicons
                                    name="book-outline"
                                    size={29}
                                    color={T.brand}
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

            {/* AI PALIWANAG MODAL — centered (spec: modal = focal element,
                2px ink border + 2px hard shadow; scrim = T.overlay token).
                Bumubukas kapag may paliwanag na (fresh o cached); nagsasara
                sa scrim tap, X button, o Android back. */}
            <Modal
                visible={Boolean(activeAiKey && activeExplanation)}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={closeAiModal}
            >
                {activeAiItem && activeExplanation ? (
                    <View
                        style={[
                            styles.aiModalScrim,
                            { backgroundColor: T.overlay },
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.aiModalDismiss}
                            onPress={closeAiModal}
                            activeOpacity={1}
                            accessibilityRole="button"
                            accessibilityLabel="Isara ang paliwanag"
                        />

                        <View
                            style={[
                                styles.aiModalCard,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                                getNeoShadow(T, 'sm'),
                            ]}
                        >
                            {/* HEADER — sparkles + title + X (ink square) */}
                            <View style={styles.aiModalHeader}>
                                <Ionicons
                                    name="sparkles-outline"
                                    size={18}
                                    color={T.brandDeep}
                                />
                                <Text
                                    style={[
                                        styles.aiModalTitle,
                                        { color: T.text },
                                    ]}
                                    numberOfLines={1}
                                >
                                    Simpleng paliwanag
                                </Text>
                                <TouchableOpacity
                                    style={[
                                        styles.aiModalClose,
                                        { backgroundColor: T.ink },
                                    ]}
                                    onPress={closeAiModal}
                                    hitSlop={{
                                        top: 8,
                                        bottom: 8,
                                        left: 8,
                                        right: 8,
                                    }}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel="Isara"
                                >
                                    <Ionicons
                                        name="close"
                                        size={15}
                                        color={T.card}
                                    />
                                </TouchableOpacity>
                            </View>

                            <View
                                style={[
                                    styles.aiModalRule,
                                    { backgroundColor: T.ink },
                                ]}
                            />

                            {/* BODY — term, legal basis, paliwanag */}
                            <ScrollView
                                style={styles.aiModalBody}
                                contentContainerStyle={
                                    styles.aiModalBodyContent
                                }
                                showsVerticalScrollIndicator={false}
                            >
                                <Text
                                    style={[
                                        styles.aiModalTerm,
                                        { color: T.text },
                                    ]}
                                    selectable
                                >
                                    {activeAiItem.term || 'Legal Term'}
                                </Text>
                                <Text
                                    style={[
                                        styles.aiModalBasis,
                                        { color: T.brand },
                                    ]}
                                    numberOfLines={2}
                                >
                                    {activeAiItem.legal_basis ||
                                        'Philippine legal reference'}
                                </Text>
                                <Text
                                    style={[
                                        styles.aiModalText,
                                        { color: T.text },
                                    ]}
                                    selectable
                                >
                                    {activeExplanation}
                                </Text>
                            </ScrollView>

                            {/* FOOTER — split-CTA "Itanong kay Lexie"
                                (purple main + black arrow square) */}
                            <View style={styles.aiModalFooter}>
                                <TouchableOpacity
                                    style={[
                                        styles.lexieCta,
                                        { borderColor: T.ink },
                                    ]}
                                    onPress={openAiModalInLexie}
                                    activeOpacity={0.8}
                                    accessibilityRole="button"
                                    accessibilityLabel="Itanong kay Lexie"
                                    accessibilityHint="Binubuksan ang Lexie AI conversation na may context ng term na ito."
                                >
                                    <View
                                        style={[
                                            styles.lexieCtaMain,
                                            { backgroundColor: T.brand },
                                        ]}
                                    >
                                        <Ionicons
                                            name="chatbubble-ellipses-outline"
                                            size={16}
                                            color={T.brandText}
                                        />
                                        <Text
                                            style={[
                                                styles.lexieCtaText,
                                                { color: T.brandText },
                                            ]}
                                            numberOfLines={1}
                                        >
                                            Itanong kay Lexie
                                        </Text>
                                    </View>
                                    <View
                                        style={[
                                            styles.lexieCtaArrow,
                                            { backgroundColor: T.ink },
                                        ]}
                                    >
                                        <Ionicons
                                            name="arrow-forward"
                                            size={16}
                                            color={T.card}
                                        />
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                ) : null}
            </Modal>

            <AlertRender />
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },

    // --- INTRO SECTION (uppercase meta overline + heading — pareho ng
    //     searchSection convention ng LibraryScreen) ---
    introSection: {
        paddingHorizontal: SPACING.lg,
        paddingTop: 12,
        paddingBottom: SPACING.md,
    },
    metaText: {
        marginBottom: 8,
        fontSize: 10,
        lineHeight: 13,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    introHeading: {
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '900',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },

    // --- CATEGORY CHIPS (squared — spec 2–6px radius; selected = purple
    //     fill + 2px border, unselected = card bg + 1.5px border) ---
    categorySection: {
        paddingBottom: SPACING.md,
    },
    categoryContent: {
        paddingHorizontal: SPACING.lg,
        gap: SPACING.sm,
    },
    categoryButton: {
        minHeight: 36,
        borderRadius: RADIUS.sm,
        borderWidth: BORDER.thin,
        paddingHorizontal: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryButtonSelected: {
        borderWidth: BORDER.thick,
    },
    categoryButtonText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },

    // --- LIST ---
    listContent: {
        paddingHorizontal: SPACING.lg,
        paddingBottom: 40,
        flexGrow: 1,
    },

    // --- TERM CARD (flat — list item, walang shadow per spec; focal-only
    //     ang hard shadows, hindi sa bawat card) ---
    card: {
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
    basisText: {
        marginTop: 3,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '700',
    },
    legalTextBox: {
        marginTop: 12,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        padding: 12,
    },
    legalTextLabel: {
        marginBottom: 6,
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
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
        gap: SPACING.sm,
    },
    textButton: {
        minHeight: 34,
        paddingRight: 8,
        justifyContent: 'center',
    },
    textButtonLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },

    // --- AI CTA (per-card action — 2px ink border ayon sa spec CTA;
    //     kulay ng fill at label naka-inline dahil nag-iiba kada state) ---
    aiButton: {
        minWidth: 105,
        minHeight: 36,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        paddingHorizontal: 11,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    aiButtonText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    disabledButton: {
        opacity: 0.45,
    },

    // --- AI PALIWANAG MODAL (centered; scrim tap = sarado; card = 2px
    //     ink border + 2px hard shadow — focal element ayon sa spec) ---
    aiModalScrim: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
    },
    aiModalDismiss: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    aiModalCard: {
        width: '100%',
        maxWidth: 460,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thick,
        // Walang overflow:'hidden' dito — sa iOS kinakain nito ang sariling
        // hard shadow (masksToBounds). Wala namang lumalampas na content
        // sa rounded corners (may padding ang header/body/footer).
    },
    aiModalHeader: {
        minHeight: 52,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    aiModalTitle: {
        flex: 1,
        minWidth: 0,
        fontSize: 13,
        lineHeight: 17,
        fontWeight: '900',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    aiModalClose: {
        width: 28,
        height: 28,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    aiModalRule: {
        height: BORDER.thick,
    },
    aiModalBody: {
        maxHeight: 400,
    },
    aiModalBodyContent: {
        padding: 16,
    },
    aiModalTerm: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
    },
    aiModalBasis: {
        marginTop: 3,
        marginBottom: 12,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '700',
    },
    aiModalText: {
        fontSize: 13,
        lineHeight: 20,
    },
    aiModalFooter: {
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 16,
    },

    // --- LEXIE SPLIT-CTA (purple main + black arrow square — signature
    //     pattern mula sa searchCta ng LibraryScreen) ---
    lexieCta: {
        height: 48,
        flexDirection: 'row',
        alignItems: 'stretch',
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.md,
        overflow: 'hidden',
    },
    lexieCtaMain: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 14,
    },
    lexieCtaText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    lexieCtaArrow: {
        width: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // --- EMPTY / FOOTER (flat states, uppercase labels) ---
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
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    footerText: {
        paddingVertical: 18,
        textAlign: 'center',
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
});