import React, { createContext, useState, useContext } from 'react';

type ThemeType = 'dark' | 'light';

interface ThemeContextType {
    isDarkMode: boolean;
    toggleTheme: () => void;
    theme: {
        bg: string;
        card: string;
        text: string;
        subText: string;
        border: string;
    };
}

const ThemeContext = createContext<ThemeContextType>({
    isDarkMode: true,
    toggleTheme: () => { },
    theme: {
        bg: '#000000', card: '#1C1C1E', text: '#FFFFFF', subText: '#8E8E93', border: '#2C2C2E'
    }
});

export const ThemeProvider = ({ children }: any) => {
    const [isDarkMode, setIsDarkMode] = useState(true);

    const toggleTheme = () => setIsDarkMode(prev => !prev);

    const theme = isDarkMode ? {
        bg: '#000000', card: '#1C1C1E', text: '#FFFFFF', subText: '#8E8E93', border: '#2C2C2E'
    } : {
        bg: '#F2F2F7', card: '#FFFFFF', text: '#000000', subText: '#3C3C43', border: '#D1D1D6'
    };

    return (
        <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);