import React, { useCallback, useEffect, useState } from 'react';
import {
    Linking,
    Modal,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { showGlobalAlert } from './GlobalAlertHost';
import { getNeoShadow } from './Neo';
import { useTheme } from '../theme/ThemeContext';
import { BORDER, RADIUS, SPACING, TYPE } from '../theme/tokens';

// CONSENT GATE VERSION: 1.0.0 — FIRST-LAUNCH PRIVACY CONSENT (SIMPLE MOCKUP)
// Full-screen na hindi ma-dismiss na modal sa unang pagbukas ng app.
// Kailangang pindutin ang "Sang-ayon ako" bago magamit ang app — kapag
// hindi pa, may maikling paliwanag na lalabas. Maikli at malinaw lang ang
// copy (3 puntos) para hindi malito ang mga user.
//
// Storage: @lex_privacy_consent_v1 = 'accepted' (AsyncStorage). Kapag
// naka-accept na, hindi na lalabas muli ito sa susunod na pagbukas.
// Kapag sira/hindi mabasa ang storage, ligtas ang default: ipapakita pa
// rin ang consent.
//
// WALANG bagong dependency (AsyncStorage ay naka-install na). Tantine:
// palitan ang PRIVACY_POLICY_URL ng totoong URL bago ang release —
// pareho ng ginagamit ng ProfileScreen.

const CONSENT_KEY = '@lex_privacy_consent_v1';

// PALITAN: totoong Privacy Policy URL bago ang release (kasalukuyang
// placeholder mula pa sa ProfileScreen).
const PRIVACY_POLICY_URL = 'https://example.com/lex-simple-privacy-policy';

const CONSENT_POINTS = [
    'Nananatili sa phone mo ang mga larawang na-scan. Sa phone din binabasa at nililinis ang text.',
    'Kapag ipinasuri mo sa AI, ang nilinis na text lang ang ipinapadala sa AI service. Kapag nag-upload ka ng PDF o DOCX, pansamantalang ipinapadala ang file sa server namin para mabasa ang text, at binubura ito pagkatapos.',
    'May naitatalang bilang ng paggamit (naka-hash na ID, hindi ang laman ng dokumento) para sa daily limit. Pwede mong i-off ang analytics sa Settings. Walang account o email na hinihingi.',
];

export default function ConsentGate() {
    const { colors: T, isDarkMode } = useTheme();
    const [needsConsent, setNeedsConsent] = useState(false);

    useEffect(() => {
        let mounted = true;

        const loadConsent = async (): Promise<void> => {
            try {
                const accepted = await AsyncStorage.getItem(CONSENT_KEY);

                if (mounted && accepted !== 'accepted') {
                    setNeedsConsent(true);
                }
            } catch {
                // Ligtas ang default: kung hindi mabasa ang storage,
                // ipakita ang consent.
                if (mounted) {
                    setNeedsConsent(true);
                }
            }
        };

        void loadConsent();

        return () => {
            mounted = false;
        };
    }, []);

    const handleAccept = useCallback(async (): Promise<void> => {
        try {
            await AsyncStorage.setItem(CONSENT_KEY, 'accepted');
        } catch {
            // Hindi ma-save ang flag — lalabas muli ang consent sa susunod
            // na bukas, pero makakatuloy na ang user ngayong session.
        }

        setNeedsConsent(false);
    }, []);

    const handleDecline = useCallback((): void => {
        showGlobalAlert(
            'Hindi pa tayo makatuloy',
            'Kailangang sumang-ayon ka muna sa privacy notice bago magamit ang app. Walang hinihinging personal na impormasyon ang pagsang-ayon.',
            'info',
            [{ text: 'OK', style: 'cancel' }]
        );
    }, []);

    const openPrivacyPolicy = useCallback((): void => {
        void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {
            // Walang gagawin kapag walang browser — hindi kritikal.
        });
    }, []);

    return (
        <Modal
            visible={needsConsent}
            transparent
            animationType="fade"
            statusBarTranslucent
            onRequestClose={() => {
                // Sadyang walang ginagawa — hindi maaaring i-back-out ang
                // consent.
            }}
        >
            <StatusBar
                barStyle={isDarkMode ? 'light-content' : 'dark-content'}
            />
            <View
                testID="consent-gate-v1"
                style={[styles.screen, { backgroundColor: T.bg }]}
            >
                <View
                    style={[
                        styles.card,
                        {
                            backgroundColor: T.card,
                            borderColor: T.ink,
                        },
                        getNeoShadow(T, 'sm'),
                    ]}
                >
                    <View
                        style={[
                            styles.iconChip,
                            {
                                backgroundColor: T.brandSoft,
                                borderColor: T.ink,
                            },
                        ]}
                    >
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={26}
                            color={T.brandDeep}
                        />
                    </View>

                    <Text
                        style={[
                            styles.eyebrow,
                            { color: T.brand },
                        ]}
                    >
                        LEX-SIMPLE
                    </Text>

                    <Text
                        style={[
                            TYPE.title,
                            styles.heading,
                            { color: T.text },
                        ]}
                    >
                        Bago tayo magsimula
                    </Text>

                    <Text
                        style={[
                            TYPE.body,
                            styles.lede,
                            { color: T.subText },
                        ]}
                    >
                        Maikling paliwanag lang kung ano ang nangyayari sa
                        mga document mo:
                    </Text>

                    <View style={styles.points}>
                        {CONSENT_POINTS.map((point, index) => (
                            <View
                                key={point}
                                style={styles.pointRow}
                            >
                                <View
                                    style={[
                                        styles.pointChip,
                                        {
                                            backgroundColor: T.brandSoft,
                                            borderColor: T.ink,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.pointChipText,
                                            { color: T.brandDeep },
                                        ]}
                                    >
                                        {index + 1}
                                    </Text>
                                </View>
                                <Text
                                    style={[
                                        TYPE.small,
                                        styles.pointText,
                                        { color: T.text },
                                    ]}
                                >
                                    {point}
                                </Text>
                            </View>
                        ))}
                    </View>

                    <Text
                        style={[
                            TYPE.small,
                            styles.footerNote,
                            { color: T.subText },
                        ]}
                    >
                        Kapag nagpatuloy ka, sumasang-ayon ka sa aming{' '}
                        <Text
                            style={{ color: T.brand, fontWeight: '800' }}
                            onPress={openPrivacyPolicy}
                            accessibilityRole="link"
                        >
                            Privacy Policy
                        </Text>
                        .
                    </Text>

                    <TouchableOpacity
                        style={[
                            styles.agreeButton,
                            {
                                backgroundColor: T.brand,
                                borderColor: T.ink,
                            },
                        ]}
                        onPress={() => void handleAccept()}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel="Sang-ayon ako sa privacy notice"
                    >
                        <Text
                            style={[
                                styles.agreeText,
                                { color: T.brandText },
                            ]}
                        >
                            Sang-ayon ako
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.declineButton,
                            {
                                backgroundColor: T.card,
                                borderColor: T.ink,
                            },
                        ]}
                        onPress={handleDecline}
                        activeOpacity={0.82}
                        accessibilityRole="button"
                        accessibilityLabel="Hindi pa ako sang-ayon"
                    >
                        <Text
                            style={[
                                styles.declineText,
                                { color: T.text },
                            ]}
                        >
                            Hindi pa ako sang-ayon
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
    },
    card: {
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
        padding: SPACING.xl,
    },
    iconChip: {
        width: 56,
        height: 56,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.md,
    },
    eyebrow: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '800',
        letterSpacing: 2.5,
        marginBottom: 6,
    },
    heading: {
        fontWeight: '900',
        marginBottom: 8,
    },
    lede: {
        marginBottom: SPACING.lg,
    },
    points: {
        gap: SPACING.sm,
        marginBottom: SPACING.lg,
    },
    pointRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    pointChip: {
        width: 22,
        height: 22,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: SPACING.sm,
        marginTop: 1,
    },
    pointChipText: {
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '900',
    },
    pointText: {
        flex: 1,
        fontWeight: '600',
        lineHeight: 19,
    },
    footerNote: {
        marginBottom: SPACING.lg,
        lineHeight: 19,
    },
    agreeButton: {
        minHeight: 48,
        borderWidth: BORDER.thick,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
        paddingVertical: 12,
        marginBottom: SPACING.sm,
    },
    agreeText: {
        fontSize: 14,
        lineHeight: 19,
        fontWeight: '900',
        letterSpacing: 0.2,
    },
    declineButton: {
        minHeight: 44,
        borderWidth: BORDER.thin,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.lg,
        paddingVertical: 10,
    },
    declineText: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '800',
    },
});