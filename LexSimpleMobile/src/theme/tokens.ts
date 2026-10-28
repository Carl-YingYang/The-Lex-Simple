// TOKENS VERSION: 1.0.0
// Iisang pinagmulan ng katotohanan (Single source of truth) para sa lahat ng desisyon sa disenyo:
// kulay (kada tema), spacing, radius, borders, hard shadows, typography.
// PANUNTUNA: BAWAL ang hardcoded hex/rgba sa mga screen/components — dito lang ang lahat.
import { Platform } from 'react-native';

// ============================================================
// 1) TYPOGRAPHY — mga pamilya ng font
// ============================================================
// Habang '' (empty string) pa ang mga ito, system font ang gagamitin — ligtas itong drop-in.
// Kapag naka-install na ang expo-font + @expo-google-fonts (hiwalay na mikroyugto),
// palitan ang mga '' ng mga totoong font names sa ibaba:
//   display: 'ArchivoBlack_400Normal'
//   body: 'Inter_400Regular', bodySemi: 'Inter_600SemiBold', bodyBold: 'Inter_700Bold'
export const FONT = {
    display: '',
    body: '',
    bodySemi: '',
    bodyBold: '',
};

// Type scale — i-spread sa mga istilo ng Text, hal.:
//   <Text style={{ ...TYPE.title, fontFamily: FONT.bodyBold, color: colors.text }}>
export const TYPE = {
    display: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 }, // mga pamagat ng screen (ALL CAPS)
    title: { fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },   // mga pamagat ng seksyon
    heading: { fontSize: 17, lineHeight: 24, letterSpacing: 0 },    // mga pamagat ng card
    body: { fontSize: 14, lineHeight: 21, letterSpacing: 0 },
    small: { fontSize: 12, lineHeight: 18, letterSpacing: 0 },
    micro: { fontSize: 10, lineHeight: 14, letterSpacing: 0.3 },    // badges, overlines
};

// ============================================================
// 2) SPACING / RADIUS / BORDER / SHADOW (mga pare-pareho, walang tema)
// ============================================================
export const SPACING = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 40,
};

export const RADIUS = {
    sm: 8,    // mga chip, maliit na kontrol
    md: 12,   // mga pindutan, linya
    lg: 16,   // mga card, panel
    pill: 999,
};

export const BORDER = {
    thin: 1,     // mga maliliit na separator (legacy style)
    thick: 2,    // karaniwang brutalist border
    brutal: 3,   // mga hero card, pangunahing CTA
};

// Mga Hard offset shadow (zero blur = ang lagda ng neo-brutalism).
// Paggamit (sa loob ng primitives/components):
//   {
//     shadowColor: colors.shadow,
//     ...SHADOW.md.ios,
//     elevation: SHADOW.md.android,
//   }
// Tandaan: Ang Android elevation ay bahagyang malambot; ang iOS ay eksaktong 0-radius na hard shadow.
export const SHADOW = {
    sm: {
        ios: { shadowOffset: { width: 2, height: 2 }, shadowRadius: 0, shadowOpacity: 1 },
        android: 2,
    },
    md: {
        ios: { shadowOffset: { width: 4, height: 4 }, shadowRadius: 0, shadowOpacity: 1 },
        android: 4,
    },
    lg: {
        ios: { shadowOffset: { width: 6, height: 6 }, shadowRadius: 0, shadowOpacity: 1 },
        android: 8,
    },
};

// ============================================================
// 3) MGA SEMANTIC NA KULAY NG TEMA
// ============================================================
export interface ThemeColors {
    // --- LEGACY 5: ang mga susi (key) na ginagamit ng LAHAT ng umiiral na screen ngayon.
    // HUWAG buburahin o palitan ang pangalan — nagpapatuloy ang mga screen nang hindi nasisira.
    bg: string;
    card: string;
    text: string;
    subText: string;
    border: string; // maliliit na separator/hairline (hindi ito ang brutal border)

    // --- Brutalism base
    cardHover: string;  // pressed / malumanay na container
    ink: string;        // BRUTAL borders, hard shadows, tints ng icon
    overlay: string;    // scrim sa likod ng mga modal/loader

    // --- Brand: "lawyer purple" (pangalawang accent ng app)
    brand: string;      // CTA fill, mga aktibong estado, fill ng progreso
    brandText: string;  // teksto SA LOOB ng brand fill
    brandSoft: string;  // may tint na bg (napili, mga chip)

    // --- Feedback (legal app mapping: amber = babala sa panganib, pula = panganib, berde = tagumpay)
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    warningSoft: string;
    info: string;
    infoSoft: string;

    // --- Highlight: ang dilaw mula sa reference (accent ng progreso, kapistahan, badge)
    highlight: string;
    highlightText: string;

    // --- Kulay ng shadow (light = itim na ink; dark = malapit sa puti para visible ang hard shadow)
    shadow: string;
}

export const lightTheme: ThemeColors = {
    // Legacy 5
    bg: '#FDFDF8',        // puti ng papel
    card: '#FFFFFF',
    text: '#111111',
    subText: '#52525B',
    border: '#DEDED8',    // malumanay na hairline (legacy separator)

    // Brutalism base
    cardHover: '#F4F4EE',
    ink: '#111111',
    overlay: 'rgba(17, 17, 17, 0.55)',

    // Lawyer purple
    brand: '#6D28D9',
    brandText: '#FFFFFF',
    brandSoft: 'rgba(109, 40, 217, 0.10)',

    // Feedback
    success: '#16A34A',
    successSoft: 'rgba(22, 163, 74, 0.10)',
    danger: '#DC2626',
    dangerSoft: 'rgba(220, 38, 38, 0.10)',
    warning: '#D97706',
    warningSoft: 'rgba(217, 119, 6, 0.12)',
    info: '#2563EB',
    infoSoft: 'rgba(37, 99, 235, 0.10)',

    // Highlight (reference yellow)
    highlight: '#FFC917',
    highlightText: '#111111',

    // Shadow
    shadow: '#111111',
};

export const darkTheme: ThemeColors = {
    // Legacy 5
    bg: '#0A0A0A',
    card: '#1C1C1E',      // legacy dark card color — binabalot ang mga umiiral na screen
    text: '#F5F5F0',
    subText: '#A1A1AA',
    border: '#2C2C2E',    // legacy hairline — binabalot ang mga umiiral na screen

    // Brutalism base (baligtad: mga puting border + malapit sa puting hard shadow)
    cardHover: '#26262A',
    ink: '#EDEDE8',
    overlay: 'rgba(0, 0, 0, 0.65)',

    // Lawyer purple (mas maliwanag na fill para sa madilim na bg)
    brand: '#A78BFA',
    brandText: '#0A0A0A',
    brandSoft: 'rgba(167, 139, 250, 0.14)',

    // Feedback
    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.12)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.12)',
    warning: '#FBBF24',
    warningSoft: 'rgba(251, 191, 36, 0.12)',
    info: '#60A5FA',
    infoSoft: 'rgba(96, 165, 250, 0.12)',

    // Highlight (reference yellow)
    highlight: '#FFD54A',
    highlightText: '#111111',

    // Shadow
    shadow: '#E8E8E3',
};

// Ayos sa Platform — inilalantad kung sakaling kailangan ng isang primitive
// na mag-iba ang istilo sa Android (hal. palitan ang hard shadow ng
// "double-border" na paraan sa susunod).
export const IS_ANDROID = Platform.OS === 'android';