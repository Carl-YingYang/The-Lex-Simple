import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

// P1: guest-only na ang local data scope — lahat ng data ay naka-namespace
// sa 'guest'. Tinanggal ang user:<uuid> branch dahil walang account system
// na umuugma dito.
export type LocalOwner = 'guest';
const LEGACY_KEYS = {
    scanHistory: '@lex_scan_history',
    chatHistory: '@lex_chat_history',
    profile: '@lex_profile',
} as const;
type DataKind = keyof typeof LEGACY_KEYS;

let currentOwner: LocalOwner = 'guest';
export const getLocalOwner = (): LocalOwner => currentOwner;
export const setLocalOwner = (owner: LocalOwner): void => {
    currentOwner = owner;
};
export const localDataKey = (kind: DataKind, owner = currentOwner): string =>
    `@lex_v2:${owner}:${kind}`;

const profileFolder = (owner: LocalOwner): Directory =>
    new Directory(Paths.document, 'lexsimple', 'profiles', 'guest');

/** Keep picked avatars outside the temporary image-picker cache. */
export const keepProfileImage = (sourceUri: string, owner = getLocalOwner()): string => {
    if (!sourceUri.startsWith('file://')) throw new Error('Invalid local profile image');
    const source = new File(sourceUri);
    if (!source.exists) throw new Error('Profile image is no longer available');
    const folder = profileFolder(owner);
    folder.create({ idempotent: true, intermediates: true });
    const folderPrefix = folder.uri.endsWith('/') ? folder.uri : `${folder.uri}/`;
    if (sourceUri.startsWith(folderPrefix)) return sourceUri;
    const extension = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(source.extension?.toLowerCase() || '')
        ? source.extension.toLowerCase() : '.jpg';
    const destination = new File(folder, `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${extension}`);
    source.copy(destination);
    return destination.uri;
};

/**
 * Task A2 / Privacy section: binubura ang LAHAT ng local user data —
 * scan history, chat history, at profile (kasama ang avatar files).
 * Kasama rin ang mga legacy key para hindi na sila bumalik sa susunod
 * na migration. Hindi kasama ang install id — iyon ay random token para
 * sa quota/abuse protection at hindi personal data.
 */
export const clearLocalData = async (): Promise<void> => {
    await AsyncStorage.multiRemove([
        localDataKey('scanHistory', 'guest'),
        localDataKey('chatHistory', 'guest'),
        localDataKey('profile', 'guest'),
        LEGACY_KEYS.scanHistory,
        LEGACY_KEYS.chatHistory,
        LEGACY_KEYS.profile,
    ]);

    try {
        const folder = profileFolder('guest');
        if (folder.exists) folder.delete();
    } catch (error) {
        // Avatar files lang ang di-umaabot dito; hindi hadlang ang FS error
        // sa pag-clear ng AsyncStorage data.
        console.warn('[LocalData] Avatar folder clear skipped', error);
    }
};

/** Copy once, without removing the old data. Each category can migrate separately. */
export const migrateLegacyKindToGuest = async (kind: DataKind): Promise<void> => {
    const target = localDataKey(kind, 'guest');
    if (await AsyncStorage.getItem(target) !== null) return;
    const oldValue = await AsyncStorage.getItem(LEGACY_KEYS[kind]);
    if (oldValue !== null) await AsyncStorage.setItem(target, oldValue);
};
export const migrateLegacyDataToGuest = async (): Promise<void> => {
    await migrateLegacyKindToGuest('scanHistory');
    await migrateLegacyKindToGuest('chatHistory');
    await migrateLegacyKindToGuest('profile');
    const key = localDataKey('profile', 'guest');
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return;
    try {
        const profile = JSON.parse(raw);
        if (profile && typeof profile.avatar === 'string' && profile.avatar.startsWith('file://')) {
            const savedAvatar = keepProfileImage(profile.avatar, 'guest');
            if (savedAvatar !== profile.avatar) {
                await AsyncStorage.setItem(key, JSON.stringify({ ...profile, avatar: savedAvatar }));
            }
        }
    } catch (error) {
        // Keep the old profile and URI; a missing cached avatar should not hide scans.
        console.warn('[LocalData] Guest avatar copy skipped', error);
    }
};