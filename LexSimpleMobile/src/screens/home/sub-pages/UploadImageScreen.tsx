import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { useBackgroundProcessScreen } from '../../../hooks/useBackgroundProcessScreen';

// UPLOAD IMAGE SCREEN VERSION: 1.0.0
// Multi-image gallery picker with recoverable permission and error states.
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const WARNING = '#F59E0B';
const DANGER = '#EF4444';
const MAX_SELECTION = 20;

type PickerState = 'opening' | 'permission-denied' | 'error';

const getValidUniqueUris = (
    assets: ImagePicker.ImagePickerAsset[]
): string[] => {
    const seen = new Set<string>();

    return assets.reduce<string[]>((uris, asset) => {
        const uri = typeof asset.uri === 'string'
            ? asset.uri.trim()
            : '';

        if (uri && !seen.has(uri)) {
            seen.add(uri);
            uris.push(uri);
        }

        return uris;
    }, []);
};

export default function UploadImageScreen({ navigation }: any) {
    const { isDarkMode, colors: T } = useTheme();
    const { showAlert, AlertRender } = useCustomAlert();
    const {
        isGlobalProcessing,
        safeGoBack,
    } = useBackgroundProcessScreen('UploadImageScreen');
    const hasInitialized = useRef(false);
    const isMounted = useRef(true);
    const isPickerActive = useRef(false);
    const [pickerState, setPickerState] =
        useState<PickerState>('opening');

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const updatePickerState = useCallback((state: PickerState): void => {
        if (isMounted.current) {
            setPickerState(state);
        }
    }, []);

    const openAppSettings = useCallback(async (): Promise<void> => {
        try {
            await Linking.openSettings();
        } catch (error) {
            console.error('[UploadImageScreen] Settings failed:', error);
            showAlert(
                'Hindi mabuksan ang Settings',
                'Buksan nang manual ang App Settings at payagan ang Photos o Gallery access.',
                'error'
            );
        }
    }, [showAlert]);

    const hasGalleryPermission = useCallback(async (): Promise<boolean> => {
        const currentPermission =
            await ImagePicker.getMediaLibraryPermissionsAsync();

        if (currentPermission.status === 'granted') {
            return true;
        }

        if (currentPermission.canAskAgain === false) {
            return false;
        }

        const requestedPermission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();

        return requestedPermission.status === 'granted';
    }, []);

    const pickImages = useCallback(async (): Promise<void> => {
        if (isPickerActive.current) {
            return;
        }

        isPickerActive.current = true;
        updatePickerState('opening');

        try {
            const permissionGranted = await hasGalleryPermission();

            if (!permissionGranted) {
                updatePickerState('permission-denied');
                showAlert(
                    'Kailangan ng gallery access',
                    'Payagan ang Photos o Gallery access para makapili ng document images.',
                    'warning',
                    [
                        {
                            text: 'Bumalik',
                            style: 'cancel',
                            onPress: safeGoBack,
                        },
                        {
                            text: 'Buksan ang Settings',
                            onPress: () => void openAppSettings(),
                        },
                    ]
                );
                return;
            }

            const result =
                await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ['images'],
                    allowsMultipleSelection: true,
                    selectionLimit: MAX_SELECTION,
                    quality: 1,
                });

            if (result.canceled) {
                safeGoBack();
                return;
            }

            const selectedPages = getValidUniqueUris(
                result.assets ?? []
            );

            if (selectedPages.length === 0) {
                updatePickerState('error');
                showAlert(
                    'Walang mabasang image',
                    'Walang valid na image na nakuha mula sa napili mo.',
                    'warning'
                );
                return;
            }

            navigation.replace('BatchEditScreen', {
                pages: selectedPages,
                source: 'gallery',
            });
        } catch (error) {
            console.error('[UploadImageScreen] Picker failed:', error);
            updatePickerState('error');
            showAlert(
                'Hindi nabuksan ang gallery',
                'Subukan ulit. Kung ayaw pa rin, isara at buksan muli ang app.',
                'error'
            );
        } finally {
            isPickerActive.current = false;
        }
    }, [
        hasGalleryPermission,
        navigation,
        openAppSettings,
        safeGoBack,
        showAlert,
        updatePickerState,
    ]);

    useEffect(() => {
        if (hasInitialized.current) {
            return;
        }

        hasInitialized.current = true;

        if (isGlobalProcessing) {
            updatePickerState('error');
            showAlert(
                'May kasalukuyang analysis',
                'Hintaying matapos o i-cancel muna ang kasalukuyang analysis bago pumili ng panibagong document.',
                'warning',
                [
                    {
                        text: 'Bumalik',
                        onPress: safeGoBack,
                    },
                ]
            );
            return;
        }

        void pickImages();
    }, [isGlobalProcessing, pickImages, safeGoBack, showAlert]);

    const isOpening = pickerState === 'opening';
    const permissionDenied = pickerState === 'permission-denied';

    return (
        <ScreenLayout
            title="Pumili sa Gallery"
            showBackButton={!isOpening}
        >
            <StatusBar
                barStyle={
                    isDarkMode ? 'light-content' : 'dark-content'
                }
            />

            <View
                testID="upload-image-screen-v1"
                style={[
                    styles.screen,
                    { backgroundColor: T.bg },
                ]}
            >
                {isOpening ? (
                    <View style={styles.centerState}>
                        <View
                            style={[
                                styles.stateIconBox,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <ActivityIndicator
                                size="small"
                                color={PRIMARY_SOFT}
                            />
                        </View>
                        <Text
                            style={[
                                styles.stateTitle,
                                { color: T.text },
                            ]}
                        >
                            Binubuksan ang gallery
                        </Text>
                        <Text
                            style={[
                                styles.stateDescription,
                                { color: T.subText },
                            ]}
                        >
                            Maaari kang pumili ng hanggang {MAX_SELECTION}{' '}
                            pahina nang sabay-sabay.
                        </Text>
                    </View>
                ) : (
                    <View style={styles.centerState}>
                        <View
                            style={[
                                styles.stateIconBox,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <Ionicons
                                name={
                                    permissionDenied
                                        ? 'images-outline'
                                        : 'alert-circle-outline'
                                }
                                size={29}
                                color={
                                    permissionDenied ? WARNING : DANGER
                                }
                            />
                        </View>
                        <Text
                            style={[
                                styles.stateTitle,
                                { color: T.text },
                            ]}
                        >
                            {permissionDenied
                                ? 'Hindi pinayagan ang gallery'
                                : 'Hindi nabuksan ang gallery'}
                        </Text>
                        <Text
                            style={[
                                styles.stateDescription,
                                { color: T.subText },
                            ]}
                        >
                            {permissionDenied
                                ? 'Payagan ang access sa App Settings para makapili ng document images.'
                                : 'Maaari mong subukang buksan ulit ang gallery.'}
                        </Text>

                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={
                                permissionDenied
                                    ? () => void openAppSettings()
                                    : () => void pickImages()
                            }
                            activeOpacity={0.82}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name={
                                    permissionDenied
                                        ? 'settings-outline'
                                        : 'refresh-outline'
                                }
                                size={18}
                                color="#FFFFFF"
                            />
                            <Text style={styles.primaryButtonText}>
                                {permissionDenied
                                    ? 'Buksan ang Settings'
                                    : 'Subukan ulit'}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[
                                styles.secondaryButton,
                                { borderColor: T.border },
                            ]}
                            onPress={safeGoBack}
                            activeOpacity={0.78}
                            accessibilityRole="button"
                        >
                            <Text
                                style={[
                                    styles.secondaryButtonText,
                                    { color: T.text },
                                ]}
                            >
                                Bumalik
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <AlertRender />
        </ScreenLayout>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    centerState: {
        flex: 1,
        paddingHorizontal: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stateIconBox: {
        width: 58,
        height: 58,
        borderWidth: 1,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stateTitle: {
        marginTop: 15,
        fontSize: 17,
        lineHeight: 23,
        fontWeight: '900',
        textAlign: 'center',
    },
    stateDescription: {
        maxWidth: 310,
        marginTop: 6,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    primaryButton: {
        minWidth: 190,
        minHeight: 46,
        marginTop: 21,
        borderRadius: 9,
        backgroundColor: PRIMARY,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '900',
    },
    secondaryButton: {
        minWidth: 190,
        minHeight: 44,
        marginTop: 9,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontSize: 13,
        fontWeight: '800',
    },
});
