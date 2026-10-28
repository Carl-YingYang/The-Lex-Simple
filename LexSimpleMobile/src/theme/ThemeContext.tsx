// THEMECONTEXT VERSION: 2.0.0
// Nag-derive na ngayon mula sa theme/tokens.ts. Ang pampublikong API ay hindi nagbago:
// { isDarkMode, toggleTheme, colors } — may dagdag na semantic tokens sa colors.
// Ang mga umiiral na screen na gumagamit ng T.bg / T.card / T.text / T.subText / T.border
// ay magpapatuloy nang WALANG PAGBABAGO (sila pa rin ang parehong mga susi sa tema).
import React, { createContext, useContext, useMemo, useState } from 'react';

import { darkTheme, lightTheme, type ThemeColors } from './tokens';

interface ThemeContextValue {
    isDarkMode: boolean;
    toggleTheme: () => void;
    colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue>({
    isDarkMode: true,
    toggleTheme: () => { },
    colors: darkTheme,
});

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [isDarkMode, setIsDarkMode] = useState(true);
    const toggleTheme = () => setIsDarkMode(prev => !prev);

    const colors = useMemo(
        () => (isDarkMode ? darkTheme : lightTheme),
        [isDarkMode]
    );

    const value = useMemo(
        () => ({ isDarkMode, toggleTheme, colors }),
        [isDarkMode, colors]
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);