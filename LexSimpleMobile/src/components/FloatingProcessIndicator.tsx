import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { navigationRef } from '../navigation/RootNavigation';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';
import { useTheme } from '../theme/ThemeContext';
import { BORDER, RADIUS } from '../theme/tokens';
import { getNeoShadow } from './Neo';

// FLOATING PROCESS INDICATOR VERSION: 3.0.0 — PURPLE NEO-BRUTALISM SPEC
// Compact background-waiting indicator (maliit na umiikot na bilog).
// 3.0.0 (UI lang — walang bagong cancel/navigation logic):
// - REDESIGN: malaking card ay tanggal na — maliit na bilog na lang na
//   may paikot na ring (Animated rotate loop) sa baba-kanan ng screen.
//   Ito ang "waiting on background" na anyo: hindi hadlang sa content.
// - AUTO-DISMISS: kapag tapos na o na-cancel ang processing
//   (isProcessing = false), agad na mawawala ito — walang kailangang
//   gawin ang user. Kasabwat nito ang stale-process watchdog ng
//   BackgroundProcessContext (v6.2.7) para kahit nabitin ang task,
//   mawawala pa rin.
// - I-tap ang bilog = balik sa proseso. X badge = Itigil ang analysis
//   (EXISTING na cancelProcess ng context — iisang cancel path).
// - % chip sa ilalim kapag may na-rereport nang porsyento.
// - Hindi lumilitaw kapag nasa process screen na mismo ang user
//   (BatchEditScreen/ConvertScreen) — doon may sariling processing UI.

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
        cancelProcess,
    } = useBackgroundProcess();
    const { colors: T } = useTheme();
    const navigation = useNavigation<any>();
    const safeProgress = clampProgress(progress);
    const canOpenProcess = processRoute.trim().length > 0;
    const [activeRouteName, setActiveRouteName] = useState('');

    // Subaybay sa kasalukuyang root route — para alam ng floating
    // indicator kung ang user ay nasa process screen na mismo (huwag
    // ipakita doon; may sariling loading UI ang process screen).
    useEffect(() => {
        const syncActiveRoute = (): void => {
            const state = navigationRef.getState();

            if (state) {
                const activeRoute = state.routes[state.index];
                setActiveRouteName(activeRoute?.name ?? '');
            } else {
                setActiveRouteName('');
            }
        };

        syncActiveRoute();
        const unsubscribe = navigationRef.addListener(
            'state',
            syncActiveRoute
        );
        return unsubscribe;
    }, []);

    const isVisible =
        isProcessing && activeRouteName !== processRoute.trim();

    // Paikot na ring — gumagalaw lang habang nakikita (tipid sa GPU/
    // JS frame at walang ghost animation pagkatapos mawala).
    const spinValue = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!isVisible) {
            spinValue.setValue(0);
            return;
        }

        const spinLoop = Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 850,
                useNativeDriver: true,
            })
        );
        spinLoop.start();
        return () => spinLoop.stop();
    }, [isVisible, spinValue]);
    const spinRotation = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const handlePress = useCallback((): void => {
        if (!canOpenProcess) {
            return;
        }

        navigation.navigate(processRoute);
    }, [canOpenProcess, navigation, processRoute]);

    // Iisang cancel path — ang context cancelProcess mismo (1:1 sa
    // "Itigil ang Analysis" ng process screen; walang bagong logic).
    const handleStopProcess = useCallback((): void => {
        cancelProcess();
    }, [cancelProcess]);

    if (!isVisible) {
        return null;
    }

    return (
        <View
            pointerEvents="box-none"
            style={styles.wrapper}
        >
            <View
                testID="floating-process-indicator-v1"
                style={[
                    styles.badge,
                    {
                        backgroundColor: T.card,
                        borderColor: T.ink,
                    },
                    getNeoShadow(T, 'sm'),
                ]}
            >
                <TouchableOpacity
                    style={styles.spinHit}
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
                    <Animated.View
                        style={[
                            styles.ring,
                            {
                                borderColor: T.border,
                                borderTopColor: T.brand,
                            },
                            !canOpenProcess && styles.dimmed,
                            {
                                transform: [
                                    { rotate: spinRotation },
                                ],
                            },
                        ]}
                    />
                </TouchableOpacity>

                {/* STOP — maliit na black square + puting X (split-CTA
                    arrow square pattern). Isang tap = cancelProcess. */}
                <TouchableOpacity
                    testID="floating-process-indicator-stop"
                    style={[
                        styles.stopBadge,
                        { backgroundColor: T.ink },
                    ]}
                    onPress={handleStopProcess}
                    hitSlop={{
                        top: 8,
                        bottom: 8,
                        left: 8,
                        right: 8,
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Itigil ang kasalukuyang analysis"
                    accessibilityHint="Inihinto ang pagsusuri at tinatanggal ang floating indicator."
                >
                    <Ionicons
                        name="close"
                        size={11}
                        color={T.card}
                    />
                </TouchableOpacity>

                {safeProgress > 0 && (
                    <View
                        style={[
                            styles.percentChip,
                            {
                                backgroundColor: T.brand,
                                borderColor: T.ink,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.percentText,
                                { color: T.brandText },
                            ]}
                        >
                            {safeProgress}%
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        right: 16,
        bottom: 96,
        zIndex: 1000,
        elevation: 8,
        alignItems: 'flex-end',
    },
    badge: {
        width: 54,
        height: 54,
        borderWidth: BORDER.thin,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
    },
    spinHit: {
        width: 54,
        height: 54,
        borderRadius: 27,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ring: {
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 3.5,
    },
    dimmed: {
        opacity: 0.5,
    },
    stopBadge: {
        position: 'absolute',
        top: -5,
        right: -5,
        width: 20,
        height: 20,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    percentChip: {
        position: 'absolute',
        bottom: -8,
        left: 4,
        right: 4,
        paddingVertical: 1,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    percentText: {
        fontSize: 9,
        lineHeight: 12,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
});