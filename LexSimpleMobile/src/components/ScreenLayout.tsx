import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../theme/globalStyles';
import { useTheme } from '../theme/ThemeContext';

interface ScreenLayoutProps {
  title: string;
  children: React.ReactNode;
  showBackButton?: boolean;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  noPadding?: boolean;
}

export default function ScreenLayout({
  title,
  children,
  showBackButton = true,
  rightIcon,
  onRightPress,
  noPadding = false,
}: ScreenLayoutProps) {
  const navigation = useNavigation();
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44 }}>

      {/* ─── APP BAR ─── */}
      <View style={[styles.appBar, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>

        {/* LEFT — Back button (Pinned Left) */}
        <View style={[styles.sideSlot, { alignItems: 'flex-start' }]}>
          {showBackButton ? (
            <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <View style={[styles.iconRing, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </View>
            </TouchableOpacity>
          ) : <View style={styles.spacer} />}
        </View>

        {/* CENTER — Title */}
        <View style={styles.centerSlot}>
          <Text style={[styles.appBarTitle, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {/* RIGHT — Trash Icon (Pinned Far Right Edge) */}
        <View style={[styles.sideSlot, { alignItems: 'flex-end' }]}>
          {rightIcon ? (
            <TouchableOpacity style={styles.iconButton} onPress={onRightPress} activeOpacity={0.7}>
              <View style={[styles.iconRing, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name={rightIcon} size={20} color={COLORS.danger} />
              </View>
            </TouchableOpacity>
          ) : <View style={styles.spacer} />}
        </View>
      </View>

      {/* ─── CONTENT ─── */}
      <View style={[styles.content, !noPadding && { paddingHorizontal: 16 }]}>
        {children}
      </View>
    </View>
  );
}

const SIDE_SLOT_WIDTH = 50;
const styles = StyleSheet.create({
  appBar: {
    paddingTop: 10,
    paddingBottom: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sideSlot: {
    width: SIDE_SLOT_WIDTH,
    justifyContent: 'center'
  },
  centerSlot: {
    position: 'absolute',
    left: SIDE_SLOT_WIDTH,
    right: SIDE_SLOT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1
  },
  iconRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconButton: { padding: 0 },
  appBarTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  spacer: { width: SIDE_SLOT_WIDTH, height: 38 },
  content: { flex: 1 },
});