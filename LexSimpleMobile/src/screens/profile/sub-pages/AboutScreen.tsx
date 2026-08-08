import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useTheme } from '../../../theme/ThemeContext';

export default function AboutScreen() {
  const { colors: T } = useTheme();

  return (
    <ScreenLayout title="App Information" noPadding={true}>
      <ScrollView
        style={{ backgroundColor: T.bg }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* LOGO SECTION */}
        <View style={uiStyles.logoContainer}>
          <View style={[uiStyles.logoCircle, { backgroundColor: 'rgba(167, 139, 250, 0.1)' }]}>
            <Ionicons name="library" size={48} color={COLORS.primaryLight} />
          </View>
          <Text style={[uiStyles.appName, { color: T.text }]}>Lex-Simple</Text>
          <Text style={uiStyles.appVersion}>VERSION 1.0.0</Text>
        </View>

        {/* MISSION */}
        <Text style={[uiStyles.sectionTitle, { color: T.subText }]}>THE MISSION</Text>
        <View style={[uiStyles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[uiStyles.cardText, { color: T.text }]}>
            In the Philippines, a significant "Linguistic Divide" exists. Legal contracts like micro-loans, rentals, and employment agreements are written in high-level technical English, while ordinary consumers communicate in Filipino.
            {'\n\n'}
            Lex-Simple bridges this gap by acting as a Hybrid OCR and RAG-Integrated Legal Assistant. It extracts text from physical contracts and simplifies complex legal stipulations into conversational Taglish, empowering users to understand what they are signing.
          </Text>
        </View>

        {/* FEATURES */}
        <Text style={[uiStyles.sectionTitle, { color: T.subText }]}>KEY FEATURES</Text>
        <View style={[uiStyles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={uiStyles.featureRow}>
            <Ionicons name="scan" size={20} color={COLORS.primaryLight} style={uiStyles.featureIcon} />
            <Text style={[uiStyles.featureText, { color: T.text }]}>Offline-First OCR Document Scanner</Text>
          </View>
          <View style={uiStyles.featureRow}>
            <Ionicons name="language" size={20} color={COLORS.primaryLight} style={uiStyles.featureIcon} />
            <Text style={[uiStyles.featureText, { color: T.text }]}>Context-Aware Taglish Simplification</Text>
          </View>
          <View style={uiStyles.featureRow}>
            <Ionicons name="warning" size={20} color={COLORS.warning} style={uiStyles.featureIcon} />
            <Text style={[uiStyles.featureText, { color: T.text }]}>Complex Clause & Risk Highlighting</Text>
          </View>
          <View style={[uiStyles.featureRow, { marginBottom: 0 }]}>
            <Ionicons name="book" size={20} color={COLORS.success} style={uiStyles.featureIcon} />
            <Text style={[uiStyles.featureText, { color: T.text }]}>Offline Philippine Law Dictionary</Text>
          </View>
        </View>

        {/* DEVELOPERS */}
        <Text style={[uiStyles.sectionTitle, { color: T.subText }]}>DEVELOPERS</Text>
        <View style={[uiStyles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <Text style={[uiStyles.devName, { color: T.text }]}>Carl Micky T. Nieva</Text>
          <Text style={[uiStyles.devRole, { color: T.subText }]}>Lead Developer / AI Engineer</Text>

          <View style={[uiStyles.divider, { backgroundColor: T.border }]} />

          <Text style={[uiStyles.devName, { color: T.text }]}>Gabriel Ace P. Casera</Text>
          <Text style={[uiStyles.devRole, { color: T.subText }]}>Co-Developer / Researcher</Text>
        </View>

        {/* DISCLAIMER */}
        <Text style={[uiStyles.disclaimerText, { color: T.subText }]}>
          Disclaimer: Lex-Simple is an educational literacy tool and not a substitute for professional legal counsel. It does not provide definitive legal judgments.
        </Text>
      </ScrollView>
    </ScreenLayout>
  );
}

const uiStyles = StyleSheet.create({
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 20, // Sleek rounded square
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primaryLight,
    letterSpacing: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    marginLeft: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  card: {
    borderRadius: 10, // Sharp corner
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
  },
  cardText: {
    fontSize: 14,
    lineHeight: 22,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  featureIcon: {
    marginRight: 12,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
  },
  devName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  devRole: {
    fontSize: 13,
    marginTop: 4,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  disclaimerText: {
    fontSize: 12,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 10,
    paddingHorizontal: 20,
    lineHeight: 18,
  }
});