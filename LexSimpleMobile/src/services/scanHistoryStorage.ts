import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScanPage } from '../types/ScanPage';
import { deleteScanSession } from './scanFileStorage';
import { getLocalOwner, localDataKey, type LocalOwner } from './localDataScope';

// SCAN HISTORY STORAGE VERSION: 6.2.6
// Serializes read/modify/write operations in this JS process.
let pending: Promise<unknown> = Promise.resolve();
const itemOwners = new Map<string, LocalOwner>();
export const waitForScanHistoryWrites = async (): Promise<void> => { await pending; };
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

const readUnlocked = async (key: string): Promise<ScanHistoryItem[]> => {
    const raw = await AsyncStorage.getItem(key);
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

export const listScanHistory = (): Promise<ScanHistoryItem[]> => {
    const owner = getLocalOwner();
    const key = localDataKey('scanHistory', owner);
    return mutate(async () => {
        const items = await readUnlocked(key);
        items.forEach((item) => itemOwners.set(item.id, owner));
        return items;
    });
};

export const updateScanHistory = (
    transform: (items: ScanHistoryItem[]) => ScanHistoryItem[],
    owner = getLocalOwner()
): Promise<ScanHistoryItem[]> => {
    const key = localDataKey('scanHistory', owner);
    return mutate(async () => {
        const current = await readUnlocked(key);
        const next = transform(current);
        await AsyncStorage.setItem(key, JSON.stringify(next));
        next.forEach((item) => itemOwners.set(item.id, owner));
        listeners.forEach((listener) => listener());
        return next;
    });
};

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
    const owner = getLocalOwner();
    itemOwners.set(id, owner);
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
    }, owner);
};

export const savePendingScan = async (
    id: string,
    pages: ScanPage[],
    type: 'camera' | 'gallery',
    ocrText: string,
    sanitizedText: string,
    defaultTitle: string
): Promise<void> => {
    const owner = getLocalOwner();
    itemOwners.set(id, owner);
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
    }, owner);
};

export const completeScan = async (
    id: string,
    result: any,
    ocrText: string,
    sanitizedText: string
): Promise<void> => {
    const owner = itemOwners.get(id) || getLocalOwner();
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
    , owner);
};

export const markScanNeedsRetry = async (id: string): Promise<void> => {
    const owner = itemOwners.get(id) || getLocalOwner();
    await updateScanHistory((items) =>
        items.map((item) => item.id === id && item.status !== 'scanned'
            ? { ...item, status: 'unscanned' as const, processingState: 'needs-retry' as const }
            : item)
    , owner);
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
    const owner = getLocalOwner();
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
            try { deleteScanSession(sessionId, owner); }
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