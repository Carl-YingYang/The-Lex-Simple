import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StyleSheet, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, globalStyles } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';
import { useTheme } from '../../../theme/ThemeContext';

export default function LegalAidScreen({ navigation }: any) {
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedGuide, setSelectedGuide] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();
  const { colors: T, isDarkMode } = useTheme();

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
  const localFileUri = FileSystem.documentDirectory + 'lex_guides_db.json';

  useEffect(() => {
    loadGuidesFromLocalDB();
  }, []);

  const loadGuidesFromLocalDB = async () => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(localFileUri);
      if (fileInfo.exists) {
        const fileContent = await FileSystem.readAsStringAsync(localFileUri);
        setGuides(JSON.parse(fileContent));
      } else {
        syncGuides();
      }
    } catch (error) {
      console.log("Error loading guides:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncGuides = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/guides/sync`, {
        method: 'GET',
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      const json = await response.json();

      if (json.status === 'success') {
        await FileSystem.writeAsStringAsync(localFileUri, JSON.stringify(json.data));
        setGuides(json.data);
        showAlert("Update Complete", "Legal Assistance guides have been downloaded.", "success");
      }
    } catch (e) {
      showAlert("Offline Mode", "Could not connect to server. Showing available offline guides.", "warning");
    } finally {
      setIsSyncing(false);
    }
  };

  const openGuide = (guide: any) => {
    setSelectedGuide(guide);
    setIsModalVisible(true);
  };

  const closeGuide = () => {
    setIsModalVisible(false);
    setSelectedGuide(null);
  };

  const renderFormattedText = (rawText: string) => {
    const lines = rawText.split('\n');

    return lines.map((line, index) => {
      let currentLine = line.trim();
      if (!currentLine) return null;

      if (currentLine.match(/^(Step \d+|Official Action:|Official Basis:|Proseso:|Proseso ng Pagsusuri:|Consultation Fee:|Documentary Requirements:|Kahaligahan:|Sino ang pwede:)/i)) {
        return <Text key={index} style={[uiStyles.stepTitle, { color: COLORS.primaryLight }]}>{currentLine}</Text>;
      }

      if (currentLine.match(/^(•|\d+\.|[A-Z]\.|o)\s/)) {
        let cleanBullet = currentLine.replace(/^(•|\d+\.|[A-Z]\.|o)\s/, '');
        return (
          <View key={index} style={uiStyles.bulletRow}>
            <View style={[uiStyles.bulletDot, { backgroundColor: T.subText }]} />
            <Text style={[uiStyles.bulletText, { color: T.text }]}>{cleanBullet}</Text>
          </View>
        );
      }

      if (currentLine.includes(':')) {
        const parts = currentLine.split(':');
        if (parts.length === 2 && parts[0].length < 40) {
          return (
            <View key={index} style={[uiStyles.bulletRow, { marginLeft: 12 }]}>
              <View style={[uiStyles.bulletDot, { backgroundColor: COLORS.primaryLight }]} />
              <Text style={[uiStyles.bulletText, { color: T.text }]}>
                <Text style={{ fontWeight: 'bold', color: COLORS.primaryLight }}>{parts[0].trim()}: </Text>
                {parts[1].trim()}
              </Text>
            </View>
          );
        }
      }

      return <Text key={index} style={[uiStyles.normalText, { color: T.subText }]}>{currentLine}</Text>;
    });
  };

  if (loading) {
    return (
      <ScreenLayout title="Legal Assistance" noPadding={true}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: T.bg }}>
          <ActivityIndicator size="large" color={COLORS.primaryLight} />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Legal Assistance" noPadding={true}>
      {/* Main Screen ScrollView - Added nestedScrollEnabled and flexGrow */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 40, backgroundColor: T.bg }}
        nestedScrollEnabled={true}
      >

        {/* HEADER BANNER */}
        <View style={[uiStyles.headerBanner, { backgroundColor: T.card, borderColor: T.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[uiStyles.bannerTitle, { color: T.text }]}>Need Legal Help?</Text>
            <Text style={[uiStyles.bannerSubtitle, { color: T.subText }]}>
              Find free legal aid or hire a private attorney.
            </Text>
            <TouchableOpacity style={uiStyles.syncBtn} onPress={syncGuides} disabled={isSyncing}>
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={uiStyles.syncBtnText}>UPDATE GUIDES</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={uiStyles.bannerIconCircle}>
            <Ionicons name="shield-checkmark" size={40} color={COLORS.primaryLight} />
          </View>
        </View>

        {/* GRID LAYOUT */}
        <Text style={[uiStyles.sectionTitle, { color: T.subText }]}>SERVICES & GUIDES</Text>

        {guides.length === 0 ? (
          <View style={[uiStyles.emptyBox, { backgroundColor: T.card, borderColor: T.border }]}>
            <Ionicons name="document-text-outline" size={40} color={T.subText} />
            <Text style={[uiStyles.emptyText, { color: T.subText }]}>No guides available yet. Tap "Update Guides" to download.</Text>
          </View>
        ) : (
          <View style={uiStyles.gridContainer}>
            {guides.map((item, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.8}
                onPress={() => openGuide(item)}
                style={[uiStyles.gridCard, { backgroundColor: T.card, borderColor: T.border }]}
              >
                <View style={uiStyles.cardIconBg}>
                  <Ionicons name="briefcase-outline" size={28} color={COLORS.primaryLight} />
                </View>
                <Text style={[uiStyles.cardTitle, { color: T.text }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[uiStyles.cardSub, { color: T.subText }]}>Tap to read</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>

      {/* FULL SCREEN READER */}
      <Modal visible={isModalVisible} animationType="slide" onRequestClose={closeGuide}>
        <View style={{ flex: 1, backgroundColor: T.bg }}>

          <View style={[uiStyles.fullScreenHeader, { backgroundColor: T.bg, borderBottomColor: T.border }]}>
            <TouchableOpacity onPress={closeGuide} style={uiStyles.backBtn}>
              <Ionicons name="arrow-back" size={26} color={T.text} />
            </TouchableOpacity>
            <Text style={[uiStyles.fullScreenTitle, { color: T.text }]} numberOfLines={2}>{selectedGuide?.title}</Text>
          </View>

          {/* Modal ScrollView - Added nestedScrollEnabled and flexGrow to fix scrolling bugs */}
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 50, backgroundColor: T.bg }}
            nestedScrollEnabled={true}
          >
            <View>
              {selectedGuide && renderFormattedText(selectedGuide.content)}
            </View>
          </ScrollView>

        </View>
      </Modal>

      <AlertRender />
    </ScreenLayout>
  );
}

const uiStyles = StyleSheet.create({
  headerBanner: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  syncBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
    alignItems: 'center',
  },
  syncBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  bannerIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 16,
    letterSpacing: 1,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: '48%',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  cardIconBg: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 11,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 13,
  },

  // FULL SCREEN MODAL STYLES
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 10 : 50,
    paddingBottom: 15,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 10,
  },
  fullScreenTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 40,
  },

  // TEXT FORMATTER STYLES
  stepTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingRight: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    marginRight: 8,
  },
  bulletText: {
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  normalText: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  }
});