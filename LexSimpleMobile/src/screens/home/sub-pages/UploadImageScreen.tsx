import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network'; 

// 🛠️ IMPORTS
import { globalStyles, COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';

// 💡 IMPORT ANG ATING LOCAL PII SCRUBBER
import { sanitizeLocalText } from '../../../utils/sanitizer';

export default function UploadImageScreen({ navigation }: any) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const hasInitialized = useRef(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const API_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev/simplify';

  // 💡 IN-UPDATE ANG LOADING MESSAGES PARA ALAM NG USER NA NILI-LINIS NATIN OFFLINE
  const LOADING_MESSAGES = [
    "Reading document file...",
    "Extracting text offline...",
    "Sanitizing sensitive data locally...", // 🛡️ NEW STEP
    "Connecting to Lex-Simple AI...",   
    "Analyzing legal terms...",       
    "Simplifying for you..."
  ];

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    pickImage();
  }, []);

  const saveToOfflineHistory = async (imageUri: string, type: 'gallery', extractedText: string) => {
      const newId = Date.now().toString();
      try {
        const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
        const historyArray = existingHistory ? JSON.parse(existingHistory) : [];
        
        const newItem = {
          id: newId,
          uri: imageUri,
          title: 'Gallery Upload', 
          date: new Date().toLocaleString(),
          type: type,
          status: 'unscanned',
          ocrText: extractedText 
        };

        await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));
        return newItem; 
      } catch (error) {
        console.error("Error saving offline", error);
        return null;
      }
  };

  const updateHistoryToScanned = async (id: string, analysisData: any, ocrText: string) => {
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
                   ocrText: ocrText 
               };
               return updatedItem;
           }
           return item;
        });

        await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
        return updatedItem;
      } catch (error) {
        console.error("Error updating history", error);
        return null;
      }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ 
          mediaTypes: ['images'], 
          allowsEditing: true, 
          quality: 1 
      });
      
      if (!result.canceled) {
          setIsAnalyzing(true); 
          const imageUri = result.assets[0].uri;
          const formattedUri = imageUri.startsWith('file://') ? imageUri : `file://${imageUri}`;

          let extractedText = "";
          try {
              const ocrResult = await TextRecognition.recognize(formattedUri);
              extractedText = ocrResult.text;
          } catch (ocrError) {
              return handleError("Hindi ma-process ng system ang larawan.");
          }

          if (!extractedText || extractedText.trim().length < 20) {
              return handleError("Masyadong malabo o walang laman ang imahe. Hindi mabasa ang text.");
          }

          // Sinusave pa rin natin yung Raw OCR sa local storage nila (para mabasa nila mamaya offline)
          const savedItem = await saveToOfflineHistory(imageUri, 'gallery', extractedText);
          
          if (!savedItem) {
              return handleError("Failed to save to local storage.");
          }

          const networkState = await Network.getNetworkStateAsync();

          if (networkState.isConnected) {
              // 🟢 ONLINE: I-process gamit ang AI
              processWithAI(extractedText, savedItem.id);
          } else {
              // 🔴 OFFLINE
              setIsAnalyzing(false);
              showAlert(
                "Offline Mode", 
                "Walang internet connection. Na-extract na ang text at naka-save sa Recent Files. Pwede mo i-review ang text at i-analyze mamaya.",
                "info",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
          }
      } else {
          navigation.goBack(); 
      }
    } catch (error) { 
        handleError("Could not open gallery."); 
    }
  };

  const processWithAI = async (extractedText: string, dbId: string) => {
    try {
        // 🛡️ THE MAGIC: DPA COMPLIANCE 🛡️
        // Nililinis natin ang text DITO sa phone bago mag-fetch sa internet!
        const locallySanitizedText = sanitizeLocalText(extractedText);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            // 💡 IPINAPADALA NATIN ANG MALINIS NA TEXT SA SERVER
            body: JSON.stringify({ text: locallySanitizedText }),
        });

        const rawResponse = await response.text();
        let data;
        
        try {
            data = JSON.parse(rawResponse);
        } catch (parseError) {
            console.log("SERVER ERROR OUTPUT:", rawResponse);
            return handleError("Server Error: Hindi maintindihan ang sagot ng server.");
        }

        if (data.status === 'success') {
            setIsAnalyzing(false);
            
            // Isinasama natin ang local sanitized text sa result para i-display mamaya sa modal
            const combinedAnalysisResult = {
                ...data.data,
                rag_context_used: data.rag_context_used,
                sanitizedText: locallySanitizedText 
            };

            const updatedHistoryItem = await updateHistoryToScanned(dbId, combinedAnalysisResult, extractedText);

            navigation.replace('ResultScreen', { 
                analysisResult: combinedAnalysisResult,
                historyItem: updatedHistoryItem 
            });
        } else {
            handleError("AI Error: " + (data.message || "Server processing failed."));
        }
    } catch (error) { 
        console.error("🔥 ERROR:", error);
        handleError("System Error. Please check your connection."); 
    }
  };

  const handleError = (msg = "Could not process document.") => {
      setIsAnalyzing(false);

      let alertTitle = "System Error";
      let alertType: AlertType = "error";

      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('malabo') || lowerMsg.includes('walang laman') || lowerMsg.includes('unreadable')) {
          alertTitle = "Unreadable Image";
          alertType = "warning";
      } else if (lowerMsg.includes('connection') || lowerMsg.includes('network') || lowerMsg.includes('server')) {
          alertTitle = "Connection Error";
          alertType = "error";
      }

      showAlert(
        alertTitle,
        msg,
        alertType,
        [{ text: "OK", style: "destructive", onPress: () => navigation.goBack() }]
      );
  };

  // ⏳ PROCESSING UI
  if (isAnalyzing) {
    return (
      <>
        <ScreenLayout title="Processing Image" showBackButton={false}>
          <ProcessingLoader title="Analyzing Image" messages={LOADING_MESSAGES} />
        </ScreenLayout>
        <AlertRender />
      </>
    );
  }

  // ⏳ INITIAL STATE
  return (
    <>
      <ScreenLayout title="Opening Gallery">
          <View style={globalStyles.centerContainer}>
              <ActivityIndicator size="large" color={COLORS.primaryLight} />
              <Text style={globalStyles.loadingSubText}>
                Loading Library...
              </Text>
          </View>
      </ScreenLayout>
      <AlertRender />
    </>
  );
}