import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StatusBar,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert, AlertType } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';

export default function UploadImageScreen({ navigation }: any) {
  const hasInitialized = useRef(false);
  const [isOpeningGallery, setIsOpeningGallery] = useState(true);

  const { showAlert, AlertRender } = useCustomAlert();
  const { isDarkMode, colors: T } = useTheme();

  const {
    isGlobalProcessing,
    safeGoBack,
  } = useBackgroundProcessScreen('UploadImageScreen');

  useEffect(() => {
    if (hasInitialized.current) return;

    hasInitialized.current = true;

    if (isGlobalProcessing) {
      showAlert(
        'May Proseso Pa',
        'May kasalukuyang nag-aanalyze pa. Hintayin matapos o i-cancel muna ito.',
        'warning',
        [
          {
            text: 'OK',
            onPress: safeGoBack,
          },
        ]
      );

      return;
    }

    pickImage();
  }, []);

  const pickImage = async () => {
    try {
      // ---------------------------------------------------------
      // 1. CHECK GALLERY PERMISSION
      // ---------------------------------------------------------
      const { status } =
        await ImagePicker.getMediaLibraryPermissionsAsync();

      if (status !== 'granted') {
        const { status: newStatus } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (newStatus !== 'granted') {
          setIsOpeningGallery(false);

          showAlert(
            'Kailangan ng Gallery Access',
            'Para makapag-upload ng litrato, kailangan namin ng pahintulot na ma-access ang gallery mo.',
            'warning',
            [
              {
                text: 'Bumalik',
                style: 'cancel',
                onPress: safeGoBack,
              },
              {
                text: 'Pumunta sa Settings',
                onPress: () => Linking.openSettings(),
              },
            ]
          );

          return;
        }
      }

      // ---------------------------------------------------------
      // 2. OPEN GALLERY
      // ---------------------------------------------------------
      const result =
        await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: true,
          quality: 1,
          selectionLimit: 20,
        });

      // ---------------------------------------------------------
      // 3. USER CANCELLED
      // ---------------------------------------------------------
      if (result.canceled || !result.assets?.length) {
        setIsOpeningGallery(false);
        safeGoBack();
        return;
      }

      // ---------------------------------------------------------
      // 4. COLLECT SELECTED IMAGE URIs
      // ---------------------------------------------------------
      const selectedPages = result.assets
        .map((asset) => asset.uri)
        .filter(
          (uri): uri is string =>
            typeof uri === 'string' && uri.length > 0
        );

      if (selectedPages.length === 0) {
        setIsOpeningGallery(false);

        showAlert(
          'No Image Selected',
          'Walang valid na larawan na napili.',
          'warning',
          [
            {
              text: 'OK',
              onPress: safeGoBack,
            },
          ]
        );

        return;
      }

      // ---------------------------------------------------------
      // 5. STOP LOADING UI
      // ---------------------------------------------------------
      setIsOpeningGallery(false);

      // ---------------------------------------------------------
      // 6. SEND IMAGES TO THE SAME BATCH EDITOR
      //    USED BY CAMERA SCANS
      // ---------------------------------------------------------
      navigation.navigate('BatchEditScreen', {
        pages: selectedPages,
        source: 'gallery',
      });
    } catch (error) {
      console.error('Gallery picker error:', error);

      setIsOpeningGallery(false);

      showAlert(
        'Gallery Error',
        'Hindi mabuksan ang gallery. Subukan ulit.',
        'error' as AlertType,
        [
          {
            text: 'OK',
            style: 'destructive',
            onPress: safeGoBack,
          },
        ]
      );
    }
  };

  // -------------------------------------------------------------
  // LOADING SCREEN WHILE GALLERY IS OPENING
  // -------------------------------------------------------------
  if (isOpeningGallery) {
    return (
      <ScreenLayout
        title="Opening Gallery"
        showBackButton={false}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: T.bg,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <StatusBar
            barStyle={
              isDarkMode
                ? 'light-content'
                : 'dark-content'
            }
          />

          <ActivityIndicator
            size="large"
            color={COLORS.primaryLight}
          />

          <Text
            style={{
              color: T.subText,
              marginTop: 15,
              fontSize: 14,
              fontWeight: 'bold',
              letterSpacing: 0.5,
            }}
          >
            Opening Gallery...
          </Text>
        </View>

        <AlertRender />
      </ScreenLayout>
    );
  }

  // -------------------------------------------------------------
  // FALLBACK
  // -------------------------------------------------------------
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: T.bg,
      }}
    >
      <StatusBar
        barStyle={
          isDarkMode
            ? 'light-content'
            : 'dark-content'
        }
      />

      <ActivityIndicator
        size="large"
        color={COLORS.primaryLight}
      />

      <AlertRender />
    </View>
  );
}