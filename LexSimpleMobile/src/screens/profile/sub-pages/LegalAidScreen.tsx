import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { COLORS, globalStyles } from '../../../theme/globalStyles';
import ScreenLayout from '../../../components/ScreenLayout';
import { useCustomAlert } from '../../../components/CustomAlert';

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
        return <Text key={index} style={globalStyles.legalAid_stepTitleText}>{currentLine}</Text>;
      }

      if (currentLine.match(/^(•|\d+\.|[A-Z]\.|o)\s/)) {
        let cleanBullet = currentLine.replace(/^(•|\d+\.|[A-Z]\.|o)\s/, '');
        return (
          <View key={index} style={globalStyles.legalAid_bulletRow}>
            <Text style={globalStyles.legalAid_bulletPoint}>•</Text>
            <Text style={globalStyles.legalAid_bulletText}>{cleanBullet}</Text>
          </View>
        );
      }

      if (currentLine.includes(':')) {
        const parts = currentLine.split(':');
        if (parts.length === 2 && parts[0].length < 40) { 
          return (
            <View key={index} style={[globalStyles.legalAid_bulletRow, { marginLeft: 15 }]}>
              <Text style={globalStyles.legalAid_bulletPoint}>◦</Text>
              <Text style={globalStyles.legalAid_bulletText}>
                <Text style={{ fontWeight: 'bold', color: 'white' }}>{parts[0].trim()}: </Text>
                {parts[1].trim()}
              </Text>
            </View>
          );
        }
      }

      // 💡 NORMAL TEXT AY NAKA-JUSTIFY NA DIN!
      return <Text key={index} style={globalStyles.legalAid_normalText}>{currentLine}</Text>;
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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={globalStyles.legalAid_scrollContent}>
        
        <View style={globalStyles.legalAid_headerBox}>
          <Ionicons name="briefcase" size={40} color={COLORS.primaryLight} />
          <Text style={globalStyles.legalAid_title}>Need a Lawyer?</Text>
          <Text style={globalStyles.legalAid_subtitle}>
            Read our offline guides on how to get free legal aid from PAO and IBP, or how to hire a private attorney.
          </Text>

          <TouchableOpacity style={globalStyles.legalAid_syncBtn} onPress={syncGuides} disabled={isSyncing}>
            {isSyncing ? (
               <ActivityIndicator size="small" color={COLORS.primaryLight} />
            ) : (
               <>
                 <Ionicons name="cloud-download" size={16} color={COLORS.primaryLight} style={{ marginRight: 6 }} />
                 <Text style={globalStyles.legalAid_syncBtnText}>UPDATE GUIDES</Text>
               </>
            )}
          </TouchableOpacity>
        </View>

        {guides.length === 0 ? (
           <View style={globalStyles.legalAid_emptyBox}>
             <Ionicons name="document-text-outline" size={30} color={COLORS.textMuted} />
             <Text style={globalStyles.legalAid_emptyText}>No guides available yet. Tap "Update Guides" to download.</Text>
           </View>
        ) : (
          guides.map((item, index) => (
            <TouchableOpacity 
              key={index}
              activeOpacity={0.8} 
              onPress={() => openGuide(item)}
              style={globalStyles.legalAid_cardBtn}
            >
              <View style={globalStyles.legalAid_cardIconBg}>
                <Ionicons name="document-text" size={20} color={COLORS.primaryLight} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={globalStyles.legalAid_guideTitle}>{item.title}</Text>
                <Text style={globalStyles.legalAid_guideSub}>Tap to read full guide</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ============================================================================== */}
      {/* 💡 CENTERED HOVER MODAL (WITH SIDE MARGINS) */}
      {/* ============================================================================== */}
      <Modal visible={isModalVisible} animationType="fade" transparent={true} onRequestClose={closeGuide}>
        <View style={globalStyles.legalAid_modalOverlay}>
          <View style={globalStyles.legalAid_modalContainer}>
            
            <View style={globalStyles.legalAid_modalHeader}>
              <Text style={globalStyles.legalAid_modalTitle}>{selectedGuide?.title}</Text>
              <TouchableOpacity onPress={closeGuide} style={globalStyles.legalAid_closeBtn}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={globalStyles.legalAid_modalContent}>
              {selectedGuide && renderFormattedText(selectedGuide.content)}
            </ScrollView>

          </View>
        </View>
      </Modal>

      <AlertRender />
    </ScreenLayout>
  );
}