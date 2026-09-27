import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScanPage } from '../types/ScanPage';
import { deleteScanSession } from './scanFileStorage';

// SCAN HISTORY STORAGE VERSION: 6.2.6
// Serializes read/modify/write operations in this JS process.
const HISTORY_KEY = '@lex_scan_history';
let pending: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
export const subscribeScanHistory = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export type ScanHistoryItem = {
    id: string;
    uri?: string;
    thumbnailUri?: string;
    images?: string[];
    pageUris?: string[];
    draftPages?: ScanPage[];
    title: string;
    userRenamed?: boolean;
    date: string;
    updatedAt?: number;
    type: 'camera' | 'gallery' | 'document';
    status: 'draft' | 'unscanned' | 'scanned';
    processingState?: 'analyzing' | 'needs-retry';
    analysisResult?: any;
    ocrText?: string;
    sanitizedText?: string;
};

const readUnlocked = async (): Promise<ScanHistoryItem[]> => {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed as ScanHistoryItem[] : [];
    } catch {
        return [];
    }
};

const mutate = <T>(
    operation: () => Promise<T>
): Promise<T> => {
    const task = pending.then(operation, operation);
    pending = task.then(() => undefined, () => undefined);
    return task;
};

export const listScanHistory = (): Promise<ScanHistoryItem[]> =>
    mutate(readUnlocked);

export const updateScanHistory = (
    transform: (items: ScanHistoryItem[]) => ScanHistoryItem[]
): Promise<ScanHistoryItem[]> =>
    mutate(async () => {
        const current = await readUnlocked();
        const next = transform(current);
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        listeners.forEach((listener) => listener());
        return next;
    });

export const getScanHistoryItem = async (
    id: string
): Promise<ScanHistoryItem | undefined> =>
    (await listScanHistory()).find((item) => item.id === id);

const draftTitle = (type: ScanHistoryItem['type']): string =>
    type === 'gallery' ? 'Mga larawan mula sa Gallery' : 'Bagong scan';

export const saveScanDraft = async (
    id: string,
    pages: ScanPage[],
    type: 'camera' | 'gallery',
    thumbnailUri?: string
): Promise<void> => {
    if (!id || pages.length === 0) return;
    await updateScanHistory((items) => {
        const previous = items.find((item) => item.id === id);
        if (previous?.status === 'scanned') return items;
        const next: ScanHistoryItem = {
            ...previous,
            id,
            uri: pages[0].editedUri,
            pageUris: pages.map((page) => page.editedUri),
            draftPages: pages,
            thumbnailUri: thumbnailUri || previous?.thumbnailUri,
            title: previous?.title || draftTitle(type),
            date: previous?.date || new Date().toLocaleString(),
            updatedAt: Date.now(),
            type: previous?.type || type,
            status: previous?.status === 'unscanned' ? 'unscanned' : 'draft',
            processingState: previous?.processingState,
        };
        return [next, ...items.filter((item) => item.id !== id)];
    });
};

export const savePendingScan = async (
    id: string,
    pages: ScanPage[],
    type: 'camera' | 'gallery',
    ocrText: string,
    sanitizedText: string,
    defaultTitle: string
): Promise<void> => {
    await updateScanHistory((items) => {
        const previous = items.find((item) => item.id === id);
        const next: ScanHistoryItem = {
            ...previous,
            id,
            uri: pages[0]?.editedUri || previous?.uri,
            pageUris: pages.map((page) => page.editedUri),
            draftPages: pages,
            title: previous?.userRenamed
                ? previous.title
                : defaultTitle,
            userRenamed: previous?.userRenamed,
            thumbnailUri: previous?.thumbnailUri,
            date: previous?.date || new Date().toLocaleString(),
            updatedAt: Date.now(),
            type,
            status: 'unscanned',
            processingState: 'analyzing',
            ocrText,
            sanitizedText,
        };
        return [next, ...items.filter((item) => item.id !== id)];
    });
};

export const completeScan = async (
    id: string,
    result: any,
    ocrText: string,
    sanitizedText: string
): Promise<void> => {
    await updateScanHistory((items) =>
        items.map((item) => item.id !== id
            ? item
            : {
                ...item,
                title: item.userRenamed
                    ? item.title
                    : typeof result?.documentTitle === 'string' &&
                      result.documentTitle.trim()
                      ? result.documentTitle.trim()
                      : item.title,
                status: 'scanned' as const,
                processingState: undefined,
                analysisResult: result,
                ocrText,
                sanitizedText,
                updatedAt: Date.now(),
            })
    );
};

export const markScanNeedsRetry = async (id: string): Promise<void> => {
    await updateScanHistory((items) =>
        items.map((item) => item.id === id && item.status !== 'scanned'
            ? { ...item, status: 'unscanned' as const, processingState: 'needs-retry' as const }
            : item)
    );
};

export const renameScan = async (
    id: string,
    title: string
): Promise<ScanHistoryItem[]> =>
    updateScanHistory((items) =>
        items.map((item) => item.id === id
            ? { ...item, title, userRenamed: true, updatedAt: Date.now() }
            : item)
    );

export const deleteScans = async (
    ids: string[]
): Promise<ScanHistoryItem[]> => {
    const selected = new Set(ids);
    const sessionsToCheck = new Set<string>();
    const remaining = await updateScanHistory((items) => {
        items.filter((item) => selected.has(item.id)).forEach((item) =>
            item.draftPages?.forEach((page) => sessionsToCheck.add(page.sessionId))
        );
        return items.filter((item) => !selected.has(item.id));
    });
    for (const sessionId of sessionsToCheck) {
        const usedElsewhere = remaining.some((item) =>
            item.draftPages?.some((page) => page.sessionId === sessionId)
        );
        if (!usedElsewhere) {
            try { deleteScanSession(sessionId); }
            catch (error) { console.warn('[ScanHistory] Image cleanup failed', error); }
        }
    }
    return remaining;
};

export const recoverInterruptedScans = async (
    processIsRunning: boolean,
    activeId?: string | null
): Promise<ScanHistoryItem[]> =>
    updateScanHistory((items) =>
        items.map((item) =>
            item.processingState === 'analyzing' &&
            !processIsRunning &&
            item.id !== activeId
                ? {
                    ...item,
                    status: 'unscanned' as const,
                    processingState: 'needs-retry' as const,
                }
                : item)
    );