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
import { markScanNeedsRetry } from '../services/scanHistoryStorage';

import { navigate } from '../navigation/RootNavigation';

// BACKGROUND PROCESS CONTEXT VERSION: 6.2.7
// One cancellable in-app process with honest progress and history recovery.
// 6.2.7: stale-process watchdog — kapag hindi na-settle ang task (hal.
// nabitin na network call o storage write na hindi sumagot sa abort),
// sapilitang sinasara ang process pagkatapos ng PROCESS_WATCHDOG_MS na
// walang anumang aktibidad (walang progress report at walang pag-settle).
// Garantiya: hindi na mananatiling "isProcessing" ang UI magpakailanman,
// kaya auto-mawawala rin ang floating waiting indicator.
// 6.2.6 at mas luma: walang watchdog — hang ga task = stuck na UI.

// 6 minutong katahimikan = nabitin ang task. Mas mahaba ito sa 5-minitong
// timeout ng bawat AI API call (ANALYSIS_TIMEOUT_MS) kaya hindi nito
// maaaring i-abort ang legit na tumatakbong analysis — sa pagitan ng mga
// progress report, laging may bounded na await (API call na may timeout).
const PROCESS_WATCHDOG_MS = 6 * 60 * 1000;

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
        // 240 na (dating 180): kasya na ang buong paliwanag ng backend sa
        // failure dialog (hal. 183-char na unsupported_document message).
        error.message.length <= 240
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
        await markScanNeedsRetry(fileId);
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
    const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            operationIdRef.current += 1;
            abortControllerRef.current?.abort();
            abortControllerRef.current = null;
            activeFileIdRef.current = null;
            isProcessingRef.current = false;
            if (watchdogRef.current !== null) {
                clearTimeout(watchdogRef.current);
                watchdogRef.current = null;
            }
        };
    }, []);

    const clearWatchdog = useCallback((): void => {
        if (watchdogRef.current !== null) {
            clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
        }
    }, []);

    const resetProcessState = useCallback((): void => {
        isProcessingRef.current = false;
        activeFileIdRef.current = null;
        abortControllerRef.current = null;
        clearWatchdog();

        if (!isMountedRef.current) {
            return;
        }

        setIsProcessing(false);
        setProcessRoute('');
        setActiveFileId(null);
        setProgress(0);
    }, [clearWatchdog]);

    // Stale-process watchdog: binubuhay muli sa bawat aktibidad
    // (pag-simula ng process at bawat progress report). Kapag umabot sa
    // PROCESS_WATCHDOG_MS na walang aktibidad at hindi pa rin nag-settle
    // ang task, itinuturing nang nabitin ito — sapilitang sinasara
    // (abort + reset + history restore) para hindi mangulubot ang UI.
    const armWatchdog = useCallback((): void => {
        if (!isMountedRef.current || !isProcessingRef.current) {
            return;
        }

        clearWatchdog();
        watchdogRef.current = setTimeout(() => {
            watchdogRef.current = null;

            if (!isMountedRef.current || !isProcessingRef.current) {
                return;
            }

            const fileIdToRestore = activeFileIdRef.current;

            console.warn(
                '[BackgroundProcess] Walang aktibidad sa process — sapilitang pagsasara (watchdog).'
            );

            // Pareho ng cancelProcess: i-invalidate muna ang operation
            // bago i-abort, para hindi makalusot ang late na settle.
            operationIdRef.current += 1;
            abortControllerRef.current?.abort();
            resetProcessState();

            void restoreHistoryItemToUnscanned(fileIdToRestore);
        }, PROCESS_WATCHDOG_MS);
    }, [clearWatchdog, resetProcessState]);

    const updateProgress = useCallback((value: number): void => {
        if (!isMountedRef.current || !isProcessingRef.current) {
            return;
        }

        setProgress(clampProgress(value));
        armWatchdog();
    }, [armWatchdog]);

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

        armWatchdog();

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
    }, [armWatchdog, resetProcessState, updateProgress]);

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