import React, { createContext, useContext, useState, useMemo } from 'react';

const ThemeContext = createContext({
    isDarkMode: true,
    toggleTheme: () => { },
    colors: {
        bg: '#000000', card: '#1C1C1E', text: '#FFFFFF', subText: '#8E8E93', border: '#2C2C2E',
    }
});

export const ThemeProvider = ({ children }: any) => {
    const [isDarkMode, setIsDarkMode] = useState(true);
    const toggleTheme = () => setIsDarkMode(prev => !prev);

    const colors = useMemo(() => isDarkMode ? {
        bg: '#000000', card: '#1C1C1E', text: '#FFFFFF', subText: '#8E8E93', border: '#2C2C2E',
    } : {
        bg: '#F2F2F7', card: '#FFFFFF', text: '#000000', subText: '#3C3C43', border: '#D1D1D6',
    }, [isDarkMode]);

    const value = useMemo(() => ({ isDarkMode, toggleTheme, colors }), [isDarkMode, colors]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);