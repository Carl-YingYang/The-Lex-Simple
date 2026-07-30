import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, globalStyles } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 40 - 16) / 2; // 2 columns with padding and gap

export default function LegalAidScreen({ navigation }: any) {
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedGuide, setSelectedGuide] = useState<any>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const { showAlert, AlertRender } = useCustomAlert();

  const API_BASE_URL = 'https://presuppurative-unconceitedly-peyton.ngrok-free.dev';
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

      if (currentLine.match(/^(Step \d+|Official Action:|Official Basis:|Proseso:|Proseso ng Pagsusuri:|Consultation Fee:|Documentary Requirements:|Kahalagahan:|Sino ang pwede:)/i)) {
        return <Text key={index} style={sleekStyles.stepTitle}>{currentLine}</Text>;
      }

      if (currentLine.match(/^(•|\d+\.|[A-Z]\.|o)\s/)) {
        let cleanBullet = currentLine.replace(/^(•|\d+\.|[A-Z]\.|o)\s/, '');
        return (
          <View key={index} style={sleekStyles.bulletRow}>
            <View style={sleekStyles.bulletDot} />
            <Text style={sleekStyles.bulletText}>{cleanBullet}</Text>
          </View>
        );
      }

      if (currentLine.includes(':')) {
        const parts = currentLine.split(':');
        if (parts.length === 2 && parts[0].length < 40) {
          return (
            <View key={index} style={[sleekStyles.bulletRow, { marginLeft: 12 }]}>
              <View style={[sleekStyles.bulletDot, { backgroundColor: COLORS.primaryLight }]} />
              <Text style={sleekStyles.bulletText}>
                <Text style={{ fontWeight: 'bold', color: COLORS.primaryLight }}>{parts[0].trim()}: </Text>
                {parts[1].trim()}
              </Text>
            </View>
          );
        }
      }

      return <Text key={index} style={sleekStyles.normalText}>{currentLine}</Text>;
    });
  };

  if (loading) {
    return (
      <ScreenLayout title="Legal Assistance" noPadding={true}>
        <View style={globalStyles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryLight} />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title="Legal Assistance" noPadding={true}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* 🚀 SLEEK HEADER BANNER (Parang Joyride Promo Banner) */}
        <View style={sleekStyles.headerBanner}>
          <View style={{ flex: 1 }}>
            <Text style={sleekStyles.bannerTitle}>Need Legal Help?</Text>
            <Text style={sleekStyles.bannerSubtitle}>
              Find free legal aid or hire a private attorney.
            </Text>
            <TouchableOpacity style={sleekStyles.syncBtn} onPress={syncGuides} disabled={isSyncing}>
              {isSyncing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={sleekStyles.syncBtnText}>UPDATE GUIDES</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={sleekStyles.bannerIconCircle}>
            <Ionicons name="shield-checkmark" size={40} color="#fff" />
          </View>
        </View>

        {/* 🚀 GRID LAYOUT (Parang Joyride Categories) */}
        <Text style={sleekStyles.sectionTitle}>SERVICES & GUIDES</Text>

        {guides.length === 0 ? (
          <View style={sleekStyles.emptyBox}>
            <Ionicons name="document-text-outline" size={40} color={COLORS.textMuted} />
            <Text style={sleekStyles.emptyText}>No guides available. Tap update to download.</Text>
          </View>
        ) : (
          <View style={sleekStyles.gridContainer}>
            {guides.map((item, index) => (
              <TouchableOpacity
                key={index}
                activeOpacity={0.8}
                onPress={() => openGuide(item)}
                style={sleekStyles.gridCard}
              >
                <View style={sleekStyles.cardIconBg}>
                  <Ionicons name="briefcase-outline" size={28} color={COLORS.primaryLight} />
                </View>
                <Text style={sleekStyles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={sleekStyles.cardSub}>Tap to read</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>

      {/* 🚀 FULL SCREEN READER (Sleek UI) */}
      <Modal visible={isModalVisible} animationType="slide" onRequestClose={closeGuide}>
        <View style={sleekStyles.fullScreenContainer}>

          <View style={sleekStyles.fullScreenHeader}>
            <TouchableOpacity onPress={closeGuide} style={sleekStyles.backBtn}>
              <Ionicons name="arrow-back" size={26} color={COLORS.primaryLight} />
            </TouchableOpacity>
            <Text style={sleekStyles.fullScreenTitle} numberOfLines={2}>{selectedGuide?.title}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 50 }}>
            {selectedGuide && renderFormattedText(selectedGuide.content)}
          </ScrollView>

        </View>
      </Modal>

      <AlertRender />
    </ScreenLayout>
  );
}

// 🎨 SLEEK STYLES (Inspired by Joyride)
const sleekStyles = StyleSheet.create({
  headerBanner: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  bannerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bannerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  syncBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary || '#6D28D9',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
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
    borderRadius: 35,
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 15,
  },
  sectionTitle: {
    color: '#94A3B8',
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
    width: CARD_WIDTH,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSub: {
    color: '#64748B',
    fontSize: 11,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 10,
    fontSize: 13,
  },

  // FULL SCREEN MODAL STYLES
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  fullScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 50,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  backBtn: {
    padding: 10,
  },
  fullScreenTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 40,
    textAlign: 'center',
  },

  // TEXT FORMATTER STYLES
  stepTitle: {
    color: COLORS.primaryLight,
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
    backgroundColor: '#94A3B8',
    marginTop: 7,
    marginRight: 8,
  },
  bulletText: {
    color: '#CBD5E1',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  normalText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
  }
});