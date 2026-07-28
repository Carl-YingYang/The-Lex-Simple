import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

import { globalStyles, COLORS } from '../../../theme/globalStyles';
import { useCustomAlert } from '../../../components/CustomAlert';

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
  const API_BASE_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev';

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
    } catch (e) {
      console.log(e);
    }
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
    } catch (e) {
      console.log(e);
    }
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
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true',
        },
        body: JSON.stringify({
          name,
          email,
          category: feedbackCategory,
          feature: feedbackFeature,
          message: feedbackMessage,
        }),
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
    <View style={globalStyles.profile_container}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={globalStyles.profile_header}>
        <Text style={globalStyles.profile_headerTitle}>My Profile</Text>
      </View>

      {/* ── Main Scroll ─────────────────────────────────────────── */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={globalStyles.profile_scrollContent}>
        {/* Profile Card */}
        <View style={globalStyles.profile_mainCard}>
          <View style={globalStyles.profile_avatarWrapper}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={globalStyles.profile_avatarImage} />
            ) : (
              <View style={globalStyles.profile_avatarPlaceholder}>
                <Text style={globalStyles.profile_avatarText}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={globalStyles.profile_welcomeText}>{name}</Text>
          <Text style={globalStyles.profile_emailText}>{email}</Text>
          <TouchableOpacity style={globalStyles.profile_editBtn} onPress={openEditModal}>
            <Ionicons name="pencil" size={13} color="white" style={{ marginRight: 6 }} />
            <Text style={globalStyles.profile_editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Card */}
        <View style={globalStyles.profile_statsCard}>
          <View style={globalStyles.profile_statsHeader}>
            <View style={globalStyles.profile_statsIconBg}>
              <Ionicons name="document-text" size={20} color={COLORS.primaryLight} />
            </View>
            <Text style={globalStyles.profile_statsTitle}>Documents Analyzed</Text>
          </View>
          <View style={globalStyles.profile_statsContent}>
            <Text style={globalStyles.profile_statsBigNumber}>{totalScanned}</Text>
            <Text style={globalStyles.profile_statsSubtext}>Files saved in your library</Text>
          </View>
        </View>

        {/* Legal Resources */}
        <Text style={globalStyles.profile_sectionTitle}>LEGAL RESOURCES</Text>
        <TouchableOpacity
          style={globalStyles.profile_actionBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('LegalAidScreen')}
        >
          <View style={[globalStyles.profile_actionIconBg, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
            <Ionicons name="briefcase" size={22} color={COLORS.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={globalStyles.profile_actionTitle}>Legal Assistance Guides</Text>
            <Text style={globalStyles.profile_actionSub}>Learn how to get a PAO, IBP, or Private Lawyer</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {/* App Information */}
        <Text style={[globalStyles.profile_sectionTitle, { marginTop: 25 }]}>APP INFORMATION</Text>
        <TouchableOpacity
          style={globalStyles.profile_actionBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('AboutScreen')}
        >
          <View style={globalStyles.profile_actionIconBg}>
            <Ionicons name="information-circle" size={22} color={COLORS.primaryLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={globalStyles.profile_actionTitle}>About Lex-Simple</Text>
            <Text style={globalStyles.profile_actionSub}>Mission, features, & developers</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={globalStyles.profile_actionBtn} activeOpacity={0.8} onPress={openFeedbackModal}>
          <View style={[globalStyles.profile_actionIconBg, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
            <Ionicons name="chatbubble-ellipses" size={22} color={COLORS.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={globalStyles.profile_actionTitle}>Send Feedback</Text>
            <Text style={globalStyles.profile_actionSub}>Report bugs or suggest features</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </ScrollView>

      {/* ─────────────────────────────────────────────────────────────
          EDIT PROFILE MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal visible={isEditing} transparent animationType="fade" onRequestClose={() => setIsEditing(false)} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={globalStyles.profile_modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "padding"} 
              style={globalStyles.profile_kavWrapper}
            >
              <ScrollView contentContainerStyle={globalStyles.profile_centerScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <TouchableWithoutFeedback>
                  <View style={globalStyles.profile_modalCard}>
                    
                    <View style={globalStyles.profile_modalHeaderRow}>
                      <Text style={globalStyles.profile_modalTitle}>Edit Profile</Text>
                      <TouchableOpacity onPress={() => setIsEditing(false)} style={globalStyles.profile_closeBtn}>
                        <Ionicons name="close" size={18} color="white" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={globalStyles.profile_modalAvatarBtn} onPress={pickImage}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={globalStyles.profile_modalAvatarImage} />
                      ) : (
                        <View style={globalStyles.profile_modalAvatarPlaceholder}>
                          <Ionicons name="camera" size={26} color={COLORS.textMuted} />
                        </View>
                      )}
                      <View style={globalStyles.profile_editBadge}>
                        <Ionicons name="pencil" size={11} color="white" />
                      </View>
                    </TouchableOpacity>

                    <Text style={globalStyles.profile_inputLabel}>Full Name</Text>
                    <TextInput
                      style={globalStyles.profile_inputField}
                      value={editName}
                      onChangeText={setEditName}
                      placeholderTextColor={COLORS.textMuted}
                      autoCorrect={false}
                      returnKeyType="next"
                    />

                    <Text style={globalStyles.profile_inputLabel}>Email Address</Text>
                    <TextInput
                      style={[globalStyles.profile_inputField, { marginBottom: 24 }]}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      keyboardType="email-address"
                      placeholderTextColor={COLORS.textMuted}
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />

                    <View style={globalStyles.profile_modalActions}>
                      <TouchableOpacity style={globalStyles.profile_cancelBtn} onPress={() => setIsEditing(false)}>
                        <Text style={globalStyles.profile_cancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={globalStyles.profile_saveBtn} onPress={saveProfileData}>
                        <Text style={globalStyles.profile_saveText}>Save Changes</Text>
                      </TouchableOpacity>
                    </View>

                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          FEEDBACK MODAL
      ───────────────────────────────────────────────────────────── */}
      <Modal visible={isFeedbackVisible} transparent animationType="fade" onRequestClose={() => setIsFeedbackVisible(false)} statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); setIsDropdownOpen(false); }}>
          <View style={globalStyles.profile_modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === "ios" ? "padding" : "padding"} 
              style={globalStyles.profile_kavWrapper}
            >
              <ScrollView contentContainerStyle={globalStyles.profile_centerScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
                <TouchableWithoutFeedback>
                  <View style={globalStyles.profile_modalCard}>
                    
                    <View style={globalStyles.profile_modalHeaderRow}>
                      <Text style={globalStyles.profile_modalTitle}>Send Feedback</Text>
                      <TouchableOpacity onPress={() => setIsFeedbackVisible(false)} style={globalStyles.profile_closeBtn}>
                        <Ionicons name="close" size={18} color="white" />
                      </TouchableOpacity>
                    </View>

                    <Text style={globalStyles.profile_feedbackDesc}>
                      Let us know what you think! Your feedback helps us improve the Lex-Simple experience.
                    </Text>

                    <Text style={globalStyles.profile_inputLabel}>Category</Text>
                    <View style={globalStyles.profile_categoryRow}>
                      {['Suggestion', 'Bug Report', 'Other'].map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[globalStyles.profile_categoryPill, feedbackCategory === cat && globalStyles.profile_categoryPillActive]}
                          onPress={() => setFeedbackCategory(cat)}
                        >
                          <Text style={[globalStyles.profile_categoryText, feedbackCategory === cat && globalStyles.profile_categoryTextActive]}>
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={globalStyles.profile_inputLabel}>Related Feature</Text>
                    <TouchableOpacity
                      style={[globalStyles.profile_inputField, globalStyles.profile_dropdownTrigger, isDropdownOpen && { borderColor: COLORS.primaryLight }]}
                      activeOpacity={0.8}
                      onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      <Text style={{ color: 'white', fontSize: 14 }}>{feedbackFeature}</Text>
                      <Ionicons name={isDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>

                    {isDropdownOpen && (
                      <View style={globalStyles.profile_dropdownList}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }}>
                          {APP_FEATURES.map((feat, index) => (
                            <TouchableOpacity
                              key={index}
                              style={[globalStyles.profile_dropdownOption, index === APP_FEATURES.length - 1 && { borderBottomWidth: 0 }]}
                              onPress={() => { setFeedbackFeature(feat); setIsDropdownOpen(false); }}
                            >
                              <Text style={[globalStyles.profile_dropdownOptionText, feedbackFeature === feat && { color: COLORS.primaryLight, fontWeight: 'bold' }]}>
                                {feat}
                              </Text>
                              {feedbackFeature === feat && <Ionicons name="checkmark" size={16} color={COLORS.primaryLight} />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    <Text style={globalStyles.profile_inputLabel}>Your Message</Text>
                    <TextInput
                      style={[globalStyles.profile_inputField, { height: 110, textAlignVertical: 'top', marginBottom: 24 }]}
                      value={feedbackMessage}
                      onChangeText={setFeedbackMessage}
                      placeholder="Tell us what's on your mind..."
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      autoCorrect={false}
                      onFocus={() => setIsDropdownOpen(false)}
                    />

                    <View style={globalStyles.profile_modalActions}>
                      <TouchableOpacity style={globalStyles.profile_cancelBtn} onPress={() => setIsFeedbackVisible(false)}>
                        <Text style={globalStyles.profile_cancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={globalStyles.profile_saveBtn} onPress={submitFeedback} disabled={isSubmittingFeedback}>
                        {isSubmittingFeedback ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <Text style={globalStyles.profile_saveText}>Submit</Text>
                        )}
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
    </View>
  );
}