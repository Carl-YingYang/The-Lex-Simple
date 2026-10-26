import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const hasSupabaseConfig = Boolean(url && key);

// SecureStore values can exceed the platform's per-value limit; split sessions.
const PREFIX = 'lex_auth_session_v1';
const SIZE = 1600;
const authStorage = {
    async getItem(_key: string): Promise<string | null> {
        const countText = await SecureStore.getItemAsync(`${PREFIX}_count`);
        if (countText === null) return null;
        const count = Number(countText);
        if (!Number.isInteger(count) || count < 1 || count > 20) return null;
        const values = await Promise.all(Array.from({ length: count }, (_, i) =>
            SecureStore.getItemAsync(`${PREFIX}_${i}`)));
        return values.every((value) => value !== null) ? values.join('') : null;
    },
    async setItem(_key: string, value: string): Promise<void> {
        const previous = Number(await SecureStore.getItemAsync(`${PREFIX}_count`) || '0');
        const parts = value.match(new RegExp(`.{1,${SIZE}}`, 'gs')) || [];
        if (parts.length > 20) throw new Error('Auth session exceeds secure storage capacity');
        for (let i = 0; i < parts.length; i++) {
            await SecureStore.setItemAsync(`${PREFIX}_${i}`, parts[i]);
        }
        await SecureStore.setItemAsync(`${PREFIX}_count`, String(parts.length));
        for (let i = parts.length; i < previous; i++) {
            await SecureStore.deleteItemAsync(`${PREFIX}_${i}`);
        }
    },
    async removeItem(_key: string): Promise<void> {
        const count = Number(await SecureStore.getItemAsync(`${PREFIX}_count`) || '0');
        await SecureStore.deleteItemAsync(`${PREFIX}_count`);
        for (let i = 0; i < Math.min(count, 20); i++) {
            await SecureStore.deleteItemAsync(`${PREFIX}_${i}`);
        }
    },
};

export const supabase = hasSupabaseConfig
    ? createClient(url!, key!, {
        auth: {
            storage: authStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    })
    : null;

if (supabase) {
    AppState.addEventListener('change', (state) => {
        if (state === 'active') supabase.auth.startAutoRefresh();
        else supabase.auth.stopAutoRefresh();
    });
}