import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    LogBox,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
    DarkTheme,
    DefaultTheme,
    NavigationContainer,
} from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundProcessProvider } from '../context/BackgroundProcessContext';
import FloatingProcessIndicator from '../components/FloatingProcessIndicator';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
import { navigationRef } from './RootNavigation';
import { migrateLegacyDataToGuest } from '../services/localDataScope';
import { waitForScanHistoryWrites } from '../services/scanHistoryStorage';
import { BORDER, RADIUS } from '../theme/tokens';

import ScanScreen from '../screens/home/tab-pages/ScanScreen';
import LibraryScreen from '../screens/dictionary/tab-pages/LibraryScreen';
import ProfileScreen from '../screens/profile/tab-pages/ProfileScreen';
import ScannerScreen from '../screens/home/sub-pages/ScannerScreen';
import ResultScreen from '../screens/home/sub-pages/ResultScreen';
import DictionaryDetailScreen from '../screens/dictionary/sub-pages/DictionaryDetailScreen';
import UploadImageScreen from '../screens/home/sub-pages/UploadImageScreen';
import ConvertScreen from '../screens/home/sub-pages/ConvertScreen';
import AskAiScreen from '../screens/home/sub-pages/AskAiScreen';
import OfflineDetailScreen from '../screens/home/sub-pages/OfflineDetailScreen';
import SanitizedOcrScreen from '../screens/home/sub-pages/SanitizedOcrScreen';
import AboutScreen from '../screens/profile/sub-pages/AboutScreen';
import LegalAidScreen from '../screens/profile/sub-pages/LegalAidScreen';
import BatchEditScreen from '../screens/home/sub-pages/BatchEditScreen';

// APP NAVIGATOR VERSION: 3.0.0 — PURPLE NEO-BRUTALISM SPEC
// (Routing, startup sequence, tab structure, at screen registry 1:1 pa
// rin — UI lang ang binago.)
// Pagbabago sa UI (v3.0.0):
//   - Landing loading ("Inihahanda ang saved scans…"): bare spinner sa
//     hard-coded na asul-puting bg → branded boot state (LEX-SIMPLE
//     eyebrow + icon box na may 1.5px ink outline + purple spinner),
//     tokens lahat — zero hardcoded hex/rgba.
//   - Error state: bare text link → 1.5px ink outline button (squared),
//     danger icon sa icon box.
//   - Tab bar accent: lumang blue-violet constant → T.brand tokens
//     (active tint, top indicator, focused bg, ripple, inactive tint) —
//     theme-aware na sa light/dark.

LogBox.ignoreLogs([
    'The app is running using the Legacy Architecture',
]);

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS: Record<string, any> = {
    Library: require('../../assets/icons/library.png'),
    Scan: require('../../assets/icons/scan.png'),
    Profile: require('../../assets/icons/profile.png'),
};

const TabBarButton = ({
    children,
    onPress,
    onLongPress,
    accessibilityState,
    accessibilityLabel,
    testID,
}: any) => {
    const { colors: T } = useTheme();
    const focused = Boolean(accessibilityState?.selected);

    return (
        <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="button"
            accessibilityState={accessibilityState}
            accessibilityLabel={accessibilityLabel}
            testID={testID}
            android_ripple={{
                color: T.brandSoft,
                borderless: false,
            }}
            style={({ pressed }) => [
                styles.tabButton,
                focused && { backgroundColor: T.brandSoft },
                pressed && styles.tabButtonPressed,
            ]}
        >
            {focused && <View style={[styles.activeIndicator, { backgroundColor: T.brand }]} />}
            {children}
        </Pressable>
    );
};

function MainTabs() {
    const { colors: T, isDarkMode } = useTheme();

    return (
        <Tab.Navigator
            initialRouteName="Scan"
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarHideOnKeyboard: true,
                tabBarShowLabel: true,
                tabBarActiveTintColor: T.brand,
                tabBarInactiveTintColor: T.subText,
                tabBarStyle: [
                    styles.tabBar,
                    {
                        backgroundColor: T.bg,
                        borderTopColor: T.border,
                    },
                ],
                tabBarItemStyle: styles.tabItem,
                tabBarLabelStyle: styles.tabLabel,
                tabBarIconStyle: styles.tabIconSlot,
                tabBarIcon: ({ focused, color }) => (
                    <View
                        style={[
                            styles.iconContainer,
                            focused && { backgroundColor: T.brandSoft },
                        ]}
                    >
                        <Image
                            source={TAB_ICONS[route.name]}
                            style={[
                                styles.tabIcon,
                                {
                                    tintColor: color,
                                    opacity: focused ? 1 : 0.82,
                                },
                            ]}
                            resizeMode="contain"
                        />
                    </View>
                ),
                tabBarButton: (props) => (
                    <TabBarButton {...props} />
                ),
            })}
        >
            <Tab.Screen
                name="Library"
                component={LibraryScreen}
                options={{ tabBarLabel: 'Library' }}
            />
            <Tab.Screen
                name="Scan"
                component={ScanScreen}
                options={{ tabBarLabel: 'Scanner' }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{ tabBarLabel: 'Profile' }}
            />
        </Tab.Navigator>
    );
}

function NavigationContent() {
    const { colors: T, isDarkMode } = useTheme();
    const [startupPhase, setStartupPhase] = useState<'loading' | 'ready' | 'error'>('loading');
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const runStartup = useCallback(async () => {
        if (mountedRef.current) setStartupPhase('loading');
        try {
            await migrateLegacyDataToGuest();
            await waitForScanHistoryWrites();
            if (mountedRef.current) setStartupPhase('ready');
        } catch (error) {
            console.warn('[Startup] Unable to prepare local data', error);
            if (mountedRef.current) setStartupPhase('error');
        }
    }, []);

    useEffect(() => {
        void runStartup();
    }, [runStartup]);

    if (startupPhase === 'loading') {
        return (
            <View style={[styles.prepare, { backgroundColor: T.bg }]}>
                <Text style={[styles.prepareEyebrow, { color: T.brand }]}>LEX-SIMPLE</Text>
                <View style={[styles.prepareIconBox, { backgroundColor: T.card, borderColor: T.ink }]}>
                    <ActivityIndicator color={T.brand} size="small" />
                </View>
                <Text style={[styles.prepareText, { color: T.text }]}>
                    Inihahanda ang saved scans…
                </Text>
            </View>
        );
    }
    if (startupPhase === 'error') {
        return (
            <View style={[styles.prepare, { backgroundColor: T.bg }]}>
                <View style={[styles.prepareIconBox, { backgroundColor: T.card, borderColor: T.ink }]}>
                    <Ionicons name="alert-circle-outline" size={26} color={T.danger} />
                </View>
                <Text style={[styles.prepareText, { color: T.text }]}>
                    Hindi mabuksan ang session o local data. Nananatili ang saved scans.
                </Text>
                <TouchableOpacity
                    style={[styles.retryButton, { borderColor: T.ink }]}
                    onPress={() => void runStartup()}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                >
                    <Text style={[styles.retryText, { color: T.text }]}>Subukan muli</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;
    const navigationTheme = {
        ...baseTheme,
        colors: {
            ...baseTheme.colors,
            primary: T.brand,
            background: T.bg,
            card: T.bg,
            text: T.text,
            border: T.border,
        },
    };

    return (
        <BackgroundProcessProvider>
            <NavigationContainer
                ref={navigationRef}
                theme={navigationTheme}
            >
                <FloatingProcessIndicator />
                <Stack.Navigator
                    initialRouteName="Main"
                    screenOptions={{ headerShown: false }}
                >
                    <Stack.Screen name="Main" component={MainTabs} />
                    <Stack.Screen name="ScannerScreen" component={ScannerScreen} />
                    <Stack.Screen name="ResultScreen" component={ResultScreen} />
                    <Stack.Screen name="DictionaryDetailScreen" component={DictionaryDetailScreen} />
                    <Stack.Screen name="ConvertScreen" component={ConvertScreen} />
                    <Stack.Screen name="AskAiScreen" component={AskAiScreen} />
                    <Stack.Screen name="UploadImageScreen" component={UploadImageScreen} />
                    <Stack.Screen name="OfflineDetailScreen" component={OfflineDetailScreen} />
                    <Stack.Screen name="AboutScreen" component={AboutScreen} />
                    <Stack.Screen name="LegalAidScreen" component={LegalAidScreen} />
                    <Stack.Screen name="SanitizedOcrScreen" component={SanitizedOcrScreen} />
                    <Stack.Screen name="BatchEditScreen" component={BatchEditScreen} />
                </Stack.Navigator>
            </NavigationContainer>
        </BackgroundProcessProvider>
    );
}

export default function AppNavigator() {
    return (
        <ThemeProvider>
            <NavigationContent />
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    prepare: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    prepareEyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 2.5, marginBottom: 22 },
    prepareIconBox: { width: 56, height: 56, borderWidth: BORDER.thin, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    prepareText: { fontSize: 13, lineHeight: 19, fontWeight: '700', textAlign: 'center', maxWidth: 280 },
    retryButton: { minHeight: 44, marginTop: 18, borderWidth: BORDER.thin, borderRadius: RADIUS.md, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
    retryText: { fontSize: 13, fontWeight: '800' },
    tabBar: {
        height: 64,
        paddingTop: 5,
        paddingBottom: 5,
        paddingHorizontal: 8,
        borderTopWidth: 1,
        elevation: 0,
        shadowOpacity: 0,
    },
    tabItem: {
        paddingHorizontal: 4,
    },
    tabButton: {
        flex: 1,
        minHeight: 52,
        marginHorizontal: 3,
        borderRadius: RADIUS.md,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    tabButtonPressed: {
        opacity: 0.72,
    },
    activeIndicator: {
        position: 'absolute',
        top: 0,
        width: 28,
        height: 3,
        borderRadius: 1,
    },
    iconContainer: {
        width: 32,
        height: 28,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabIcon: {
        width: 22,
        height: 22,
    },
    tabIconSlot: {
        marginTop: 0,
        marginBottom: 0,
    },
    tabLabel: {
        marginTop: 1,
        marginBottom: 0,
        fontSize: 11,
        lineHeight: 14,
        fontWeight: '700',
        letterSpacing: 0.15,
    },
});