import { useState, useEffect } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';
import type { BackgroundTask } from '../context/BackgroundProcessContext';

// BACKGROUND PROCESS SCREEN HOOK VERSION: 2.0.1

// ROUTE CONTRACT (loose): kapareho ng contract sa navigation/RootNavigation.tsx.
// UPGRADE PATH: kapag may RootStackParamList na, palitan ito ng
// NativeStackNavigationProp<RootStackParamList> para maging eksakto ang
// pag-type-check ng mga route names at params.
type AppNavigationProp = NavigationProp<Record<string, object | undefined>>;

export const useBackgroundProcessScreen = (screenName: string) => {
    const navigation = useNavigation<AppNavigationProp>();
    const { isProcessing: isGlobalProcessing, processRoute, activeFileId, startProcess, cancelProcess } = useBackgroundProcess();

    // 🚀 PURE STATE: Kung ito yung screen na kasalukuyang nagpoprocess
    const isProcessing = isGlobalProcessing && processRoute === screenName;

    const safeGoBack = () => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Main', { screen: 'Scan' });
    };

    const triggerBackgroundProcess = (task: BackgroundTask<any>, fileId?: string) => {
        startProcess(task, screenName, fileId);
    };

    return {
        isProcessing,
        isGlobalProcessing,
        activeFileId,
        triggerBackgroundProcess,
        cancelProcess,
        safeGoBack
    };
};