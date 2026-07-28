import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';

// 🛠️ IMPORTS
import { globalStyles, COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { AlertType, useCustomAlert } from '../../../components/CustomAlert';

export default function ConvertScreen({ navigation }: any) {
  const [isProcessing, setIsProcessing] = useState(false);
  const hasInitialized = useRef(false);

  const { showAlert, AlertRender } = useCustomAlert();

  const API_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev/simplify_file';

  const LOADING_MESSAGES = [
    "Reading document file...",
    "Extracting text content...",
    "Sanitizing sensitive data locally...",
    "Connecting to Lex-Simple AI...",
    "Analyzing legal terms...",
    "Finalizing report..."
  ];


  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    handleSelectDocument();
  }, []);

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
        navigation.goBack();
        return;
      }

      const file = result.assets[0];

      if (file.size && file.size > 5 * 1024 * 1024) {
        showAlert(
          "File Too Large",
          "Masyadong malaki ang file. Limitahan ang document sa 5MB pataas.",
          "warning",
          [{ text: "OK", style: "cancel", onPress: () => navigation.goBack() }]
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
          [{ text: "OK", onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      showAlert(
        "Access Error",
        "Hindi mabuksan ang file manager. Subukan ulit.",
        "error",
        [{ text: "OK", style: "destructive", onPress: () => navigation.goBack() }]
      );
    }
  };

  const processDocument = async (file: DocumentPicker.DocumentPickerAsset, dbId: string) => {
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || 'application/octet-stream',
      } as any);

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
          'ngrok-skip-browser-warning': 'true'
        },
        body: formData,
      });

      const rawResponse = await response.text();
      let data;

      try {
        data = JSON.parse(rawResponse);
      } catch (parseError) {
        console.log("SERVER ERROR OUTPUT:", rawResponse);
        throw new Error("Hindi ma-proseso ang dokumento. Siguraduhing tama ang format ng file.");
      }

      if (data.status === 'success') {
        setIsProcessing(false);

        const combinedAnalysisResult = {
          ...data.data,
          rag_context_used: data.rag_context_used,
          sanitizedText: data.sanitizedText
        };

        const textToSave = data.extractedText || `File Content from: ${file.name}`;
        const updatedHistoryItem = await updateHistoryToScanned(dbId, combinedAnalysisResult, textToSave);

        navigation.replace('ResultScreen', {
          analysisResult: combinedAnalysisResult,
          historyItem: updatedHistoryItem
        });
      } else {
        throw new Error(data.message || "Server processing failed.");
      }
    } catch (error: any) {
      setIsProcessing(false);
      const errorMsg = error.message || "Please check your connection or file format.";

      let alertTitle = "System Error";
      let alertType: AlertType = "error";

      const lowerMsg = errorMsg.toLowerCase();
      if (lowerMsg.includes('unreadable') || lowerMsg.includes('empty')) {
        alertTitle = "Unreadable Document";
        alertType = "warning";
      } else if (lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
        alertTitle = "Connection Error";
        alertType = "error";
      }

      showAlert(
        alertTitle,
        errorMsg,
        alertType,
        [{ text: "OK", style: "destructive", onPress: () => navigation.goBack() }]
      );
    }
  };

  if (isProcessing) {
    return (
      <ScreenLayout title="Processing Document" showBackButton={false}>
        <ProcessingLoader title="Analyzing Document" messages={LOADING_MESSAGES} />
      </ScreenLayout>
    );
  }

  return (
    <>
      <ScreenLayout title="Document Converter">
        <View style={globalStyles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryLight} />
          {/* 💡 GINAGAMIT NA NATIN YUNG REUSABLE STYLE DITO */}
          <Text style={globalStyles.loadingSubText}>
            Opening File Manager...
          </Text>
        </View>
      </ScreenLayout>

      {/* 💡 ALERT RENDERER NASA LABAS NA NG SCREEN LAYOUT */}
      <AlertRender />
    </>
  );
}