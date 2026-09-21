import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

// PROFILE SCREEN VERSION: 5.0.0
// Uses the built-in map placeholder until a Google Maps API key is configured.

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

const DEFAULT_PROFILE = {
  name: 'Lex User',
  email: 'user@lexsimple.com',
  avatar: null as string | null,
  city: '',
  province: '',
};

type MenuItemProps = {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
};

function MenuItem({ title, description, icon, iconColor, iconBg, onPress }: MenuItemProps) {
  const { colors: T } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.menuItem, { backgroundColor: T.card, borderColor: T.border }]}
      activeOpacity={0.72}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconBg }]}> 
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>

      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, { color: T.text }]}>{title}</Text>
        <Text style={[styles.menuDescription, { color: T.subText }]} numberOfLines={2}>
          {description}
        </Text>
      </View>

      <View style={[styles.menuChevron, { backgroundColor: T.bg, borderColor: T.border }]}> 
        <Ionicons name="chevron-forward" size={15} color={T.subText} />
      </View>
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const [totalScanned, setTotalScanned] = useState(0);
  const [name, setName] = useState(DEFAULT_PROFILE.name);
  const [email, setEmail] = useState(DEFAULT_PROFILE.email);
  const [avatarUri, setAvatarUri] = useState<string | null>(DEFAULT_PROFILE.avatar);
  const [city, setCity] = useState(DEFAULT_PROFILE.city);
  const [province, setProvince] = useState(DEFAULT_PROFILE.province);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editProvince, setEditProvince] = useState('');

  const [isLocationVisible, setIsLocationVisible] = useState(false);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('Suggestion');
  const [feedbackFeature, setFeedbackFeature] = useState('General Feedback');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T } = useTheme();
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
    }, []),
  );

  const loadScanStats = async () => {
    try {
      const history = await AsyncStorage.getItem('@lex_scan_history');
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
      const profile = await AsyncStorage.getItem('@lex_profile');
      if (!profile) return;
      const parsed = JSON.parse(profile);
      setName(parsed.name || DEFAULT_PROFILE.name);
      setEmail(parsed.email || DEFAULT_PROFILE.email);
      setAvatarUri(parsed.avatar || null);
      setCity(parsed.city || DEFAULT_PROFILE.city);
      setProvince(parsed.province || DEFAULT_PROFILE.province);
    } catch (error) {
      console.warn('Unable to load profile:', error);
    }
  };

  const openEditModal = () => {
    setEditName(name);
    setEditEmail(email);
    setEditCity(city);
    setEditProvince(province);
    setIsEditing(true);
  };

  const saveProfileData = async () => {
    const cleanName = editName.trim();
    const cleanEmail = editEmail.trim().toLowerCase();
    const cleanCity = editCity.trim();
    const cleanProvince = editProvince.trim();

    if (!cleanName || !cleanEmail) {
      showAlert('Incomplete Profile', 'Complete your name and email address.', 'warning');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      showAlert('Invalid Email', 'Please enter a valid email address.', 'warning');
      return;
    }
    if ((cleanCity && !cleanProvince) || (!cleanCity && cleanProvince)) {
      showAlert('Incomplete Location', 'Enter both city and province, or leave both blank to use Philippines.', 'warning');
      return;
    }

    try {
      const nextProfile = {
        name: cleanName,
        email: cleanEmail,
        avatar: avatarUri,
        city: cleanCity,
        province: cleanProvince,
      };
      await AsyncStorage.setItem('@lex_profile', JSON.stringify(nextProfile));
      setName(cleanName);
      setEmail(cleanEmail);
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
        setAvatarUri(result.assets[0].uri);
      }
    } catch {
      showAlert('Gallery Error', 'Unable to open your gallery. Please try again.', 'error');
    }
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

    try {
      const response = await fetch(`${API_BASE_URL}/submit_feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          name,
          email,
          category: feedbackCategory,
          feature: feedbackFeature,
          message: cleanMessage,
        }),
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
          <View style={styles.pinBubble}>
            <Ionicons name="location" size={large ? 27 : 22} color="#FFFFFF" />
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
        <View style={[styles.profileCard, { backgroundColor: T.card, borderColor: T.border }]}> 
          <TouchableOpacity
            style={styles.coverButton}
            activeOpacity={0.9}
            onPress={() => setIsLocationVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`View location: ${locationLabel}`}
          >
            {renderMap(false)}
            <View style={styles.locationWatermark}>
              <Ionicons name="location-outline" size={13} color="#FFFFFF" />
              <View style={styles.locationCopy}>
                <Text style={styles.locationCity} numberOfLines={1}>{city || 'Philippines'}</Text>
                <Text style={styles.locationProvince} numberOfLines={1}>{province || 'Tap to add city and province'}</Text>
              </View>
            </View>
            <View style={styles.mapHint}>
              <Ionicons name="expand-outline" size={13} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <View style={styles.profileBody}>
            <TouchableOpacity style={[styles.avatarShell, { borderColor: T.card }]} onPress={pickImage} activeOpacity={0.82}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: T.bg, borderColor: T.border }]}> 
                  <Image source={require('../../../../assets/icons/profile.png')} style={styles.profileIcon} resizeMode="contain" />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={11} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            <View style={styles.identityArea}>
              <Text style={[styles.profileName, { color: T.text }]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.profileEmail, { color: T.subText }]} numberOfLines={1}>{email}</Text>
              <TouchableOpacity
                style={[styles.editProfileButton, { backgroundColor: T.bg, borderColor: T.border }]}
                onPress={openEditModal}
                activeOpacity={0.72}
              >
                <Ionicons name="pencil-outline" size={14} color={COLORS.primaryLight} />
                <Text style={styles.editProfileText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.statsCard, { backgroundColor: T.card, borderColor: T.border }]}> 
          <View style={styles.statsIconBox}>
            <Image source={require('../../../../assets/icons/files.png')} style={styles.statsIcon} resizeMode="contain" />
          </View>
          <View style={styles.statsCopy}>
            <Text style={[styles.statsTitle, { color: T.text }]}>Documents analyzed</Text>
            <Text style={[styles.statsDescription, { color: T.subText }]}>Saved privately in your local scan history.</Text>
          </View>
          <Text style={styles.statsCount}>{totalScanned}</Text>
        </View>

        <Text style={[styles.sectionLabel, { color: T.subText }]}>GENERAL</Text>
        <MenuItem
          title="Legal assistance guides"
          description="Find clear next steps for PAO, IBP, and private legal help."
          icon="briefcase-outline"
          iconColor={COLORS.success}
          iconBg="rgba(16, 185, 129, 0.12)"
          onPress={() => navigation.navigate('LegalAidScreen')}
        />
        <MenuItem
          title="About Lex-Simple"
          description="Read about the app, its purpose, features, and developers."
          icon="information-circle-outline"
          iconColor={COLORS.primaryLight}
          iconBg="rgba(167, 139, 250, 0.12)"
          onPress={() => navigation.navigate('AboutScreen')}
        />

        <Text style={[styles.sectionLabel, styles.supportLabel, { color: T.subText }]}>SUPPORT</Text>
        <MenuItem
          title="Send feedback"
          description="Report a bug or suggest an improvement to the Lex-Simple team."
          icon="chatbubble-ellipses-outline"
          iconColor={COLORS.warning}
          iconBg="rgba(245, 158, 11, 0.12)"
          onPress={openFeedbackModal}
        />
      </ScrollView>

      <Modal visible={isLocationVisible} transparent animationType="fade" onRequestClose={() => setIsLocationVisible(false)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setIsLocationVisible(false)} />
          <View style={[styles.locationModal, { backgroundColor: T.card, borderColor: T.border }]}> 
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderCopy}>
                <Text style={[styles.modalTitle, { color: T.text }]}>Profile location</Text>
                <Text style={[styles.modalSubtitle, { color: T.subText }]} numberOfLines={1}>{locationLabel}</Text>
              </View>
              <TouchableOpacity style={[styles.closeButton, { backgroundColor: T.bg, borderColor: T.border }]} onPress={() => setIsLocationVisible(false)}>
                <Ionicons name="close" size={17} color={T.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.locationMapFrame, { borderColor: T.border }]}>{renderMap(true)}</View>
            <Text style={[styles.locationPrivacy, { color: T.subText }]}> 
              {hasCustomLocation
                ? 'Only your city and province are shown—not your exact address.'
                : 'Philippines is shown by default. Add a city and province from Edit profile when you are ready.'}
            </Text>

            <TouchableOpacity style={styles.primaryFullButton} onPress={openGoogleMaps} activeOpacity={0.78}>
              <Ionicons name="map-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryFullButtonText}>Open in Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isEditing} transparent animationType="fade" onRequestClose={() => setIsEditing(false)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={[styles.formModal, { backgroundColor: T.card, borderColor: T.border }]}> 
                  <View style={styles.modalHeader}>
                    <View style={styles.modalHeaderCopy}>
                      <Text style={[styles.modalTitle, { color: T.text }]}>Edit profile</Text>
                      <Text style={[styles.modalSubtitle, { color: T.subText }]}>Update your public profile details.</Text>
                    </View>
                    <TouchableOpacity style={[styles.closeButton, { backgroundColor: T.bg, borderColor: T.border }]} onPress={() => setIsEditing(false)}>
                      <Ionicons name="close" size={17} color={T.text} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.editAvatarButton} onPress={pickImage} activeOpacity={0.8}>
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.editAvatarImage} />
                    ) : (
                      <View style={[styles.editAvatarPlaceholder, { backgroundColor: T.bg, borderColor: T.border }]}> 
                        <Ionicons name="person-outline" size={26} color={COLORS.primaryLight} />
                      </View>
                    )}
                    <Text style={styles.changePhotoText}>Change photo</Text>
                  </TouchableOpacity>

                  <Text style={[styles.inputLabel, { color: T.subText }]}>FULL NAME</Text>
                  <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]} value={editName} onChangeText={setEditName} autoCorrect={false} returnKeyType="next" />

                  <Text style={[styles.inputLabel, { color: T.subText }]}>EMAIL ADDRESS</Text>
                  <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="next" />

                  <View style={styles.twoColumnRow}>
                    <View style={styles.halfField}>
                      <Text style={[styles.inputLabel, { color: T.subText }]}>CITY</Text>
                      <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]} value={editCity} onChangeText={setEditCity} autoCorrect={false} returnKeyType="next" />
                    </View>
                    <View style={styles.halfField}>
                      <Text style={[styles.inputLabel, { color: T.subText }]}>PROVINCE</Text>
                      <TextInput style={[styles.input, { backgroundColor: T.bg, borderColor: T.border, color: T.text }]} value={editProvince} onChangeText={setEditProvince} autoCorrect={false} returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: T.bg, borderColor: T.border }]} onPress={() => setIsEditing(false)}>
                      <Text style={[styles.secondaryButtonText, { color: T.text }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={saveProfileData}>
                      <Text style={styles.primaryButtonText}>Save changes</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={isFeedbackVisible} transparent animationType="fade" onRequestClose={() => { if (!isSubmittingFeedback) setIsFeedbackVisible(false); }} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setIsDropdownOpen(false); }}>
          <View style={styles.feedbackOverlay}>
            <KeyboardAvoidingView behavior="padding" style={styles.feedbackKeyboardArea}>
              <ScrollView contentContainerStyle={styles.feedbackScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <TouchableWithoutFeedback>
                  <View style={[styles.feedbackCard, { backgroundColor: T.card, borderColor: T.border }]}> 
                    <View style={styles.feedbackHeader}>
                      <Text style={[styles.feedbackTitle, { color: T.text }]}>Send Feedback</Text>
                      <TouchableOpacity disabled={isSubmittingFeedback} onPress={() => setIsFeedbackVisible(false)} style={[styles.feedbackCloseButton, isSubmittingFeedback && styles.feedbackDisabled, { backgroundColor: T.bg, borderColor: T.border }]}> 
                        <Ionicons name="close" size={16} color={T.text} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.feedbackDescription, { color: T.subText }]}>Let us know what you think! Your feedback helps us improve the Lex-Simple experience.</Text>

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Category</Text>
                    <View style={styles.feedbackCategoryRow}>
                      {['Suggestion', 'Bug Report', 'Other'].map((category) => (
                        <TouchableOpacity
                          key={category}
                          style={[styles.feedbackCategoryButton, { borderColor: feedbackCategory === category ? COLORS.primaryLight : T.border, backgroundColor: feedbackCategory === category ? 'rgba(167, 139, 250, 0.1)' : T.bg }]}
                          onPress={() => setFeedbackCategory(category)}
                        >
                          <Text style={{ color: feedbackCategory === category ? COLORS.primaryLight : T.text, fontSize: 12, fontWeight: 'bold' }}>{category}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Related Feature</Text>
                    <TouchableOpacity
                      style={[styles.feedbackInput, styles.feedbackDropdownTrigger, { backgroundColor: T.bg, borderColor: isDropdownOpen ? COLORS.primaryLight : T.border }]}
                      activeOpacity={0.8}
                      onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      <Text style={{ color: T.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{feedbackFeature}</Text>
                      <Ionicons name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.subText} />
                    </TouchableOpacity>

                    {isDropdownOpen && (
                      <View style={[styles.feedbackDropdownList, { backgroundColor: T.bg, borderColor: T.border }]}> 
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 120 }} keyboardShouldPersistTaps="handled">
                          {APP_FEATURES.map((feature) => (
                            <TouchableOpacity
                              key={feature}
                              style={[styles.feedbackDropdownOption, { borderBottomColor: T.border }]}
                              onPress={() => { setFeedbackFeature(feature); setIsDropdownOpen(false); }}
                            >
                              <Text style={{ flex: 1, color: feedbackFeature === feature ? COLORS.primaryLight : T.text, fontSize: 14, fontWeight: feedbackFeature === feature ? 'bold' : 'normal' }}>{feature}</Text>
                              {feedbackFeature === feature && <Ionicons name="checkmark" size={14} color={COLORS.primaryLight} />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <Text style={[styles.feedbackLabel, { color: T.subText }]}>Your Message</Text>
                    <TextInput
                      style={[styles.feedbackInput, styles.feedbackMessageInput, { backgroundColor: T.bg, color: T.text, borderColor: T.border }]}
                      value={feedbackMessage}
                      onChangeText={setFeedbackMessage}
                      placeholder="Tell us what's on your mind..."
                      placeholderTextColor={T.subText}
                      multiline
                      maxLength={1000}
                      autoCorrect={false}
                      onFocus={() => setIsDropdownOpen(false)}
                    />

                    <View style={styles.feedbackActions}>
                      <TouchableOpacity disabled={isSubmittingFeedback} style={[styles.feedbackCancelButton, isSubmittingFeedback && styles.feedbackDisabled, { backgroundColor: T.bg, borderColor: T.border }]} onPress={() => setIsFeedbackVisible(false)}>
                        <Text style={{ color: T.text, fontWeight: 'bold' }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.feedbackSubmitButton, isSubmittingFeedback && styles.feedbackDisabled]} onPress={submitFeedback} disabled={isSubmittingFeedback}>
                        {isSubmittingFeedback ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: 'bold' }}>Submit</Text>}
                      </TouchableOpacity>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 34 },
  profileCard: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
  coverButton: { height: 118, overflow: 'hidden', position: 'relative' },
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
  pinBubble: { position: 'absolute', alignSelf: 'center', top: '31%', width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.88)' },
  locationWatermark: { position: 'absolute', left: 12, bottom: 10, maxWidth: '72%', flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 9, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.68)' },
  locationCopy: { marginLeft: 6, flexShrink: 1 },
  locationCity: { color: '#FFFFFF', fontSize: 12, lineHeight: 14, fontWeight: '800' },
  locationProvince: { color: 'rgba(255,255,255,0.72)', fontSize: 9, lineHeight: 11, fontWeight: '600' },
  mapHint: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.58)', alignItems: 'center', justifyContent: 'center' },
  profileBody: { minHeight: 108, flexDirection: 'row', paddingHorizontal: 14, paddingBottom: 14 },
  avatarShell: { width: 82, height: 82, borderRadius: 41, borderWidth: 4, marginTop: -31, backgroundColor: '#111827', position: 'relative' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 37 },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 37, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileIcon: { width: 34, height: 34, tintColor: COLORS.primaryLight },
  cameraBadge: { position: 'absolute', right: -1, bottom: -1, width: 25, height: 25, borderRadius: 7, backgroundColor: COLORS.primary, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  identityArea: { flex: 1, minWidth: 0, marginLeft: 13, paddingTop: 10 },
  profileName: { fontSize: 18, lineHeight: 22, fontWeight: '900', marginBottom: 2 },
  profileEmail: { fontSize: 11, lineHeight: 15, marginBottom: 9 },
  editProfileButton: { alignSelf: 'flex-start', minHeight: 32, borderRadius: 6, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center' },
  editProfileText: { color: COLORS.primaryLight, fontSize: 11, fontWeight: '800', marginLeft: 6 },
  statsCard: { minHeight: 76, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 22 },
  statsIconBox: { width: 38, height: 38, borderRadius: 7, backgroundColor: 'rgba(52,120,246,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  statsIcon: { width: 19, height: 19, tintColor: COLORS.primaryLight },
  statsCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  statsTitle: { fontSize: 13, lineHeight: 17, fontWeight: '800', marginBottom: 2 },
  statsDescription: { fontSize: 10, lineHeight: 15, maxWidth: 220 },
  statsCount: { minWidth: 38, textAlign: 'center', color: COLORS.primaryLight, fontSize: 27, fontWeight: '900' },
  sectionLabel: { fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1, marginLeft: 2, marginBottom: 9 },
  supportLabel: { marginTop: 13 },
  menuItem: { minHeight: 78, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  menuIcon: { width: 38, height: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  menuCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  menuTitle: { fontSize: 13, lineHeight: 17, fontWeight: '800', marginBottom: 3 },
  menuDescription: { fontSize: 11, lineHeight: 16, maxWidth: 245 },
  menuChevron: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.84)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  keyboardArea: { flex: 1, width: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  locationModal: { width: '100%', maxWidth: 410, alignSelf: 'center', borderWidth: 1, borderRadius: 8, padding: 16 },
  formModal: { width: '100%', maxWidth: 410, alignSelf: 'center', borderWidth: 1, borderRadius: 8, padding: 18 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  modalHeaderCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  modalTitle: { fontSize: 18, lineHeight: 22, fontWeight: '900', marginBottom: 3 },
  modalSubtitle: { fontSize: 11, lineHeight: 16 },
  closeButton: { width: 34, height: 34, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  locationMapFrame: { height: 230, overflow: 'hidden', borderRadius: 7, borderWidth: 1, marginBottom: 10 },
  locationPrivacy: { fontSize: 10, lineHeight: 15, marginBottom: 15 },
  primaryFullButton: { minHeight: 46, borderRadius: 6, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryFullButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', marginLeft: 8 },
  editAvatarButton: { alignSelf: 'center', alignItems: 'center', marginBottom: 18 },
  editAvatarImage: { width: 70, height: 70, borderRadius: 35, marginBottom: 7 },
  editAvatarPlaceholder: { width: 70, height: 70, borderRadius: 35, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  changePhotoText: { color: COLORS.primaryLight, fontSize: 11, fontWeight: '800' },
  inputLabel: { fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 0.7, marginLeft: 1, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 14 },
  twoColumnRow: { flexDirection: 'row', marginHorizontal: -4 },
  halfField: { flex: 1, marginHorizontal: 4 },
  actionRow: { flexDirection: 'row', marginHorizontal: -4, marginTop: 4 },
  secondaryButton: { flex: 1, minHeight: 44, marginHorizontal: 4, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 12, fontWeight: '800' },
  primaryButton: { flex: 1, minHeight: 44, marginHorizontal: 4, borderRadius: 6, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  feedbackOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.82)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  feedbackKeyboardArea: { flex: 1, justifyContent: 'center', width: '100%' },
  feedbackScrollContent: { flexGrow: 1, justifyContent: 'center', width: '100%', paddingVertical: 16 },
  feedbackCard: { width: '100%', maxWidth: 400, alignSelf: 'center', borderRadius: 8, padding: 20, borderWidth: 1 },
  feedbackHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  feedbackTitle: { fontSize: 18, fontWeight: 'bold' },
  feedbackCloseButton: { width: 30, height: 30, borderRadius: 6, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  feedbackDescription: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  feedbackLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 6, marginLeft: 2 },
  feedbackInput: { minHeight: 44, borderRadius: 6, padding: 12, fontSize: 14, borderWidth: 1, marginBottom: 14 },
  feedbackCategoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -3, marginBottom: 16 },
  feedbackCategoryButton: { flex: 1, minHeight: 42, paddingHorizontal: 5, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3 },
  feedbackDropdownTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feedbackDropdownList: { borderRadius: 6, marginTop: -7, marginBottom: 14, borderWidth: 1, overflow: 'hidden' },
  feedbackDropdownOption: { minHeight: 43, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1 },
  feedbackMessageInput: { height: 100, textAlignVertical: 'top', marginBottom: 20 },
  feedbackActions: { flexDirection: 'row', marginHorizontal: -5 },
  feedbackCancelButton: { flex: 1, minHeight: 44, marginHorizontal: 5, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  feedbackSubmitButton: { flex: 1, minHeight: 44, marginHorizontal: 5, borderRadius: 6, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  feedbackDisabled: { opacity: 0.55 },
});
