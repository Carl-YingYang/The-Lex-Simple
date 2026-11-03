import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { BORDER, RADIUS } from '../theme/tokens';

// LOADING SPINNER VERSION: 2.0.0 — PURPLE NEO-BRUTALISM SPEC
// (Minimal native loading state — walang timers o custom animations,
// behavior 1:1 pa rin.)
// Pagbabago sa UI (v2.0.0):
//   - Binura ang PRIMARY_SOFT constant (asul — bawal sa purple spec) —
//     spinner = T.brand na (theme-aware: kumikinang sa dark mode).
//   - Indicator box: 1.5px ink outline + squared 6px radius (dating 1px
//     hairline border at 10px radius).

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
                        borderColor: T.ink,
                    },
                ]}
            >
                <ActivityIndicator
                    size="small"
                    color={T.brand}
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
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
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