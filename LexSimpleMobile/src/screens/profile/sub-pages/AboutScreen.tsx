import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useTheme } from '../../../theme/ThemeContext';

// ABOUT SCREEN VERSION: 1.0.0

type FeatureItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBackground: string;
  title: string;
  description: string;
  isLast?: boolean;
};

function FeatureItem({
  icon,
  iconColor,
  iconBackground,
  title,
  description,
  isLast = false,
}: FeatureItemProps) {
  const { colors: T } = useTheme();

  return (
    <View style={[styles.featureItem, !isLast && { borderBottomColor: T.border, borderBottomWidth: 1 }]}> 
      <View style={[styles.featureIconBox, { backgroundColor: iconBackground }]}> 
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.featureCopy}>
        <Text style={[styles.featureTitle, { color: T.text }]}>{title}</Text>
        <Text style={[styles.featureDescription, { color: T.subText }]}>{description}</Text>
      </View>
    </View>
  );
}

type DeveloperItemProps = {
  initials: string;
  name: string;
  role: string;
  description: string;
};

function DeveloperItem({ initials, name, role, description }: DeveloperItemProps) {
  const { colors: T } = useTheme();

  return (
    <View style={[styles.developerCard, { backgroundColor: T.card, borderColor: T.border }]}> 
      <View style={styles.developerAvatar}>
        <Text style={styles.developerInitials}>{initials}</Text>
      </View>
      <View style={styles.developerCopy}>
        <Text style={[styles.developerName, { color: T.text }]}>{name}</Text>
        <Text style={styles.developerRole}>{role}</Text>
        <Text style={[styles.developerDescription, { color: T.subText }]}>{description}</Text>
      </View>
    </View>
  );
}

export default function AboutScreen() {
  const { colors: T } = useTheme();

  return (
    <ScreenLayout title="App Information" noPadding>
      <ScrollView
        testID="about-screen-v1"
        style={[styles.screen, { backgroundColor: T.bg }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: T.card, borderColor: T.border }]}> 
          <View style={styles.logoBox}>
            <Ionicons name="library" size={32} color={COLORS.primaryLight} />
          </View>

          <View style={styles.heroCopy}>
            <Text style={[styles.appName, { color: T.text }]}>Lex-Simple</Text>
            <Text style={[styles.appTagline, { color: T.subText }]}>Understand legal documents in clearer, conversational Taglish.</Text>
            <View style={styles.versionBadge}>
              <View style={styles.versionDot} />
              <Text style={styles.versionText}>VERSION 1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: T.subText }]}>THE MISSION</Text>
          <View style={[styles.sectionLine, { backgroundColor: T.border }]} />
        </View>

        <View style={[styles.missionCard, { backgroundColor: T.card, borderColor: T.border }]}> 
          <View style={styles.missionHeader}>
            <View style={styles.missionIconBox}>
              <Ionicons name="people-outline" size={20} color={COLORS.primaryLight} />
            </View>
            <View style={styles.missionHeaderCopy}>
              <Text style={[styles.missionTitle, { color: T.text }]}>Bridging the legal language gap</Text>
              <Text style={[styles.missionEyebrow, { color: T.subText }]}>BUILT FOR FILIPINO USERS</Text>
            </View>
          </View>

          <Text style={[styles.missionText, { color: T.text }]}>Legal contracts for loans, rentals, and employment are often written in technical English that can be difficult for ordinary consumers to understand.</Text>
          <Text style={[styles.missionText, styles.secondParagraph, { color: T.text }]}>Lex-Simple combines OCR and retrieval-assisted AI to extract contract text, explain complex clauses in conversational Taglish, and help users make more informed decisions before signing.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: T.subText }]}>KEY FEATURES</Text>
          <View style={[styles.sectionLine, { backgroundColor: T.border }]} />
        </View>

        <View style={[styles.featureCard, { backgroundColor: T.card, borderColor: T.border }]}> 
          <FeatureItem
            icon="scan-outline"
            iconColor={COLORS.primaryLight}
            iconBackground="rgba(167, 139, 250, 0.12)"
            title="Offline-first document scanning"
            description="Capture documents and extract readable text directly from your phone."
          />
          <FeatureItem
            icon="language-outline"
            iconColor="#60A5FA"
            iconBackground="rgba(96, 165, 250, 0.12)"
            title="Conversational Taglish explanations"
            description="Simplifies difficult legal wording while preserving the clause's meaning."
          />
          <FeatureItem
            icon="warning-outline"
            iconColor={COLORS.warning}
            iconBackground="rgba(245, 158, 11, 0.12)"
            title="Complex clause and risk highlighting"
            description="Points out unusual or potentially risky terms that deserve attention."
          />
          <FeatureItem
            icon="book-outline"
            iconColor={COLORS.success}
            iconBackground="rgba(16, 185, 129, 0.12)"
            title="Philippine legal dictionary"
            description="Provides quick, plain-language definitions for common legal terms."
            isLast
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: T.subText }]}>DEVELOPERS</Text>
          <View style={[styles.sectionLine, { backgroundColor: T.border }]} />
        </View>

        <DeveloperItem
          initials="CN"
          name="Carl Micky T. Nieva"
          role="Lead Developer / AI Engineer"
          description="Mobile development, OCR and AI integration, system architecture, and user experience."
        />
        <DeveloperItem
          initials="GC"
          name="Gabriel Ace P. Casera"
          role="Co-Developer / Researcher"
          description="Research development, legal-literacy content, documentation, and system evaluation."
        />

        <View style={[styles.disclaimerCard, { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)' }]}> 
          <View style={styles.disclaimerHeader}>
            <Ionicons name="shield-checkmark-outline" size={19} color={COLORS.warning} />
            <Text style={styles.disclaimerTitle}>Educational tool only</Text>
          </View>
          <Text style={[styles.disclaimerText, { color: T.text }]}>Lex-Simple helps users understand legal language. It does not provide definitive legal judgments and is not a substitute for advice from a qualified lawyer.</Text>
        </View>

        <Text style={[styles.footerText, { color: T.subText }]}>Made in the Philippines for clearer legal understanding.</Text>
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 36,
  },
  heroCard: {
    minHeight: 116,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBox: {
    width: 68,
    height: 68,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  appName: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
    marginBottom: 3,
  },
  appTagline: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 9,
    maxWidth: 245,
  },
  versionBadge: {
    alignSelf: 'flex-start',
    minHeight: 24,
    borderRadius: 5,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
  },
  versionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 6,
    backgroundColor: COLORS.primaryLight,
  },
  versionText: {
    color: COLORS.primaryLight,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 9,
  },
  sectionTitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1,
    marginRight: 10,
  },
  sectionLine: {
    flex: 1,
    height: 1,
  },
  missionCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 15,
    marginBottom: 22,
  },
  missionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  missionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 7,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  missionHeaderCopy: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  missionEyebrow: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  missionText: {
    fontSize: 13,
    lineHeight: 21,
  },
  secondParagraph: {
    marginTop: 11,
  },
  featureCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 22,
  },
  featureItem: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginLeft: 12,
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  featureTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    marginBottom: 3,
  },
  featureDescription: {
    fontSize: 10,
    lineHeight: 15,
    maxWidth: 260,
  },
  developerCard: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: 8,
    padding: 13,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  developerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  developerInitials: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  developerCopy: {
    flex: 1,
    minWidth: 0,
  },
  developerName: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    marginBottom: 2,
  },
  developerRole: {
    color: COLORS.primaryLight,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    marginBottom: 5,
  },
  developerDescription: {
    fontSize: 10,
    lineHeight: 15,
    maxWidth: 270,
  },
  disclaimerCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  disclaimerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  disclaimerTitle: {
    color: COLORS.warning,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 7,
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 17,
  },
  footerText: {
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 20,
  },
});
