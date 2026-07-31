import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, Easing, StyleSheet, StatusBar, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as Network from 'expo-network';
import { postEndpoint } from '../../../services/AiEngine';

import { COLORS, SCAN_FRAME_HEIGHT } from '../../../theme/globalStyles';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';
import { sanitizeLocalText } from '../../../utils/sanitizer';
// 🚀 IMPORT GLOBAL THEME
import { useTheme } from '../../../theme/ThemeContext';

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
  // 🎨 KUNIN ANG THEME COLORS
  const { isDarkMode, colors: T } = useTheme();

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
    return () => { scanLineAnim.stopAnimation(); };
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
        showAlert("Permission Required", "Kailangan ng camera access para makapag-scan.", "warning", [{ text: "OK", style: "cancel", onPress: () => navigation.goBack() }]);
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

  const saveToOfflineHistory = async (imageUri: string, type: 'camera' | 'gallery', extractedText: string): Promise<string> => {
    const newId = Date.now().toString();
    try {
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      const historyArray = existingHistory ? JSON.parse(existingHistory) : [];
      const newItem = {
        id: newId, uri: imageUri, title: type === 'camera' ? 'Camera Scan' : 'Gallery Upload',
        date: new Date().toLocaleString(), type: type, status: 'unscanned', ocrText: extractedText
      };
      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify([newItem, ...historyArray]));
    } catch (error) { console.error("Error saving offline", error); }
    return newId;
  };

  const updateHistoryToScanned = async (id: string, analysisData: any, ocrText: string, sanitizedText?: string) => {
    try {
      const existingHistory = await AsyncStorage.getItem('@lex_scan_history');
      if (!existingHistory) return;
      let historyArray = JSON.parse(existingHistory);
      historyArray = historyArray.map((item: any) => {
        if (item.id === id) return { ...item, status: 'scanned', analysisResult: { ...analysisData, sanitizedText: sanitizedText }, ocrText: ocrText };
        return item;
      });
      await AsyncStorage.setItem('@lex_scan_history', JSON.stringify(historyArray));
    } catch (error) { console.error("Error updating history", error); }
  };

  const triggerErrorAlert = (msg: string) => {
    setIsAnalyzing(false);
    setIsProcessing(false);
    let alertTitle = "System Error";
    let alertType: AlertType = "error";
    const lowerMsg = msg.toLowerCase();
    if (lowerMsg.includes('unreadable') || lowerMsg.includes('blurry') || lowerMsg.includes('empty')) { alertTitle = "Unreadable Image"; alertType = "warning"; }
    else if (lowerMsg.includes('connection') || lowerMsg.includes('network') || lowerMsg.includes('server')) { alertTitle = "Connection Error"; alertType = "error"; }
    showAlert(alertTitle, msg, alertType, [{ text: "Try Again", style: "destructive", onPress: resetScanner }]);
  };

  const manualTakePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      setIsProcessing(true);
      setScanFeedback("Capturing image...");
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
        if (photo) {
          setCapturedImage(photo.uri);
          setIsCameraOpen(false);
          setIsFlashOn(false);
          setIsAnalyzing(true);

          const formattedUri = photo.uri.startsWith('file://') ? photo.uri : `file://${photo.uri}`;
          let extractedText = "";
          try {
            const ocrResult = await TextRecognition.recognize(formattedUri);
            extractedText = ocrResult.text;
          } catch (ocrError) { triggerErrorAlert("Hindi ma-process ng system ang larawan."); return; }

          if (!extractedText || extractedText.trim().length < 20) { triggerErrorAlert("Masyadong malabo o walang laman ang imahe. Hindi mabasa ang text."); return; }

          const savedId = await saveToOfflineHistory(photo.uri, 'camera', extractedText);
          const networkState = await Network.getNetworkStateAsync();

          if (networkState.isConnected) {
            startAnalysisWithImageOnly(extractedText, savedId);
          } else {
            setIsAnalyzing(false);
            showAlert("Offline Mode", "Walang internet connection. Na-extract na ang text at naka-save sa Recent Files. Pwede mo i-review ang text at i-analyze mamaya.", "info", [{ text: "OK", onPress: () => navigation.goBack() }]);
          }
        }
      } catch (error) { triggerErrorAlert("Hindi makuha ang picture. Subukan ulit."); }
    }
  };

  const startAnalysisWithImageOnly = async (extractedText: string, dbId: string) => {
    try {
      const locallySanitizedText = sanitizeLocalText(extractedText);
      const data = await postEndpoint('/simplify', { text: locallySanitizedText });

      if (data.status === 'error') { triggerErrorAlert("AI Error: " + (data.message || "Server processing failed.")); return; }
      if (data.status === 'success') {
        setIsAnalyzing(false);
        const combinedAnalysisResult = { ...data.data, rag_context_used: data.rag_context_used, sanitizedText: locallySanitizedText };
        await updateHistoryToScanned(dbId, combinedAnalysisResult, extractedText, locallySanitizedText);
        navigation.replace('ResultScreen', { analysisResult: combinedAnalysisResult });
      } else { triggerErrorAlert("AI Error: " + (data.message || "Server processing failed.")); }
    } catch (error) {
      console.error("🔥 ERROR:", error);
      triggerErrorAlert("System Error. Please check your internet connection.");
    }
  };

  // 🟢 ANALYZING UI
  if (isAnalyzing) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ProcessingLoader title="Analyzing Contract" messages={LOADING_MESSAGES} />
        <AlertRender />
      </View>
    );
  }

  // 🟢 CAMERA UI
  if (isCameraOpen && permission?.granted && !capturedImage) {
    return (
      <View style={uiStyles.cameraContainer}>
        <StatusBar barStyle="light-content" />
        <CameraView
          style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          ref={cameraRef}
          enableTorch={isFlashOn}
        />

        <View style={uiStyles.scanOverlayBlock} />
        <View style={uiStyles.scanMiddleRow}>
          <View style={uiStyles.scanOverlayBlock} />
          <View style={uiStyles.scanFrame}>
            <View style={[uiStyles.scanCorner, uiStyles.scanTopLeft]} />
            <View style={[uiStyles.scanCorner, uiStyles.scanTopRight]} />
            <View style={[uiStyles.scanCorner, uiStyles.scanBottomLeft]} />
            <View style={[uiStyles.scanCorner, uiStyles.scanBottomRight]} />
            <Animated.View style={[uiStyles.scanLaser, { transform: [{ translateY: scanLineAnim }] }]} />
          </View>
          <View style={uiStyles.scanOverlayBlock} />
        </View>
        <View style={[uiStyles.scanOverlayBlock, uiStyles.scanBottomOverlayContainer]} />

        <View style={uiStyles.scanTopControls}>
          <TouchableOpacity style={uiStyles.scanIconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={uiStyles.scanIconBtn} onPress={() => setIsFlashOn(!isFlashOn)}>
            <Ionicons name={isFlashOn ? "flash" : "flash-off"} size={22} color={isFlashOn ? "#fcd34d" : "white"} />
          </TouchableOpacity>
        </View>

        <View style={uiStyles.scanBottomSafeZone}>
          <View style={uiStyles.scanFeedbackPill}>
            <Ionicons name="scan-outline" size={14} color="white" style={{ marginRight: 6 }} />
            <Text style={uiStyles.scanFeedbackText}>{scanFeedback}</Text>
          </View>
          <TouchableOpacity style={uiStyles.shutterOuter} onPress={manualTakePicture} disabled={isProcessing}>
            <View style={uiStyles.shutterInner} />
          </TouchableOpacity>
        </View>

        <AlertRender />
      </View>
    );
  }

  // ⏳ DEFAULT LOADING CAMERA STATE
  return (
    <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ActivityIndicator size="large" color={COLORS.primaryLight} />
      <Text style={{ color: T.subText, marginTop: 15, fontSize: 14, fontWeight: 'bold' }}>Loading Camera...</Text>
      <AlertRender />
    </View>
  );
}

// 🎨 SLEEK & SHARP UI STYLES FOR SCANNER
const uiStyles = StyleSheet.create({
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  scanOverlayBlock: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.70)' },
  scanMiddleRow: { flexDirection: 'row', height: SCAN_FRAME_HEIGHT },
  scanBottomOverlayContainer: { flex: 1.5 },
  scanBottomSafeZone: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  scanFrame: { width: '85%', height: SCAN_FRAME_HEIGHT, backgroundColor: 'transparent', overflow: 'hidden' },
  scanCorner: { position: 'absolute', width: 36, height: 36, borderColor: 'white' },
  scanTopLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 4 },
  scanTopRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 4 },
  scanBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 4 },
  scanBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 4 },
  scanLaser: { position: 'absolute', width: '100%', height: 3, backgroundColor: COLORS.primaryLight, shadowColor: COLORS.primaryLight, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 8 },
  scanFeedbackPill: { flexDirection: 'row', backgroundColor: 'rgba(20, 20, 20, 0.8)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginBottom: 24 },
  scanFeedbackText: { color: 'white', fontSize: 13, fontWeight: '600' },
  scanTopControls: { position: 'absolute', top: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 20 : 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 20 },
  scanIconBtn: { width: 40, height: 40, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  shutterOuter: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' }
});