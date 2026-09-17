import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { navigate } from '../navigation/RootNavigation';

// BACKGROUND PROCESS CONTEXT VERSION: 2.0.0
// One cancellable in-app process with honest progress and history recovery.
const HISTORY_KEY = '@lex_scan_history';

type ProgressReporter = (value: number) => void;

export type BackgroundTask<T = unknown> = (
    signal: AbortSignal,
    reportProgress: ProgressReporter
) => Promise<T>;

interface BackgroundProcessContextValue {
    isProcessing: boolean;
    processRoute: string;
    activeFileId: string | null;
    progress: number;
    startProcess: <T>(
        task: BackgroundTask<T>,
        routeName: string,
        fileId?: string
    ) => Promise<void>;
    cancelProcess: () => void;
    updateProgress: ProgressReporter;
}

interface BackgroundProcessProviderProps {
    children: ReactNode;
}

const BackgroundProcessContext =
    createContext<BackgroundProcessContextValue | undefined>(undefined);

const clampProgress = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(100, Math.max(0, Math.round(value)));
};

const isCancellationError = (
    error: unknown,
    signal?: AbortSignal
): boolean => {
    if (signal?.aborted) {
        return true;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const normalizedMessage = error.message.toLowerCase();

    return (
        error.name === 'AbortError' ||
        error.message === 'OCR_CANCELLED' ||
        normalizedMessage.includes('aborted') ||
        normalizedMessage.includes('cancelled') ||
        normalizedMessage.includes('canceled')
    );
};

const getSafeErrorMessage = (error: unknown): string => {
    if (
        error instanceof Error &&
        error.message.trim().length > 0 &&
        error.message.length <= 180
    ) {
        return error.message;
    }

    return 'Hindi natapos ang pagsusuri. Pakisubukan ulit.';
};

const restoreHistoryItemToUnscanned = async (
    fileId?: string | null
): Promise<void> => {
    if (!fileId) {
        return;
    }

    try {
        const storedHistory = await AsyncStorage.getItem(HISTORY_KEY);

        if (!storedHistory) {
            return;
        }

        const parsedHistory = JSON.parse(storedHistory);

        if (!Array.isArray(parsedHistory)) {
            console.warn(
                '[BackgroundProcess] History data is not an array.'
            );
            return;
        }

        let itemWasFound = false;
        const updatedHistory = parsedHistory.map((item: unknown) => {
            if (
                typeof item !== 'object' ||
                item === null ||
                !('id' in item) ||
                item.id !== fileId
            ) {
                return item;
            }

            itemWasFound = true;

            return {
                ...item,
                status: 'unscanned',
            };
        });

        if (!itemWasFound) {
            return;
        }

        await AsyncStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(updatedHistory)
        );
    } catch (error) {
        console.error(
            '[BackgroundProcess] Failed to restore history status:',
            error
        );
    }
};

export const BackgroundProcessProvider = ({
    children,
}: BackgroundProcessProviderProps) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [processRoute, setProcessRoute] = useState('');
    const [activeFileId, setActiveFileId] =
        useState<string | null>(null);
    const [progress, setProgress] = useState(0);

    const isMountedRef = useRef(true);
    const isProcessingRef = useRef(false);
    const activeFileIdRef = useRef<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const operationIdRef = useRef(0);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            operationIdRef.current += 1;
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            activeFileIdRef.current = null;
            isProcessingRef.current = false;
        };
    }, []);

    const resetProcessState = useCallback((): void => {
        isProcessingRef.current = false;
        activeFileIdRef.current = null;
        abortControllerRef.current = null;

        if (!isMountedRef.current) {
            return;
        }

        setIsProcessing(false);
        setProcessRoute('');
        setActiveFileId(null);
        setProgress(0);
    }, []);

    const updateProgress = useCallback((value: number): void => {
        if (!isMountedRef.current || !isProcessingRef.current) {
            return;
        }

        setProgress(clampProgress(value));
    }, []);

    const cancelProcess = useCallback((): void => {
        if (!isProcessingRef.current) {
            return;
        }

        const fileIdToRestore = activeFileIdRef.current;

        // Invalidate first so a task that ignores AbortSignal cannot navigate.
        operationIdRef.current += 1;
        abortControllerRef.current?.abort();
        resetProcessState();

        void restoreHistoryItemToUnscanned(fileIdToRestore);
    }, [resetProcessState]);

    const startProcess = useCallback(async <T,>(
        task: BackgroundTask<T>,
        routeName: string,
        fileId?: string
    ): Promise<void> => {
        if (isProcessingRef.current) {
            Alert.alert(
                'May kasalukuyang analysis',
                'Hintaying matapos o i-cancel muna ang kasalukuyang proseso.'
            );
            return;
        }

        if (typeof task !== 'function') {
            Alert.alert(
                'Hindi masimulan ang analysis',
                'Invalid ang process na ipinasa sa application.'
            );
            return;
        }

        const controller = new AbortController();
        const operationId = operationIdRef.current + 1;
        const normalizedFileId = fileId || null;

        operationIdRef.current = operationId;
        abortControllerRef.current = controller;
        activeFileIdRef.current = normalizedFileId;
        isProcessingRef.current = true;

        if (isMountedRef.current) {
            setIsProcessing(true);
            setProcessRoute(routeName || 'UnknownScreen');
            setActiveFileId(normalizedFileId);
            setProgress(0);
        }

        const reportProgress: ProgressReporter = (value) => {
            if (
                operationIdRef.current !== operationId ||
                controller.signal.aborted
            ) {
                return;
            }

            updateProgress(value);
        };

        try {
            const result = await task(
                controller.signal,
                reportProgress
            );

            const operationIsActive =
                operationIdRef.current === operationId &&
                !controller.signal.aborted;

            if (!operationIsActive) {
                return;
            }

            if (isMountedRef.current) {
                setProgress(100);
            }

            if (result !== undefined && result !== null) {
                navigate('ResultScreen', {
                    analysisResult: result,
                });
            }
        } catch (error: unknown) {
            const operationIsActive =
                operationIdRef.current === operationId;
            const wasCancelled = isCancellationError(
                error,
                controller.signal
            );

            if (operationIsActive && !wasCancelled) {
                console.error(
                    '[BackgroundProcess] Analysis failed:',
                    error
                );

                await restoreHistoryItemToUnscanned(normalizedFileId);

                if (isMountedRef.current) {
                    Alert.alert(
                        'Hindi natapos ang analysis',
                        getSafeErrorMessage(error)
                    );
                }
            }
        } finally {
            if (operationIdRef.current === operationId) {
                resetProcessState();
            }
        }
    }, [resetProcessState, updateProgress]);

    const contextValue = useMemo<BackgroundProcessContextValue>(() => ({
        isProcessing,
        processRoute,
        activeFileId,
        progress,
        startProcess,
        cancelProcess,
        updateProgress,
    }), [
        activeFileId,
        cancelProcess,
        isProcessing,
        processRoute,
        progress,
        startProcess,
        updateProgress,
    ]);

    return (
        <BackgroundProcessContext.Provider value={contextValue}>
            {children}
        </BackgroundProcessContext.Provider>
    );
};

export const useBackgroundProcess = (): BackgroundProcessContextValue => {
    const context = useContext(BackgroundProcessContext);

    if (!context) {
        throw new Error(
            'useBackgroundProcess must be used inside BackgroundProcessProvider.'
        );
    }

    return context;
};
