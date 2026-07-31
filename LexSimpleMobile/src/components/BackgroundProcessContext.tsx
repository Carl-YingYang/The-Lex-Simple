import React, { createContext, useContext, useState } from 'react';
import { Alert } from 'react-native';
import { navigate } from '../navigation/RootNavigation'; // 🚀 IMPORT ANG GLOBAL NAVIGATE

const BackgroundProcessContext = createContext({
    isProcessing: false,
    processRoute: '',
    startProcess: async (task: () => Promise<any>, routeName: string) => { },
});

export const BackgroundProcessProvider = ({ children }: any) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [processRoute, setProcessRoute] = useState('');

    const startProcess = async (task: () => Promise<any>, routeName: string) => {
        setIsProcessing(true);
        setProcessRoute(routeName);

        try {
            // 🚀 DITO TATAKBO ANG ACTUAL API CALL KAHIT NAKA-BACKGROUND ANG APP
            const result = await task();
            if (result) {
                // 🚀 GAMITIN ANG GLOBAL NAVIGATE FUNCTION
                navigate('ResultScreen', { analysisResult: result });
            }
        } catch (error: any) {
            Alert.alert("Error", error.message || "Nagkaproblema sa background process.");
        } finally {
            setIsProcessing(false);
            setProcessRoute('');
        }
    };

    return (
        <BackgroundProcessContext.Provider value={{ isProcessing, processRoute, startProcess }}>
            {children}
        </BackgroundProcessContext.Provider>
    );
};

export const useBackgroundProcess = () => useContext(BackgroundProcessContext);