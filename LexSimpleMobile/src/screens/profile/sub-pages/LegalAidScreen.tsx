import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { getNeoShadow } from '../../../components/Neo';
import { BORDER, RADIUS } from '../../../theme/tokens';
import { getApiIdentityHeaders } from '../../../services/installId';

// LEGAL AID SCREEN VERSION: 4.0.0 — PURPLE NEO-BRUTALISM SPEC
// (Offline legal-guides directory na may built-in reader. UI lang ang
// binago; sync/cache/reader-parsing/navigation logic 1:1 pa rin.)
// Spec: purple system (zero na ang asul/dilaw/gold/orange), 1.5px standard
// borders, 2px lang sa CTA, 2–6px radius (squared), predominantly FLAT —
// hard shadow lang sa primary CTA (focal element).
// Pagbabago sa UI (v4.0.0):
//   - Binura ang COLORS.* at lahat ng hardcoded hex/rgba — tokens lahat
//     (T.brand / T.brandText / T.brandSoft / T.brandDeep + BORDER/RADIUS).
//   - Mga CTA ("Update guides" / "Download guides"): purple fill + ITIM na
//     icon/teksto (spec CTA rule), 2px ink border + hard shadow
//     (getNeoShadow 'sm') — dating puting teksto sa asul, borderless.
//   - Cards/boxes: 1.5px ink outline na (dating 1px hairline), squared
//     3–6px radius (dating 6–8px).
//   - Disclaimer box sa reader: dilaw/amber → lavender (brandSoft) +
//     purple accent — purple lang ang accent sa buong screen.
//   - Reader headings (Step/Requirements): lavender surface + deep purple
//     text (dating translucent purple rgba).
//   - Meta labels (eyebrow/badges): condensed uppercase, weight 800,
//     letterSpacing 0.8.

type LegalGuide = {
  id?: string | number;
  title: string;
  content: string;
  category?: string;
  updatedAt?: string;
};

const GUIDE_FILE_NAME = 'lex_guides_db.json';

export default function LegalAidScreen() {
  const [guides, setGuides] = useState<LegalGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<LegalGuide | null>(null);
  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T, isDarkMode } = useTheme();

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  const localFileUri = FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${GUIDE_FILE_NAME}`
    : null;

  useEffect(() => {
    loadGuidesFromLocalDB();
  }, []);

  useEffect(() => {
    if (!selectedGuide) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedGuide(null);
      return true;
    });

    return () => subscription.remove();
  }, [selectedGuide]);

  const normalizeGuides = (value: unknown): LegalGuide[] => {
    if (!Array.isArray(value)) return [];

    return value.filter((item): item is LegalGuide => (
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as LegalGuide).title === 'string' &&
      typeof (item as LegalGuide).content === 'string'
    ));
  };

  const loadGuidesFromLocalDB = async () => {
    try {
      if (!localFileUri) {
        await syncGuides(false);
        return;
      }

      const fileInfo = await FileSystem.getInfoAsync(localFileUri);

      if (!fileInfo.exists) {
        await syncGuides(false);
        return;
      }

      const fileContent = await FileSystem.readAsStringAsync(localFileUri);
      const localGuides = normalizeGuides(JSON.parse(fileContent));
      setGuides(localGuides);

      if (localGuides.length === 0) {
        await syncGuides(false);
      }
    } catch (error) {
      console.warn('Unable to load legal guides:', error);
      await syncGuides(false);
    } finally {
      setLoading(false);
    }
  };

  const syncGuides = async (showSuccessMessage = true) => {
    if (isSyncing) return;

    setIsSyncing(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${API_BASE_URL}/guides/sync`, {
        method: 'GET',
        headers: {
          ...(await getApiIdentityHeaders()),
        },
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data: any = {};

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error('The server returned an unreadable response.');
        }
      }

      if (!response.ok || data.status !== 'success') {
        throw new Error(data.message || `Server returned status ${response.status}.`);
      }

      const downloadedGuides = normalizeGuides(data.data);
      if (downloadedGuides.length === 0) {
        throw new Error('No valid legal guides were received.');
      }

      if (localFileUri) {
        await FileSystem.writeAsStringAsync(localFileUri, JSON.stringify(downloadedGuides));
      }

      setGuides(downloadedGuides);

      if (showSuccessMessage) {
        showAlert(
          'Guides Updated',
          `${downloadedGuides.length} legal guide${downloadedGuides.length === 1 ? '' : 's'} saved for offline viewing.`,
          'success',
        );
      }
    } catch (error: any) {
      const timedOut = error?.name === 'AbortError';
      showAlert(
        timedOut ? 'Update Timed Out' : 'Offline Mode',
        timedOut
          ? 'The server took too long to respond. Your saved guides are still available.'
          : error?.message || 'Could not connect to the server. Showing available offline guides.',
        'warning',
      );
    } finally {
      clearTimeout(timeoutId);
      setIsSyncing(false);
    }
  };

  const openGuide = (guide: LegalGuide) => {
    setSelectedGuide(guide);
  };

  const closeGuide = () => {
    setSelectedGuide(null);
  };

  const getGuidePreview = (content: string) => {
    const firstUsefulLine = content
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);

    return firstUsefulLine || 'Open this guide to view the complete steps and requirements.';
  };

  const renderFormattedLine = (line: string) => {
    const currentLine = line.trim();
    if (!currentLine) return <View style={styles.readerSpacer} />;

    const isSectionHeading = currentLine.match(
      /^(Step\s+\d+|Official Action|Official Basis|Proseso|Proseso ng Pagsusuri|Consultation Fee|Documentary Requirements|Kahalagahan|Kahaligahan|Sino ang puwede|Sino ang pwede)\s*:?/i,
    );

    if (isSectionHeading) {
      return (
        <View style={[styles.readerHeading, { backgroundColor: T.brandSoft, borderColor: T.ink }]}>
          <Text style={[styles.readerHeadingText, { color: T.brandDeep }]}>{currentLine}</Text>
        </View>
      );
    }

    const bulletMatch = currentLine.match(/^(•|\-|\d+\.|[A-Z]\.\s|o\s)(.*)$/);
    if (bulletMatch) {
      const marker = bulletMatch[1];
      const bulletCopy = bulletMatch[2].trim();

      return (
        <View style={styles.bulletRow}>
          <View style={[styles.bulletMarker, { backgroundColor: T.card, borderColor: T.ink }]}>
            <Text style={[styles.bulletMarkerText, { color: T.brand }]}>
              {marker === '•' || marker === '-' || marker.trim() === 'o' ? '•' : marker.replace('.', '').trim()}
            </Text>
          </View>
          <Text style={[styles.bulletText, { color: T.text }]}>{bulletCopy}</Text>
        </View>
      );
    }

    const colonIndex = currentLine.indexOf(':');
    if (colonIndex > 0 && colonIndex < 40) {
      const label = currentLine.slice(0, colonIndex).trim();
      const value = currentLine.slice(colonIndex + 1).trim();

      if (value) {
        return (
          <View style={[styles.labelValueBox, { backgroundColor: T.bg, borderColor: T.ink }]}>
            <Text style={[styles.labelText, { color: T.brand }]}>{label}</Text>
            <Text style={[styles.valueText, { color: T.text }]}>{value}</Text>
          </View>
        );
      }
    }

    return (
      <Text style={[styles.normalText, { color: T.text }]}>
        {currentLine}
      </Text>
    );
  };

  const guideCountLabel = useMemo(
    () => `${guides.length} offline guide${guides.length === 1 ? '' : 's'}`,
    [guides.length],
  );

  if (selectedGuide) {
    const guideLines = selectedGuide.content.split('\n');

    return (
      <View testID="legal-aid-reader-v3" style={[styles.readerScreen, { backgroundColor: T.bg }]}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={T.bg} />

        <View style={[styles.readerHeader, { backgroundColor: T.bg, borderBottomColor: T.border }]}>
          <TouchableOpacity
            style={[styles.readerBackButton, { backgroundColor: T.card, borderColor: T.ink }]}
            onPress={closeGuide}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Back to legal assistance guides"
          >
            <Ionicons name="chevron-back" size={20} color={T.text} />
          </TouchableOpacity>
          <View style={styles.readerHeaderCopy}>
            <Text style={[styles.readerEyebrow, { color: T.brand }]}>LEGAL ASSISTANCE GUIDE</Text>
            <Text style={[styles.readerTitle, { color: T.text }]} numberOfLines={2}>{selectedGuide.title}</Text>
          </View>
        </View>

        <FlatList
          data={guideLines}
          keyExtractor={(_line, index) => `guide-line-${index}`}
          style={styles.readerScroll}
          contentContainerStyle={styles.readerContent}
          renderItem={({ item }) => renderFormattedLine(item)}
          showsVerticalScrollIndicator
          persistentScrollbar
          nestedScrollEnabled
          keyboardShouldPersistTaps="always"
          overScrollMode="always"
          removeClippedSubviews={false}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
          ListHeaderComponent={(
            <View style={[styles.readerIntro, { backgroundColor: T.card, borderColor: T.ink }]}>
              <Ionicons name="reader-outline" size={18} color={T.brand} />
              <Text style={[styles.readerIntroText, { color: T.subText }]}>Review the requirements and process carefully. Confirm current details with the organization before visiting.</Text>
            </View>
          )}
          ListFooterComponent={(
            <View style={[styles.readerDisclaimer, { backgroundColor: T.brandSoft, borderColor: T.ink }]}>
              <Ionicons name="shield-outline" size={17} color={T.brand} />
              <Text style={[styles.readerDisclaimerText, { color: T.text }]}>This guide provides general information and does not replace professional legal advice.</Text>
            </View>
          )}
        />

        <AlertRender />
      </View>
    );
  }

  if (loading) {
    return (
      <ScreenLayout title="Legal Assistance" noPadding>
        <View style={[styles.loadingContainer, { backgroundColor: T.bg }]}>
          <View style={[styles.loadingIconBox, { backgroundColor: T.card, borderColor: T.ink }]}>
            <ActivityIndicator size="small" color={T.brand} />
          </View>
          <Text style={[styles.loadingTitle, { color: T.text }]}>Loading legal guides</Text>
          <Text style={[styles.loadingSubtitle, { color: T.subText }]}>Checking the guides saved on your device.</Text>
        </View>
        <AlertRender />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Legal Assistance" noPadding>
      <ScrollView
        testID="legal-aid-screen-v3"
        style={[styles.screen, { backgroundColor: T.bg }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        overScrollMode="always"
      >
        <View style={[styles.heroCard, { backgroundColor: T.card, borderColor: T.ink }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: T.brand }]}>LEGAL HELP DIRECTORY</Text>
              <Text style={[styles.heroTitle, { color: T.text }]}>Find the right next step</Text>
              <Text style={[styles.heroDescription, { color: T.subText }]}>Read practical guides for free legal aid, consultation, and private legal assistance.</Text>
            </View>
            <View style={[styles.heroIconBox, { backgroundColor: T.brandSoft, borderColor: T.ink }]}>
              <Ionicons name="shield-checkmark-outline" size={28} color={T.brandDeep} />
            </View>
          </View>

          <View style={[styles.syncRow, { borderTopColor: T.border }]}>
            <View style={styles.offlineStatus}>
              <View style={[styles.statusDot, { backgroundColor: T.brand }]} />
              <Text style={[styles.statusText, { color: T.subText }]}>{guideCountLabel}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.syncButton,
                { backgroundColor: T.brand, borderColor: T.ink },
                getNeoShadow(T, 'sm'),
                isSyncing && styles.disabledButton,
              ]}
              onPress={() => syncGuides(true)}
              disabled={isSyncing}
              activeOpacity={0.76}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={T.brandText} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color={T.brandText} />
                  <Text style={[styles.syncButtonText, { color: T.brandText }]}>Update guides</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoNotice}>
          <Ionicons name="information-circle-outline" size={17} color={T.brand} />
          <Text style={[styles.infoNoticeText, { color: T.subText }]}>Saved guides remain readable without internet. Contact details and requirements may change, so update when connected.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: T.subText }]}>SERVICES & GUIDES</Text>
          <View style={[styles.sectionLine, { backgroundColor: T.border }]} />
        </View>

        {guides.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: T.card, borderColor: T.ink }]}>
            <View style={[styles.emptyIconBox, { backgroundColor: T.bg, borderColor: T.ink }]}>
              <Ionicons name="document-text-outline" size={25} color={T.subText} />
            </View>
            <Text style={[styles.emptyTitle, { color: T.text }]}>No guides saved yet</Text>
            <Text style={[styles.emptyDescription, { color: T.subText }]}>Connect to the internet and download the latest legal-assistance guides.</Text>
            <TouchableOpacity
              style={[
                styles.emptyButton,
                { backgroundColor: T.brand, borderColor: T.ink },
                getNeoShadow(T, 'sm'),
                isSyncing && styles.disabledButton,
              ]}
              onPress={() => syncGuides(true)}
              disabled={isSyncing}
            >
              {isSyncing ? <ActivityIndicator size="small" color={T.brandText} /> : <Text style={[styles.emptyButtonText, { color: T.brandText }]}>Download guides</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {guides.map((guide, index) => (
              <TouchableOpacity
                key={String(guide.id ?? `${guide.title}-${index}`)}
                style={[styles.guideCard, { backgroundColor: T.card, borderColor: T.ink }]}
                activeOpacity={0.72}
                onPress={() => openGuide(guide)}
                accessibilityRole="button"
                accessibilityLabel={`Read ${guide.title}`}
              >
                <View style={[styles.guideIconBox, { backgroundColor: T.brandSoft, borderColor: T.ink }]}>
                  <Ionicons name="briefcase-outline" size={19} color={T.brandDeep} />
                </View>
                <View style={styles.guideCopy}>
                  <View style={styles.guideMetaRow}>
                    <Text style={[styles.guideBadge, { color: T.brand }]}>{guide.category?.toUpperCase() || 'LEGAL GUIDE'}</Text>
                    <Text style={[styles.offlineBadge, { color: T.subText }]}>OFFLINE</Text>
                  </View>
                  <Text style={[styles.guideTitle, { color: T.text }]} numberOfLines={2}>{guide.title}</Text>
                  <Text style={[styles.guidePreview, { color: T.subText }]} numberOfLines={2}>{getGuidePreview(guide.content)}</Text>
                </View>
                <View style={[styles.chevronBox, { backgroundColor: T.bg, borderColor: T.ink }]}>
                  <Ionicons name="chevron-forward" size={15} color={T.subText} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <AlertRender />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 38 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  loadingIconBox: { width: 52, height: 52, borderRadius: RADIUS.lg, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  loadingTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', marginBottom: 4 },
  loadingSubtitle: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  heroCard: { borderRadius: RADIUS.lg, borderWidth: BORDER.thin, padding: 15, marginBottom: 12 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  heroEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  heroTitle: { fontSize: 19, lineHeight: 23, fontWeight: '900', marginBottom: 5 },
  heroDescription: { fontSize: 11, lineHeight: 17, maxWidth: 255 },
  heroIconBox: { width: 54, height: 54, borderRadius: RADIUS.lg, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center' },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  offlineStatus: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  statusDot: { width: 8, height: 8, borderRadius: RADIUS.sm, marginRight: 7 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  syncButton: { minHeight: 36, minWidth: 126, borderRadius: RADIUS.md, borderWidth: BORDER.thick, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  syncButtonText: { fontSize: 10, fontWeight: '900', marginLeft: 6 },
  disabledButton: { opacity: 0.55 },
  infoNotice: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 3, marginBottom: 22 },
  infoNoticeText: { flex: 1, fontSize: 10, lineHeight: 15, marginLeft: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  sectionTitle: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.8, marginRight: 10 },
  sectionLine: { flex: 1, height: 1 },
  guideCard: { minHeight: 102, borderRadius: RADIUS.lg, borderWidth: BORDER.thin, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  guideIconBox: { width: 40, height: 40, borderRadius: RADIUS.md, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  guideCopy: { flex: 1, minWidth: 0, paddingRight: 9 },
  guideMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  guideBadge: { fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.8, marginRight: 9 },
  offlineBadge: { fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.8 },
  guideTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900', marginBottom: 3 },
  guidePreview: { fontSize: 10, lineHeight: 15 },
  chevronBox: { width: 28, height: 28, borderRadius: RADIUS.md, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { borderRadius: RADIUS.lg, borderWidth: BORDER.thin, padding: 22, alignItems: 'center' },
  emptyIconBox: { width: 52, height: 52, borderRadius: RADIUS.lg, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900', marginBottom: 5 },
  emptyDescription: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 275, marginBottom: 15 },
  emptyButton: { minHeight: 40, minWidth: 142, borderRadius: RADIUS.md, borderWidth: BORDER.thick, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  emptyButtonText: { fontSize: 11, fontWeight: '900' },
  readerScreen: { flex: 1, minHeight: 0 },
  readerHeader: { minHeight: 86, flexShrink: 0, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 48, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  readerBackButton: { width: 38, height: 38, borderRadius: RADIUS.md, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  readerHeaderCopy: { flex: 1, minWidth: 0 },
  readerEyebrow: { fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 3 },
  readerTitle: { fontSize: 15, lineHeight: 19, fontWeight: '900', paddingRight: 8 },
  readerScroll: { flex: 1, minHeight: 0 },
  readerContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 56 },
  readerIntro: { borderRadius: RADIUS.lg, borderWidth: BORDER.thin, padding: 12, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  readerIntroText: { flex: 1, fontSize: 10, lineHeight: 16, marginLeft: 9 },
  readerSpacer: { height: 7 },
  readerHeading: { borderRadius: RADIUS.md, borderWidth: BORDER.thin, paddingHorizontal: 11, paddingVertical: 9, marginTop: 13, marginBottom: 9 },
  readerHeadingText: { fontSize: 12, lineHeight: 16, fontWeight: '900' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
  bulletMarker: { width: 24, minHeight: 24, borderRadius: RADIUS.sm, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginRight: 9, marginTop: 1 },
  bulletMarkerText: { fontSize: 10, lineHeight: 13, fontWeight: '900' },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 20 },
  labelValueBox: { borderRadius: RADIUS.md, borderWidth: BORDER.thin, padding: 11, marginBottom: 9 },
  labelText: { fontSize: 10, lineHeight: 14, fontWeight: '900', marginBottom: 4 },
  valueText: { fontSize: 13, lineHeight: 20 },
  normalText: { fontSize: 13, lineHeight: 21, marginBottom: 9 },
  readerDisclaimer: { borderRadius: RADIUS.lg, borderWidth: BORDER.thin, padding: 12, marginTop: 19, flexDirection: 'row', alignItems: 'flex-start' },
  readerDisclaimerText: { flex: 1, fontSize: 10, lineHeight: 16, marginLeft: 8 },
});