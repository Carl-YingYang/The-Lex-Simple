import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { useTheme } from '../theme/ThemeContext';

// LOADING SPINNER VERSION: 1.0.0
// Minimal native loading state without timers or custom animations.
const PRIMARY_SOFT = '#66A0FF';

interface LoadingSpinnerProps {
    message?: string;
}

const getDisplayMessage = (message: unknown): string => {
    if (typeof message !== 'string') {
        return 'Sandali lang...';
    }

    const normalizedMessage = message.trim();
    return normalizedMessage || 'Sandali lang...';
};

export default function LoadingSpinner({
    message = 'Sandali lang...',
}: LoadingSpinnerProps) {
    const { colors: T } = useTheme();
    const displayMessage = getDisplayMessage(message);

    return (
        <View
            testID="loading-spinner-v1"
            style={[
                styles.container,
                { backgroundColor: T.bg },
            ]}
            accessibilityLiveRegion="polite"
        >
            <View
                style={[
                    styles.indicatorBox,
                    {
                        backgroundColor: T.card,
                        borderColor: T.border,
                    },
                ]}
            >
                <ActivityIndicator
                    size="small"
                    color={PRIMARY_SOFT}
                    accessibilityLabel="Naglo-load"
                />
            </View>

            <Text
                style={[
                    styles.message,
                    { color: T.subText },
                ]}
            >
                {displayMessage}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
        paddingVertical: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    indicatorBox: {
        width: 48,
        height: 48,
        borderWidth: 1,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    message: {
        maxWidth: 280,
        minHeight: 18,
        marginTop: 12,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
});
