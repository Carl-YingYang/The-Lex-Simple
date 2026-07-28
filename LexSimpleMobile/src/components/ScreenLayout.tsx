import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
// 🛠️ Import ang global styles at COLORS natin
import { globalStyles, COLORS } from '../theme/globalStyles';

const { width } = Dimensions.get('window');

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

  return (
    <View style={globalStyles.safeArea}>

      {/* ─── APP BAR ─── */}
      <View style={styles.appBar}>
        
        {/* Soft indigo wash layered on top of the base bg */}
        <View style={styles.indigoOverlay} pointerEvents="none" />

        <View style={styles.barRow}>

          {/* LEFT — Back button */}
          <View style={styles.sideSlot}>
            {showBackButton ? (
              <TouchableOpacity style={styles.iconButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
                <View style={styles.iconRing}>
                  <Ionicons name="chevron-back" size={22} color="#a5b4fc" />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.spacer} />
            )}
          </View>

          {/* CENTER — Title */}
          <View style={styles.centerSlot}>
            <Text style={styles.appBarTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* RIGHT — Optional action icon */}
          <View style={styles.sideSlot}>
            {rightIcon ? (
              <TouchableOpacity style={styles.iconButton} onPress={onRightPress} activeOpacity={0.7}>
                <View style={styles.iconRing}>
                  <Ionicons name={rightIcon} size={20} color="#a5b4fc" />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.spacer} />
            )}
          </View>

        </View>
      </View>

      {/* ─── CONTENT ─── */}
      <View style={[styles.content, !noPadding && { paddingHorizontal: 20 }]}>
        {children}
      </View>

    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const SIDE_SLOT_WIDTH = 50;

const styles = StyleSheet.create({

  appBar: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: COLORS.background,  // Ginaya na sa true black ng buong app para seamless
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 8,
    paddingBottom: 15,
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.1)', // Very subtle indigo line
  },

  // Soft indigo wash — adds a premium glow without changing the solid color completely
  indigoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(79, 70, 229, 0.05)',  // Super faint indigo tint
  },

  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Platform.OS === 'android' ? 5 : 10,
  },

  // Fixed-width side slots keep the title perfectly centred
  sideSlot: {
    width: SIDE_SLOT_WIDTH,
    alignItems: 'flex-start', // Para pumantay sa edges
    justifyContent: 'center',
  },

  centerSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: -1, // Para hindi maharang yung touch events ng buttons
  },

  // Premium Circular Ring para sa buttons (Tugma sa Chat at Scan Screen)
  iconRing: {
    width: 38,
    height: 38,
    borderRadius: 19, // Circular pill
    backgroundColor: 'rgba(99, 102, 241, 0.1)',  // Light indigo background
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.15)', // Subtle border
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconButton: {
    padding: 0,
  },

  // Clean Typography
  appBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',              
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  spacer: {
    width: SIDE_SLOT_WIDTH,
    height: 38,
  },

  content: {
    flex: 1,
  },
});