import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import ScreenLayout from '../../../components/ScreenLayout';
import { NeoButton, NeoCard, NeoIconButton, NeoSectionHeader, getNeoShadow } from '../../../components/Neo';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';
import { BORDER, RADIUS, SHADOW, SPACING, type ThemeColors } from '../../../theme/tokens';
import { clearLocalData, getLocalOwner, keepProfileImage, localDataKey } from '../../../services/localDataScope';
import { getApiIdentityHeaders, isAnalyticsEnabled, setAnalyticsEnabled } from '../../../services/installId';
import { fetchUsage, formatQuotaResetAt, type UsageStatus } from '../../../services/AiEngine';

// PROFILE SCREEN VERSION: 6.2.0 — PURPLE NEO-BRUTALISM SPEC
// A2/P1: email removed from profile (name = optional nickname), at bagong
// Privacy section: analytics toggle, natitirang scan ngayong araw (GET /usage),
// clear local data, Privacy Policy link, at app version.
// Spec: purple system, 1.5px standard borders, 2px sa CTA/hero,
// 2–6px radius (squared), predominantly FLAT — 2px hard shadow lang
// sa mga focal element (hero card, modals, CTA buttons).

const APP_FEATURES = [
  'General Feedback',
  'Camera Scanner',
  'Gallery Image Upload',
  'Document Converter (PDF/Word)',
  'AI Simplification Results',
  'Ask AI Chat Assistant',
  'Lex-Library (Dictionary)',
  'Scan History / Offline Details',
  'Legal Assistance Guides',
  'Profile & Settings',
  'Other / UI Issues',
];

// PALITAN: ilagay dito ang totoong Privacy Policy URL bago ang release.
const PRIVACY_POLICY_URL = 'https://example.com/lex-simple-privacy-policy';
// I-sync ito sa "version" sa app.json kapag may bagong release.
const APP_VERSION = '1.0.0';

// P1: walang default email at walang default name — opsyonal na lang ang
// palayaw, at hindi na hinihingi ang email sa profile.
const DEFAULT_PROFILE = {
  name: '',
  avatar: null as string | null,
  city: '',
  province: '',
};

/**
 * Hard-shadow press helper ("sink into paper") — para sa mga focal
 * element na may 2px hard shadow (hal. Submit CTA). Flat surfaces
 * ay simple lang dim press.
 */
function makeSink(colors: ThemeColors) {
  return (pressed: boolean, level: 'sm' | 'md' | 'lg'): ViewStyle => {
    if (!pressed) return getNeoShadow(colors, level);
    const offset = SHADOW[level].ios.shadowOffset;
    return {
      elevation: 0,
      transform: [
        { translateX: offset.width },
        { translateY: offset.height },
      ],
    };
  };
}

type MenuItemProps = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function MenuItem({ title, description, icon, onPress }: MenuItemProps) {
  const { colors: T } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      style={styles.menuItemWrapper}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.menuItem,
            { backgroundColor: T.card, borderColor: T.ink },
            pressed ? styles.dimmed : null,
          ]}
        >
          {/* Vivid purple circular badge + itim na outline icon (spec) */}
          <View style={[styles.menuIcon, { backgroundColor: T.brandVivid, borderColor: T.ink }]}>
            <Ionicons name={icon} size={20} color={T.brandText} />
          </View>

          <View style={styles.menuCopy}>
            <Text style={[styles.menuTitle, { color: T.text }]}>{title}</Text>
            <Text style={[styles.menuDescription, { color: T.subText }]} numberOfLines={2}>
              {description}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={16} color={T.text} />
        </View>
      )}
    </Pressable>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const owner = useRef(getLocalOwner()).current;
  const profileKey = localDataKey('profile', owner);
  const scanHistoryKey = localDataKey('scanHistory', owner);
  const [totalScanned, setTotalScanned] = useState(0);
  const [name, setName] = useState(DEFAULT_PROFILE.name);
  const [avatarUri, setAvatarUri] = useState<string | null>(DEFAULT_PROFILE.avatar);
  const [city, setCity] = useState(DEFAULT_PROFILE.city);
  const [province, setProvince] = useState(DEFAULT_PROFILE.province);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editProvince, setEditProvince] = useState('');

  // Privacy section (A2)
  const [analyticsOn, setAnalyticsOn] = useState(true);
  const [usage, setUsage] = useState<UsageStatus | null>(null);

  const [isLocationVisible, setIsLocationVisible] = useState(false);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('Suggestion');
  const [feedbackFeature, setFeedbackFeature] = useState('General Feedback');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackContact, setFeedbackContact] = useState('');

  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T } = useTheme();
  const sink = makeSink(T);
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const hasCustomLocation = Boolean(city.trim() && province.trim());

  const locationLabel = useMemo(
    () => [city.trim(), province.trim()].filter(Boolean).join(', ') || 'Philippines',
    [city, province],
  );

  const mapImageUrl = useMemo(() => {
    if (!GOOGLE_MAPS_API_KEY) return null;
    const query = encodeURIComponent(hasCustomLocation ? `${locationLabel}, Philippines` : 'Philippines');
    const zoom = hasCustomLocation ? 13 : 5;
    const marker = hasCustomLocation ? `&markers=color:0x7C3AED%7C${query}` : '';
    return `https://maps.googleapis.com/maps/api/staticmap?center=${query}&zoom=${zoom}&size=640x320&scale=2&maptype=roadmap${marker}&key=${GOOGLE_MAPS_API_KEY}`;
  }, [GOOGLE_MAPS_API_KEY, hasCustomLocation, locationLabel]);

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
      loadScanStats();
      loadPrivacyInfo();
    }, []),
  );

  const loadScanStats = async () => {
    try {
      const history = await AsyncStorage.getItem(scanHistoryKey);
      if (!history) return setTotalScanned(0);
      const parsed = JSON.parse(history);
      setTotalScanned(Array.isArray(parsed) ? parsed.length : 0);
    } catch (error) {
      console.warn('Unable to load scan stats:', error);
      setTotalScanned(0);
    }
  };

  const loadProfileData = async () => {
    try {
      const profile = await AsyncStorage.getItem(profileKey);
      if (!profile) {
        setName(DEFAULT_PROFILE.name);
        setAvatarUri(null);
        setCity('');
        setProvince('');
        return;
      }
      const parsed = JSON.parse(profile);
      setName(parsed.name || DEFAULT_PROFILE.name);
      setAvatarUri(parsed.avatar || null);
      setCity(parsed.city || DEFAULT_PROFILE.city);
      setProvince(parsed.province || DEFAULT_PROFILE.province);
    } catch (error) {
      console.warn('Unable to load profile:', error);
    }
  };

  const openEditModal = () => {
    setEditName(name);
    setEditCity(city);
    setEditProvince(province);
    setIsEditing(true);
  };

  const saveProfileData = async () => {
    // P1: opsyonal na ang palayaw at wala nang email — location lang ang
    // may validation (parehong puno o parehong blanko).
    const cleanName = editName.trim();
    const cleanCity = editCity.trim();
    const cleanProvince = editProvince.trim();

    if ((cleanCity && !cleanProvince) || (!cleanCity && cleanProvince)) {
      showAlert('Incomplete Location', 'Enter both city and province, or leave both blank to use Philippines.', 'warning');
      return;
    }

    try {
      const nextProfile = {
        name: cleanName,
        avatar: avatarUri,
        city: cleanCity,
        province: cleanProvince,
      };
      await AsyncStorage.setItem(profileKey, JSON.stringify(nextProfile));
      setName(cleanName);
      setCity(cleanCity);
      setProvince(cleanProvince);
      setMapLoadFailed(false);
      setIsEditing(false);
      showAlert('Profile Saved', 'Your profile and location have been updated.', 'success');
    } catch {
      showAlert('Save Error', 'Your profile could not be saved. Please try again.', 'error');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setAvatarUri(keepProfileImage(result.assets[0].uri, owner));
      }
    } catch {
      showAlert('Gallery Error', 'Unable to open your gallery. Please try again.', 'error');
    }
  };

  // --- Privacy section (A2) ---
  const loadPrivacyInfo = async () => {
    try {
      setAnalyticsOn(await isAnalyticsEnabled());
    } catch {
      setAnalyticsOn(true);
    }
    try {
      setUsage(await fetchUsage());
    } catch {
      setUsage(null);
    }
  };

  const toggleAnalytics = async (next: boolean) => {
    setAnalyticsOn(next);
    await setAnalyticsEnabled(next);
    // Task B2: may daily limit pa rin kahit naka-off ang analytics,
    // kaya totoong used/remaining pa rin ang ipinapakita.
    try {
      setUsage(await fetchUsage());
    } catch {
      setUsage(null);
    }
  };

  const clearAllLocalData = async () => {
    try {
      await clearLocalData();
      setTotalScanned(0);
      setName(DEFAULT_PROFILE.name);
      setAvatarUri(null);
      setCity('');
      setProvince('');
      setMapLoadFailed(false);
      showAlert('Na-clear na', 'Burado na ang scan history, chat, at profile sa device na ito.', 'success');
    } catch {
      showAlert('Clear Failed', 'May hindi na-clear. Subukan ulit.', 'error');
    }
  };

  const confirmClearLocalData = () => {
    showAlert(
      'I-clear ang local data?',
      'Buburahin ang scan history, chat history, at profile na naka-save sa device na ito. Hindi ito maibabalik.',
      'warning',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'I-clear',
          style: 'destructive',
          onPress: () => { void clearAllLocalData(); },
        },
      ],
    );
  };

  const openGoogleMaps = async () => {
    const query = encodeURIComponent(`${locationLabel}, Philippines`);
    const url = Platform.select({
      ios: `https://maps.apple.com/?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) await Linking.openURL(url);
  };

  const openFeedbackModal = () => {
    setFeedbackMessage('');
    setFeedbackCategory('Suggestion');
    setFeedbackFeature('General Feedback');
    setFeedbackContact('');
    setIsDropdownOpen(false);
    setIsFeedbackVisible(true);
  };

  const submitFeedback = async () => {
    const cleanMessage = feedbackMessage.trim();

    if (isSubmittingFeedback) return;

    if (!cleanMessage) {
      showAlert('Missing Message', 'Please enter your feedback before submitting.', 'warning');
      return;
    }

    Keyboard.dismiss();
    setIsDropdownOpen(false);
    setIsSubmittingFeedback(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const feedbackBody: Record<string, string> = {
      category: feedbackCategory,
      feature: feedbackFeature,
      message: cleanMessage,
    };
    // Task B2: opsyonal na contact (email o mobile number) para masagot
    // ang user. Hindi ito naka-save sa profile — feedback lang ang dala.
    const contact = feedbackContact.trim();
    if (contact) {
      if (contact.includes('@')) feedbackBody.email = contact;
      else feedbackBody.name = contact;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/submit_feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
          ...(await getApiIdentityHeaders()),
        },
        body: JSON.stringify(feedbackBody),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data: any = {};

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { message: responseText };
        }
      }

      const serverRejected =
        (typeof data.status === 'string' && data.status !== 'success') ||
        data.success === false;

      if (!response.ok || serverRejected) {
        throw new Error(data.message || `Server returned status ${response.status}.`);
      }

      setFeedbackMessage('');
      setFeedbackContact('');
      setIsFeedbackVisible(false);
      showAlert('Thank You!', 'Your feedback helps us improve Lex-Simple.', 'success');
    } catch (error: any) {
      showAlert(
        error?.name === 'AbortError' ? 'Request Timed Out' : 'Submission Failed',
        error?.name === 'AbortError'
          ? 'The server took too long to respond. Please try again.'
          : error?.message || 'Check your connection and try again.',
        'error',
      );
    } finally {
      clearTimeout(timeoutId);
      setIsSubmittingFeedback(false);
    }
  };

  const renderMap = (large = false) => (
    <View style={[styles.mapFallback, large && styles.largeMapFallback, { backgroundColor: T.card }]}>
      {mapImageUrl && !mapLoadFailed ? (
        <Image
          source={{ uri: mapImageUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={large ? 1 : 2}
          onError={() => setMapLoadFailed(true)}
        />
      ) : (
        <>
          <View style={[styles.road, styles.roadOne, { backgroundColor: T.border }]} />
          <View style={[styles.road, styles.roadTwo, { backgroundColor: T.border }]} />
          <View style={[styles.road, styles.roadThree, { backgroundColor: T.border }]} />
          <View style={[styles.mapBlock, styles.blockOne, { borderColor: T.border }]} />
          <View style={[styles.mapBlock, styles.blockTwo, { borderColor: T.border }]} />
        </>
      )}
      <View style={styles.mapTint} />
      {hasCustomLocation && (
        <>
          <View style={styles.pinShadow} />
          <View style={[styles.pinBubble, { backgroundColor: T.brand, borderColor: T.ink }]}>
            <Ionicons name="location" size={large ? 27 : 22} color={T.card} />
          </View>
        </>
      )}
    </View>
  );

  return (
    <ScreenLayout title="My Profile" noPadding showBackButton={false}>
      <ScrollView
        testID="profile-screen-v5"
        style={[styles.screen, { backgroundColor: T.bg }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO — Primary Purple focal card (spec: purple surface + 2px outline + 2px shadow) */}
        <View
          style={[
            styles.profileCard,
            { backgroundColor: T.brand, borderColor: T.ink },
            getNeoShadow(T, 'sm'),
          ]}
        >
          <TouchableOpacity
            style={[styles.coverButton, { borderBottomColor: T.ink }]}
            activeOpacity={0.9}
            onPress={() => setIsLocationVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`View location: ${locationLabel}`}
          >
            {renderMap(false)}
            <View style={[styles.locationWatermark, { backgroundColor: T.card, borderColor: T.ink }]}>
              <Ionicons name="location-outline" size={13} color={T.text} />
              <View style={styles.locationCopy}>
                <Text style={[styles.locationCity, { color: T.text }]} numberOfLines={1}>{city || 'Philippines'}</Text>
                <Text style={[styles.locationProvince, { color: T.subText }]} numberOfLines={1}>{province || 'Tap to add city and province'}</Text>
              </View>
            </View>
            <View style={[styles.mapHint, { backgroundColor: T.ink }]}>
              <Ionicons name="expand-outline" size={13} color={T.bg} />
            </View>
          </TouchableOpacity>

          <View style={styles.profileBody}>
            <TouchableOpacity
              style={[styles.avatarShell, { backgroundColor: T.card, borderColor: T.ink }]}
              onPress={pickImage}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Image source={require('../../../../assets/icons/profile.png')} style={[styles.profileIcon, { tintColor: T.subText }]} resizeMode="contain" />
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: T.ink, borderColor: T.card }]}>
                <Ionicons name="camera" size={11} color={T.bg} />
              </View>
            </TouchableOpacity>

            <View style={styles.identityArea}>
              <Text style={[styles.profileName, { color: T.bg }]} numberOfLines={1}>{name || 'Guest'}</Text>

              {/* EDIT PROFILE — mini split-button (spec: main section + black arrow square) */}
              <Pressable
                style={styles.editProfilePress}
                onPress={openEditModal}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                {({ pressed }) => (
                  <View
                    style={[
                      styles.editProfileButton,
                      { borderColor: T.ink },
                      pressed ? styles.dimmed : null,
                    ]}
                  >
                    <View style={[styles.editProfileMain, { backgroundColor: T.card }]}>
                      <Ionicons name="pencil-outline" size={13} color={T.text} />
                      <Text style={[styles.editProfileText, { color: T.text }]}>Edit profile</Text>
                    </View>
                    <View style={[styles.editProfileArrow, { backgroundColor: T.ink }]}>
                      <Ionicons name="arrow-forward" size={13} color={T.bg} />
                    </View>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* STATS — flat white card, 1.5px outline, itim na malaking numero (spec) */}
        <NeoCard variant="flat" padding={false} style={styles.statsCard}>
          <View style={styles.statsIconWrap}>
            <Image source={require('../../../../assets/icons/files.png')} style={[styles.statsIcon, { tintColor: T.text }]} resizeMode="contain" />
          </View>
          <View style={styles.statsCopy}>
            <Text style={[styles.statsTitle, { color: T.text }]}>Documents analyzed</Text>
            <Text style={[styles.statsDescription, { color: T.subText }]}>Saved privately in your local scan history.</Text>
          </View>
          <Text style={[styles.statsCount, { color: T.text }]}>{totalScanned}</Text>
        </NeoCard>

        <NeoSectionHeader title="General" marker={false} style={styles.sectionGap} />
        <MenuItem
          title="Legal assistance guides"
          description="Find clear next steps for PAO, IBP, and private legal help."
          icon="briefcase-outline"
          onPress={() => navigation.navigate('LegalAidScreen')}
        />
        <MenuItem
          title="About Lex-Simple"
          description="Read about the app, its purpose, features, and developers."
          icon="information-circle-outline"
          onPress={() => navigation.navigate('AboutScreen')}
        />

        <NeoSectionHeader title="Support" marker={false} style={[styles.sectionGap, styles.supportGap]} />
        <MenuItem
          title="Send feedback"
          description="Report a bug or suggest an improvement to the Lex-Simple team."
          icon="chatbubble-ellipses-outline"
          onPress={openFeedbackModal}
        />

        {/* PRIVACY — flat rows card (spec: 1.5px border, walang shadow) */}
        <NeoSectionHeader title="Privacy" marker={false} style={[styles.sectionGap, styles.supportGap]} />

        <View style={[styles.privacyCard, { backgroundColor: T.card, borderColor: T.ink }]}>
          <View style={styles.privacyRow}>
            <View style={[styles.menuIcon, { backgroundColor: T.brandVivid, borderColor: T.ink }]}>
              <Ionicons name="analytics-outline" size={20} color={T.brandText} />
            </View>
            <View style={styles.privacyCopy}>
              <Text style={[styles.privacyTitle, { color: T.text }]}>Anonymous analytics</Text>
              <Text style={[styles.privacyDescription, { color: T.subText }]}> Bilang ng scans lang ang naka-tabay sa server, at naka-hash ang install ID. Naka-off = hindi ka mabibilang sa usage stats; may daily limit pa rin.
              </Text>
            </View>
            <Switch
              value={analyticsOn}
              onValueChange={(value) => { void toggleAnalytics(value); }}
              trackColor={{ false: T.border, true: T.brand }}
              thumbColor={T.card}
            />
          </View>

          <View style={[styles.privacyDivider, { backgroundColor: T.border }]} />

          <View style={styles.privacyRow}>
            <View style={[styles.menuIcon, { backgroundColor: T.brandVivid, borderColor: T.ink }]}>
              <Ionicons name="speedometer-outline" size={20} color={T.brandText} />
            </View>
            <View style={styles.privacyCopy}>
              <Text style={[styles.privacyTitle, { color: T.text }]}>Natitirang scan ngayong araw</Text>
              <Text style={[styles.privacyDescription, { color: T.subText }]} numberOfLines={2}>
                {usage
                  ? `Bumabalik ang quota sa ${formatQuotaResetAt(usage.resetAt)}.`
                  : 'Hindi ma-verify ang quota ngayon.'}
              </Text>
            </View>
            <Text style={[styles.privacyValue, { color: T.text }]}>
              {usage ? (usage.limit > 0 ? `${usage.remaining}/${usage.limit}` : '—') : '—'}
            </Text>
          </View>

          <View style={[styles.privacyDivider, { backgroundColor: T.border }]} />

          <View style={styles.privacyRow}>
            <View style={[styles.menuIcon, { backgroundColor: T.bg, borderColor: T.ink }]}>
              <Ionicons name="information-circle-outline" size={20} color={T.subText} />
            </View>
            <View style={styles.privacyCopy}>
              <Text style={[styles.privacyTitle, { color: T.text }]}>App version</Text>
            </View>
            <Text style={[styles.privacyValue, { color: T.subText }]}>{APP_VERSION}</Text>
          </View>
        </View>

        <MenuItem
          title="Privacy Policy"
          description="Basahin kung ano lang ang kinokolekta at paano ito ginagamit."
          icon="shield-checkmark-outline"
          onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {}); }}
        />

        <Pressable
          onPress={confirmClearLocalData}
          accessibilityRole="button"
          accessibilityLabel="Clear local data"
        >
          {({ pressed }) => (
            <View style={[styles.clearDataCard, { backgroundColor: T.card, borderColor: T.ink }, pressed ? styles.dimmed : null]}>
              <View style={styles.privacyRow}>
                <View style={[styles.menuIcon, { backgroundColor: T.danger, borderColor: T.ink }]}>
                  <Ionicons name="trash-outline" size={20} color={T.card} />
                </View>
                <View style={styles.privacyCopy}>
                  <Text style={[styles.privacyTitle, { color: T.danger }]}>I-clear ang local data</Text>
                  <Text style={[styles.privacyDescription, { color: T.subText }]}>
                    Buburahin ang scan history, chat, at profile sa device na ito. Hindi maibabalik.
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Pressable>
      </ScrollView>

      <Modal visible={isLocationVisible} transparent animationType="fade" onRequestClose={() => setIsLocationVisible(false)} statusBarTranslucent>
        <View style={[styles.modalOverlay, { backgroundColor: T.overlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsLocationVisible(false)} />
          <View style={[styles.locationModal, { backgroundColor: T.card, borderColor: T.ink }, getNeoShadow(T, 'sm')]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={[styles.modalTitle, { color: T.text }]}>Profile location</Text>
                <Text style={[styles.modalSubtitle, { color: T.subText }]} numberOfLines={1}>{locationLabel}</Text>
              </View>
              <NeoIconButton icon="close" size={34} onPress={() => setIsLocationVisible(false)} accessibilityLabel="Close" />
            </View>

            <View style={[styles.locationMapFrame, { borderColor: T.ink }]}>{renderMap(true)}</View>
            <Text style={[styles.locationPrivacy, { color: T.subText }]}>
              {hasCustomLocation
                ? 'Only your city and province are shown—not your exact address.'
                : 'Philippines is shown by default. Add a city and province from Edit profile when you are ready.'}
            </Text>

            <NeoButton label="Open in Google Maps" variant="accent" size="md" icon="map-outline" onPress={openGoogleMaps} />
          </View>
        </View>
      </Modal>

      <Modal visible={isEditing} transparent animationType="fade" onRequestClose={() => setIsEditing(false)} statusBarTranslucent>
        <View style={[styles.modalOverlay, { backgroundColor: T.overlay }]}>
          <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={[styles.formModal, { backgroundColor: T.card, borderColor: T.ink }, getNeoShadow(T, 'sm')]}>
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderCopy}>
                      <Text style={[styles.modalTitle, { color: T.text }]}>Edit profile</Text>
                      <Text style={[styles.modalSubtitle, { color: T.subText }]}>Update your public profile details.</Text>
                    </View>
                    <NeoIconButton icon="close" size={34} onPress={() => setIsEditing(false)} accessibilityLabel="Close" />
                  </View>

                  <TouchableOpacity style={styles.editAvatarButton} onPress={pickImage} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Change photo">
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={[styles.editAvatarImage, { borderColor: T.ink }]} />
                    ) : (
                      <View style={[styles.editAvatarPlaceholder, { backgroundColor: T.bg, borderColor: T.ink }]}>
                        <Ionicons name="person-outline" size={26} color={T.subText} />
                      </View>
                    )}
                    <Text style={[styles.changePhotoText, { color: T.brand }]}>Change photo</Text>
                  </TouchableOpacity>

                  <Text style={[styles.inputLabel, { color: T.subText }]}>NICKNAME (OPTIONAL)</Text>
                  <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.ink, color: T.text }]} value={editName} onChangeText={setEditName} autoCorrect={false} returnKeyType="next" />

                  <View style={styles.twoColumnRow}>
                    <View style={styles.halfField}>
                      <Text style={[styles.inputLabel, { color: T.subText }]}>CITY</Text>
                      <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.ink, color: T.text }]} value={editCity} onChangeText={setEditCity} autoCorrect={false} returnKeyType="next" />
                    </View>
                    <View style={styles.halfField}>
                      <Text style={[styles.inputLabel, { color: T.subText }]}>PROVINCE</Text>
                      <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.ink, color: T.text }]} value={editProvince} onChangeText={setEditProvince} autoCorrect={false} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <NeoButton label="Cancel" variant="secondary" size="md" style={styles.flexOne} onPress={() => setIsEditing(false)} />
                    <NeoButton label="Save changes" variant="accent" size="md" style={styles.flexOne} onPress={saveProfileData} />
                  </View>
                </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={isFeedbackVisible} transparent animationType="fade" onRequestClose={() => { if (!isSubmittingFeedback) { setIsFeedbackVisible(false); setFeedbackContact(''); } }} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setIsDropdownOpen(false); }}>
          <View style={[styles.feedbackOverlay, { backgroundColor: T.overlay }]}>
            <KeyboardAvoidingView behavior="padding" style={styles.feedbackKeyboardArea}>
              <ScrollView contentContainerStyle={styles.feedbackScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <TouchableWithoutFeedback>
                  <View style={[styles.feedbackCard, { backgroundColor: T.card, borderColor: T.ink }, getNeoShadow(T, 'sm')]}>
                    <View style={styles.feedbackHeader}>
                      <Text style={[styles.feedbackTitle, { color: T.text }]}>Send Feedback</Text>
                      <NeoIconButton
                        icon="close"
                        size={34}
                        disabled={isSubmittingFeedback}
                        onPress={() => { setIsFeedbackVisible(false); setFeedbackContact(''); }}
                        accessibilityLabel="Close"
                      />
                    </View>

                    <Text style={[styles.feedbackDescription, { color: T.subText }]}>Let us know what you think! Your feedback helps us improve the Lex-Simple experience.</Text>

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Category</Text>
                    <View style={styles.feedbackCategoryRow}>
                      {['Suggestion', 'Bug Report', 'Other'].map((category) => {
                        const selected = feedbackCategory === category;
                        return (
                          <TouchableOpacity
                            key={category}
                            style={[styles.feedbackCategoryButton, {
                              borderColor: selected ? T.brand : T.ink,
                              backgroundColor: selected ? T.brandSoft : T.bg,
                            }]}
                            onPress={() => setFeedbackCategory(category)}
                          >
                            <Text style={{ color: selected ? T.brandDeep : T.text, fontSize: 12, fontWeight: selected ? '800' : '700', textTransform: 'uppercase' }}>{category}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Related Feature</Text>
                    <TouchableOpacity
                      style={[styles.feedbackInput, styles.feedbackDropdownTrigger, { backgroundColor: T.bg, borderColor: isDropdownOpen ? T.brand : T.ink }]}
                      activeOpacity={0.8}
                      onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      <Text style={{ color: T.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{feedbackFeature}</Text>
                      <Ionicons name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.subText} />
                    </TouchableOpacity>

                    {isDropdownOpen && (
                      <View style={[styles.feedbackDropdownList, { backgroundColor: T.bg, borderColor: T.ink }]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 120 }} keyboardShouldPersistTaps="handled">
                          {APP_FEATURES.map((feature) => {
                            const selected = feedbackFeature === feature;
                            return (
                              <TouchableOpacity
                                key={feature}
                                style={[styles.feedbackDropdownOption, { borderBottomColor: T.border }]}
                                onPress={() => { setFeedbackFeature(feature); setIsDropdownOpen(false); }}
                              >
                                <Text style={{ flex: 1, color: selected ? T.brand : T.text, fontSize: 14, fontWeight: selected ? '800' : '400' }}>{feature}</Text>
                                {selected && <Ionicons name="checkmark" size={14} color={T.brand} />}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Your Message</Text>
                    <TextInput
                      style={[styles.feedbackInput, styles.feedbackMessageInput, { backgroundColor: T.bg, color: T.text, borderColor: T.ink }]}
                      value={feedbackMessage}
                      onChangeText={setFeedbackMessage}
                      placeholder="Tell us what's on your mind..."
                      placeholderTextColor={T.subText}
                      multiline
                      maxLength={1000}
                      autoCorrect={false}
                      onFocus={() => setIsDropdownOpen(false)}
                    />

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Contact (email o number)</Text>
                    <TextInput
                      style={[styles.feedbackInput, { backgroundColor: T.bg, color: T.text, borderColor: T.ink }]}
                      value={feedbackContact}
                      onChangeText={setFeedbackContact}
                      placeholder="Opsyonal — kung gusto mong masagot ka namin"
                      placeholderTextColor={T.subText}
                      maxLength={200}
                      autoCorrect={false}
                      onFocus={() => setIsDropdownOpen(false)}
                    />

                    <View style={styles.feedbackActions}>
                      <NeoButton
                        label="Cancel"
                        variant="secondary"
                        size="md"
                        disabled={isSubmittingFeedback}
                        style={styles.flexOne}
                        onPress={() => { setIsFeedbackVisible(false); setFeedbackContact(''); }}
                      />
                      <Pressable
                        onPress={submitFeedback}
                        disabled={isSubmittingFeedback}
                        style={styles.flexOne}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: isSubmittingFeedback }}
                      >
                        {({ pressed }) => (
                          <View
                            style={[
                              styles.submitButton,
                              { backgroundColor: T.brandVivid, borderColor: T.ink },
                              isSubmittingFeedback ? styles.feedbackDisabled : sink(pressed, 'sm'),
                            ]}
                          >
                            {isSubmittingFeedback ? (
                              <ActivityIndicator size="small" color={T.brandText} />
                            ) : (
                              <Text style={[styles.submitButtonText, { color: T.brandText }]}>Submit</Text>
                            )}
                          </View>
                        )}
                      </Pressable>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <AlertRender />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: 14, paddingBottom: 34 },

  // --- HERO (Primary Purple, 2px ink border, 2px hard shadow — focal) ---
  profileCard: { borderWidth: BORDER.thick, borderRadius: RADIUS.lg, overflow: 'hidden', marginBottom: 14 },
  coverButton: { height: 118, overflow: 'hidden', position: 'relative', borderBottomWidth: BORDER.thick },
  mapFallback: { flex: 1, overflow: 'hidden', position: 'relative' },
  largeMapFallback: { minHeight: 230 },
  mapTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7, 10, 18, 0.24)' },
  road: { position: 'absolute', height: 5, width: '135%', opacity: 0.8 },
  roadOne: { top: 33, left: -45, transform: [{ rotate: '-12deg' }] },
  roadTwo: { top: 82, left: -18, transform: [{ rotate: '18deg' }] },
  roadThree: { top: 57, left: -60, transform: [{ rotate: '72deg' }] },
  mapBlock: { position: 'absolute', borderWidth: 1, opacity: 0.65, transform: [{ rotate: '-8deg' }] },
  blockOne: { width: 78, height: 44, top: 9, left: 26 },
  blockTwo: { width: 92, height: 54, right: 23, bottom: 9 },
  pinShadow: { position: 'absolute', width: 22, height: 8, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.32)', alignSelf: 'center', top: '58%' },
  pinBubble: { position: 'absolute', alignSelf: 'center', top: '31%', width: 38, height: 38, borderRadius: 19, borderWidth: BORDER.thick, alignItems: 'center', justifyContent: 'center' },
  locationWatermark: { position: 'absolute', left: 12, bottom: 10, maxWidth: '72%', flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 9, borderRadius: RADIUS.sm, borderWidth: BORDER.thin },
  locationCopy: { marginLeft: 6, flexShrink: 1 },
  locationCity: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  locationProvince: { fontSize: 9, lineHeight: 11, fontWeight: '600' },
  mapHint: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  profileBody: { minHeight: 104, flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 14 },
  avatarShell: { width: 84, height: 84, borderRadius: 42, borderWidth: BORDER.thick, marginTop: -34, position: 'relative' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 40 },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  profileIcon: { width: 36, height: 36 },
  cameraBadge: { position: 'absolute', right: -1, bottom: -1, width: 26, height: 26, borderRadius: 13, borderWidth: BORDER.thick, alignItems: 'center', justifyContent: 'center' },
  identityArea: { flex: 1, minWidth: 0, marginLeft: 13, paddingTop: 8 },
  profileName: { fontSize: 20, lineHeight: 25, fontWeight: '900', marginBottom: 2 },
  profileEmail: { fontSize: 12, lineHeight: 16, marginBottom: 10, opacity: 0.85 },

  // EDIT PROFILE — mini split-button (main + black arrow square)
  editProfilePress: { alignSelf: 'flex-start' },
  editProfileButton: { flexDirection: 'row', alignItems: 'stretch', borderWidth: BORDER.thick, borderRadius: RADIUS.md, overflow: 'hidden' },
  editProfileMain: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9 },
  editProfileText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  editProfileArrow: { width: 32, alignItems: 'center', justifyContent: 'center' },

  // --- STATS (flat, 1.5px outline, walang filled icon bg — spec) ---
  statsCard: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 16 },
  statsIconWrap: { width: 30, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  statsIcon: { width: 22, height: 22 },
  statsCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  statsTitle: { fontSize: 14, lineHeight: 18, fontWeight: '800', marginBottom: 2 },
  statsDescription: { fontSize: 11, lineHeight: 15 },
  statsCount: { minWidth: 40, textAlign: 'center', fontSize: 28, fontWeight: '900' },

  // --- SECTIONS ---
  sectionGap: { marginBottom: 10 },
  supportGap: { marginTop: 20 },

  // --- MENU ITEMS (flat white cards + vivid purple circular badges) ---
  menuItemWrapper: { marginBottom: 10 },
  menuItem: { minHeight: 74, borderWidth: BORDER.thin, borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' },
  menuIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  menuTitle: { fontSize: 14, lineHeight: 18, fontWeight: '800', marginBottom: 3 },
  menuDescription: { fontSize: 11, lineHeight: 16 },

  dimmed: { opacity: 0.7 },

  // --- MODALS (2px outline + 2px hard shadow — focal surfaces) ---
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  keyboardArea: { flex: 1, width: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  locationModal: { width: '100%', maxWidth: 410, alignSelf: 'center', borderWidth: BORDER.thick, borderRadius: RADIUS.lg, padding: 16 },
  formModal: { width: '100%', maxWidth: 410, alignSelf: 'center', borderWidth: BORDER.thick, borderRadius: RADIUS.lg, padding: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  modalHeaderCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  modalTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 3 },
  modalSubtitle: { fontSize: 11, lineHeight: 16 },
  locationMapFrame: { height: 230, overflow: 'hidden', borderRadius: RADIUS.md, borderWidth: BORDER.thin, marginBottom: 10 },
  locationPrivacy: { fontSize: 10, lineHeight: 15, marginBottom: 15 },
  editAvatarButton: { alignSelf: 'center', alignItems: 'center', marginBottom: 18 },
  editAvatarImage: { width: 70, height: 70, borderRadius: 35, borderWidth: BORDER.thin, marginBottom: 7 },
  editAvatarPlaceholder: { width: 70, height: 70, borderRadius: 35, borderWidth: BORDER.thin, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  changePhotoText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  inputLabel: { fontSize: 10, lineHeight: 13, fontWeight: '900', letterSpacing: 0.7, marginLeft: 1, marginBottom: 6 },
  input: { minHeight: 46, borderWidth: BORDER.thin, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 14 },
  twoColumnRow: { flexDirection: 'row', marginHorizontal: -4 },
  halfField: { flex: 1, marginHorizontal: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flexOne: { flex: 1 },

  // --- FEEDBACK MODAL ---
  feedbackOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  feedbackKeyboardArea: { flex: 1, justifyContent: 'center', width: '100%' },
  feedbackScrollContent: { flexGrow: 1, justifyContent: 'center', width: '100%', paddingVertical: 16 },
  feedbackCard: { width: '100%', maxWidth: 400, alignSelf: 'center', borderRadius: RADIUS.lg, padding: 20, borderWidth: BORDER.thick },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  feedbackTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', letterSpacing: 0.3, textTransform: 'uppercase' },
  feedbackDescription: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  feedbackLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6, marginLeft: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
  feedbackInput: { minHeight: 44, borderRadius: RADIUS.md, padding: 12, fontSize: 14, borderWidth: BORDER.thin, marginBottom: 14 },
  feedbackCategoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3, marginBottom: 16 },
  feedbackCategoryButton: { flex: 1, minHeight: 42, paddingHorizontal: 5, borderRadius: RADIUS.md, borderWidth: BORDER.thick, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3 },
  feedbackDropdownTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedbackDropdownList: { borderRadius: RADIUS.md, marginTop: -7, marginBottom: 14, borderWidth: BORDER.thin, overflow: 'hidden' },
  feedbackDropdownOption: { minHeight: 43, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },
  feedbackMessageInput: { height: 100, textAlignVertical: 'top', marginBottom: 20 },
  shareContactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  shareContactLabel: { flex: 1, fontSize: 12, lineHeight: 17, marginLeft: 10 },
  feedbackActions: { flexDirection: 'row', gap: 10 },
  submitButton: { flex: 1, minHeight: 48, borderRadius: RADIUS.md, borderWidth: BORDER.thick, alignItems: 'center', justifyContent: 'center' },
  submitButtonText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  feedbackDisabled: { opacity: 0.55 },

  // --- PRIVACY SECTION (flat rows, 1.5px borders — spec) ---
  privacyCard: { borderWidth: BORDER.thin, borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  privacyRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 4 },
  privacyCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  privacyTitle: { fontSize: 14, lineHeight: 18, fontWeight: '800', marginBottom: 2 },
  privacyDescription: { fontSize: 11, lineHeight: 15 },
  privacyValue: { fontSize: 16, fontWeight: '900', minWidth: 40, textAlign: 'right' },
  privacyDivider: { height: BORDER.thin, marginLeft: 54 },
  clearDataCard: { borderWidth: BORDER.thin, borderRadius: RADIUS.lg, paddingHorizontal: 12, marginBottom: 10 },
});