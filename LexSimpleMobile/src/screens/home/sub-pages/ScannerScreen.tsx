import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, Easing } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as Network from 'expo-network';

import { globalStyles, COLORS, SCAN_FRAME_HEIGHT } from '../../../theme/globalStyles';
import ProcessingLoader from '../../../components/ProcessingLoader';

// 💡 IMPORT ANG CUSTOM ALERT HOOK AT LOCAL SANITIZER NATIN
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';
import { sanitizeLocalText } from '../../../utils/sanitizer';

export default function ScannerScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  
  const hasInitialized = useRef(false); 
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanFeedback, setScanFeedback] = useState("Position document inside the frame");
  const [isFlashOn, setIsFlashOn] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();

  const API_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev/simplify';

  // 💡 IDINAGDAG ANG LOADING MESSAGES PARA MAKITA ANG "SANITIZING LOCALLY"
  const LOADING_MESSAGES = [
    "Extracting text offline...",
    "Sanitizing sensitive data locally...", 
    "Connecting to Lex-Simple AI...",   
    "Analyzing legal terms...",       
    "Simplifying for you..."
  ];

  useEffect(() => {
    if (!permission || hasInitialized.current) return;
    hasInitialized.current = true; 
    handleOpenCamera();

    return () => {
        scanLineAnim.stopAnimation();
    };
  }, [permission]);

  useEffect(() => {
    if (isCameraOpen && !capturedImage) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, { toValue: SCAN_FRAME_HEIGHT - 4, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scanLineAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
        ])
      ).start();
    } else {
      scanLineAnim.stopAnimation();
      scanLineAnim.setValue(0);
    }
  }, [isCameraOpen, capturedImage]);

  const handleOpenCamera = async () => {
    if (permission?.granted) setIsCameraOpen(true);
    else {
      const result = await requestPermission();
      if (result.granted) setIsCameraOpen(true);
      else { 
        showAlert(
          "Permission Required", 
          "Kailangan ng camera access para makapag-scan.", 
          "warning", 
          [{ text: "OK", style: "cancel", onPress: () => navigation.goBack() }]
        );
      }
    }
  };

  const resetScanner = () => {
    setCapturedImage(null);
    setIsCameraOpen(true); 
    setIsAnalyzing(false);
    setScanFeedback("Position document inside the frame");
    setIsProcessing(false);
    setIsFlashOn(false); 
  };

  // 💡 IN-UPDATE PARA TANGGAPIN ANG `extractedText`
  const saveToOfflineHistory = async (imageUri: string, type: 'camera' | 'gallery', extractedText: string): Promise<string> => {
      const newId = Date.now().toString();
      try {
        const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
        const historyArray = existingHistory ? JSON.parse(existingHistory) : [];
        
        const newItem = {
          id: newId,
          uri: imageUri,
          title: type === 'camera' ? 'Camera Scan' : 'Gallery Upload',
          date: new Date().toLocaleString(),
          type: type,
          status: 'unscanned',
          ocrText: extractedText // 💡 SINESAVE NA NATIN AGAD ANG TEXT KAHIT OFFLINE
        };

        await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));
      } catch (error) {
        console.error("Error saving offline", error);
      }
      return newId;
  };

  const updateHistoryToScanned = async (id: string, analysisData: any, ocrText: string, sanitizedText?: string) => {
      try {
        const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
        if (!existingHistory) return;
        let historyArray = JSON.parse(existingHistory);
        
        historyArray = historyArray.map((item: any) => {
           if (item.id === id) {
               return { 
                   ...item, 
                   status: 'scanned', 
                   analysisResult: {
                     ...analysisData,
                     sanitizedText: sanitizedText
                   }, 
                   ocrText: ocrText 
               };
           }
           return item;
        });

        await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
      } catch (error) {
        console.error("Error updating history", error);
      }
  };

  const triggerErrorAlert = (msg: string) => {
      setIsAnalyzing(false);
      setIsProcessing(false);

      let alertTitle = "System Error";
      let alertType: AlertType = "error";

      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('unreadable') || lowerMsg.includes('blurry') || lowerMsg.includes('empty')) {
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
        [{ text: "Try Again", style: "destructive", onPress: resetScanner }]
      );
  };

  const manualTakePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      setIsProcessing(true);
      setScanFeedback("Capturing image...");
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
        if(photo) {
          setCapturedImage(photo.uri);
          setIsCameraOpen(false);
          setIsFlashOn(false); 
          
          setIsAnalyzing(true); // 💡 BUHAYIN AGAD ANG LOADER PARA SA OFFLINE OCR

          // 💡 STEP A: LOCAL OCR EXTRACTION MUNA BAGO LAHAT!
          const formattedUri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;
          let extractedText = "";
          try {
              const ocrResult = await TextRecognition.recognize(formattedUri);
              extractedText = ocrResult.text;
          } catch (ocrError) {
              triggerErrorAlert("Hindi ma-process ng system ang larawan.");
              return;
          }

          if (!extractedText || extractedText.trim().length < 20) {
              triggerErrorAlert("Masyadong malabo o walang laman ang imahe. Hindi mabasa ang text.");
              return;
          }

          // 💡 STEP B: I-SAVE SA DATABASE KASAMA YUNG TEXT (Kahit offline)
          const savedId = await saveToOfflineHistory(photo.uri, 'camera', extractedText);
          
          // 💡 STEP C: CHECK NETWORK
          const networkState = await Network.getNetworkStateAsync();

          if (networkState.isConnected) {
              // 🟢 ONLINE: I-diretso sa AI gamit yung nakuha nating text (Mas mabilis!)
              startAnalysisWithImageOnly(extractedText, savedId);
          } else {
              // 🔴 OFFLINE: I-alert ang user at ibalik sa Home Screen
              setIsAnalyzing(false);
              showAlert(
                "Offline Mode", 
                "Walang internet connection. Na-extract na ang text at naka-save sa Recent Files. Pwede mo i-review ang text at i-analyze mamaya.",
                "info",
                [{ text: "OK", onPress: () => navigation.goBack() }]
              );
          }
        }
      } catch (error) { 
        triggerErrorAlert("Hindi makuha ang picture. Subukan ulit.");
      } 
    }
  };

  // 💡 BINAGO: Tatanggapin na niya yung extracted text imbes na siya ang mag-OCR
  const startAnalysisWithImageOnly = async (extractedText: string, dbId: string) => {
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
            triggerErrorAlert("Server Error: Hindi JSON ang ibinalik ng server.");
            return;
        }

        if (data.status === 'success') {
            setIsAnalyzing(false);
            const combinedAnalysisResult = {
                ...data.data,
                rag_context_used: data.rag_context_used,
                sanitizedText: locallySanitizedText // 💡 GINAMIT YUNG LOCAL SANITIZED TEXT
            };

            await updateHistoryToScanned(dbId, combinedAnalysisResult, extractedText, locallySanitizedText);
            navigation.replace('ResultScreen', { analysisResult: combinedAnalysisResult });
        } else {
            triggerErrorAlert("AI Error: " + (data.message || "Server processing failed."));
        }
    } catch (error) { 
        console.error("🔥 ERROR:", error);
        triggerErrorAlert("System Error. Please check your internet connection."); 
    }
  };

  // ====================================================
  // 🟢 SCREEN RENDERERS
  // ====================================================

  if (isAnalyzing) {
    return (
      <View style={globalStyles.centerContainer}>
        {/* 💡 IDINAGDAG YUNG LOADING_MESSAGES PROP PARA MATCH SA UPLOAD SCREEN */}
        <ProcessingLoader title="Analyzing Contract" messages={LOADING_MESSAGES} />
        <AlertRender />
      </View>
    );
  }

  if (isCameraOpen && permission?.granted && !capturedImage) {
    return (
      <View style={globalStyles.scannerContainer}>
        <CameraView 
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} 
          facing="back" 
          ref={cameraRef}
          enableTorch={isFlashOn} 
        />
        
        <View style={globalStyles.scanOverlayBlock} />
        
        <View style={globalStyles.scanMiddleRow}>
            <View style={globalStyles.scanOverlayBlock} />
            
            <View style={globalStyles.scanFrame}>
                <View style={[globalStyles.scanCorner, globalStyles.scanTopLeft]} />
                <View style={[globalStyles.scanCorner, globalStyles.scanTopRight]} />
                <View style={[globalStyles.scanCorner, globalStyles.scanBottomLeft]} />
                <View style={[globalStyles.scanCorner, globalStyles.scanBottomRight]} />
                
                <Animated.View style={[globalStyles.scanLaser, { transform: [{ translateY: scanLineAnim }] }]} />
            </View>
            
            <View style={globalStyles.scanOverlayBlock} />
        </View>

        <View style={[globalStyles.scanOverlayBlock, globalStyles.scanBottomOverlayContainer]} />

        <View style={globalStyles.scanTopControls}>
              <TouchableOpacity style={globalStyles.scanIconBtn} onPress={() => navigation.goBack()}>
                <Ionicons name="close" size={26} color="white" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={globalStyles.scanIconBtn} 
                onPress={() => setIsFlashOn(!isFlashOn)}
              >
                <Ionicons 
                  name={isFlashOn ? "flash" : "flash-off"} 
                  size={24} 
                  color={isFlashOn ? "#fcd34d" : "white"} 
                />
              </TouchableOpacity>
        </View>

        <View style={globalStyles.scanBottomSafeZone}>
            <View style={globalStyles.scanFeedbackPill}>
                <Ionicons name="scan-outline" size={16} color="white" style={{marginRight: 6}} />
                <Text style={globalStyles.scanFeedbackText}>{scanFeedback}</Text>
            </View>

            <TouchableOpacity style={globalStyles.shutterOuter} onPress={manualTakePicture} disabled={isProcessing}>
                <View style={globalStyles.shutterInner}/>
            </TouchableOpacity>
        </View>

        <AlertRender />
      </View>
    );
  }

  // ⏳ DEFAULT LOADING CAMERA STATE
  return (
    <View style={globalStyles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primaryLight} />
        <Text style={globalStyles.loadingSubText}>Loading Camera...</Text>
        
        <AlertRender />
    </View>
  );
}