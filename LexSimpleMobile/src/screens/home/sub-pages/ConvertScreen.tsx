import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

import { postFileEndpoint } from '../../../services/AiEngine';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';

// CONVERT SCREEN VERSION: 1.0.0
// Document import with flat processing UI and recoverable error states.
const HISTORY_KEY = '@lex_scan_history';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const DANGER = '#EF4444';

const ACCEPTED_DOCUMENT_TYPES = [
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

type ScreenState = 'opening' | 'error' | 'blocked';

type HistoryItem = {
    id: string;
    uri: string;
    title: string;
    date: string;
    type: 'document';
    status: 'unscanned' | 'scanned';
    analysisResult?: unknown;
    ocrText?: string;
};

const parseHistory = (value: string | null): HistoryItem[] => {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('[ConvertScreen] Invalid history data:', error);
        return [];
    }
};

export default function ConvertScreen({ navigation }: any) {
    const { showAlert, AlertRender } = useCustomAlert();
    const { isDarkMode, colors: T } = useTheme();
    const {
        isProcessing,
        isGlobalProcessing,
        triggerBackgroundProcess,
        cancelProcess,
        safeGoBack,
    } = useBackgroundProcessScreen('ConvertScreen');

    const hasInitialized = useRef(false);
    const isMounted = useRef(true);
    const isPickerActive = useRef(false);
    const [screenState, setScreenState] =
        useState<ScreenState>('opening');
    const [selectedFileName, setSelectedFileName] =
        useState('Dokumento');

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const updateScreenState = useCallback((state: ScreenState): void => {
        if (isMounted.current) {
            setScreenState(state);
        }
    }, []);

    const saveToOfflineHistory = useCallback(async (
        fileUri: string,
        fileName: string
    ): Promise<HistoryItem | null> => {
        try {
            const existingHistory = await AsyncStorage.getItem(HISTORY_KEY);
            const history = parseHistory(existingHistory);
            const newItem: HistoryItem = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                uri: fileUri,
                title: fileName || 'Document File',
                // Keep the existing history schema/display format.
                date: new Date().toLocaleString(),
                type: 'document',
                status: 'unscanned',
            };

            await AsyncStorage.setItem(
                HISTORY_KEY,
                JSON.stringify([newItem, ...history])
            );

            return newItem;
        } catch (error) {
            console.error('[ConvertScreen] Saving history failed:', error);
            return null;
        }
    }, []);

    const updateHistoryToScanned = useCallback(async (
        id: string,
        analysisData: unknown,
        extractedText: string
    ): Promise<HistoryItem | null> => {
        try {
            const storedHistory = await AsyncStorage.getItem(HISTORY_KEY);
            const history = parseHistory(storedHistory);
            let updatedItem: HistoryItem | null = null;

            const updatedHistory = history.map((item) => {
                if (item.id !== id) {
                    return item;
                }

                updatedItem = {
                    ...item,
                    status: 'scanned',
                    analysisResult: analysisData,
                    ocrText: extractedText,
                };

                return updatedItem;
            });

            if (!updatedItem) {
                return null;
            }

            await AsyncStorage.setItem(
                HISTORY_KEY,
                JSON.stringify(updatedHistory)
            );

            return updatedItem;
        } catch (error) {
            console.error('[ConvertScreen] Updating history failed:', error);
            return null;
        }
    }, []);

    const processDocument = useCallback((
        file: DocumentPicker.DocumentPickerAsset,
        historyId: string
    ): void => {
        triggerBackgroundProcess(async (signal: AbortSignal) => {
            const formData = new FormData();

            formData.append('file', {
                uri: file.uri,
                name: file.name || 'document',
                type: file.mimeType || 'application/octet-stream',
            } as any);

            const response = await postFileEndpoint(
                '/simplify_file',
                formData,
                signal
            );

            if (!response || response.status !== 'success' || !response.data) {
                throw new Error(
                    response?.message || 'Hindi nakumpleto ang document analysis.'
                );
            }

            const combinedAnalysisResult = {
                ...response.data,
                rag_context_used: response.rag_context_used,
                sanitizedText: response.sanitizedText,
            };
            const extractedText =
                response.extractedText || `File Content from: ${file.name}`;

            await updateHistoryToScanned(
                historyId,
                combinedAnalysisResult,
                extractedText
            );

            return combinedAnalysisResult;
        }, historyId);
    }, [triggerBackgroundProcess, updateHistoryToScanned]);

    const handleSelectDocument = useCallback(async (): Promise<void> => {
        if (isPickerActive.current) {
            return;
        }

        if (isProcessing || isGlobalProcessing) {
            updateScreenState('blocked');
            showAlert(
                'May kasalukuyang analysis',
                'Hintaying matapos o i-cancel muna ang kasalukuyang analysis bago pumili ng bagong file.',
                'warning',
                [
                    {
                        text: 'Bumalik',
                        onPress: safeGoBack,
                    },
                ]
            );
            return;
        }

        isPickerActive.current = true;
        updateScreenState('opening');

        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ACCEPTED_DOCUMENT_TYPES,
                copyToCacheDirectory: true,
                multiple: false,
            });

            if (result.canceled) {
                safeGoBack();
                return;
            }

            const file = result.assets?.[0];

            if (!file?.uri) {
                throw new Error('No valid document was returned by the picker.');
            }

            if (
                typeof file.size === 'number' &&
                file.size > MAX_FILE_SIZE_BYTES
            ) {
                updateScreenState('error');
                showAlert(
                    'Masyadong malaki ang file',
                    'Pumili ng document na 5 MB o mas maliit.',
                    'warning',
                    [
                        {
                            text: 'Pumili ulit',
                            onPress: () => void handleSelectDocument(),
                        },
                        {
                            text: 'Bumalik',
                            style: 'cancel',
                            onPress: safeGoBack,
                        },
                    ]
                );
                return;
            }

            if (isMounted.current) {
                setSelectedFileName(file.name || 'Dokumento');
            }

            const savedItem = await saveToOfflineHistory(
                file.uri,
                file.name || 'Document File'
            );

            if (!savedItem) {
                throw new Error('The document could not be saved locally.');
            }

            const networkState = await Network.getNetworkStateAsync();
            const isOnline =
                networkState.isConnected === true &&
                networkState.isInternetReachable !== false;

            if (!isOnline) {
                updateScreenState('error');
                showAlert(
                    'Naka-save para sa offline viewing',
                    'Walang internet ngayon. Nasa Recent Files na ang dokumento at maaari mo itong suriin kapag online ka na.',
                    'info',
                    [
                        {
                            text: 'OK',
                            onPress: safeGoBack,
                        },
                    ]
                );
                return;
            }

            processDocument(file, savedItem.id);
        } catch (error) {
            console.error('[ConvertScreen] Document picker failed:', error);
            updateScreenState('error');
            showAlert(
                'Hindi mabuksan ang file',
                'Subukan ulit at pumili ng PDF, DOC, DOCX, o TXT file.',
                'error'
            );
        } finally {
            isPickerActive.current = false;
        }
    }, [
        isGlobalProcessing,
        isProcessing,
        processDocument,
        safeGoBack,
        saveToOfflineHistory,
        showAlert,
        updateScreenState,
    ]);

    useEffect(() => {
        if (hasInitialized.current) {
            return;
        }

        hasInitialized.current = true;

        // A restored ConvertScreen process should show its progress UI,
        // not reopen the picker or display a conflicting-process alert.
        if (isProcessing) {
            return;
        }

        void handleSelectDocument();
    }, [handleSelectDocument, isProcessing]);

    if (isProcessing) {
        return (
            <ScreenLayout
                title="Sinusuri ang Dokumento"
                showBackButton={false}
            >
                <StatusBar
                    barStyle={
                        isDarkMode ? 'light-content' : 'dark-content'
                    }
                />

                <View
                    testID="convert-screen-v1-processing"
                    style={[
                        styles.screen,
                        { backgroundColor: T.bg },
                    ]}
                >
                    <View style={styles.centerState}>
                        <View
                            style={[
                                styles.stateIconBox,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <ActivityIndicator
                                size="small"
                                color={PRIMARY_SOFT}
                            />
                        </View>

                        <Text
                            style={[
                                styles.stateTitle,
                                { color: T.text },
                            ]}
                        >
                            Sinusuri ang dokumento
                        </Text>
                        <Text
                            numberOfLines={2}
                            style={[
                                styles.fileName,
                                { color: T.subText },
                            ]}
                        >
                            {selectedFileName}
                        </Text>
                        <Text
                            style={[
                                styles.stateDescription,
                                { color: T.subText },
                            ]}
                        >
                            Maaari kang bumalik sa Scanner habang nagpapatuloy
                            ito sa background.
                        </Text>

                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={() =>
                                navigation.navigate('Main', {
                                    screen: 'Scan',
                                })
                            }
                            activeOpacity={0.82}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name="remove-outline"
                                size={19}
                                color="#FFFFFF"
                            />
                            <Text style={styles.primaryButtonText}>
                                I-minimize
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.secondaryButton,
                                { borderColor: T.border },
                            ]}
                            onPress={cancelProcess}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                        >
                            <Text
                                style={[
                                    styles.secondaryButtonText,
                                    { color: DANGER },
                                ]}
                            >
                                Kanselahin
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <AlertRender />
            </ScreenLayout>
        );
    }

    const isBlocked = screenState === 'blocked';
    const hasError = screenState === 'error';

    return (
        <ScreenLayout
            title="Pumili ng File"
            showBackButton={hasError || isBlocked}
        >
            <StatusBar
                barStyle={
                    isDarkMode ? 'light-content' : 'dark-content'
                }
            />

            <View
                testID="convert-screen-v1"
                style={[
                    styles.screen,
                    { backgroundColor: T.bg },
                ]}
            >
                {screenState === 'opening' ? (
                    <View style={styles.centerState}>
                        <View
                            style={[
                                styles.stateIconBox,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <ActivityIndicator
                                size="small"
                                color={PRIMARY_SOFT}
                            />
                        </View>
                        <Text
                            style={[
                                styles.stateTitle,
                                { color: T.text },
                            ]}
                        >
                            Binubuksan ang files
                        </Text>
                        <Text
                            style={[
                                styles.stateDescription,
                                { color: T.subText },
                            ]}
                        >
                            Pumili ng PDF, DOC, DOCX, o TXT na hanggang 5 MB.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.centerState}>
                        <View
                            style={[
                                styles.stateIconBox,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Ionicons
                                name={
                                    isBlocked
                                        ? 'time-outline'
                                        : 'document-text-outline'
                                }
                                size={29}
                                color={isBlocked ? PRIMARY_SOFT : DANGER}
                            />
                        </View>
                        <Text
                            style={[
                                styles.stateTitle,
                                { color: T.text },
                            ]}
                        >
                            {isBlocked
                                ? 'May kasalukuyang analysis'
                                : 'Walang napiling file'}
                        </Text>
                        <Text
                            style={[
                                styles.stateDescription,
                                { color: T.subText },
                            ]}
                        >
                            {isBlocked
                                ? 'Tapusin o i-cancel muna ang kasalukuyang proseso.'
                                : 'Subukan ulit at pumili ng suportadong document.'}
                        </Text>

                        {!isBlocked && (
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={() => void handleSelectDocument()}
                                activeOpacity={0.82}
                                accessibilityRole="button"
                            >
                                <Ionicons
                                    name="folder-open-outline"
                                    size={18}
                                    color="#FFFFFF"
                                />
                                <Text style={styles.primaryButtonText}>
                                    Pumili ulit
                                </Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[
                                styles.secondaryButton,
                                { borderColor: T.border },
                            ]}
                            onPress={safeGoBack}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                        >
                            <Text
                                style={[
                                    styles.secondaryButtonText,
                                    { color: T.text },
                                ]}
                            >
                                Bumalik
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <AlertRender />
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    centerState: {
        flex: 1,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stateIconBox: {
        width: 58,
        height: 58,
        borderWidth: 1,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stateTitle: {
        marginTop: 15,
        fontSize: 17,
        lineHeight: 23,
        fontWeight: '900',
        textAlign: 'center',
    },
    fileName: {
        maxWidth: 300,
        marginTop: 6,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    stateDescription: {
        maxWidth: 310,
        marginTop: 7,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    primaryButton: {
        minWidth: 190,
        minHeight: 46,
        marginTop: 21,
        borderRadius: 9,
        backgroundColor: PRIMARY,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '900',
    },
    secondaryButton: {
        minWidth: 190,
        minHeight: 44,
        marginTop: 9,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontSize: 13,
        fontWeight: '800',
    },
});
