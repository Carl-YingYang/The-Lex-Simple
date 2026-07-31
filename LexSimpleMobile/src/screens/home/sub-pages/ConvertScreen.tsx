import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StatusBar } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { postFileEndpoint } from '../../../services/AiEngine';
import { useBackgroundProcess } from '../../../context/BackgroundProcessContext';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { AlertType, useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

export default function ConvertScreen({ navigation }: any) {
  const [isProcessing, setIsProcessing] = useState(false);
  const hasInitialized = useRef(false);

  const { isProcessing: isGlobalProcessing, processRoute, startProcess } = useBackgroundProcess();
  const { showAlert, AlertRender } = useCustomAlert();
  const { isDarkMode, colors: T } = useTheme();

  const LOADING_MESSAGES = [
    "Reading document file...",
    "Extracting text content...",
    "Sanitizing sensitive data locally...",
    "Connecting to Lex-Simple AI...",
    "Analyzing legal terms...",
    "Finalizing report..."
  ];

  // KUNG MAY ONGOING PROCESS, IPAKITA ANG LOADER
  useEffect(() => {
    if (processRoute === 'ConvertScreen' && isGlobalProcessing) {
      setIsProcessing(true);
    } else if (!isGlobalProcessing) {
      setIsProcessing(false);
    }
  }, [isGlobalProcessing, processRoute]);

  // KUNG TUMAPILIK ANG USER DITO AT TAPUS NA ANG PROCESS, BALIK AGAD SA HOME
  useFocusEffect(
    useCallback(() => {
      if (hasInitialized.current && !isGlobalProcessing) {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('Main', { screen: 'Scan' });
      }
    }, [isGlobalProcessing])
  );

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    handleSelectDocument();
  }, []);

  const safeGoBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main', { screen: 'Scan' });
  };

  const saveToOfflineHistory = async (fileUri: string, fileName: string) => {
    const newId = Date.now().toString();
    try {
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      const historyArray = existingHistory ? JSON.parse(existingHistory) : [];

      const newItem = {
        id: newId,
        uri: fileUri,
        title: fileName || 'Document File',
        date: new Date().toLocaleString(),
        type: 'document',
        status: 'unscanned'
      };

      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));
      return newItem;
    } catch (error) {
      return null;
    }
  };

  const updateHistoryToScanned = async (id: string, analysisData: any, extractedText: string) => {
    try {
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      if (!existingHistory) return null;

      let historyArray = JSON.parse(existingHistory);
      let updatedItem = null;

      historyArray = historyArray.map((item: any) => {
        if (item.id === id) {
          updatedItem = {
            ...item,
            status: 'scanned',
            analysisResult: analysisData,
            ocrText: extractedText
          };
          return updatedItem;
        }
        return item;
      });

      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
      return updatedItem;
    } catch (error) {
      return null;
    }
  };

  const handleSelectDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/plain',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        safeGoBack();
        return;
      }

      const file = result.assets[0];

      if (file.size && file.size > 5 * 1024 * 1024) {
        showAlert(
          "File Too Large",
          "Masyadong malaki ang file. Limitahan ang document sa 5MB pataas.",
          "warning",
          [{ text: "OK", style: "cancel", onPress: safeGoBack }]
        );
        return;
      }

      const savedItem = await saveToOfflineHistory(file.uri, file.name);
      if (!savedItem) throw new Error("Failed to save to local storage.");

      const networkState = await Network.getNetworkStateAsync();

      if (networkState.isConnected) {
        processDocument(file, savedItem.id);
      } else {
        showAlert(
          "Offline Mode",
          "Walang internet connection. Na-save ang dokumento sa Recent Files. I-analyze ito kapag may internet na.",
          "info",
          [{ text: "OK", onPress: safeGoBack }]
        );
      }
    } catch (error) {
      showAlert(
        "Access Error",
        "Hindi mabuksan ang file manager. Subukan ulit.",
        "error",
        [{ text: "OK", style: "destructive", onPress: safeGoBack }]
      );
    }
  };

  const processDocument = (file: any, dbId: string) => {
    setIsProcessing(true);

    // 🚀 LINIS NA CODE: WALANG TS ERRORS DITO
    startProcess(async () => {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      });

      const data = await postFileEndpoint('/simplify_file', formData);

      if (data && data.status === 'success') {
        const combinedAnalysisResult = {
          ...data.data,
          rag_context_used: data.rag_context_used,
          sanitizedText: data.sanitizedText
        };
        const textToSave = data.extractedText || `File Content from: ${file.name}`;
        await updateHistoryToScanned(dbId, combinedAnalysisResult, textToSave);
        return combinedAnalysisResult;
      } else {
        throw new Error(data?.message || "Server processing failed.");
      }
    }, 'ConvertScreen');
  };

  if (isProcessing) {
    return (
      <ScreenLayout title="Processing Document" showBackButton={false}>
        <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <ProcessingLoader
            title="Analyzing Document"
            messages={LOADING_MESSAGES}
            onMinimize={() => navigation.navigate('Main', { screen: 'Scan' })}
          />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Opening File Manager">
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={COLORS.primaryLight} />
        <Text style={{ color: T.subText, marginTop: 15, fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 }}>
          Loading Library...
        </Text>
      </View>
      <AlertRender />
    </ScreenLayout>
  );
}