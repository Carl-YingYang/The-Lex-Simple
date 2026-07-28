import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { globalStyles, COLORS } from '../../../theme/globalStyles';

// 💡 GINAMIT NA NATIN ANG SCREEN LAYOUT PARA PANTAY ANG APP BAR SA IBANG SCREENS!
import ScreenLayout from '../../../components/ScreenLayout';

export default function AboutScreen() {
  return (
    <ScreenLayout title="App Information" noPadding={true}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={globalStyles.about_scrollContent}
      >
        <View style={globalStyles.about_logoContainer}>
          <Ionicons name="library" size={60} color={COLORS.primaryLight} />
          <Text style={globalStyles.about_appName}>Lex-Simple</Text>
          <Text style={globalStyles.about_appVersion}>VERSION 1.0.0</Text>
        </View>

        <Text style={globalStyles.about_sectionTitle}>THE MISSION</Text>
        <View style={globalStyles.about_card}>
          <Text style={globalStyles.about_text}>
            In the Philippines, a significant "Linguistic Divide" exists. Legal contracts like micro-loans, rentals, and employment agreements are written in high-level technical English, while ordinary consumers communicate in Filipino.
            {'\n\n'}
            Lex-Simple bridges this gap by acting as a Hybrid OCR and RAG-Integrated Legal Assistant. It extracts text from physical contracts and simplifies complex legal stipulations into conversational Taglish, empowering users to understand what they are signing.
          </Text>
        </View>

        <Text style={globalStyles.about_sectionTitle}>KEY FEATURES</Text>
        <View style={globalStyles.about_card}>
          <View style={globalStyles.about_featureRow}>
            <Ionicons name="scan" size={20} color={COLORS.primaryLight} style={globalStyles.about_featureIcon} />
            <Text style={globalStyles.about_featureText}>Offline-First OCR Document Scanner</Text>
          </View>
          <View style={globalStyles.about_featureRow}>
            <Ionicons name="language" size={20} color={COLORS.primaryLight} style={globalStyles.about_featureIcon} />
            <Text style={globalStyles.about_featureText}>Context-Aware Taglish Simplification</Text>
          </View>
          <View style={globalStyles.about_featureRow}>
            <Ionicons name="warning" size={20} color={COLORS.warning} style={globalStyles.about_featureIcon} />
            <Text style={globalStyles.about_featureText}>Complex Clause & Risk Highlighting</Text>
          </View>
          <View style={[globalStyles.about_featureRow, { marginBottom: 0 }]}>
            <Ionicons name="book" size={20} color={COLORS.success} style={globalStyles.about_featureIcon} />
            <Text style={globalStyles.about_featureText}>Offline Philippine Law Dictionary</Text>
          </View>
        </View>

        <Text style={globalStyles.about_sectionTitle}>DEVELOPERS</Text>
        <View style={globalStyles.about_card}>
          <Text style={globalStyles.about_devName}>Carl Micky T. Nieva</Text>
          <Text style={globalStyles.about_devRole}>Lead Developer / AI Engineer</Text>
          
          <View style={globalStyles.about_divider} />
          
          <Text style={globalStyles.about_devName}>Gabriel Ace P. Casera</Text>
          <Text style={globalStyles.about_devRole}>Co-Developer / Researcher</Text>
        </View>

        <Text style={globalStyles.about_disclaimerText}>
          Disclaimer: Lex-Simple is an educational literacy tool and not a substitute for professional legal counsel. It does not provide definitive legal judgments.
        </Text>
      </ScrollView>
    </ScreenLayout>
  );
}