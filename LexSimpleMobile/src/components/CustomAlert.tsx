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

import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

// CUSTOM ALERT VERSION: 1.0.0
// Sharp, accessible notification modal with safe action handling.
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

const ALERT_CONFIG: Record<AlertType, AlertConfig> = {
    success: {
        icon: 'checkmark',
        color: COLORS.success,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    error: {
        icon: 'close',
        color: COLORS.danger,
        backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    warning: {
        icon: 'alert-outline',
        color: COLORS.warning,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    info: {
        icon: 'information-outline',
        color: COLORS.primaryLight,
        backgroundColor: 'rgba(52, 120, 246, 0.12)',
    },
    loading: {
        icon: 'hourglass-outline',
        color: COLORS.primaryLight,
        backgroundColor: 'rgba(52, 120, 246, 0.12)',
    },
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
    const alertConfig = ALERT_CONFIG[type] ?? ALERT_CONFIG.info;
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
                    style={styles.overlay}
                    activeOpacity={1}
                    onPress={isLoading ? undefined : closeAlert}
                    accessibilityRole="button"
                    accessibilityLabel={
                        isLoading ? undefined : 'Isara ang abiso'
                    }
                >
                    <TouchableWithoutFeedback>
                        <View
                            testID="custom-alert-v1"
                            accessibilityViewIsModal
                            style={[
                                styles.card,
                                {
                                    backgroundColor: T.card,
                                    borderColor: T.border,
                                },
                            ]}
                        >
                            <View style={styles.header}>
                                <View
                                    style={[
                                        styles.iconBox,
                                        {
                                            backgroundColor:
                                                alertConfig.backgroundColor,
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
                                            size={21}
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
                                                            backgroundColor: T.bg,
                                                            borderColor: T.border,
                                                        },
                                                    ],
                                                    isDestructive &&
                                                        styles.destructiveButton,
                                                    !isCancel &&
                                                        !isDestructive &&
                                                        styles.primaryButton,
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
                                                        isDestructive &&
                                                            styles.destructiveText,
                                                        !isCancel &&
                                                            !isDestructive &&
                                                            styles.primaryText,
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
        backgroundColor: 'rgba(0,0,0,0.66)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    card: {
        width: '100%',
        maxWidth: 390,
        maxHeight: '80%',
        padding: 18,
        borderWidth: 1,
        borderRadius: 9,
        elevation: 6,
        shadowColor: '#000000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: {
            width: 0,
            height: 4,
        },
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 38,
        height: 38,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        flex: 1,
        minWidth: 0,
        marginLeft: 11,
        fontSize: 17,
        lineHeight: 22,
        fontWeight: '900',
        letterSpacing: 0.1,
    },
    messageScroll: {
        maxHeight: 190,
        marginTop: 13,
    },
    messageContent: {
        flexGrow: 1,
    },
    message: {
        fontSize: 13,
        lineHeight: 20,
        textAlign: 'left',
    },
    actions: {
        width: '100%',
        marginTop: 20,
        flexDirection: 'row',
    },
    actionsStacked: {
        flexDirection: 'column',
    },
    button: {
        flex: 1,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stackedButton: {
        flex: 0,
        width: '100%',
    },
    rowButtonSpacing: {
        marginLeft: 9,
    },
    stackedButtonSpacing: {
        marginTop: 8,
    },
    primaryButton: {
        backgroundColor: COLORS.primary,
    },
    secondaryButton: {
        borderWidth: 1,
    },
    destructiveButton: {
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.45)',
        backgroundColor: 'rgba(239, 68, 68, 0.10)',
    },
    buttonText: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '800',
        textAlign: 'center',
    },
    primaryText: {
        color: '#FFFFFF',
    },
    destructiveText: {
        color: COLORS.danger,
    },
});
