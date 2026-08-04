import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

interface ProcessingLoaderProps {
  title?: string;
  messages?: string[];
  onMinimize?: () => void;
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
  onMinimize
}: ProcessingLoaderProps) {
  const { colors: T } = useTheme();
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        const increment = Math.random() * 4 + 1;
        return Math.min(prev + increment, 90);
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);

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

        <Text style={[uiStyles.percentageText, { color: COLORS.primaryLight }]}>
          {Math.round(progress)}%
        </Text>

        <Text style={[uiStyles.subtitle, { color: T.subText }]}>{messages[step]}</Text>

        <View style={[uiStyles.progressBarBg, { backgroundColor: T.bg }]}>
          <View style={[uiStyles.progressBarFill, { width: `${progress}%` }]} />
        </View>

        {onMinimize && (
          <TouchableOpacity style={uiStyles.minimizeBtn} onPress={onMinimize}>
            <Ionicons name="arrow-down-circle-outline" size={16} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
            <Text style={uiStyles.minimizeBtnText}>Run in Background</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const uiStyles = StyleSheet.create({
  processingCard: {
    width: '100%',
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  pulseContainer: {
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  percentageText: {
    fontSize: 40,
    fontWeight: '900',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    height: 20,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 3,
  },
  minimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 25,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    backgroundColor: 'rgba(167, 139, 250, 0.05)'
  },
  minimizeBtnText: {
    color: COLORS.primaryLight,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  }
});