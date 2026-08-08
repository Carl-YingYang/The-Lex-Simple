import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';
import { useBackgroundProcess } from '../context/BackgroundProcessContext';

interface ProcessingLoaderProps {
  title?: string;
  messages?: string[];
  onMinimize?: () => void;
  onCancel?: () => void;
}

export default function ProcessingLoader({
  title = "Analyzing Document",
  messages = [
    "Reading document text...",
    "Connecting to Lex-Simple AI...",
    "Analyzing legal terms...",
    "Simplifying for you...",
    "Finalizing report..."
  ],
  onMinimize,
  onCancel
}: ProcessingLoaderProps) {
  const { colors: T } = useTheme();
  const { progress } = useBackgroundProcess(); // 🚀 KUNIN ANG PROGRESS SA CONTEXT
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [step, setStep] = React.useState(0);

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setStep(prev => (prev + 1) % messages.length);
    }, 2000);
    return () => clearInterval(messageInterval);
  }, [messages]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: T.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
      <View style={[uiStyles.processingCard, { backgroundColor: T.card, borderColor: T.border }]}>
        <Animated.View style={[uiStyles.pulseContainer, { backgroundColor: 'rgba(167, 139, 250, 0.1)', transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="sparkles" size={32} color={COLORS.primaryLight} />
        </Animated.View>

        <Text style={[uiStyles.title, { color: T.text }]}>{title}</Text>
        <Text style={[uiStyles.percentageText, { color: COLORS.primaryLight }]}>{Math.round(progress)}%</Text>
        <Text style={[uiStyles.subtitle, { color: T.subText }]}>{messages[step]}</Text>

        <View style={[uiStyles.progressBarBg, { backgroundColor: T.bg }]}>
          <View style={[uiStyles.progressBarFill, { width: `${progress}%` }]} />
        </View>

        <View style={uiStyles.actionsRow}>
          {onMinimize && (
            <TouchableOpacity style={[uiStyles.minimizeBtn, { borderColor: COLORS.primaryLight }]} onPress={onMinimize}>
              <Ionicons name="arrow-down-circle-outline" size={16} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
              <Text style={[uiStyles.minimizeBtnText, { color: COLORS.primaryLight }]}>Background</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity style={[uiStyles.cancelBtn, { borderColor: COLORS.danger }]} onPress={onCancel}>
              <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={[uiStyles.minimizeBtnText, { color: COLORS.danger }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const uiStyles = StyleSheet.create({
  processingCard: { width: '100%', borderRadius: 12, padding: 30, alignItems: 'center', borderWidth: 1, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  pulseContainer: { padding: 20, borderRadius: 12, marginBottom: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  percentageText: { fontSize: 40, fontWeight: '900', marginBottom: 8 },
  subtitle: { fontSize: 13, textAlign: 'center', marginBottom: 20, height: 20 },
  progressBarBg: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.primaryLight, borderRadius: 3 },
  actionsRow: { flexDirection: 'row', marginTop: 25, gap: 10 },
  minimizeBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(167, 139, 250, 0.05)' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(239, 68, 68, 0.05)' },
  minimizeBtnText: { fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 }
});