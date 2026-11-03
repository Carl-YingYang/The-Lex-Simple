// SCAN SCREEN VERSION: 7.0.2 — PURPLE NEO-BRUTALISM SPEC
// (UI lang ang nagbago; walang binagong logic/state/network)
// 7.0.2: ang "Legal Literacy Tool" popup ay in-screen neo modal na
// (hindi na dumadaan sa CustomAlert) — kaya visible na ngayon ang
// purple spec dito: 2px ink outline, hard shadow, purple CTA na itim
// ang text. Same pa rin ang text at action; walang binagong logic.
// 7.0.1: inalis ang lokal na mount ng FloatingProcessIndicator —
// may global mount na sa AppNavigator, at ang dalawang sabay na
// instance ang dahilan ng dobleng floating card sa Scan tab.
// Spec: purple system (walang blue/dilaw/gold), 1.5px standard borders,
// 2px sa CTA/informational CTA, 2–6px radius (squared), predominantly
// FLAT — hard shadow lang sa rename modal (focal surface).
// Header: unified ScreenLayout app bar (ALL-CAPS title + ink/purple
// square pair). Theme toggle ang nasa right slot; ang info button ay
// sumanib sa disclaimer row (pareho ng action — showLegalInfo).
// Status colors: analyzing = purple (progreso per spec), scanned =
// success green (feedback), iba = muted gray.

import React, {
    useCallback,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
    type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import {
    deleteScans,
    listScanHistory,
    recoverInterruptedScans,
    renameScan,
    subscribeScanHistory,
} from '../../../services/scanHistoryStorage';
import type { ScanHistoryItem } from '../../../services/scanHistoryStorage';

import { useCustomAlert } from '../../../components/CustomAlert';
import { NeoButton, NeoIconButton, getNeoShadow } from '../../../components/Neo';
import ScreenLayout from '../../../components/ScreenLayout';
import { useBackgroundProcess } from '../../../context/BackgroundProcessContext';
import { useTheme } from '../../../theme/ThemeContext';
import { BORDER, RADIUS, SHADOW, SPACING, type ThemeColors } from '../../../theme/tokens';

/**
 * Hard-shadow press helper ("sink into paper") — pareho ng helper ng
 * ProfileScreen. Para lang sa focal element na may 2px hard shadow
 * (dito: I-save button ng rename modal).
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

type HistoryFilter = 'all' | 'scanned' | 'unscanned';

type ImagePreview = {
    images: string[];
    title: string;
} | null;

type SourceOptionProps = {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    title: string;
    accent: string;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    iconBackgroundColor: string;
    onPress: () => void;
};

const SourceOption = ({
    icon,
    title,
    accent,
    backgroundColor,
    borderColor,
    textColor,
    iconBackgroundColor,
    onPress,
}: SourceOptionProps) => (
    <TouchableOpacity
        style={[
            styles.sourceOption,
            { backgroundColor, borderColor },
        ]}
        onPress={onPress}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={title}
    >
        <View
            style={[
                styles.sourceOptionIcon,
                {
                    borderColor: accent,
                    backgroundColor: iconBackgroundColor,
                },
            ]}
        >
            <Ionicons
                name={icon}
                size={18}
                color={accent}
            />
        </View>

        <Text
            style={[styles.sourceOptionText, { color: textColor }]}
            numberOfLines={2}
        >
            {title}
        </Text>
    </TouchableOpacity>
);

const getHistoryImages = (
    item: ScanHistoryItem
): string[] => {
    const candidates = item.pageUris?.length
        ? item.pageUris
        : item.images?.length
          ? item.images
          : item.uri
            ? [item.uri]
            : [];

    return candidates.filter(
        (value): value is string =>
            typeof value === 'string' &&
            value.trim().length > 0
    );
};

const getItemDate = (value: string): string => {
    if (!value) {
        return 'Walang petsa';
    }

    return value.split(',')[0]?.trim() || value;
};

const isGenericTitle = (value: string): boolean => {
    const normalized = value.trim().toLocaleLowerCase();

    return (
        normalized === 'camera scan' ||
        normalized === 'gallery upload' ||
        normalized === 'document file' ||
        normalized === 'document scan' ||
        normalized.startsWith('document scan (') ||
        normalized.includes('pages)')
        || /^dokumento\s+\d+\s*·\s*pahina/i.test(normalized)
    );
};

export default function ScanScreen({ navigation }: any) {
    const { isDarkMode, toggleTheme, colors: T } = useTheme();
    const { width: previewWidth } = useWindowDimensions();
    const {
        isProcessing: isGlobalProcessing,
        activeFileId,
    } = useBackgroundProcess();
    const { showAlert, AlertRender } = useCustomAlert();

    const [historyItems, setHistoryItems] = useState<
        ScanHistoryItem[]
    >([]);
    const [activeFilter, setActiveFilter] =
        useState<HistoryFilter>('all');
    const [renameModalVisible, setRenameModalVisible] =
        useState(false);
    const [itemToRename, setItemToRename] =
        useState<ScanHistoryItem | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [visibleCount, setVisibleCount] = useState(15);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [imagePreview, setImagePreview] = useState<ImagePreview>(null);
    const [previewPage, setPreviewPage] = useState(0);
    // v7.0.2 — Legal Literacy Tool popup: in-screen modal na ngayon
    // (hindi CustomAlert) para masunod ang purple neo-brutalism spec.
    const [legalInfoVisible, setLegalInfoVisible] = useState(false);
    const lastLongPressedIdRef = useRef<string | null>(null);
    const isSelecting = selectedIds.size > 0;
    const sink = makeSink(T);

    const loadHistory = useCallback(async (): Promise<void> => {
        try {
            const parsed = await recoverInterruptedScans(
                isGlobalProcessing,
                activeFileId
            );
            const sortedHistory = parsed.sort(
                (a, b) =>
                    (b.updatedAt || Number.parseInt(String(b.id), 10) || 0) -
                    (a.updatedAt || Number.parseInt(String(a.id), 10) || 0)
            );
            setHistoryItems(sortedHistory);
        } catch (error) {
            console.error(
                '[ScanScreen] Failed to load history:',
                error
            );
            setHistoryItems([]);
        }
    }, [isGlobalProcessing, activeFileId]);

    useFocusEffect(
        useCallback(() => {
            void loadHistory();
            const unsubscribe = subscribeScanHistory(() => {
                void listScanHistory().then((items) =>
                    setHistoryItems([...items].sort((a, b) =>
                        (b.updatedAt || 0) - (a.updatedAt || 0)
                    ))
                );
            });
            return unsubscribe;
        }, [loadHistory])
    );

    const getDisplayTitle = useCallback(
        (item: ScanHistoryItem): string => {
            let title = item.title?.trim() || 'Document';

            if (!item.userRenamed && isGenericTitle(title)) {
                const analyzedTitle =
                    item.analysisResult?.documentTitle;

                if (
                    item.status === 'scanned' &&
                    typeof analyzedTitle === 'string' &&
                    analyzedTitle.trim()
                ) {
                    title = analyzedTitle.trim();
                } else if (item.ocrText) {
                    const firstUsefulLine = item.ocrText
                        .split('\n')
                        .map((line) => line.trim())
                        .find(
                            (line) =>
                                line.length > 4 &&
                                !/^--- Page \d+ ---$/i.test(line)
                        );

                    if (firstUsefulLine) {
                        title = firstUsefulLine;
                    }
                }
            }

            return title.length > 42
                ? `${title.slice(0, 42).trim()}...`
                : title;
        },
        []
    );

    const filteredHistory = useMemo(
        () =>
            historyItems.filter((item) =>
                activeFilter === 'all'
                    ? true
                    : activeFilter === 'unscanned'
                      ? item.status !== 'scanned'
                      : item.status === 'scanned'
            ),
        [activeFilter, historyItems]
    );
    const visibleHistory = useMemo(
        () => filteredHistory.slice(0, visibleCount),
        [filteredHistory, visibleCount]
    );
    const toggleSelection = (id: string): void => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const showLegalInfo = (): void => {
        // v7.0.2 — in-screen modal na ang rendering (tingnan ang LEGAL
        // LITERACY MODAL sa JSX); same pa rin ang text at flow.
        setLegalInfoVisible(true);
    };

    const handleCardPress = (item: ScanHistoryItem): void => {
        if (lastLongPressedIdRef.current === item.id) {
            lastLongPressedIdRef.current = null;
            return;
        }
        if (isSelecting) {
            toggleSelection(item.id);
            return;
        }
        if (
            item.draftPages?.length &&
            (item.status === 'draft' || item.processingState === 'needs-retry')
        ) {
            navigation.navigate('BatchEditScreen', {
                pages: item.draftPages,
                draftId: item.id,
                source: item.type,
            });
            return;
        }
        if (item.status === 'scanned' && item.analysisResult) {
            navigation.navigate('ResultScreen', {
                analysisResult: item.analysisResult,
                historyItem: item,
            });
            return;
        }

        navigation.navigate('OfflineDetailScreen', {
            scanItem: item,
        });
    };

    const openImagePreview = (item: ScanHistoryItem): void => {
        if (isSelecting) {
            handleCardPress(item);
            return;
        }
        const images = getHistoryImages(item);
        if (item.type === 'document' || images.length === 0) {
            handleCardPress(item);
            return;
        }
        setPreviewPage(0);
        setImagePreview({ images, title: getDisplayTitle(item) });
    };

    const closeImagePreview = (): void => {
        setImagePreview(null);
        setPreviewPage(0);
    };

    const handleCardLongPress = (
        item: ScanHistoryItem,
        isAnalyzing: boolean
    ): void => {
        if (isAnalyzing) return;
        lastLongPressedIdRef.current = item.id;
        toggleSelection(item.id);
        setTimeout(() => {
            if (lastLongPressedIdRef.current === item.id) {
                lastLongPressedIdRef.current = null;
            }
        }, 500);
    };

    const openRenameModal = (item: ScanHistoryItem): void => {
        setItemToRename(item);
        setNewTitle(getDisplayTitle(item));
        setRenameModalVisible(true);
    };

    const closeRenameModal = (): void => {
        setRenameModalVisible(false);
        setItemToRename(null);
        setNewTitle('');
    };

    const saveRenamedTitle = async (): Promise<void> => {
        const cleanTitle = newTitle.trim();
        if (!itemToRename || !cleanTitle) {
            return;
        }

        try {
            const updatedHistory = await renameScan(itemToRename.id, cleanTitle);
            setHistoryItems(updatedHistory);
            closeRenameModal();
        } catch (error) {
            console.error(
                '[ScanScreen] Rename failed:',
                error
            );
            showAlert(
                'Hindi Napalitan ang Pangalan',
                'Subukan ulit pagkatapos ng ilang sandali.',
                'error',
                [{ text: 'OK' }]
            );
        }
    };

    const deleteItem = async (id: string): Promise<void> => {
        try {
            const updatedHistory = await deleteScans([id]);
            setHistoryItems(updatedHistory);
        } catch (error) {
            console.error(
                '[ScanScreen] Delete failed:',
                error
            );
            showAlert(
                'Hindi Nabura ang File',
                'Subukan ulit pagkatapos ng ilang sandali.',
                'error',
                [{ text: 'OK' }]
            );
        }
    };
    const deleteSelected = async (): Promise<void> => {
        const ids = Array.from(selectedIds);
        const processingSelection = historyItems.some((item) =>
            selectedIds.has(item.id) &&
            isGlobalProcessing &&
            (activeFileId === item.id ||
                (activeFileId === null && item.processingState === 'analyzing'))
        );
        if (processingSelection) {
            showAlert(
                'May sinusuring file',
                'Hintaying matapos ang pagsusuri bago ito burahin.',
                'warning',
                [{ text: 'OK' }]
            );
            return;
        }
        try {
            const updated = await deleteScans(ids);
            setHistoryItems(updated);
            setSelectedIds(new Set());
        } catch (error) {
            console.error('[ScanScreen] Bulk delete failed:', error);
            showAlert('Hindi nabura ang files', 'Pakisubukan ulit.', 'error', [{ text: 'OK' }]);
        }
    };
    const confirmDeleteSelected = (): void => {
        showAlert(
            `Burahin ang ${selectedIds.size} file?`,
            'Permanenteng aalisin ang mga napiling file.',
            'warning',
            [
                { text: 'Kanselahin', style: 'cancel' },
                { text: 'Burahin', style: 'destructive', onPress: () => void deleteSelected() },
            ]
        );
    };

    const handleDelete = (item: ScanHistoryItem): void => {
        showAlert(
            'Burahin ang File?',
            `Permanenteng aalisin ang “${getDisplayTitle(item)}” sa Recent Files.`,
            'warning',
            [
                { text: 'Huwag Burahin', style: 'cancel' },
                {
                    text: 'Burahin',
                    style: 'destructive',
                    onPress: () => void deleteItem(item.id),
                },
            ]
        );
    };

    const openHistoryOptions = (
        item: ScanHistoryItem
    ): void => {
        showAlert(
            getDisplayTitle(item),
            'Piliin kung ano ang gusto mong gawin sa file.',
            'info',
            [
                {
                    text: 'Palitan ang Pangalan',
                    onPress: () => openRenameModal(item),
                },
                {
                    text: 'Burahin',
                    style: 'destructive',
                    onPress: () => handleDelete(item),
                },
                {
                    text: 'Kanselahin',
                    style: 'cancel',
                },
            ]
        );
    };

    const renderHistoryItem = ({
        item,
    }: {
        item: ScanHistoryItem;
    }) => {
        const isAnalyzing =
            isGlobalProcessing &&
            (activeFileId === item.id ||
                (activeFileId === null && item.processingState === 'analyzing'));
        const images = getHistoryImages(item);
        const previewUri = item.thumbnailUri || images[0];
        const pageCount = images.length;

        return (
            <View
                style={[
                    styles.historyCard,
                    {
                        backgroundColor: T.card,
                        borderColor: T.ink,
                    },
                ]}
            >
                <View style={styles.historyMainPress}>
                    <TouchableOpacity
                        style={styles.previewTouchArea}
                        onPress={(event) => {
                            event.stopPropagation();
                            openImagePreview(item);
                        }}
                        onLongPress={(event) => {
                            event.stopPropagation();
                            handleCardLongPress(item, isAnalyzing);
                        }}
                        disabled={isAnalyzing && item.type === 'document'}
                        activeOpacity={0.78}
                        accessibilityRole="button"
                        accessibilityLabel={
                            isSelecting
                                ? `Piliin ang ${getDisplayTitle(item)}`
                                : item.type !== 'document' && images.length > 0
                                  ? `Tingnan ang ${pageCount} larawan ng ${getDisplayTitle(item)}`
                                  : `Buksan ang ${getDisplayTitle(item)}`
                        }
                    >
                        <View
                            style={[
                                styles.previewBox,
                                {
                                    backgroundColor: T.bg,
                                    borderColor: T.ink,
                                },
                            ]}
                        >
                            {selectedIds.has(item.id) ? (
                                <Ionicons name="checkmark-circle" size={28} color={T.brand} />
                            ) : item.type === 'document' || !previewUri ? (
                                <Ionicons
                                    name="document-text-outline"
                                    size={27}
                                    color={T.brand}
                                />
                            ) : (
                                <Image
                                    source={{ uri: previewUri }}
                                    style={styles.previewImage}
                                    resizeMode="cover"
                                />
                            )}

                            {pageCount > 1 && (
                                <View style={styles.pageCountBadge}>
                                    <Text style={styles.pageCountText}>
                                        {pageCount}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.historyContent}
                        onPress={() => handleCardPress(item)}
                        onLongPress={() => handleCardLongPress(item, isAnalyzing)}
                        disabled={isAnalyzing}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={`Buksan ang ${getDisplayTitle(item)}`}
                    >
                        <Text
                            style={[
                                styles.historyTitle,
                                { color: T.text },
                            ]}
                            numberOfLines={2}
                        >
                            {getDisplayTitle(item)}
                        </Text>

                        <View style={styles.metaRow}>
                            <Ionicons
                                name={
                                    item.type === 'camera'
                                        ? 'camera-outline'
                                        : item.type === 'gallery'
                                          ? 'images-outline'
                                          : 'document-outline'
                                }
                                size={13}
                                color={T.subText}
                            />
                            <Text
                                style={[
                                    styles.metaText,
                                    { color: T.subText },
                                ]}
                                numberOfLines={1}
                            >
                                {item.type === 'camera'
                                    ? 'Camera'
                                    : item.type === 'gallery'
                                      ? 'Gallery'
                                      : 'File'}
                                {'  ·  '}
                                {getItemDate(item.date)}
                                {pageCount > 1
                                    ? `  ·  ${pageCount} pahina`
                                    : ''}
                            </Text>
                        </View>

                        <View style={styles.historyStatusRow}>
                            <View style={styles.historyStatusLabel}>
                                <Ionicons
                                    name={
                                        isAnalyzing
                                            ? 'time-outline'
                                            : item.status === 'scanned'
                                              ? 'checkmark-circle-outline'
                                              : 'ellipse-outline'
                                    }
                                    size={14}
                                    color={
                                        isAnalyzing
                                            ? T.brand
                                            : item.status === 'scanned'
                                              ? T.success
                                              : T.subText
                                    }
                                />
                                <Text
                                    style={[
                                        styles.historyStatusText,
                                        {
                                            color: isAnalyzing
                                                ? T.brand
                                                : item.status === 'scanned'
                                                  ? T.success
                                                  : T.subText,
                                        },
                                    ]}
                                >
                                    {isAnalyzing
                                        ? 'Sinusuri ngayon'
                                        : item.status === 'scanned'
                                          ? 'May resulta'
                                          : item.status === 'draft'
                                            ? 'Ipagpatuloy ang pag-edit'
                                            : item.processingState === 'needs-retry'
                                              ? 'Subukan ulit'
                                              : 'Hindi pa nasuri'}
                                </Text>
                            </View>

                        </View>
                    </TouchableOpacity>
                </View>

                {!isAnalyzing && !isSelecting && (
                    <TouchableOpacity
                        style={styles.historyMenuButton}
                        onPress={() => openHistoryOptions(item)}
                        accessibilityRole="button"
                        accessibilityLabel="Iba pang options"
                    >
                        <Ionicons
                            name="ellipsis-horizontal"
                            size={20}
                            color={T.subText}
                        />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const ListHeader = (
        <View>
            {/* DISCLAIMER — pale lavender (spec: informational surfaces).
                Pinagsama rito ang dating info button ng header (pareho ng
                action: showLegalInfo). */}
            <TouchableOpacity
                style={[
                    styles.disclaimer,
                    {
                        backgroundColor: T.brandSoft,
                        borderColor: T.ink,
                    },
                ]}
                onPress={showLegalInfo}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Impormasyon tungkol sa Lex-Simple"
            >
                <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={T.brand}
                />
                <Text
                    style={[
                        styles.disclaimerText,
                        { color: T.brandDeep },
                    ]}
                >
                    Hindi ito legal advice o kapalit ng abogado.
                </Text>
                <Ionicons
                    name="chevron-forward"
                    size={15}
                    color={T.brand}
                />
            </TouchableOpacity>

            <Text
                style={[styles.sourceHeading, { color: T.text }]}
            >
                Saan manggagaling ang document?
            </Text>

            {/* SOURCE OPTIONS — purple icon badges (spec: circular purple
                icon chips), flat white cards, 1.5px ink outlines */}
            <View style={styles.sourceRow}>
                <SourceOption
                    icon="camera-outline"
                    title="Camera"
                    accent={T.brand}
                    backgroundColor={T.card}
                    borderColor={T.ink}
                    textColor={T.text}
                    iconBackgroundColor={T.brandSoft}
                    onPress={() =>
                        navigation.navigate('ScannerScreen')
                    }
                />
                <SourceOption
                    icon="images-outline"
                    title="Gallery"
                    accent={T.brandVivid}
                    backgroundColor={T.card}
                    borderColor={T.ink}
                    textColor={T.text}
                    iconBackgroundColor={T.brandSoft}
                    onPress={() =>
                        navigation.navigate('UploadImageScreen')
                    }
                />
                <SourceOption
                    icon="document-attach-outline"
                    title="PDF / Word"
                    accent={T.brandDeep}
                    backgroundColor={T.card}
                    borderColor={T.ink}
                    textColor={T.text}
                    iconBackgroundColor={T.brandSoft}
                    onPress={() =>
                        navigation.navigate('ConvertScreen')
                    }
                />
            </View>

            {/* ASK AI — informational CTA: 2px outline + lavender fill */}
            <TouchableOpacity
                style={[
                    styles.askAiButton,
                    {
                        backgroundColor: T.brandSoft,
                        borderColor: T.ink,
                    },
                ]}
                onPress={() => navigation.navigate('AskAiScreen')}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Magtanong kay Lexie AI"
            >
                <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={20}
                    color={T.brand}
                />
                <Text
                    style={[styles.askAiText, { color: T.brandDeep }]}
                >
                    Magtanong sa Lexie AI
                </Text>
            </TouchableOpacity>

            <View
                style={[
                    styles.divider,
                    { backgroundColor: T.border },
                ]}
            />

            <View style={styles.recentHeader}>
                <View>
                    <Text
                        style={[
                            styles.sectionTitle,
                            { color: T.text },
                        ]}
                    >
                        {isSelecting ? 'Pumili ng files' : 'Recent Files'}
                    </Text>
                    {!isSelecting && (
                        <Text style={[styles.recentHint, { color: T.subText }]}>
                            Pindutin nang matagal para pumili ng files
                        </Text>
                    )}
                </View>
                {isSelecting && (
                    <View style={styles.selectionHeaderActions}>
                        <TouchableOpacity
                            onPress={() => setSelectedIds(new Set(
                                filteredHistory.filter((item) => !(
                                    isGlobalProcessing &&
                                    (activeFileId === item.id ||
                                        (activeFileId === null && item.processingState === 'analyzing'))
                                )).map((item) => item.id)
                            ))}
                            style={[styles.selectionHeaderButton, { borderColor: T.ink, backgroundColor: T.card }]}
                            accessibilityRole="button"
                            accessibilityLabel="Piliin lahat ng nakikitang file"
                        >
                            <Text style={[styles.selectionHeaderText, { color: T.brand }]}>Piliin lahat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setSelectedIds(new Set())}
                            style={[styles.selectionHeaderButton, { borderColor: T.ink, backgroundColor: T.card }]}
                            accessibilityRole="button"
                            accessibilityLabel="Tapusin ang pagpili"
                        >
                            <Text style={[styles.selectionHeaderText, { color: T.text }]}>Tapos</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* FILTER CHIPS — selected: purple fill + black text (spec) */}
            <View style={styles.filterRow}>
                {(
                    [
                        ['all', 'Lahat'],
                        ['scanned', 'Tapos'],
                        ['unscanned', 'Hindi pa'],
                    ] as const
                ).map(([value, label]) => {
                    const selected = activeFilter === value;

                    return (
                        <TouchableOpacity
                            key={value}
                            style={[
                                styles.filterButton,
                                {
                                    backgroundColor: selected
                                        ? T.brand
                                        : T.card,
                                    borderColor: T.ink,
                                },
                            ]}
                            onPress={() => {
                                setActiveFilter(value);
                                setVisibleCount(15);
                                setSelectedIds(new Set());
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                        >
                            <Text
                                style={[
                                    styles.filterText,
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
        </View>
    );

    return (
        <ScreenLayout
            title="Lex-Simple"
            showBackButton={false}
            noPadding
            rightIcon={isDarkMode ? 'moon-outline' : 'sunny-outline'}
            rightIconColor={T.text}
            onRightPress={toggleTheme}
        >
            <View style={[styles.safeArea, { backgroundColor: T.bg }]}>
                <FlatList
                    data={visibleHistory}
                    keyExtractor={(item) => item.id}
                    renderItem={renderHistoryItem}
                    initialNumToRender={8}
                    maxToRenderPerBatch={6}
                    windowSize={5}
                    onEndReachedThreshold={0.35}
                    onEndReached={() => {
                        if (visibleCount < filteredHistory.length) {
                            setVisibleCount((count) => count + 15);
                        }
                    }}
                    ListHeaderComponent={ListHeader}
                    ListEmptyComponent={
                        <View
                            style={[
                                styles.emptyState,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                            ]}
                        >
                            <Ionicons
                                name="folder-open-outline"
                                size={34}
                                color={T.brand}
                            />
                            <Text
                                style={[
                                    styles.emptyTitle,
                                    { color: T.text },
                                ]}
                            >
                                Walang file dito
                            </Text>
                            <Text
                                style={[
                                    styles.emptyText,
                                    { color: T.subText },
                                ]}
                            >
                                Mag-scan o mag-upload ng document para magsimula.
                            </Text>
                        </View>
                    }
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
                {isSelecting && (
                    <View style={[styles.selectionBar, { backgroundColor: T.card, borderTopColor: T.ink }]}>
                        <Text style={[styles.selectionCount, { color: T.text }]}>
                            {selectedIds.size} napili
                        </Text>
                        <TouchableOpacity
                            onPress={confirmDeleteSelected}
                            style={[styles.selectionDelete, { backgroundColor: T.danger }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Burahin ang ${selectedIds.size} napiling file`}
                        >
                            <Ionicons name="trash-outline" size={18} color={T.card} />
                            <Text style={[styles.selectionDeleteText, { color: T.card }]}>Burahin</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* RENAME MODAL — focal surface: 2px outline + 2px hard shadow */}
                <Modal
                    visible={renameModalVisible}
                    transparent
                    animationType="none"
                    onRequestClose={closeRenameModal}
                    statusBarTranslucent
                >
                    <KeyboardAvoidingView
                        style={[styles.modalBackdrop, { backgroundColor: T.overlay }]}
                        behavior={
                            Platform.OS === 'ios' ? 'padding' : 'height'
                        }
                    >
                        <View
                            style={[
                                styles.renamePanel,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                                getNeoShadow(T, 'sm'),
                            ]}
                        >
                            <View style={styles.renameHeader}>
                                <Text
                                    style={[
                                        styles.renameTitle,
                                        { color: T.text },
                                    ]}
                                >
                                    Palitan ang Pangalan
                                </Text>
                                <NeoIconButton
                                    icon="close"
                                    size={34}
                                    iconSize={19}
                                    onPress={closeRenameModal}
                                    accessibilityLabel="Isara"
                                />
                            </View>

                            <Text
                                style={[
                                    styles.inputLabel,
                                    { color: T.subText },
                                ]}
                            >
                                Pangalan ng file
                            </Text>
                            <TextInput
                                style={[
                                    styles.renameInput,
                                    {
                                        backgroundColor: T.bg,
                                        borderColor: T.ink,
                                        color: T.text,
                                    },
                                ]}
                                value={newTitle}
                                onChangeText={setNewTitle}
                                placeholder="Halimbawa: Lease Agreement"
                                placeholderTextColor={T.subText}
                                maxLength={80}
                                autoFocus
                                returnKeyType="done"
                                onSubmitEditing={() =>
                                    void saveRenamedTitle()
                                }
                            />

                            <View style={styles.renameActions}>
                                <NeoButton
                                    label="Kanselahin"
                                    variant="secondary"
                                    size="md"
                                    style={styles.flexOne}
                                    onPress={closeRenameModal}
                                />

                                <Pressable
                                    onPress={() => void saveRenamedTitle()}
                                    disabled={!newTitle.trim()}
                                    style={styles.flexOne}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: !newTitle.trim() }}
                                >
                                    {({ pressed }) => (
                                        <View
                                            style={[
                                                styles.renameSaveButton,
                                                { backgroundColor: T.brandVivid, borderColor: T.ink },
                                                !newTitle.trim()
                                                    ? styles.disabledButton
                                                    : sink(pressed, 'sm'),
                                            ]}
                                        >
                                            <Text style={[styles.renameSaveText, { color: T.brandText }]}>
                                                I-save
                                            </Text>
                                        </View>
                                    )}
                                </Pressable>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                {/* IMAGE VIEWER — full-screen media viewer; dark chrome ay
                    sadyang ganoon (hindi themed ang photo viewer) */}
                <Modal
                    visible={imagePreview !== null}
                    animationType="fade"
                    onRequestClose={closeImagePreview}
                >
                    <SafeAreaView style={styles.imageViewer} edges={['top', 'bottom']}>
                        <StatusBar barStyle="light-content" backgroundColor="#080B10" />
                        <View style={styles.imageViewerHeader}>
                            <TouchableOpacity
                                style={styles.imageViewerClose}
                                onPress={closeImagePreview}
                                accessibilityRole="button"
                                accessibilityLabel="Isara ang larawan"
                            >
                                <Ionicons name="close" size={25} color="#FFFFFF" />
                            </TouchableOpacity>
                            <View style={styles.imageViewerHeading}>
                                <Text style={styles.imageViewerTitle} numberOfLines={1}>
                                    {imagePreview?.title}
                                </Text>
                                <Text style={styles.imageViewerCount}>
                                    {previewPage + 1} / {imagePreview?.images.length ?? 0}
                                </Text>
                            </View>
                        </View>
                        {imagePreview && (
                            <FlatList
                                data={imagePreview.images}
                                horizontal
                                pagingEnabled
                                initialNumToRender={1}
                                maxToRenderPerBatch={2}
                                windowSize={3}
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={(uri, index) => `${uri}-${index}`}
                                getItemLayout={(_, index) => ({
                                    length: previewWidth,
                                    offset: previewWidth * index,
                                    index,
                                })}
                                onMomentumScrollEnd={({ nativeEvent }) => {
                                    const nextPage = Math.round(
                                        nativeEvent.contentOffset.x / previewWidth
                                    );
                                    setPreviewPage(Math.max(0, Math.min(
                                        nextPage,
                                        imagePreview.images.length - 1
                                    )));
                                }}
                                renderItem={({ item: uri, index }) => (
                                    <View style={[styles.imageViewerPage, { width: previewWidth }]}>
                                        <Image
                                            source={{ uri }}
                                            style={styles.imageViewerImage}
                                            resizeMode="contain"
                                            accessibilityLabel={`Larawan ng pahina ${index + 1}`}
                                        />
                                    </View>
                                )}
                                style={styles.imageViewerList}
                            />
                        )}
                        {imagePreview && imagePreview.images.length > 1 && (
                            <Text style={styles.imageViewerHint}>
                                I-swipe para makita ang ibang pahina
                            </Text>
                        )}
                    </SafeAreaView>
                </Modal>

                {/* LEGAL LITERACY MODAL — v7.0.2: focal surface na
                    in-screen (hindi CustomAlert): 2px ink outline +
                    2px hard shadow + purple CTA na itim ang text. */}
                <Modal
                    visible={legalInfoVisible}
                    transparent
                    animationType="fade"
                    statusBarTranslucent
                    onRequestClose={() => setLegalInfoVisible(false)}
                >
                    <View style={[styles.modalBackdrop, { backgroundColor: T.overlay }]}>
                        <Pressable
                            style={StyleSheet.absoluteFill}
                            onPress={() => setLegalInfoVisible(false)}
                        />
                        <View
                            style={[
                                styles.legalInfoPanel,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                                getNeoShadow(T, 'sm'),
                            ]}
                        >
                            <View style={styles.legalInfoHeader}>
                                <View
                                    style={[
                                        styles.legalInfoIconBox,
                                        {
                                            backgroundColor: T.brandSoft,
                                            borderColor: T.ink,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="book-outline"
                                        size={19}
                                        color={T.brandDeep}
                                    />
                                </View>
                                <View style={styles.legalInfoHeading}>
                                    <Text style={[styles.legalInfoEyebrow, { color: T.subText }]}>
                                        LEX-SIMPLE
                                    </Text>
                                    <Text style={[styles.legalInfoTitle, { color: T.text }]}>
                                        Legal Literacy Tool
                                    </Text>
                                </View>
                                <NeoIconButton
                                    icon="close"
                                    size={34}
                                    iconSize={19}
                                    onPress={() => setLegalInfoVisible(false)}
                                    accessibilityLabel="Isara"
                                />
                            </View>
                            <Text style={[styles.legalInfoBody, { color: T.subText }]}>
                                Tumutulong ang Lex-Simple na ipaliwanag ang
                                legal text. Hindi ito kapalit ng payo mula sa
                                lisensyadong abogado.
                            </Text>
                            <Pressable
                                onPress={() => setLegalInfoVisible(false)}
                                accessibilityRole="button"
                                accessibilityLabel="Naintindihan ko"
                            >
                                {({ pressed }) => (
                                    <View
                                        style={[
                                            styles.legalInfoCta,
                                            {
                                                backgroundColor: T.brand,
                                                borderColor: T.ink,
                                            },
                                            sink(pressed, 'sm'),
                                        ]}
                                    >
                                        <Ionicons
                                            name="checkmark-circle-outline"
                                            size={17}
                                            color={T.brandText}
                                        />
                                        <Text style={[styles.legalInfoCtaText, { color: T.brandText }]}>
                                            Naintindihan ko
                                        </Text>
                                    </View>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </Modal>

                <AlertRender />
            </View>
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    // --- LAYOUT ---
    safeArea: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: SPACING.lg,
        paddingTop: 12,
        paddingBottom: 40,
    },
    flexOne: {
        flex: 1,
    },

    // --- DISCLAIMER (pale lavender — spec: informational surfaces) ---
    disclaimer: {
        minHeight: 44,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginBottom: 14,
    },
    disclaimerText: {
        flex: 1,
        fontSize: 11,
        lineHeight: 15,
        fontWeight: '600',
    },

    // --- SOURCE OPTIONS (flat white cards + circular purple icon chips) ---
    sourceHeading: {
        fontSize: 16,
        lineHeight: 21,
        fontWeight: '900',
        letterSpacing: 0.3,
        marginBottom: 10,
        textTransform: 'uppercase',
    },
    sourceRow: {
        flexDirection: 'row',
        gap: SPACING.sm,
    },
    sourceOption: {
        flex: 1,
        minWidth: 0,
        minHeight: 76,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: 8,
    },
    sourceOptionIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sourceOptionText: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '800',
        textAlign: 'center',
        marginTop: 5,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },

    // --- ASK AI (informational CTA: 2px outline + lavender fill) ---
    askAiButton: {
        minHeight: 46,
        marginTop: SPACING.sm,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACING.sm,
        paddingHorizontal: 12,
    },
    askAiText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    divider: {
        height: 1,
        marginVertical: 18,
    },

    // --- RECENT FILES HEADER + SELECTION ACTIONS ---
    sectionTitle: {
        fontSize: 18,
        lineHeight: 23,
        fontWeight: '900',
        letterSpacing: 0.2,
        textTransform: 'uppercase',
    },
    recentHint: {
        fontSize: 11,
        marginTop: 3,
    },
    selectionHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    selectionHeaderButton: {
        minHeight: 40,
        justifyContent: 'center',
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        paddingHorizontal: 9,
    },
    selectionHeaderText: {
        fontSize: 12,
        fontWeight: '800',
    },
    recentHeader: {
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },

    // --- FILTER CHIPS (selected: purple fill + black text — spec) ---
    filterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 7,
        marginBottom: 13,
    },
    filterButton: {
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: RADIUS.sm,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterText: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },

    // --- HISTORY CARD (flat — list item, 1.5px ink outline, walang shadow) ---
    historyCard: {
        minHeight: 114,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
        marginBottom: 10,
        position: 'relative',
        overflow: 'hidden',
    },
    historyMainPress: {
        minHeight: 112,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        paddingRight: 42,
    },
    previewTouchArea: {
        marginRight: 12,
    },
    previewBox: {
        width: 66,
        height: 88,
        borderRadius: RADIUS.sm,
        borderWidth: BORDER.thin,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    pageCountBadge: {
        position: 'absolute',
        right: 4,
        bottom: 4,
        minWidth: 22,
        height: 20,
        paddingHorizontal: 5,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
    },
    pageCountText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '900',
    },
    historyContent: {
        flex: 1,
        minWidth: 0,
    },
    historyTitle: {
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '900',
        paddingRight: 2,
    },
    metaRow: {
        minHeight: 20,
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        marginBottom: 6,
    },
    metaText: {
        flex: 1,
        minWidth: 0,
        fontSize: 10,
        marginLeft: 5,
    },
    historyStatusRow: {
        minHeight: 26,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    historyStatusLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    historyStatusText: {
        fontSize: 10,
        fontWeight: '800',
    },
    historyMenuButton: {
        position: 'absolute',
        top: 8,
        right: 7,
        width: 34,
        height: 34,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // --- EMPTY STATE (flat white card, 1.5px ink outline) ---
    emptyState: {
        minHeight: 170,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thin,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '900',
        marginTop: 12,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    emptyText: {
        maxWidth: 270,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginTop: 5,
    },

    // --- SELECTION BAR (bottom bar: 2px ink rule sa taas — mirror ng app bar) ---
    selectionBar: {
        minHeight: 64,
        paddingHorizontal: 18,
        borderTopWidth: BORDER.thick,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectionCount: {
        fontWeight: '800',
    },
    selectionDelete: {
        minHeight: 42,
        paddingHorizontal: 15,
        borderRadius: RADIUS.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    selectionDeleteText: {
        fontWeight: '800',
        fontSize: 13,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },

    // --- RENAME MODAL (focal: 2px outline + 2px hard shadow) ---

    // --- LEGAL INFO MODAL (v7.0.2 — focal surface: 2px ink outline +
    //     hard shadow; in-screen modal, hindi CustomAlert) ---
    legalInfoPanel: {
        width: '100%',
        maxWidth: 400,
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.lg,
        padding: 18,
    },
    legalInfoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        marginBottom: 13,
    },
    legalInfoIconBox: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
    },
    legalInfoHeading: {
        flex: 1,
        minWidth: 0,
    },
    legalInfoEyebrow: {
        fontSize: 9,
        lineHeight: 13,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    legalInfoTitle: {
        marginTop: 2,
        fontSize: 15,
        lineHeight: 20,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    legalInfoBody: {
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 16,
    },
    legalInfoCta: {
        minHeight: 46,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    legalInfoCtaText: {
        fontSize: 13,
        fontWeight: '800',
    },
    modalBackdrop: {
        flex: 1,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    renamePanel: {
        width: '100%',
        maxWidth: 390,
        borderRadius: RADIUS.lg,
        borderWidth: BORDER.thick,
        padding: 18,
    },
    renameHeader: {
        minHeight: 38,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    renameTitle: {
        fontSize: 18,
        lineHeight: 23,
        fontWeight: '900',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    inputLabel: {
        fontSize: 10,
        lineHeight: 13,
        fontWeight: '900',
        letterSpacing: 0.7,
        marginBottom: 7,
        textTransform: 'uppercase',
    },
    renameInput: {
        minHeight: 48,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thin,
        paddingHorizontal: 13,
        paddingVertical: 10,
        fontSize: 14,
    },
    renameActions: {
        flexDirection: 'row',
        gap: 9,
        marginTop: 16,
    },
    renameSaveButton: {
        minHeight: 46,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        alignItems: 'center',
        justifyContent: 'center',
    },
    renameSaveText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    disabledButton: {
        opacity: 0.45,
    },

    // --- IMAGE VIEWER (full-screen media viewer — dark chrome, hindi themed) ---
    imageViewer: {
        flex: 1,
        backgroundColor: '#080B10',
    },
    imageViewerHeader: {
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#252B35',
    },
    imageViewerClose: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    imageViewerHeading: {
        flex: 1,
    },
    imageViewerTitle: {
        color: '#FFFFFF',
        fontWeight: '800',
        fontSize: 15,
    },
    imageViewerCount: {
        color: '#A3ACBA',
        fontSize: 12,
        marginTop: 3,
    },
    imageViewerList: {
        flex: 1,
    },
    imageViewerPage: {
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageViewerImage: {
        width: '100%',
        height: '100%',
    },
    imageViewerHint: {
        color: '#A3ACBA',
        textAlign: 'center',
        fontSize: 12,
        paddingVertical: 15,
    },
});
