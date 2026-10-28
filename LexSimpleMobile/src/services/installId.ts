import AsyncStorage from '@react-native-async-storage/async-storage';

// Anonymous install identifier used for rate limiting / abuse protection and
// aggregate analytics. It is a random string generated on first launch and is
// NOT derived from, stored with, or linked to any account, device fingerprint,
// or personal information. Opting out stops sending the header entirely.
// This is a convenience token, not a security secret.

const INSTALL_ID_KEY = '@lex_install_id_v1';
const ANALYTICS_OPTOUT_KEY = '@lex_analytics_optout_v1';
const INSTALL_ID_LENGTH = 32;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

let cachedInstallId: string | null = null;
let cachedAnalyticsEnabled: boolean | null = null;
let installIdPromise: Promise<string> | null = null;

const generateInstallId = (): string => {
    let id = '';
    for (let i = 0; i < INSTALL_ID_LENGTH; i++) {
        id += ID_ALPHABET.charAt(Math.floor(Math.random() * ID_ALPHABET.length));
    }
    return id;
};

export const getInstallId = (): Promise<string> => {
    if (cachedInstallId) return Promise.resolve(cachedInstallId);
    if (installIdPromise) return installIdPromise;
    installIdPromise = (async () => {
        try {
            const stored = await AsyncStorage.getItem(INSTALL_ID_KEY);
            if (stored) {
                cachedInstallId = stored;
                return stored;
            }
            const generated = generateInstallId();
            await AsyncStorage.setItem(INSTALL_ID_KEY, generated);
            cachedInstallId = generated;
            return generated;
        } catch {
            // Storage unavailable: fall back to an in-memory id for this
            // session so requests are never blocked or crashed.
            if (!cachedInstallId) cachedInstallId = generateInstallId();
            return cachedInstallId;
        } finally {
            installIdPromise = null;
        }
    })();
    return installIdPromise;
};

export const isAnalyticsEnabled = async (): Promise<boolean> => {
    if (cachedAnalyticsEnabled !== null) return cachedAnalyticsEnabled;
    try {
        const stored = await AsyncStorage.getItem(ANALYTICS_OPTOUT_KEY);
        // No stored preference means analytics is enabled by default.
        const enabled = stored === null ? true : stored !== 'true';
        cachedAnalyticsEnabled = enabled;
        return enabled;
    } catch {
        return true;
    }
};

export const setAnalyticsEnabled = async (enabled: boolean): Promise<void> => {
    cachedAnalyticsEnabled = enabled;
    try {
        if (enabled) {
            await AsyncStorage.removeItem(ANALYTICS_OPTOUT_KEY);
        } else {
            await AsyncStorage.setItem(ANALYTICS_OPTOUT_KEY, 'true');
        }
    } catch {
        // Preference stays in memory for this session; persistence can be retried later.
    }
};

export const getApiIdentityHeaders = async (): Promise<Record<string, string>> => {
    try {
        if (!(await isAnalyticsEnabled())) return {};
        const installId = await getInstallId();
        return { 'X-Install-Id': installId };
    } catch {
        return {};
    }
};