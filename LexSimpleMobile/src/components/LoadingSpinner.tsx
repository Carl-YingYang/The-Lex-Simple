import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  const { isDarkMode, colors: T } = useTheme();

  return (
    <View style={[styles.centerMessage, { backgroundColor: T.bg }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <ActivityIndicator size="large" color={COLORS.primaryLight} />
      <Text style={[styles.loadingText, { color: T.subText }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerMessage: {
    flex: 1,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 15,
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5
  },
});