import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ActivityIndicator, StatusBar, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';
import { postEndpoint } from '../../../services/AiEngine';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';
import { sanitizeLocalText } from '../../../utils/sanitizer';

export default function UploadImageScreen({ navigation }: any) {
  const hasInitialized = useRef(false);
  const { showAlert, AlertRender } = useCustomAlert();
  const { isDarkMode, colors: T } = useTheme();

  // 🚀 REUSABLE HOOK
  const { isProcessing, isGlobalProcessing, triggerBackgroundProcess, cancelProcess, safeGoBack } = useBackgroundProcessScreen('UploadImageScreen');

  const LOADING_MESSAGES = [
    "Reading document file...",
    "Extracting text offline...",
    "Sanitizing sensitive data locally...",
    "Connecting to Lex-Simple AI...",
    "Analyzing legal terms...",
    "Simplifying for you..."
  ];

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // 🚀 KUNG MAY ONGOING PROCESS NA, WAG MAG-OPEN NG GALLERY, BALIK AGAD SA HOME
    if (isGlobalProcessing) {
      showAlert("May Proseso Pa", "May kasalukuyang nag-aanalyze pa. Hintayin matapos o i-cancel muna ito.", "warning", [{ text: "OK", onPress: safeGoBack }]);
      return;
    }

    pickImage();
  }, []);

  const saveToOfflineHistory = async (imageUri: string, type: 'gallery', extractedText: string) => {
    const newId = Date.now().toString();
    try {
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      const historyArray = existingHistory ? JSON.parse(existingHistory) : [];
      const newItem = {
        id: newId, uri: imageUri, title: 'Gallery Upload',
        date: new Date().toLocaleString(), type: type, status: 'unscanned', ocrText: extractedText
      };
      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));
      return newItem;
    } catch (error) { console.error("Error saving offline", error); return null; }
  };

  const updateHistoryToScanned = async (id: string, analysisData: any, ocrText: string) => {
    try {
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      if (!existingHistory) return null;
      let historyArray = JSON.parse(existingHistory);
      let updatedItem = null;

      historyArray = historyArray.map((item: any) => {
        if (item.id === id) {
          updatedItem = { ...item, status: 'scanned', analysisResult: analysisData, ocrText: ocrText };
          return updatedItem;
        }
        return item;
      });

      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
      return updatedItem;
    } catch (error) { console.error("Error updating history", error); return null; }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (newStatus !== 'granted') {
        showAlert("Kailangan ng Gallery Access", "Para makapag-upload ng litrato, kailangan namin ng pahintulot na ma-access ang gallery mo.", "warning", [
          { text: "Bumalik", style: "cancel", onPress: safeGoBack },
          { text: "Pumunta sa Settings", onPress: () => Linking.openSettings() }
        ]);
        return;
      }
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 1 });
      if (!result.canceled) {
        const imageUri = result.assets[0].uri;
        const formattedUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;

        let extractedText = "";
        try {
          const ocrResult = await TextRecognition.recognize(formattedUri);
          extractedText = ocrResult.text;
        } catch (ocrError) { return handleError("Hindi ma-process ng system ang larawan."); }

        if (!extractedText || extractedText.trim().length < 20) return handleError("Masyadong malabo o walang laman ang imahe. Hindi mabasa ang text.");

        const savedItem = await saveToOfflineHistory(imageUri, 'gallery', extractedText);
        if (!savedItem) return handleError("Failed to save to local storage.");

        const networkState = await Network.getNetworkStateAsync();
        if (networkState.isConnected) {
          processWithAI(extractedText, savedItem.id);
        } else {
          showAlert("Offline Mode", "Walang internet connection. Na-save sa Recent Files.", "info", [{ text: "OK", onPress: safeGoBack }]);
        }
      } else { safeGoBack(); }
    } catch (error) { handleError("Could not open gallery."); }
  };

  const processWithAI = (extractedText: string, dbId: string) => {
    // 🚀 TAWAGIN ANG REUSABLE TRIGGER AT IPASA ANG SIGNAL AT dbId
    triggerBackgroundProcess(async (signal: AbortSignal) => {
      const locallySanitizedText = sanitizeLocalText(extractedText);
      const data = await postEndpoint('/simplify', { text: locallySanitizedText }, signal);

      if (data && data.status === 'success') {
        const combinedAnalysisResult = { ...data.data, rag_context_used: data.rag_context_used, sanitizedText: locallySanitizedText };
        await updateHistoryToScanned(dbId, combinedAnalysisResult, extractedText);
        return combinedAnalysisResult;
      } else {
        throw new Error(data?.message || "Server processing failed.");
      }
    }, dbId);
  };

  const handleError = (msg = "Could not process document.") => {
    let alertTitle = "System Error";
    let alertType: AlertType = "error";
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('malabo') || lowerMsg.includes('walang laman') || lowerMsg.includes('unreadable')) { alertTitle = "Unreadable Image"; alertType = "warning"; }
    else if (lowerMsg.includes('connection') || lowerMsg.includes('network') || lowerMsg.includes('server')) { alertTitle = "Connection Error"; alertType = "error"; }
    showAlert(alertTitle, msg, alertType, [{ text: "OK", style: "destructive", onPress: safeGoBack }]);
  };

  if (isProcessing) {
    return (
      <ScreenLayout title="Processing Image" showBackButton={false}>
        <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center' }}>
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <ProcessingLoader
            title="Analyzing Image"
            messages={LOADING_MESSAGES}
            onMinimize={safeGoBack}
            onCancel={cancelProcess}
          />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Opening Gallery">
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={COLORS.primaryLight} />
        <Text style={{ color: T.subText, marginTop: 15, fontSize: 14, fontWeight: 'bold', letterSpacing: 0.5 }}>Loading Library...</Text>
      </View>
      <AlertRender />
    </ScreenLayout>
  );
}