import React, { useRef, useEffect } from 'react';
import { Animated, TouchableWithoutFeedback, View, StyleSheet, LogBox } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { BackgroundProcessProvider } from '../context/BackgroundProcessContext';
import FloatingProcessIndicator from '../components/FloatingProcessIndicator';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
// 🚀 IMPORT ROOT NAVIGATION
import { navigationRef } from './RootNavigation';

LogBox.ignoreLogs(['The app is running using the Legacy Architecture']);

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

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabBarButton = ({ children, onPress, accessibilityState }: any) => {
  const focused = accessibilityState?.selected;
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (focused) Animated.spring(translateY, { toValue: -6, useNativeDriver: true, friction: 5, tension: 40 }).start();
    else Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 5, tension: 40 }).start();
  }, [focused]);
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <Animated.View style={[styles.tabButton, { transform: [{ translateY }] }]}>{children}</Animated.View>
    </TouchableWithoutFeedback>
  );
};

function MainTabs() {
  const { colors, isDarkMode } = useTheme();
  return (
    <Tab.Navigator initialRouteName="Scan" screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, height: 70, paddingBottom: 8, paddingTop: 8, elevation: 0, shadowOpacity: 0 },
      tabBarShowLabel: true,
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
      tabBarActiveTintColor: '#A78BFA',
      tabBarInactiveTintColor: isDarkMode ? '#64748b' : '#8E8E93',
      tabBarIcon: ({ focused, color }) => {
        let iconName: any;
        if (route.name === 'Library') iconName = focused ? 'book' : 'book-outline';
        else if (route.name === 'Scan') iconName = focused ? 'scan' : 'scan-outline';
        else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
        return <Ionicons name={iconName} size={28} color={color} />;
      },
      tabBarButton: (props) => <TabBarButton {...props} />,
    })}>
      <Tab.Screen name="Library" component={LibraryScreen} options={{ tabBarLabel: 'Library' }} />
      <Tab.Screen name="Scan" component={ScanScreen} options={{ tabBarLabel: 'Scanner' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <ThemeProvider>
      <BackgroundProcessProvider>
        {/* 🚀 ILAGAY ANG navigationRef DITO */}
        <NavigationContainer ref={navigationRef} theme={DarkTheme}>
          <FloatingProcessIndicator />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
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
          </Stack.Navigator>
        </NavigationContainer>
      </BackgroundProcessProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ tabButton: { flex: 1, justifyContent: 'center', alignItems: 'center' } });