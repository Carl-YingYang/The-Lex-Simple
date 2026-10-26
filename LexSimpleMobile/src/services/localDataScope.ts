import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export type LocalOwner = 'guest' | `user:${string}`;
const LEGACY_KEYS = {
    scanHistory: '@lex_scan_history',
    chatHistory: '@lex_chat_history',
    profile: '@lex_profile',
} as const;
type DataKind = keyof typeof LEGACY_KEYS;

let currentOwner: LocalOwner = 'guest';
export const getLocalOwner = (): LocalOwner => currentOwner;
export const setLocalOwner = (owner: LocalOwner): void => {
    if (owner !== 'guest' && !/^user:[0-9a-f-]{36}$/i.test(owner)) {
        throw new Error('Invalid local owner');
    }
    currentOwner = owner;
};
export const localDataKey = (kind: DataKind, owner = currentOwner): string =>
    `@lex_v2:${owner}:${kind}`;

const profileFolder = (owner: LocalOwner): Directory =>
    owner === 'guest'
        ? new Directory(Paths.document, 'lexsimple', 'profiles', 'guest')
        : new Directory(Paths.document, 'lexsimple', 'profiles', 'users', owner.slice(5));

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