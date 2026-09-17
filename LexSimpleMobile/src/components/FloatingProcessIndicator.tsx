import React, { useCallback } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { useBackgroundProcess } from '../context/BackgroundProcessContext';
import { useTheme } from '../theme/ThemeContext';

// FLOATING PROCESS INDICATOR VERSION: 1.0.0
// Compact, non-animated access point for the active in-app process.
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';

const clampProgress = (value: unknown): number => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.min(100, Math.max(0, Math.round(numericValue)));
};

export default function FloatingProcessIndicator() {
    const {
        isProcessing,
        processRoute,
        progress,
    } = useBackgroundProcess();
    const { colors: T } = useTheme();
    const navigation = useNavigation<any>();
    const safeProgress = clampProgress(progress);
    const canOpenProcess = processRoute.trim().length > 0;

    const handlePress = useCallback((): void => {
        if (!canOpenProcess) {
            return;
        }

        navigation.navigate(processRoute);
    }, [canOpenProcess, navigation, processRoute]);

    if (!isProcessing) {
        return null;
    }

    return (
        <View
            pointerEvents="box-none"
            style={styles.wrapper}
        >
            <TouchableOpacity
                testID="floating-process-indicator-v1"
                style={[
                    styles.card,
                    {
                        backgroundColor: T.card,
                        borderColor: T.border,
                    },
                    !canOpenProcess && styles.cardDisabled,
                ]}
                onPress={handlePress}
                disabled={!canOpenProcess}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Bumalik sa kasalukuyang document analysis"
                accessibilityHint={
                    canOpenProcess
                        ? 'Binubuksan ang screen ng kasalukuyang proseso.'
                        : undefined
                }
            >
                <View
                    style={[
                        styles.iconBox,
                        { backgroundColor: `${PRIMARY}18` },
                    ]}
                >
                    <Ionicons
                        name="document-text-outline"
                        size={20}
                        color={PRIMARY_SOFT}
                    />
                </View>

                <View style={styles.content}>
                    <View style={styles.titleRow}>
                        <Text
                            numberOfLines={1}
                            style={[
                                styles.title,
                                { color: T.text },
                            ]}
                        >
                            Sinusuri ang dokumento
                        </Text>

                        {safeProgress > 0 && (
                            <Text
                                style={[
                                    styles.progressValue,
                                    { color: T.subText },
                                ]}
                            >
                                {safeProgress}%
                            </Text>
                        )}
                    </View>

                    <Text
                        numberOfLines={1}
                        style={[
                            styles.subtitle,
                            { color: T.subText },
                        ]}
                    >
                        I-tap para bumalik sa proseso
                    </Text>

                    <View
                        accessible
                        accessibilityRole="progressbar"
                        accessibilityLabel="Progreso ng pagsusuri"
                        accessibilityValue={{
                            min: 0,
                            max: 100,
                            now: safeProgress,
                            text: `${safeProgress} porsyento`,
                        }}
                        style={[
                            styles.progressTrack,
                            { backgroundColor: T.border },
                        ]}
                    >
                        <View
                            style={[
                                styles.progressFill,
                                { width: `${safeProgress}%` },
                            ]}
                        />
                    </View>
                </View>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 88,
        zIndex: 1000,
        elevation: 8,
        alignItems: 'center',
    },
    card: {
        width: '100%',
        maxWidth: 410,
        minHeight: 64,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardDisabled: {
        opacity: 0.72,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        minWidth: 0,
        marginLeft: 11,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    title: {
        flex: 1,
        minWidth: 0,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '900',
    },
    progressValue: {
        marginLeft: 10,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
    subtitle: {
        marginTop: 1,
        fontSize: 10,
        lineHeight: 15,
        fontWeight: '500',
    },
    progressTrack: {
        width: '100%',
        height: 3,
        marginTop: 7,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
        backgroundColor: PRIMARY,
    },
});
