import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// 🛠️ Gagamitin natin yung mismong global styles mo!
import { globalStyles, COLORS } from '../theme/globalStyles';

interface ProcessingLoaderProps {
  title?: string;
  messages?: string[];
}

export default function ProcessingLoader({
  title = "Analyzing Document",
  messages = [
    "Reading document text...",
    "Connecting to Lex-Simple AI...",   
    "Analyzing legal terms...",       
    "Simplifying for you...",  
    "Finalizing report..."
  ]
}: ProcessingLoaderProps) {
  const [step, setStep] = useState(0);

  // 💡 Naka-encapsulate na dito yung logic ng nag-iibang text para hindi kalat sa main screen!
  useEffect(() => {
    const interval = setInterval(() => {
      setStep((prev) => (prev + 1) % messages.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [messages]);

  return (
    <View style={globalStyles.analysisContainer}>
      <View style={globalStyles.processingCard}>
          <View style={globalStyles.pulseContainer}>
              <Ionicons name="sparkles" size={40} color={COLORS.primaryLight} />
          </View>
          <Text style={globalStyles.analysisTitle}>{title}</Text>
          <Text style={globalStyles.analysisSubtitle}>{messages[step]}</Text>
          
          <View style={globalStyles.progressBarBg}>
              <View style={[globalStyles.progressBarFill, { width: `${(step + 1) * (100 / messages.length)}%` }]} />
          </View>
      </View>
    </View>
  );
}