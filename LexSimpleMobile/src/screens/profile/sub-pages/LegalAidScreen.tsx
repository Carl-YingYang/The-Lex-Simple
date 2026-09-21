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
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

// LEGAL AID SCREEN VERSION: 3.0.0

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
        headers: { 'ngrok-skip-browser-warning': 'true' },
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
        <View style={[styles.readerHeading, { backgroundColor: 'rgba(167, 139, 250, 0.1)', borderColor: 'rgba(167, 139, 250, 0.25)' }]}> 
          <Text style={styles.readerHeadingText}>{currentLine}</Text>
        </View>
      );
    }

    const bulletMatch = currentLine.match(/^(•|\-|\d+\.|[A-Z]\.\s|o\s)(.*)$/);
    if (bulletMatch) {
      const marker = bulletMatch[1];
      const bulletCopy = bulletMatch[2].trim();

      return (
        <View style={styles.bulletRow}>
          <View style={[styles.bulletMarker, { backgroundColor: T.bg, borderColor: T.border }]}> 
            <Text style={[styles.bulletMarkerText, { color: COLORS.primaryLight }]}> 
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
          <View style={[styles.labelValueBox, { backgroundColor: T.bg, borderColor: T.border }]}> 
            <Text style={styles.labelText}>{label}</Text>
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
            style={[styles.readerBackButton, { backgroundColor: T.card, borderColor: T.border }]}
            onPress={closeGuide}
            activeOpacity={0.72}
            accessibilityRole="button"
            accessibilityLabel="Back to legal assistance guides"
          >
            <Ionicons name="chevron-back" size={20} color={T.text} />
          </TouchableOpacity>
          <View style={styles.readerHeaderCopy}>
            <Text style={[styles.readerEyebrow, { color: COLORS.primaryLight }]}>LEGAL ASSISTANCE GUIDE</Text>
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
            <View style={[styles.readerIntro, { backgroundColor: T.card, borderColor: T.border }]}> 
              <Ionicons name="reader-outline" size={18} color={COLORS.primaryLight} />
              <Text style={[styles.readerIntroText, { color: T.subText }]}>Review the requirements and process carefully. Confirm current details with the organization before visiting.</Text>
            </View>
          )}
          ListFooterComponent={(
            <View style={[styles.readerDisclaimer, { backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.28)' }]}> 
              <Ionicons name="shield-outline" size={17} color={COLORS.warning} />
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
          <View style={[styles.loadingIconBox, { backgroundColor: T.card, borderColor: T.border }]}> 
            <ActivityIndicator size="small" color={COLORS.primaryLight} />
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
        <View style={[styles.heroCard, { backgroundColor: T.card, borderColor: T.border }]}> 
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: COLORS.primaryLight }]}>LEGAL HELP DIRECTORY</Text>
              <Text style={[styles.heroTitle, { color: T.text }]}>Find the right next step</Text>
              <Text style={[styles.heroDescription, { color: T.subText }]}>Read practical guides for free legal aid, consultation, and private legal assistance.</Text>
            </View>
            <View style={styles.heroIconBox}>
              <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.primaryLight} />
            </View>
          </View>

          <View style={[styles.syncRow, { borderTopColor: T.border }]}> 
            <View style={styles.offlineStatus}>
              <View style={styles.statusDot} />
              <Text style={[styles.statusText, { color: T.subText }]}>{guideCountLabel}</Text>
            </View>
            <TouchableOpacity
              style={[styles.syncButton, isSyncing && styles.disabledButton]}
              onPress={() => syncGuides(true)}
              disabled={isSyncing}
              activeOpacity={0.76}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.syncButtonText}>Update guides</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoNotice}>
          <Ionicons name="information-circle-outline" size={17} color={COLORS.primaryLight} />
          <Text style={[styles.infoNoticeText, { color: T.subText }]}>Saved guides remain readable without internet. Contact details and requirements may change, so update when connected.</Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: T.subText }]}>SERVICES & GUIDES</Text>
          <View style={[styles.sectionLine, { backgroundColor: T.border }]} />
        </View>

        {guides.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: T.card, borderColor: T.border }]}> 
            <View style={[styles.emptyIconBox, { backgroundColor: T.bg, borderColor: T.border }]}> 
              <Ionicons name="document-text-outline" size={25} color={T.subText} />
            </View>
            <Text style={[styles.emptyTitle, { color: T.text }]}>No guides saved yet</Text>
            <Text style={[styles.emptyDescription, { color: T.subText }]}>Connect to the internet and download the latest legal-assistance guides.</Text>
            <TouchableOpacity style={[styles.emptyButton, isSyncing && styles.disabledButton]} onPress={() => syncGuides(true)} disabled={isSyncing}>
              {isSyncing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.emptyButtonText}>Download guides</Text>}
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {guides.map((guide, index) => (
              <TouchableOpacity
                key={String(guide.id ?? `${guide.title}-${index}`)}
                style={[styles.guideCard, { backgroundColor: T.card, borderColor: T.border }]}
                activeOpacity={0.72}
                onPress={() => openGuide(guide)}
                accessibilityRole="button"
                accessibilityLabel={`Read ${guide.title}`}
              >
                <View style={styles.guideIconBox}>
                  <Ionicons name="briefcase-outline" size={19} color={COLORS.primaryLight} />
                </View>
                <View style={styles.guideCopy}>
                  <View style={styles.guideMetaRow}>
                    <Text style={styles.guideBadge}>{guide.category?.toUpperCase() || 'LEGAL GUIDE'}</Text>
                    <Text style={[styles.offlineBadge, { color: T.subText }]}>OFFLINE</Text>
                  </View>
                  <Text style={[styles.guideTitle, { color: T.text }]} numberOfLines={2}>{guide.title}</Text>
                  <Text style={[styles.guidePreview, { color: T.subText }]} numberOfLines={2}>{getGuidePreview(guide.content)}</Text>
                </View>
                <View style={[styles.chevronBox, { backgroundColor: T.bg, borderColor: T.border }]}> 
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
  loadingIconBox: { width: 52, height: 52, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  loadingTitle: { fontSize: 15, lineHeight: 20, fontWeight: '900', marginBottom: 4 },
  loadingSubtitle: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  heroCard: { borderRadius: 8, borderWidth: 1, padding: 15, marginBottom: 12 },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  heroEyebrow: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.8, marginBottom: 5 },
  heroTitle: { fontSize: 19, lineHeight: 23, fontWeight: '900', marginBottom: 5 },
  heroDescription: { fontSize: 11, lineHeight: 17, maxWidth: 255 },
  heroIconBox: { width: 54, height: 54, borderRadius: 8, backgroundColor: 'rgba(167, 139, 250, 0.12)', borderWidth: 1, borderColor: 'rgba(167, 139, 250, 0.25)', alignItems: 'center', justifyContent: 'center' },
  syncRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 14, paddingTop: 12 },
  offlineStatus: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success, marginRight: 7 },
  statusText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  syncButton: { minHeight: 36, minWidth: 126, borderRadius: 6, paddingHorizontal: 11, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  syncButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', marginLeft: 6 },
  disabledButton: { opacity: 0.55 },
  infoNotice: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 3, marginBottom: 22 },
  infoNoticeText: { flex: 1, fontSize: 10, lineHeight: 15, marginLeft: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  sectionTitle: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, marginRight: 10 },
  sectionLine: { flex: 1, height: 1 },
  guideCard: { minHeight: 102, borderRadius: 8, borderWidth: 1, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  guideIconBox: { width: 40, height: 40, borderRadius: 7, backgroundColor: 'rgba(167, 139, 250, 0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  guideCopy: { flex: 1, minWidth: 0, paddingRight: 9 },
  guideMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  guideBadge: { color: COLORS.primaryLight, fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.5, marginRight: 9 },
  offlineBadge: { fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.4 },
  guideTitle: { fontSize: 13, lineHeight: 17, fontWeight: '900', marginBottom: 3 },
  guidePreview: { fontSize: 10, lineHeight: 15 },
  chevronBox: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { borderRadius: 8, borderWidth: 1, padding: 22, alignItems: 'center' },
  emptyIconBox: { width: 52, height: 52, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 14, lineHeight: 18, fontWeight: '900', marginBottom: 5 },
  emptyDescription: { fontSize: 11, lineHeight: 17, textAlign: 'center', maxWidth: 275, marginBottom: 15 },
  emptyButton: { minHeight: 40, minWidth: 142, borderRadius: 6, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  readerScreen: { flex: 1, minHeight: 0 },
  readerHeader: { minHeight: 86, flexShrink: 0, paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 48, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  readerBackButton: { width: 38, height: 38, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  readerHeaderCopy: { flex: 1, minWidth: 0 },
  readerEyebrow: { fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, marginBottom: 3 },
  readerTitle: { fontSize: 15, lineHeight: 19, fontWeight: '900', paddingRight: 8 },
  readerScroll: { flex: 1, minHeight: 0 },
  readerContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 56 },
  readerIntro: { borderRadius: 8, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  readerIntroText: { flex: 1, fontSize: 10, lineHeight: 16, marginLeft: 9 },
  readerSpacer: { height: 7 },
  readerHeading: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9, marginTop: 13, marginBottom: 9 },
  readerHeadingText: { color: COLORS.primaryLight, fontSize: 12, lineHeight: 16, fontWeight: '900' },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
  bulletMarker: { width: 24, minHeight: 24, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 9, marginTop: 1 },
  bulletMarkerText: { fontSize: 10, lineHeight: 13, fontWeight: '900' },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 20 },
  labelValueBox: { borderRadius: 6, borderWidth: 1, padding: 11, marginBottom: 9 },
  labelText: { color: COLORS.primaryLight, fontSize: 10, lineHeight: 14, fontWeight: '900', marginBottom: 4 },
  valueText: { fontSize: 13, lineHeight: 20 },
  normalText: { fontSize: 13, lineHeight: 21, marginBottom: 9 },
  readerDisclaimer: { borderRadius: 8, borderWidth: 1, padding: 12, marginTop: 19, flexDirection: 'row', alignItems: 'flex-start' },
  readerDisclaimerText: { flex: 1, fontSize: 10, lineHeight: 16, marginLeft: 8 },
});
