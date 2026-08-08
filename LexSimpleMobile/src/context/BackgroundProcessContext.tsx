import React, { createContext, useContext, useState, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate } from '../navigation/RootNavigation';

const BackgroundProcessContext = createContext({
    isProcessing: false,
    processRoute: '',
    activeFileId: null as string | null,
    progress: 0,
    startProcess: async (task: (signal: AbortSignal) => Promise<any>, routeName: string, fileId?: string) => { },
    cancelProcess: () => { },
});

export const BackgroundProcessProvider = ({ children }: any) => {
    // 🚀 LAHAT NG HOOKS AY NASA TAAS AT NASA TAMANG ORDER
    const [isProcessing, setIsProcessing] = useState(false);
    const [processRoute, setProcessRoute] = useState('');
    const [activeFileId, setActiveFileId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);
    const progressIntervalRef = useRef<any>(null);

    const startProcess = async (task: (signal: AbortSignal) => Promise<any>, routeName: string, fileId?: string) => {
        setIsProcessing(true);
        setProcessRoute(routeName);
        setActiveFileId(fileId || null);
        setProgress(0);

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // 🚀 SIMULATE PROGRESS SA CONTEXT PARA HINDI MAG-RESET KAPAG NAG-BACKGROUND
        progressIntervalRef.current = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) return prev;
                return Math.min(prev + Math.random() * 4 + 1, 90);
            });
        }, 300);

        try {
            const result = await task(signal);
            clearInterval(progressIntervalRef.current);
            setProgress(100);

            if (result) {
                navigate('ResultScreen', { analysisResult: result });
            }
        } catch (error: any) {
            clearInterval(progressIntervalRef.current);
            if (error.name === 'AbortError') {
                Alert.alert("Cancelled", "Na-cancel ang proseso.");
            } else {
                Alert.alert("Error", error.message || "Nagkaproblema sa background process.");
            }

            if (fileId) {
                try {
                    const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
                    if (existingHistory) {
                        let historyArray = JSON.parse(existingHistory);
                        historyArray = historyArray.map((item: any) => item.id === fileId ? { ...item, status: 'unscanned' } : item);
                        await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
                    }
                } catch (e) { console.error("Failed to restore file status", e); }
            }
        } finally {
            setIsProcessing(false);
            setProcessRoute('');
            setActiveFileId(null);
            abortControllerRef.current = null;
            // Reset progress after a short delay so user sees 100%
            setTimeout(() => setProgress(0), 500);
        }
    };

    const cancelProcess = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    return (
        <BackgroundProcessContext.Provider value={{ isProcessing, processRoute, activeFileId, progress, startProcess, cancelProcess }}>
            {children}
        </BackgroundProcessContext.Provider>
    );
};

export const useBackgroundProcess = () => useContext(BackgroundProcessContext);