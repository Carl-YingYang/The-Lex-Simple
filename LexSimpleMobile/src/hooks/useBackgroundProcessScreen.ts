import { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';
import type { BackgroundTask } from '../context/BackgroundProcessContext';

// BACKGROUND PROCESS SCREEN HOOK VERSION: 2.0.0

export const useBackgroundProcessScreen = (screenName: string) => {
    const navigation = useNavigation();
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