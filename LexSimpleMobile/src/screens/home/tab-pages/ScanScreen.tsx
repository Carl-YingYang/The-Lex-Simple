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
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
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
import FloatingProcessIndicator from '../../../components/FloatingProcessIndicator';
import { useBackgroundProcess } from '../../../context/BackgroundProcessContext';
import { useTheme } from '../../../theme/ThemeContext';


// SCAN SCREEN VERSION: 6.2.9
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const SUCCESS = '#10B981';
const WARNING = '#F59E0B';

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
                size={21}
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
    const lastLongPressedIdRef = useRef<string | null>(null);
    const isSelecting = selectedIds.size > 0;

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
        showAlert(
            'Legal Literacy Tool',
            'Tumutulong ang Lex-Simple na ipaliwanag ang legal text. Hindi ito kapalit ng payo mula sa lisensyadong abogado.',
            'info',
            [{ text: 'Naintindihan ko' }]
        );
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
                        borderColor: T.border,
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
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            {selectedIds.has(item.id) ? (
                                <Ionicons name="checkmark-circle" size={28} color={PRIMARY} />
                            ) : item.type === 'document' || !previewUri ? (
                                <Ionicons
                                    name="document-text-outline"
                                    size={27}
                                    color={PRIMARY_SOFT}
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
                                            ? WARNING
                                            : item.status === 'scanned'
                                              ? SUCCESS
                                              : T.subText
                                    }
                                />
                                <Text
                                    style={[
                                        styles.historyStatusText,
                                        {
                                            color: isAnalyzing
                                                ? WARNING
                                                : item.status === 'scanned'
                                                  ? SUCCESS
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
            <View style={styles.header}>
                <View style={styles.headerCopy}>
                    <Text
                        style={[
                            styles.screenTitle,
                            { color: T.text },
                        ]}
                    >
                        Lex-Simple
                    </Text>
                </View>

                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={[
                            styles.headerButton,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                        onPress={toggleTheme}
                        accessibilityRole="button"
                        accessibilityLabel="Palitan ang theme"
                    >
                        <Ionicons
                            name={
                                isDarkMode
                                    ? 'moon-outline'
                                    : 'sunny-outline'
                            }
                            size={20}
                            color={T.text}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.headerButton,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
                        ]}
                        onPress={showLegalInfo}
                        accessibilityRole="button"
                        accessibilityLabel="Impormasyon tungkol sa Lex-Simple"
                    >
                        <Ionicons
                            name="information-circle-outline"
                            size={21}
                            color={T.text}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            <View
                style={[
                    styles.disclaimer,
                    {
                        backgroundColor: T.card,
                        borderColor: T.border,
                    },
                ]}
            >
                <Ionicons
                    name="information-circle-outline"
                    size={19}
                    color={PRIMARY_SOFT}
                />
                <Text
                    style={[
                        styles.disclaimerText,
                        { color: T.subText },
                    ]}
                >
                    Hindi ito legal advice o kapalit ng abogado.
                </Text>
            </View>

            <Text
                style={[styles.sourceHeading, { color: T.text }]}
            >
                Saan manggagaling ang document?
            </Text>

            <View style={styles.sourceRow}>
                <SourceOption
                    icon="camera-outline"
                    title="Camera"
                    accent={PRIMARY_SOFT}
                    backgroundColor={T.card}
                    borderColor={T.border}
                    textColor={T.text}
                    iconBackgroundColor={T.bg}
                    onPress={() =>
                        navigation.navigate('ScannerScreen')
                    }
                />
                <SourceOption
                    icon="images-outline"
                    title="Gallery"
                    accent="#8B5CF6"
                    backgroundColor={T.card}
                    borderColor={T.border}
                    textColor={T.text}
                    iconBackgroundColor={T.bg}
                    onPress={() =>
                        navigation.navigate('UploadImageScreen')
                    }
                />
                <SourceOption
                    icon="document-attach-outline"
                    title="PDF / Word"
                    accent={SUCCESS}
                    backgroundColor={T.card}
                    borderColor={T.border}
                    textColor={T.text}
                    iconBackgroundColor={T.bg}
                    onPress={() =>
                        navigation.navigate('ConvertScreen')
                    }
                />
            </View>

            <TouchableOpacity
                style={[
                    styles.askAiButton,
                    {
                        backgroundColor: T.card,
                        borderColor: T.border,
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
                    color={WARNING}
                />
                <Text
                    style={[styles.askAiText, { color: T.text }]}
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
                        <Text style={{ color: T.subText, fontSize: 11, marginTop: 3 }}>
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
                            style={[styles.selectionHeaderButton, { borderColor: T.border }]}
                            accessibilityRole="button"
                            accessibilityLabel="Piliin lahat ng nakikitang file"
                        >
                            <Text style={{ color: PRIMARY_SOFT, fontWeight: '800' }}>Piliin lahat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setSelectedIds(new Set())}
                            style={[styles.selectionHeaderButton, { borderColor: T.border }]}
                            accessibilityRole="button"
                            accessibilityLabel="Tapusin ang pagpili"
                        >
                            <Text style={{ color: T.text, fontWeight: '800' }}>Tapos</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

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
                                        ? PRIMARY
                                        : T.card,
                                    borderColor: selected
                                        ? PRIMARY
                                        : T.border,
                                },
                            ]}
                            onPress={() => {
                                setActiveFilter(value);
                                setVisibleCount(15);
                                setSelectedIds(new Set());
                            }}
                        >
                            <Text
                                style={[
                                    styles.filterText,
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
        </View>
    );

    return (
        <SafeAreaView
            style={[styles.safeArea, { backgroundColor: T.bg }]}
            edges={['top']}
        >
            <StatusBar
                barStyle={
                    isDarkMode
                        ? 'light-content'
                        : 'dark-content'
                }
                backgroundColor={T.bg}
            />

            <FloatingProcessIndicator />

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
                                borderColor: T.border,
                            },
                        ]}
                    >
                        <Ionicons
                            name="folder-open-outline"
                            size={34}
                            color={T.subText}
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
                <View style={[styles.selectionBar, { backgroundColor: T.card, borderColor: T.border }]}>
                    <Text style={{ color: T.text, fontWeight: '800' }}>
                        {selectedIds.size} napili
                    </Text>
                    <TouchableOpacity
                        onPress={confirmDeleteSelected}
                        style={styles.selectionDelete}
                        accessibilityRole="button"
                        accessibilityLabel={`Burahin ang ${selectedIds.size} napiling file`}
                    >
                        <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Burahin</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Modal
                visible={renameModalVisible}
                transparent
                animationType="none"
                onRequestClose={closeRenameModal}
                statusBarTranslucent
            >
                <KeyboardAvoidingView
                    style={styles.modalBackdrop}
                    behavior={
                        Platform.OS === 'ios' ? 'padding' : 'height'
                    }
                >
                    <View
                        style={[
                            styles.renamePanel,
                            {
                                backgroundColor: T.card,
                                borderColor: T.border,
                            },
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
                            <TouchableOpacity
                                style={styles.compactIconButton}
                                onPress={closeRenameModal}
                            >
                                <Ionicons
                                    name="close"
                                    size={21}
                                    color={T.subText}
                                />
                            </TouchableOpacity>
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
                                    borderColor: T.border,
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
                            <TouchableOpacity
                                style={[
                                    styles.renameCancelButton,
                                    {
                                        backgroundColor: T.bg,
                                        borderColor: T.border,
                                    },
                                ]}
                                onPress={closeRenameModal}
                            >
                                <Text
                                    style={[
                                        styles.renameCancelText,
                                        { color: T.text },
                                    ]}
                                >
                                    Kanselahin
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.renameSaveButton,
                                    !newTitle.trim() &&
                                        styles.disabledButton,
                                ]}
                                onPress={() =>
                                    void saveRenamedTitle()
                                }
                                disabled={!newTitle.trim()}
                            >
                                <Text style={styles.renameSaveText}>
                                    I-save
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

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

            <AlertRender />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    selectionBar: {
        minHeight: 64,
        paddingHorizontal: 18,
        borderTopWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectionDelete: {
        minHeight: 42,
        paddingHorizontal: 15,
        borderRadius: 6,
        backgroundColor: '#DC2626',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    safeArea: {
        flex: 1,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 40,
    },
    header: {
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    headerCopy: {
        flex: 1,
    },
    screenTitle: {
        fontSize: 25,
        fontWeight: '900',
        letterSpacing: -0.4,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    headerButton: {
        width: 42,
        height: 42,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    disclaimer: {
        minHeight: 44,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    disclaimerText: {
        flex: 1,
        marginLeft: 10,
        fontSize: 11,
        lineHeight: 15,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '900',
        letterSpacing: -0.2,
    },
    sourceHeading: {
        fontSize: 14,
        fontWeight: '900',
        marginBottom: 10,
    },
    sourceRow: {
        flexDirection: 'row',
        gap: 8,
    },
    sourceOption: {
        flex: 1,
        minWidth: 0,
        minHeight: 76,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
        paddingVertical: 8,
    },
    sourceOptionIcon: {
        width: 34,
        height: 34,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sourceOptionText: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '800',
        textAlign: 'center',
        marginTop: 5,
    },
    askAiButton: {
        minHeight: 46,
        marginTop: 8,
        borderRadius: 6,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 12,
    },
    askAiText: {
        fontSize: 12,
        fontWeight: '900',
    },
    divider: {
        height: 1,
        marginVertical: 18,
    },
    selectionHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    selectionHeaderButton: {
        minHeight: 40,
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 6,
        paddingHorizontal: 9,
    },
    recentHeader: {
        minHeight: 34,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    filterRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 7,
        marginBottom: 13,
    },
    filterButton: {
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterText: {
        fontSize: 11,
        fontWeight: '800',
    },
    historyCard: {
        minHeight: 114,
        borderWidth: 1,
        borderRadius: 7,
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
        borderRadius: 5,
        borderWidth: 1,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
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
        borderRadius: 4,
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
    compactIconButton: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
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
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        minHeight: 170,
        borderRadius: 7,
        borderWidth: 1,
        paddingHorizontal: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 15,
        fontWeight: '900',
        marginTop: 12,
    },
    emptyText: {
        maxWidth: 270,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        marginTop: 5,
    },
    modalBackdrop: {
        flex: 1,
        paddingHorizontal: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
    },
    renamePanel: {
        width: '100%',
        maxWidth: 390,
        borderRadius: 8,
        borderWidth: 1,
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
        fontWeight: '900',
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: '800',
        marginBottom: 7,
    },
    renameInput: {
        minHeight: 48,
        borderRadius: 6,
        borderWidth: 1,
        paddingHorizontal: 13,
        paddingVertical: 10,
        fontSize: 14,
    },
    renameActions: {
        flexDirection: 'row',
        gap: 9,
        marginTop: 16,
    },
    renameCancelButton: {
        flex: 1,
        minHeight: 46,
        borderRadius: 6,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    renameCancelText: {
        fontSize: 13,
        fontWeight: '800',
    },
    renameSaveButton: {
        flex: 1,
        minHeight: 46,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PRIMARY,
    },
    disabledButton: {
        opacity: 0.45,
    },
    renameSaveText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '900',
    },
});