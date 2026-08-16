import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Animated, Easing, StyleSheet, StatusBar, Platform, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { COLORS, SCAN_FRAME_HEIGHT } from '../../../theme/globalStyles';
import ProcessingLoader from '../../../components/ProcessingLoader';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';

export default function ScannerScreen({ route, navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const hasInitialized = useRef(false);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // 🚀 FIX: BULLETPROOF ARRAY INITIALIZATION (Para iwas 'length of undefined' crash)
  const initialPages = route?.params?.existingPages || [];
  const [capturedPages, setCapturedPages] = useState<string[]>(initialPages);

  // 🚀 FIX: SAFE GETTER (Sinisiguro na laging array ang bibilangin, kahit magloko ang state)
  const safePages = Array.isArray(capturedPages) ? capturedPages : [];

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(true);
  const [scanFeedback, setScanFeedback] = useState("Position document inside the frame");
  const [isFlashOn, setIsFlashOn] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const { isDarkMode, colors: T } = useTheme();
  const { isProcessing: isAnalyzing, cancelProcess } = useBackgroundProcessScreen('ScannerScreen');

  useEffect(() => {
    if (!permission || hasInitialized.current) return;
    hasInitialized.current = true;
    handleOpenCamera();
  }, [permission]);

  useEffect(() => {
    if (route?.params?.existingPages) {
      setCapturedPages(route.params.existingPages);
    }
  }, [route?.params?.existingPages]);

  useEffect(() => {
    if (isCameraOpen && safePages.length === 0) {
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
  }, [isCameraOpen, safePages.length]);

  const handleOpenCamera = async () => {
    if (permission?.granted) setIsCameraOpen(true);
    else {
      const result = await requestPermission();
      if (result.granted) setIsCameraOpen(true);
      else {
        showAlert("Camera Permission", "Kailangan ng camera access para makapag-scan.", "warning", [
          { text: "Bumalik", style: "cancel", onPress: () => navigation.goBack() },
          { text: "Pumunta sa Settings", onPress: () => Linking.openSettings() }
        ]);
      }
    }
  };

  const resetScanner = () => {
    setCapturedPages([]);
    setIsCameraOpen(true);
    setScanFeedback("Position document inside the frame");
    setIsProcessing(false);
    setIsFlashOn(false);
  };

  const manualTakePicture = async () => {
    if (cameraRef.current && !isProcessing) {
      setIsProcessing(true);
      setScanFeedback("Capturing image...");
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.8, base64: false });
        if (photo && photo.uri) {
          setCapturedPages(prev => [...(prev || []), photo.uri]);
          setScanFeedback("Position next document inside the frame");
        }
      } catch (error) {
        showAlert("Camera Error", "Hindi makuha ang picture. Subukan ulit.", "error");
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const newUris = result.assets.map(a => a.uri);
        setCapturedPages(prev => [...(prev || []), ...newUris]);
      }
    } catch (error) {
      showAlert("Gallery Error", "Hindi mabuksan ang gallery.", "error");
    }
  };

  const handleDoneCapture = async () => {
    if (safePages.length === 0) return;
    navigation.navigate('BatchEditScreen', { pages: safePages });
  };

  if (isAnalyzing) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ProcessingLoader
          title="Analyzing Contract"
          messages={["Extracting text...", "Connecting to Lex-Simple AI..."]}
          onMinimize={() => navigation.navigate('Main', { screen: 'Scan' })}
          onCancel={() => cancelProcess()}
        />
        <AlertRender />
      </View>
    );
  }

  if (isCameraOpen && permission?.granted) {
    return (
      <View style={uiStyles.cameraContainer}>
        <StatusBar barStyle="light-content" />
        <CameraView style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} facing="back" ref={cameraRef} enableTorch={isFlashOn} />

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

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={uiStyles.scanIconBtn} onPress={() => setIsFlashOn(!isFlashOn)}>
              <Ionicons name={isFlashOn ? "flash" : "flash-off"} size={22} color={isFlashOn ? "#fcd34d" : "white"} />
            </TouchableOpacity>
            <TouchableOpacity style={uiStyles.scanIconBtn} onPress={pickFromGallery}>
              <Ionicons name="images-outline" size={22} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={uiStyles.scanBottomSafeZone}>
          <View style={uiStyles.scanFeedbackPill}>
            <Ionicons name="scan-outline" size={14} color="white" style={{ marginRight: 6 }} />
            <Text style={uiStyles.scanFeedbackText}>
              {safePages.length > 0 ? `${safePages.length} page(s) captured` : scanFeedback}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
            {safePages.length > 0 && (
              <TouchableOpacity style={uiStyles.doneBtn} onPress={handleDoneCapture}>
                <Ionicons name="checkmark-circle" size={60} color={COLORS.primaryLight} />
              </TouchableOpacity>
            )}

            <TouchableOpacity style={uiStyles.shutterOuter} onPress={manualTakePicture} disabled={isProcessing}>
              <View style={uiStyles.shutterInner} />
            </TouchableOpacity>

            {safePages.length > 0 && (
              <TouchableOpacity style={uiStyles.trashBtn} onPress={resetScanner}>
                <Ionicons name="trash-outline" size={30} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <AlertRender />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center' }}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ActivityIndicator size="large" color={COLORS.primaryLight} />
      <Text style={{ color: T.subText, marginTop: 15, fontSize: 14, fontWeight: 'bold' }}>Loading Camera...</Text>
      <AlertRender />
    </View>
  );
}

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
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white' },
  doneBtn: { justifyContent: 'center', alignItems: 'center' },
  trashBtn: { justifyContent: 'center', alignItems: 'center' }
});