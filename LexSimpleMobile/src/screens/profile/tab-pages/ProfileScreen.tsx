import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Platform, Modal, TextInput, Image,
  KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback, ActivityIndicator, StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

import { COLORS } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

const APP_FEATURES = [
  'General Feedback', 'Camera Scanner', 'Gallery Image Upload', 'Document Converter (PDF/Word)',
  'AI Simplification Results', 'Ask AI Chat Assistant', 'Lex-Library (Dictionary)',
  'Scan History / Offline Details', 'Legal Assistance Guides', 'Profile & Settings', 'Other / UI Issues',
];

export default function ProfileScreen({ navigation }: any) {
  const [totalScanned, setTotalScanned] = useState(0);
  const [name, setName] = useState('Lex User');
  const [email, setEmail] = useState('user@lexsimple.com');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState('Suggestion');
  const [feedbackFeature, setFeedbackFeature] = useState('General Feedback');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T, isDarkMode } = useTheme();
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

  useFocusEffect(
    useCallback(() => {
      loadProfileData();
      loadScanStats();
    }, [])
  );

  const loadScanStats = async () => {
    try {
      const history = await AsyncStorage.getItem('@lex_scan_history');
      if (history) {
        const parsed = JSON.parse(history);
        setTotalScanned(parsed.length);
      }
    } catch (e) { console.log(e); }
  };

  const loadProfileData = async () => {
    try {
      const profile = await AsyncStorage.getItem('@lex_profile');
      if (profile) {
        const parsed = JSON.parse(profile);
        setName(parsed.name || 'Lex User');
        setEmail(parsed.email || 'user@lexsimple.com');
        setAvatarUri(parsed.avatar || null);
      }
    } catch (e) { console.log(e); }
  };

  const saveProfileData = async () => {
    try {
      const newProfile = { name: editName, email: editEmail, avatar: avatarUri };
      await AsyncStorage.setItem('@lex_profile', JSON.stringify(newProfile));
      setName(editName);
      setEmail(editEmail);
      setIsEditing(false);
      showAlert('Profile Saved', 'Your profile information has been updated.', 'success');
    } catch {
      showAlert('Error', 'Failed to save profile data.', 'error');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const openEditModal = () => {
    setEditName(name);
    setEditEmail(email);
    setIsEditing(true);
  };

  const openFeedbackModal = () => {
    setFeedbackMessage('');
    setFeedbackCategory('Suggestion');
    setFeedbackFeature('General Feedback');
    setIsDropdownOpen(false);
    setIsFeedbackVisible(true);
  };

  const submitFeedback = async () => {
    if (!feedbackMessage.trim()) {
      showAlert('Missing Information', 'Please enter your message before submitting.', 'warning');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      const response = await fetch(`${API_BASE_URL}/submit_feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ name, email, category: feedbackCategory, feature: feedbackFeature, message: feedbackMessage }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setIsFeedbackVisible(false);
        showAlert('Thank You!', 'Your feedback helps us improve Lex-Simple.', 'success');
      } else {
        showAlert('Submission Failed', data.message || 'Something went wrong.', 'error');
      }
    } catch {
      showAlert('Connection Error', 'Please check your internet connection and try again.', 'error');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <ScreenLayout title="My Profile" noPadding={true}>
      <ScrollView style={{ flex: 1, backgroundColor: T.bg }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}>

        {/* Profile Header Card */}
        <View style={[uiStyles.card, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={uiStyles.avatarWrapper}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={[uiStyles.avatarImage, { borderColor: COLORS.primaryLight }]} />
            ) : (
              <View style={[uiStyles.avatarPlaceholder, { backgroundColor: T.bg, borderColor: COLORS.primaryLight }]}>
                <Image source={require('../../../../assets/icons/profile.png')} style={{ width: 36, height: 36, tintColor: COLORS.primaryLight }} resizeMode="contain" />
              </View>
            )}
          </View>
          <Text style={[uiStyles.welcomeText, { color: T.text }]}>{name}</Text>
          <Text style={[uiStyles.emailText, { color: T.subText }]}>{email}</Text>

          <TouchableOpacity
            style={[uiStyles.editBtn, { backgroundColor: T.bg, borderColor: COLORS.primaryLight }]}
            onPress={openEditModal}
          >
            <Ionicons name="pencil-outline" size={14} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
            <Text style={[uiStyles.editBtnText, { color: COLORS.primaryLight }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Card - Side by side with divider (Text Left, Number Right) */}
        <View style={uiStyles.statsCard}>
          <View style={uiStyles.statsRow}>
            {/* Left Side: Icon, Title, and Subtext */}
            <View style={uiStyles.statsLeftContent}>
              <View style={uiStyles.statsHeader}>
                <View style={uiStyles.statsIconBg}>
                  <Image source={require('../../../../assets/icons/files.png')} style={{ width: 18, height: 18, tintColor: '#fff' }} resizeMode="contain" />
                </View>
                <Text style={uiStyles.statsTitle}>Documents Analyzed</Text>
              </View>
              <Text style={uiStyles.statsSubtext}>Files saved in your local library</Text>
            </View>

            {/* Divider */}
            <View style={uiStyles.statsDivider} />

            {/* Right Side: Big Number */}
            <Text style={uiStyles.statsBigNumber}>{totalScanned}</Text>
          </View>
        </View>

        {/* Grouped Settings List */}
        <Text style={[uiStyles.sectionTitle, { color: T.subText }]}>RESOURCES & INFO</Text>

        <View style={[uiStyles.groupedList, { backgroundColor: T.card, borderColor: T.border }]}>
          {/* Legal Assistance */}
          <TouchableOpacity style={uiStyles.listItem} activeOpacity={0.7} onPress={() => navigation.navigate('LegalAidScreen')}>
            <View style={[uiStyles.listIconBg, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Ionicons name="briefcase-outline" size={18} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[uiStyles.listTitle, { color: T.text }]}>Legal Assistance Guides</Text>
              <Text style={[uiStyles.listSub, { color: T.subText }]}>Learn how to get a PAO, IBP, or Private Lawyer</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.subText} />
          </TouchableOpacity>

          <View style={[uiStyles.listDivider, { backgroundColor: T.border }]} />

          {/* About Lex-Simple */}
          <TouchableOpacity style={uiStyles.listItem} activeOpacity={0.7} onPress={() => navigation.navigate('AboutScreen')}>
            <View style={[uiStyles.listIconBg, { backgroundColor: 'rgba(167, 139, 250, 0.1)' }]}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[uiStyles.listTitle, { color: T.text }]}>About Lex-Simple</Text>
              <Text style={[uiStyles.listSub, { color: T.subText }]}>Mission, features, & developers</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.subText} />
          </TouchableOpacity>

          <View style={[uiStyles.listDivider, { backgroundColor: T.border }]} />

          {/* Send Feedback */}
          <TouchableOpacity style={uiStyles.listItem} activeOpacity={0.7} onPress={openFeedbackModal}>
            <View style={[uiStyles.listIconBg, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[uiStyles.listTitle, { color: T.text }]}>Send Feedback</Text>
              <Text style={[uiStyles.listSub, { color: T.subText }]}>Report bugs or suggest features</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.subText} />
          </TouchableOpacity>
        </View>

      </ScrollView>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={isEditing} transparent animationType="fade" onRequestClose={() => setIsEditing(false)} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={uiStyles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={uiStyles.kavWrapper}>
              <ScrollView contentContainerStyle={uiStyles.centerScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <TouchableWithoutFeedback>
                  <View style={[uiStyles.modalCard, { backgroundColor: T.card, borderColor: T.border }]}>
                    <View style={uiStyles.modalHeaderRow}>
                      <Text style={[uiStyles.modalTitle, { color: T.text }]}>Edit Profile</Text>
                      <TouchableOpacity onPress={() => setIsEditing(false)} style={[uiStyles.closeBtn, { backgroundColor: T.bg, borderColor: T.border }]}>
                        <Ionicons name="close" size={16} color={T.text} />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={uiStyles.modalAvatarBtn} onPress={pickImage}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={[uiStyles.modalAvatarImage, { borderColor: COLORS.primaryLight }]} />
                      ) : (
                        <View style={[uiStyles.modalAvatarPlaceholder, { backgroundColor: T.bg, borderColor: COLORS.primaryLight }]}>
                          <Ionicons name="camera-outline" size={28} color={COLORS.primaryLight} />
                        </View>
                      )}
                      <View style={uiStyles.editBadge}>
                        <Ionicons name="pencil" size={12} color="white" />
                      </View>
                    </TouchableOpacity>

                    <Text style={[uiStyles.inputLabel, { color: T.subText }]}>Full Name</Text>
                    <TextInput
                      style={[uiStyles.inputField, { backgroundColor: T.bg, color: T.text, borderColor: T.border }]}
                      value={editName} onChangeText={setEditName} placeholderTextColor={T.subText} autoCorrect={false} returnKeyType="next"
                    />

                    <Text style={[uiStyles.inputLabel, { color: T.subText }]}>Email Address</Text>
                    <TextInput
                      style={[uiStyles.inputField, { backgroundColor: T.bg, color: T.text, borderColor: T.border, marginBottom: 20 }]}
                      value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" placeholderTextColor={T.subText} autoCorrect={false} returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
                    />

                    <View style={uiStyles.modalActions}>
                      <TouchableOpacity style={[uiStyles.cancelBtn, { backgroundColor: T.bg, borderColor: T.border }]} onPress={() => setIsEditing(false)}>
                        <Text style={{ color: T.text, fontWeight: 'bold' }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={uiStyles.saveBtn} onPress={saveProfileData}>
                        <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save Changes</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* FEEDBACK MODAL */}
      <Modal visible={isFeedbackVisible} transparent animationType="fade" onRequestClose={() => setIsFeedbackVisible(false)} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setIsDropdownOpen(false); }}>
          <View style={uiStyles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={uiStyles.kavWrapper}>
              <ScrollView contentContainerStyle={uiStyles.centerScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <TouchableWithoutFeedback>
                  <View style={[uiStyles.modalCard, { backgroundColor: T.card, borderColor: T.border }]}>
                    <View style={uiStyles.modalHeaderRow}>
                      <Text style={[uiStyles.modalTitle, { color: T.text }]}>Send Feedback</Text>
                      <TouchableOpacity onPress={() => setIsFeedbackVisible(false)} style={[uiStyles.closeBtn, { backgroundColor: T.bg, borderColor: T.border }]}>
                        <Ionicons name="close" size={16} color={T.text} />
                      </TouchableOpacity>
                    </View>

                    <Text style={[uiStyles.feedbackDesc, { color: T.subText }]}>
                      Let us know what you think! Your feedback helps us improve the Lex-Simple experience.
                    </Text>

                    <Text style={[uiStyles.inputLabel, { color: T.subText }]}>Category</Text>
                    <View style={uiStyles.categoryRow}>
                      {['Suggestion', 'Bug Report', 'Other'].map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[uiStyles.categoryPill, { borderColor: feedbackCategory === cat ? COLORS.primaryLight : T.border, backgroundColor: feedbackCategory === cat ? 'rgba(167, 139, 250, 0.1)' : T.bg }]}
                          onPress={() => setFeedbackCategory(cat)}
                        >
                          <Text style={{ color: feedbackCategory === cat ? COLORS.primaryLight : T.text, fontSize: 12, fontWeight: 'bold' }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={[uiStyles.inputLabel, { color: T.subText }]}>Related Feature</Text>
                    <TouchableOpacity
                      style={[uiStyles.inputField, uiStyles.dropdownTrigger, { backgroundColor: T.bg, borderColor: isDropdownOpen ? COLORS.primaryLight : T.border }]}
                      activeOpacity={0.8}
                      onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      <Text style={{ color: T.text, fontSize: 14 }}>{feedbackFeature}</Text>
                      <Ionicons name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={T.subText} />
                    </TouchableOpacity>

                    {isDropdownOpen && (
                      <View style={[uiStyles.dropdownList, { backgroundColor: T.bg, borderColor: T.border }]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 120 }}>
                          {APP_FEATURES.map((feat, index) => (
                            <TouchableOpacity
                              key={index}
                              style={[uiStyles.dropdownOption, { borderBottomColor: T.border }]}
                              onPress={() => { setFeedbackFeature(feat); setIsDropdownOpen(false); }}
                            >
                              <Text style={{ color: feedbackFeature === feat ? COLORS.primaryLight : T.text, fontSize: 14, fontWeight: feedbackFeature === feat ? 'bold' : 'normal' }}>
                                {feat}
                              </Text>
                              {feedbackFeature === feat && <Ionicons name="checkmark" size={14} color={COLORS.primaryLight} />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <Text style={[uiStyles.inputLabel, { color: T.subText }]}>Your Message</Text>
                    <TextInput
                      style={[uiStyles.inputField, { backgroundColor: T.bg, color: T.text, borderColor: T.border, height: 100, textAlignVertical: 'top', marginBottom: 20 }]}
                      value={feedbackMessage} onChangeText={setFeedbackMessage} placeholder="Tell us what's on your mind..." placeholderTextColor={T.subText} multiline autoCorrect={false} onFocus={() => setIsDropdownOpen(false)}
                    />

                    <View style={uiStyles.modalActions}>
                      <TouchableOpacity style={[uiStyles.cancelBtn, { backgroundColor: T.bg, borderColor: T.border }]} onPress={() => setIsFeedbackVisible(false)}>
                        <Text style={{ color: T.text, fontWeight: 'bold' }}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={uiStyles.saveBtn} onPress={submitFeedback} disabled={isSubmittingFeedback}>
                        {isSubmittingFeedback ? <ActivityIndicator size="small" color="white" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Submit</Text>}
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

// 🎨 SLEEK & PROFESSIONAL UI STYLES
const uiStyles = StyleSheet.create({
  card: {
    borderRadius: 10,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  avatarWrapper: { marginBottom: 12 },
  avatarImage: { width: 76, height: 76, borderRadius: 38, borderWidth: 2 },
  avatarPlaceholder: { width: 76, height: 76, borderRadius: 38, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  welcomeText: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  emailText: { fontSize: 13, marginBottom: 16 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 20,
    borderRadius: 8, borderWidth: 1,
  },
  editBtnText: { fontSize: 12, fontWeight: 'bold' },

  statsCard: {
    borderRadius: 10,
    padding: 18,
    marginBottom: 24,
    backgroundColor: COLORS.primary,
  },

  // Side-by-side layout with text on left, number on right
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statsLeftContent: { flex: 1, marginRight: 12 },
  statsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statsIconBg: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  statsTitle: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  statsSubtext: { fontSize: 12, color: 'rgba(255,255,255,0.8)', lineHeight: 16 },

  statsDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 12 },
  statsBigNumber: { fontSize: 36, fontWeight: '900', color: '#fff' },

  sectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 10, marginLeft: 4 },

  // Grouped List Styles
  groupedList: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  listIconBg: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  listTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  listSub: { fontSize: 11 },
  listDivider: { height: 1, marginHorizontal: 14 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  kavWrapper: { flex: 1, justifyContent: 'center', width: '100%' },
  centerScrollContent: { flexGrow: 1, justifyContent: 'center', width: '100%' },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 12, padding: 20, borderWidth: 1 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  closeBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },

  modalAvatarBtn: { alignSelf: 'center', marginBottom: 20, position: 'relative' },
  modalAvatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 2 },
  modalAvatarPlaceholder: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primary, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },

  feedbackDesc: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
  inputLabel: { fontSize: 11, fontWeight: 'bold', marginBottom: 6, marginLeft: 2 },
  inputField: { borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 1, marginBottom: 14 },

  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  categoryPill: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center', marginHorizontal: 3 },

  dropdownTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownList: { borderRadius: 8, marginBottom: 14, borderWidth: 1, overflow: 'hidden' },
  dropdownOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },

  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' },
});