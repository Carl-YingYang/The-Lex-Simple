import React, { useCallback } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';

// SCREEN LAYOUT VERSION: 1.0.0
// Safe-area-aware app bar with balanced side slots and sharp controls.
const DANGER = '#EF4444';

interface ScreenLayoutProps {
    title: string;
    children: React.ReactNode;
    showBackButton?: boolean;
    rightIcon?: keyof typeof Ionicons.glyphMap;
    onRightPress?: () => void;
    noPadding?: boolean;
    onBackPress?: () => void;
    rightIconColor?: string;
}

export default function ScreenLayout({
    title,
    children,
    showBackButton = true,
    rightIcon,
    onRightPress,
    noPadding = false,
    onBackPress,
    rightIconColor = DANGER,
}: ScreenLayoutProps) {
    const navigation = useNavigation();
    const { colors } = useTheme();

    const handleBackPress = useCallback((): void => {
        if (onBackPress) {
            onBackPress();
            return;
        }

        if (navigation.canGoBack()) {
            navigation.goBack();
        }
    }, [navigation, onBackPress]);

    const normalizedTitle =
        typeof title === 'string' ? title.trim() : '';

    return (
        <SafeAreaView
            testID="screen-layout-v1"
            style={[
                styles.safeArea,
                { backgroundColor: colors.bg },
            ]}
            edges={['top']}
        >
            {/* APP BAR */}
            <View
                style={[
                    styles.appBar,
                    {
                        backgroundColor: colors.bg,
                        borderBottomColor: colors.border,
                    },
                ]}
            >
                {/* LEFT */}
                <View style={styles.sideSlot}>
                    {showBackButton ? (
                        <TouchableOpacity
                            style={[
                                styles.iconButton,
                                {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                },
                            ]}
                            onPress={handleBackPress}
                            activeOpacity={0.72}
                            accessibilityRole="button"
                            accessibilityLabel="Bumalik"
                        >
                            <Ionicons
                                name="arrow-back"
                                size={21}
                                color={colors.text}
                            />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.buttonPlaceholder} />
                    )}
                </View>

                {/* CENTER */}
                <View style={styles.centerSlot}>
                    <Text
                        style={[
                            styles.appBarTitle,
                            { color: colors.text },
                        ]}
                        numberOfLines={1}
                    >
                        {normalizedTitle}
                    </Text>
                </View>

                {/* RIGHT */}
                <View style={styles.sideSlot}>
                    {rightIcon ? (
                        <TouchableOpacity
                            style={[
                                styles.iconButton,
                                {
                                    backgroundColor: colors.card,
                                    borderColor: colors.border,
                                },
                            ]}
                            onPress={onRightPress}
                            disabled={!onRightPress}
                            activeOpacity={0.72}
                            accessibilityRole="button"
                            accessibilityLabel="Karagdagang action"
                            accessibilityState={{
                                disabled: !onRightPress,
                            }}
                        >
                            <Ionicons
                                name={rightIcon}
                                size={20}
                                color={rightIconColor}
                            />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.buttonPlaceholder} />
                    )}
                </View>
            </View>

            {/* CONTENT */}
            <View
                style={[
                    styles.content,
                    !noPadding && styles.contentPadding,
                ]}
            >
                {children}
            </View>
        </SafeAreaView>
    );
}

const SIDE_SLOT_WIDTH = 46;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    appBar: {
        minHeight: 58,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        alignItems: 'center',
    },
    sideSlot: {
        width: SIDE_SLOT_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
    },
    centerSlot: {
        flex: 1,
        minWidth: 0,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconButton: {
        width: 38,
        height: 38,
        borderWidth: 1,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPlaceholder: {
        width: 38,
        height: 38,
    },
    appBarTitle: {
        width: '100%',
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: 0.15,
    },
    content: {
        flex: 1,
    },
    contentPadding: {
        paddingHorizontal: 16,
    },
});
