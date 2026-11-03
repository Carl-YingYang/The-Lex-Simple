
import React, { useCallback } from 'react';
import {
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { NeoIconButton, getNeoShadow } from './Neo';
import { SPACING, RADIUS, BORDER, SHADOW, TYPE } from '../theme/tokens';

function pressedNeoState(): ViewStyle {
    const offset = SHADOW.sm.ios.shadowOffset;

    if (Platform.OS === 'android') {
        return {
            elevation: 0,
            transform: [
                { translateX: offset.width },
                { translateY: offset.height },
            ],
        };
    }

    return {
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 0,
        shadowOpacity: 0,
        transform: [
            { translateX: offset.width },
            { translateY: offset.height },
        ],
    };
}

function typeStyle(preset: unknown): TextStyle {
    return preset as TextStyle;
}

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
    rightIconColor,
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

    const resolvedRightColor =
        rightIconColor ?? colors.danger;

    return (
        <SafeAreaView
            testID="screen-layout-v1"
            style={[
                styles.safeArea,
                { backgroundColor: colors.bg },
            ]}
            edges={['top']}
        >
            <View
                style={[
                    styles.appBar,
                    {
                        backgroundColor: colors.bg,
                        borderBottomColor: colors.ink,
                    },
                ]}
            >
                {/* Left action */}
                <View style={styles.sideSlot}>
                    {showBackButton ? (
                        <NeoIconButton
                            icon="arrow-back"
                            onPress={handleBackPress}
                            size={36}
                            iconSize={18}
                            accessibilityLabel="Bumalik"
                        />
                    ) : (
                        <View style={styles.buttonPlaceholder} />
                    )}
                </View>

                {/* Compact centered title */}
                <View style={styles.centerSlot}>
                    {normalizedTitle !== '' ? (
                        <Text
                            style={[
                                typeStyle(TYPE.display),
                                styles.appBarTitle,
                                { color: colors.text },
                            ]}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                            maxFontSizeMultiplier={1.15}
                        >
                            {normalizedTitle}
                        </Text>
                    ) : null}
                </View>

                {/* Right action */}
                <View style={styles.sideSlot}>
                    {rightIcon ? (
                        <Pressable
                            onPress={onRightPress}
                            disabled={!onRightPress}
                            accessibilityRole="button"
                            accessibilityLabel="Karagdagang action"
                            accessibilityState={{
                                disabled: !onRightPress,
                            }}
                            hitSlop={4}
                        >
                            {({ pressed }) => (
                                <View
                                    style={[
                                        styles.iconButton,
                                        {
                                            backgroundColor: colors.card,
                                            borderColor: colors.ink,
                                        },
                                        pressed && onRightPress
                                            ? pressedNeoState()
                                            : getNeoShadow(colors, 'sm'),
                                    ]}
                                >
                                    <Ionicons
                                        name={rightIcon}
                                        size={18}
                                        color={resolvedRightColor}
                                    />
                                </View>
                            )}
                        </Pressable>
                    ) : (
                        <View style={styles.buttonPlaceholder} />
                    )}
                </View>
            </View>

            {/* Screen content */}
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

const SIDE_SLOT_WIDTH = 40;
const ACTION_BUTTON_SIZE = 36;

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },

    appBar: {
        minHeight: 56,
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        borderBottomWidth: BORDER.thin,
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
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },

    iconButton: {
        width: ACTION_BUTTON_SIZE,
        height: ACTION_BUTTON_SIZE,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },

    buttonPlaceholder: {
        width: ACTION_BUTTON_SIZE,
        height: ACTION_BUTTON_SIZE,
    },

    appBarTitle: {
        width: '100%',
        minWidth: 0,
        flexShrink: 1,
        fontSize: 19,
        lineHeight: 23,
        fontWeight: '900',
        letterSpacing: 0.25,
        textTransform: 'uppercase',
        textAlign: 'center',
        includeFontPadding: false,
    },

    content: {
        flex: 1,
        minHeight: 0,
    },

    contentPadding: {
        paddingHorizontal: SPACING.lg,
    },
});
