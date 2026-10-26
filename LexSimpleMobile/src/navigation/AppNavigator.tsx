import React from 'react';
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

import { BackgroundProcessProvider } from '../context/BackgroundProcessContext';
import FloatingProcessIndicator from '../components/FloatingProcessIndicator';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
import { navigationRef } from './RootNavigation';
import { getLocalOwner } from '../services/localDataScope';
import { AuthProvider, useAuth } from '../context/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';

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

// APP NAVIGATOR VERSION: 2.0.0

LogBox.ignoreLogs([
    'The app is running using the Legacy Architecture',
]);

const ACTIVE_COLOR = '#7C6CFF';
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
                color: 'rgba(124, 108, 255, 0.12)',
                borderless: false,
            }}
            style={({ pressed }) => [
                styles.tabButton,
                focused && styles.tabButtonFocused,
                pressed && styles.tabButtonPressed,
            ]}
        >
            {focused && <View style={styles.activeIndicator} />}
            {children}
        </Pressable>
    );
};

function MainTabs() {
    const { colors, isDarkMode } = useTheme();

    return (
        <Tab.Navigator
            initialRouteName="Scan"
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarHideOnKeyboard: true,
                tabBarShowLabel: true,
                tabBarActiveTintColor: ACTIVE_COLOR,
                tabBarInactiveTintColor: isDarkMode
                    ? '#7E8797'
                    : '#747883',
                tabBarStyle: [
                    styles.tabBar,
                    {
                        backgroundColor: colors.bg,
                        borderTopColor: colors.border,
                    },
                ],
                tabBarItemStyle: styles.tabItem,
                tabBarLabelStyle: styles.tabLabel,
                tabBarIconStyle: styles.tabIconSlot,
                tabBarIcon: ({ focused, color }) => (
                    <View
                        style={[
                            styles.iconContainer,
                            focused && styles.iconContainerFocused,
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
    const { phase, retry } = useAuth();
    const { colors, isDarkMode } = useTheme();
    if (phase === 'loading') {
        return <View style={styles.prepare}><ActivityIndicator color={ACTIVE_COLOR} />
            <Text style={styles.prepareText}>Inihahanda ang account at saved scans…</Text></View>;
    }
    if (phase === 'error') {
        return <View style={styles.prepare}><Text style={styles.prepareText}>Hindi mabuksan ang session o local data. Nananatili ang saved scans.</Text>
            <TouchableOpacity onPress={() => void retry().catch(() => undefined)}><Text style={styles.retry}>Subukan muli</Text></TouchableOpacity></View>;
    }
    if (phase === 'login' || phase === 'recovery') return <LoginScreen />;
    const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;
    const navigationTheme = {
        ...baseTheme,
        colors: {
            ...baseTheme.colors,
            primary: ACTIVE_COLOR,
            background: colors.bg,
            card: colors.bg,
            text: colors.text,
            border: colors.border,
        },
    };

    return (
        <BackgroundProcessProvider>
            <NavigationContainer
                key={getLocalOwner()}
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
        <AuthProvider>
            <ThemeProvider>
                <NavigationContent />
            </ThemeProvider>
        </AuthProvider>
    );
}

const styles = StyleSheet.create({
    prepare: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#F8F8FD' },
    prepareText: { marginTop: 12, color: '#444', textAlign: 'center' },
    retry: { color: ACTIVE_COLOR, fontWeight: '700', marginTop: 16 },
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
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    tabButtonFocused: {
        backgroundColor: 'rgba(124, 108, 255, 0.08)',
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
        backgroundColor: ACTIVE_COLOR,
    },
    iconContainer: {
        width: 32,
        height: 28,
        borderRadius: 5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainerFocused: {
        backgroundColor: 'rgba(124, 108, 255, 0.10)',
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