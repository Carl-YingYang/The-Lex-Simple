import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../theme/globalStyles';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message = "Loading..." }: LoadingSpinnerProps) {
  return (
    <View style={styles.centerMessage}>
      <ActivityIndicator size="large" color={COLORS.primaryLight} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerMessage: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  loadingText: { marginTop: 15, color: COLORS.textMuted, fontWeight: 'bold', fontSize: 14, letterSpacing: 0.5 },
});