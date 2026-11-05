// THEMECONTEXT VERSION: 2.1.0
// Default ay LIGHT mode sa fresh install (dating dark), at naka-persist na
// ang napiling tema sa AsyncStorage (@lex_theme_mode_v1) — ibinabalik ito
// sa susunod na bukas ng app. Ang pampublikong API ay hindi nagbago:
// { isDarkMode, toggleTheme, colors }.
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { darkTheme, lightTheme, type ThemeColors } from './tokens';

const THEME_MODE_KEY = '@lex_theme_mode_v1';

interface ThemeContextValue {
    isDarkMode: boolean;
    toggleTheme: () => void;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
    isDarkMode: false,
    toggleTheme: () => { },
    colors: lightTheme,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    // Light mode muna ang default (fresh install). Kapag may na-save na
    // pili noong nakaraang session, ibabalik iyon pagkatapos ng load.
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadSavedMode = async (): Promise<void> => {
            try {
                const saved = await AsyncStorage.getItem(THEME_MODE_KEY);

                if (mounted && saved === 'dark') {
                    setIsDarkMode(true);
                }
            } catch {
                // Hindi mabasa ang saved theme — mananatiling light.
            }
        };

        void loadSavedMode();

        return () => {
            mounted = false;
        };
    }, []);

    const toggleTheme = useCallback((): void => {
        setIsDarkMode((prev) => {
            const next = !prev;

            void AsyncStorage
                .setItem(THEME_MODE_KEY, next ? 'dark' : 'light')
                .catch(() => {
                    // Hindi kritikal kung mabigo ang save — tumutuloy pa rin
                    // ang toggle sa session na ito.
                });

            return next;
        });
    }, []);

    const colors = useMemo(
        () => (isDarkMode ? darkTheme : lightTheme),
        [isDarkMode]
    );

    const value = useMemo(
        () => ({ isDarkMode, toggleTheme, colors }),
        [isDarkMode, colors, toggleTheme]
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);