import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getNeoShadow } from './Neo';
import { useTheme } from '../theme/ThemeContext';
import { BORDER, RADIUS, SPACING, type ThemeColors } from '../theme/tokens';

// CUSTOM ALERT VERSION: 2.0.0
// 2.0.0: TUNAY NA NEO-BRUTALISM (purple spec) — hindi na "soft dialog".
// Iisang popup itsura ang buong app dahil lahat ng popup (useCustomAlert
// hook + GlobalAlertHost) ay dumadaan sa component na ito:
//   - Card: 2px ink border (BORDER.thick), squared 6px radius
//     (RADIUS.lg), HARD shadow na walang blur (getNeoShadow 'md') —
//     pareho ng AI paliwanag modal ng DictionaryDetailScreen.
//   - Ink rule divider sa ilalim ng header (signature na pattern).
//   - Icon chip: squared (3px), 1.5px ink border, soft bg mula sa tokens.
//   - Title: ALL-CAPS via textTransform, weight 900.
//   - Buttons: squared (4px), 2px borders — primary = purple fill +
//     itim na label (spec CTA), cancel = card fill + ink border,
//     destructive = dangerSoft fill + danger border.
//   - Lahat ng kulay galing sa theme tokens — light/dark auto-adjust.
// WALANG binago sa API: { visible, title, message, type, buttons, onClose }
// at ang useCustomAlert() hook — 1:1 pa rin lahat ng existing callsites.
// (1.1.0: theme tokens re-skin; 1.0.0: orihinal na soft dialog.)
export type AlertType =
    | 'success'
    | 'error'
    | 'warning'
    | 'info'
    | 'loading';

export interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

export interface CustomAlertProps {
    visible: boolean;
    title: string;
    message: string;
    type?: AlertType;
    buttons?: AlertButton[];
    onClose: () => void;
}

type AlertConfig = {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    backgroundColor: string;
};

// Theme-aware na config — galing lahat sa tokens (walang hardcoded hex).
const getAlertConfig = (type: AlertType, T: ThemeColors): AlertConfig => {
    switch (type) {
        case 'success':
            return {
                icon: 'checkmark',
                color: T.success,
                backgroundColor: T.successSoft,
            };
        case 'error':
            return {
                icon: 'close',
                color: T.danger,
                backgroundColor: T.dangerSoft,
            };
        case 'warning':
            return {
                icon: 'alert-outline',
                color: T.warning,
                backgroundColor: T.warningSoft,
            };
        case 'loading':
            return {
                icon: 'hourglass-outline',
                color: T.info,
                backgroundColor: T.infoSoft,
            };
        case 'info':
        default:
            return {
                icon: 'information-outline',
                color: T.info,
                backgroundColor: T.infoSoft,
            };
    }
};

const cleanLabel = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') {
        return fallback;
    }

    const normalized = value.trim();
    return normalized || fallback;
};

export function useCustomAlert() {
    const [config, setConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type: AlertType;
        buttons: AlertButton[];
    }>({
        visible: false,
        title: '',
        message: '',
        type: 'info',
        buttons: [],
    });

    const showAlert = useCallback((
        title: string,
        message: string,
        type: AlertType = 'info',
        buttons: AlertButton[] = []
    ): void => {
        setConfig({
            visible: true,
            title,
            message,
            type,
            buttons,
        });
    }, []);

    const hideAlert = useCallback((): void => {
        setConfig((current) => ({
            ...current,
            visible: false,
        }));
    }, []);

    const AlertRender = useCallback(() => (
        <CustomAlert
            visible={config.visible}
            title={config.title}
            message={config.message}
            type={config.type}
            buttons={config.buttons}
            onClose={hideAlert}
        />
    ), [config, hideAlert]);

    return {
        showAlert,
        hideAlert,
        AlertRender,
    };
}

export default function CustomAlert({
    visible,
    title,
    message,
    type = 'info',
    buttons = [],
    onClose,
}: CustomAlertProps) {
    const { colors: T } = useTheme();
    const actionLockedRef = useRef(false);
    const alertConfig = useMemo(
        () => getAlertConfig(type, T),
        [type, T]
    );
    const isLoading = type === 'loading';
    const displayTitle = cleanLabel(title, 'Abiso');
    const displayMessage = cleanLabel(
        message,
        isLoading ? 'Sandali lang...' : 'Walang karagdagang detalye.'
    );

    useEffect(() => {
        if (visible) {
            actionLockedRef.current = false;
        }
    }, [visible]);

    const actionButtons = useMemo<AlertButton[]>(() => {
        if (buttons.length > 0) {
            return buttons;
        }

        return [
            {
                text: 'OK',
            },
        ];
    }, [buttons]);

    const buttonsAreStacked = actionButtons.length > 2;

    const closeAlert = useCallback((): void => {
        if (isLoading || actionLockedRef.current) {
            return;
        }

        actionLockedRef.current = true;
        onClose();
    }, [isLoading, onClose]);

    const handleAction = useCallback((button: AlertButton): void => {
        if (actionLockedRef.current) {
            return;
        }

        actionLockedRef.current = true;

        // Hide first. Run the action on the next frame so a callback that
        // opens another alert is not batched with this alert's close state.
        onClose();

        if (button.onPress) {
            requestAnimationFrame(button.onPress);
        }
    }, [onClose]);

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            statusBarTranslucent
            onRequestClose={isLoading ? () => undefined : closeAlert}
        >
            <KeyboardAvoidingView
                style={styles.keyboardContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <TouchableOpacity
                    style={[
                        styles.overlay,
                        { backgroundColor: T.overlay },
                    ]}
                    activeOpacity={1}
                    onPress={isLoading ? undefined : closeAlert}
                    accessibilityRole="button"
                    accessibilityLabel={
                        isLoading ? undefined : 'Isara ang abiso'
                    }
                >
                    <TouchableWithoutFeedback>
                        <View
                            testID="custom-alert-v2"
                            accessibilityViewIsModal
                            style={[
                                styles.card,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.ink,
                                },
                                getNeoShadow(T, 'md'),
                            ]}
                        >
                            {/* HEADER — icon chip + ALL-CAPS title */}
                            <View style={styles.header}>
                                <View
                                    style={[
                                        styles.iconBox,
                                        {
                                            backgroundColor:
                                                alertConfig.backgroundColor,
                                            borderColor: T.ink,
                                        },
                                    ]}
                                >
                                    {isLoading ? (
                                        <ActivityIndicator
                                            size="small"
                                            color={alertConfig.color}
                                            accessibilityLabel="Naglo-load"
                                        />
                                    ) : (
                                        <Ionicons
                                            name={alertConfig.icon}
                                            size={19}
                                            color={alertConfig.color}
                                        />
                                    )}
                                </View>

                                <Text
                                    style={[
                                        styles.title,
                                        { color: T.text },
                                    ]}
                                >
                                    {displayTitle}
                                </Text>
                            </View>

                            {/* INK RULE — signature divider ng neo modal */}
                            <View
                                style={[
                                    styles.rule,
                                    { backgroundColor: T.ink },
                                ]}
                            />

                            <ScrollView
                                style={styles.messageScroll}
                                contentContainerStyle={styles.messageContent}
                                showsVerticalScrollIndicator={false}
                                bounces={false}
                            >
                                <Text
                                    accessibilityLiveRegion="polite"
                                    selectable={type === 'error'}
                                    style={[
                                        styles.message,
                                        { color: T.subText },
                                    ]}
                                >
                                    {displayMessage}
                                </Text>
                            </ScrollView>

                            {!isLoading && (
                                <View
                                    style={[
                                        styles.actions,
                                        buttonsAreStacked &&
                                            styles.actionsStacked,
                                    ]}
                                >
                                    {actionButtons.map((button, index) => {
                                        const isCancel =
                                            button.style === 'cancel';
                                        const isDestructive =
                                            button.style === 'destructive';

                                        return (
                                            <TouchableOpacity
                                                key={`${button.text}-${index}`}
                                                style={[
                                                    styles.button,
                                                    buttonsAreStacked &&
                                                        styles.stackedButton,
                                                    !buttonsAreStacked &&
                                                        index > 0 &&
                                                        styles.rowButtonSpacing,
                                                    buttonsAreStacked &&
                                                        index > 0 &&
                                                        styles.stackedButtonSpacing,
                                                    isCancel && [
                                                        styles.secondaryButton,
                                                        {
                                                            backgroundColor:
                                                                T.card,
                                                            borderColor: T.ink,
                                                        },
                                                    ],
                                                    isDestructive && [
                                                        styles.destructiveButton,
                                                        {
                                                            backgroundColor:
                                                                T.dangerSoft,
                                                            borderColor:
                                                                T.danger,
                                                        },
                                                    ],
                                                    !isCancel &&
                                                        !isDestructive && [
                                                            styles.primaryButton,
                                                            {
                                                                backgroundColor:
                                                                    T.brand,
                                                                borderColor:
                                                                    T.ink,
                                                            },
                                                        ],
                                                ]}
                                                onPress={() =>
                                                    handleAction(button)
                                                }
                                                activeOpacity={0.78}
                                                accessibilityRole="button"
                                            >
                                                <Text
                                                    numberOfLines={2}
                                                    style={[
                                                        styles.buttonText,
                                                        isCancel && {
                                                            color: T.text,
                                                        },
                                                        isDestructive && {
                                                            color: T.danger,
                                                        },
                                                        !isCancel &&
                                                            !isDestructive && {
                                                                color: T.brandText,
                                                            },
                                                    ]}
                                                >
                                                    {cleanLabel(
                                                        button.text,
                                                        'OK'
                                                    )}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </TouchableWithoutFeedback>
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    keyboardContainer: {
        flex: 1,
    },
    overlay: {
        flex: 1,
        paddingHorizontal: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Focal element: 2px ink border + hard shadow (getNeoShadow sa JSX).
    // Walang padding dito — bawat seksyon may sariling padding para
    // edge-to-edge ang ink rule (pareho ng AI modal).
    card: {
        width: '100%',
        maxWidth: 390,
        maxHeight: '80%',
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg - 2,
        paddingTop: 14,
        paddingBottom: 10,
    },
    iconBox: {
        width: 32,
        height: 32,
        borderRadius: RADIUS.sm,
        borderWidth: BORDER.thin,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        flex: 1,
        minWidth: 0,
        marginLeft: SPACING.sm + 2,
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '900',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    rule: {
        height: BORDER.thick,
    },
    messageScroll: {
        maxHeight: 190,
    },
    messageContent: {
        flexGrow: 1,
        paddingHorizontal: SPACING.lg - 2,
        paddingTop: SPACING.md,
    },
    message: {
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'left',
    },
    actions: {
        width: '100%',
        flexDirection: 'row',
        paddingHorizontal: SPACING.lg - 2,
        paddingTop: SPACING.lg - 2,
        paddingBottom: SPACING.lg - 2,
    },
    actionsStacked: {
        flexDirection: 'column',
    },
    // CTA-grade buttons: 2px border (BORDER.thick), squared 4px radius.
    button: {
        flex: 1,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: RADIUS.md,
        borderWidth: BORDER.thick,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stackedButton: {
        flex: 0,
        width: '100%',
    },
    rowButtonSpacing: {
        marginLeft: SPACING.sm,
    },
    stackedButtonSpacing: {
        marginTop: SPACING.sm,
    },
    primaryButton: {
        // Kulay (T.brand fill + T.ink border) naka-inline sa JSX.
    },
    secondaryButton: {
        // Kulay (T.card fill + T.ink border) naka-inline sa JSX.
    },
    destructiveButton: {
        // Kulay (T.dangerSoft fill + T.danger border) naka-inline sa JSX.
    },
    buttonText: {
        fontSize: 12,
        lineHeight: 17,
        fontWeight: '800',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
});