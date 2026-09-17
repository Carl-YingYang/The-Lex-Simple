import React, { useMemo } from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';

// PROCESSING LOADER VERSION: 1.0.0
// Flat progress UI driven only by the process context's actual progress value.
const PRIMARY = '#3478F6';
const PRIMARY_SOFT = '#66A0FF';
const DANGER = '#EF4444';

interface ProcessingLoaderProps {
    title?: string;
    messages?: string[];
    onMinimize?: () => void;
    onCancel?: () => void;
}

const DEFAULT_MESSAGES = [
    'Inihahanda ang dokumento...',
    'Binabasa ang document text...',
    'Sinusuri ang legal terms...',
    'Binubuo ang malinaw na paliwanag...',
    'Tinatapos ang resulta...',
];

const clampProgress = (value: unknown): number => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return Math.min(100, Math.max(0, Math.round(numericValue)));
};

export default function ProcessingLoader({
    title = 'Sinusuri ang Dokumento',
    messages = DEFAULT_MESSAGES,
    onMinimize,
    onCancel,
}: ProcessingLoaderProps) {
    const { colors: T } = useTheme();
    const { progress } = useBackgroundProcess();
    const safeProgress = clampProgress(progress);

    const validMessages = useMemo(
        () => messages.filter(
            (message) =>
                typeof message === 'string' &&
                message.trim().length > 0
        ),
        [messages]
    );

    const statusMessage = useMemo(() => {
        if (safeProgress >= 100) {
            return 'Tapos na ang pagsusuri.';
        }

        if (validMessages.length === 0) {
            return 'Pinoproseso ang dokumento...';
        }

        const progressRatio = safeProgress / 100;
        const messageIndex = Math.min(
            validMessages.length - 1,
            Math.floor(progressRatio * validMessages.length)
        );

        return validMessages[messageIndex];
    }, [safeProgress, validMessages]);

    return (
        <View
            testID="processing-loader-v1"
            style={[
                styles.screen,
                { backgroundColor: T.bg },
            ]}
        >
            <View style={styles.content}>
                <View
                    style={[
                        styles.iconBox,
                        {
                            backgroundColor: T.card,
                            borderColor: T.border,
                        },
                    ]}
                >
                    <Ionicons
                        name={
                            safeProgress >= 100
                                ? 'checkmark-outline'
                                : 'document-text-outline'
                        }
                        size={28}
                        color={safeProgress >= 100 ? PRIMARY : PRIMARY_SOFT}
                    />
                </View>

                <Text
                    style={[
                        styles.title,
                        { color: T.text },
                    ]}
                >
                    {title}
                </Text>

                <Text
                    accessibilityLiveRegion="polite"
                    style={[
                        styles.status,
                        { color: T.subText },
                    ]}
                >
                    {statusMessage}
                </Text>

                <View style={styles.progressHeader}>
                    <Text
                        style={[
                            styles.progressLabel,
                            { color: T.subText },
                        ]}
                    >
                        Progreso
                    </Text>
                    <Text
                        style={[
                            styles.progressValue,
                            { color: T.text },
                        ]}
                    >
                        {safeProgress}%
                    </Text>
                </View>

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

                {(onMinimize || onCancel) && (
                    <View style={styles.actions}>
                        {onMinimize && (
                            <TouchableOpacity
                                style={styles.primaryButton}
                                onPress={onMinimize}
                                activeOpacity={0.82}
                                accessibilityRole="button"
                                accessibilityLabel="Ipagpatuloy sa background"
                            >
                                <Ionicons
                                    name="remove-outline"
                                    size={19}
                                    color="#FFFFFF"
                                />
                                <Text style={styles.primaryButtonText}>
                                    I-minimize
                                </Text>
                            </TouchableOpacity>
                        )}

                        {onCancel && (
                            <TouchableOpacity
                                style={[
                                    styles.secondaryButton,
                                    { borderColor: T.border },
                                ]}
                                onPress={onCancel}
                                activeOpacity={0.78}
                                accessibilityRole="button"
                                accessibilityLabel="Kanselahin ang pagsusuri"
                            >
                                <Ionicons
                                    name="close-outline"
                                    size={19}
                                    color={DANGER}
                                />
                                <Text style={styles.cancelButtonText}>
                                    Kanselahin
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {onMinimize && safeProgress < 100 && (
                    <Text
                        style={[
                            styles.helperText,
                            { color: T.subText },
                        ]}
                    >
                        Magpapatuloy ang pagsusuri kahit i-minimize mo ito.
                    </Text>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 26,
        paddingVertical: 24,
    },
    content: {
        width: '100%',
        maxWidth: 420,
        alignSelf: 'center',
        alignItems: 'center',
    },
    iconBox: {
        width: 58,
        height: 58,
        borderWidth: 1,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        marginTop: 16,
        fontSize: 18,
        lineHeight: 24,
        fontWeight: '900',
        textAlign: 'center',
    },
    status: {
        minHeight: 20,
        marginTop: 6,
        fontSize: 13,
        lineHeight: 19,
        textAlign: 'center',
    },
    progressHeader: {
        width: '100%',
        marginTop: 25,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    progressLabel: {
        fontSize: 12,
        fontWeight: '700',
    },
    progressValue: {
        fontSize: 13,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
    progressTrack: {
        width: '100%',
        height: 7,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
        backgroundColor: PRIMARY,
    },
    actions: {
        width: '100%',
        marginTop: 26,
        gap: 9,
    },
    primaryButton: {
        minHeight: 47,
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
        minHeight: 45,
        borderWidth: 1,
        borderRadius: 9,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    cancelButtonText: {
        color: DANGER,
        fontSize: 13,
        fontWeight: '800',
    },
    helperText: {
        marginTop: 13,
        fontSize: 11,
        lineHeight: 16,
        textAlign: 'center',
    },
});
