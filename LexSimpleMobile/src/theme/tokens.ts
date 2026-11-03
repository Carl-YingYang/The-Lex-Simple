// TOKENS VERSION: 1.1.0 — PURPLE NEO-BRUTALISM SPEC
// Iisang pinagmulan ng katotohanan (Single source of truth) para sa lahat ng desisyon sa disenyo:
// kulay (kada tema), spacing, radius, borders, hard shadows, typography.
// PANUNTUNA: BAWAL ang hardcoded hex/rgba sa mga screen/components — dito lang ang lahat.
//
// SPEC MAPPING (Purple Neo-Brutalist — v1.1.0):
//   brand       = Primary Purple  #7C3AED (main accent: CTA fill, aktibong estado, progreso)
//   brandText   = #111111 — itim na teksto SA LOOB ng purple fills (spec: black text sa CTA)
//   brandVivid  = Vivid Purple    #8B5CF6 (mga badge, icon chips, split-CTA bg)
//   brandDeep   = Deep Purple     #4C1D95 (emphasis text sa lavender surfaces)
//   brandLight  = Light Purple    #C4B5FD (dekorasyong geometric, light progress)
//   brandSoft   = Pale Lavender   #F3E8FF (soft purple surfaces / selected fill)
//   BAWAL NA: dilaw/gold/orange — ang highlight/highlightText ay DEPRECATED (naka-keep
//   lang para hindi mabali ang lumang code; huwag nang gamitin sa mga bagong screen).
import { Platform } from 'react-native';

// ============================================================
// 1) TYPOGRAPHY — mga pamilya ng font
// ============================================================
// Habang '' (empty string) pa ang mga ito, system font ang gagamitin — ligtas itong drop-in.
// Kapag naka-install na ang expo-font + @expo-google-fonts (hiwalay na mikroyugto),
// palitan ang mga '' ng mga totoong font names sa ibaba:
//   display: 'Oswald_700Bold' (o Anton/Bebas — condensed heavy para sa mga heading)
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
    display: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5 }, // mga pamagat ng screen (ALL CAPS, condensed heavy)
    title: { fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },   // malalaking subtitle/pamagat
    heading: { fontSize: 17, lineHeight: 24, letterSpacing: 0 },    // mga pamagat ng seksyon (14–17 spec)
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

// SPEC: "2–6 px radius — minimal rounded corners, squared edges"
export const RADIUS = {
    sm: 3,    // maliliit na kontrol: icon buttons, badges, chips
    md: 4,    // mga pindutan, inputs, dropdowns
    lg: 6,    // mga card, panel, modal
    pill: 999, // DEPRECATED — spec: iwasan ang pill shapes; huwag nang gamitin sa bago
};

// SPEC: "1–1.5 px standard outlines; ~2 px sa CTA/hero; consistent weights"
export const BORDER = {
    thin: 1.5,  // karaniwang card, input, row, separator (standard brutal outline)
    thick: 2,   // hero card, CTA buttons, app bar rule
    brutal: 3,  // reserved — hindi na default kahit saan
};

// Mga Hard offset shadow (zero blur = ang lagda ng neo-brutalism).
// SPEC: "predominantly flat — 2–3px hard shadow LANG sa mga focal element
// (hero card, CTA, modal)". Kaya: sm ang default na gamitin; md/lg ay reserved.
// Paggamit:
//   {
//     shadowColor: colors.shadow,
//     ...SHADOW.sm.ios,
//     elevation: SHADOW.sm.android,
//   }
export const SHADOW = {
    sm: {
        ios: { shadowOffset: { width: 2, height: 2 }, shadowRadius: 0, shadowOpacity: 1 },
        android: 2,
    },
    md: { // reserved — kasalukuyang walang gumagamit sa purple spec
        ios: { shadowOffset: { width: 4, height: 4 }, shadowRadius: 0, shadowOpacity: 1 },
        android: 4,
    },
    lg: { // reserved — kasalukuyang walang gumagamit sa purple spec
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
    ink: string;        // BRUTAL borders, hard shadows, tints ng icon (#111111 sa spec)
    overlay: string;    // scrim sa likod ng mga modal/loader

    // --- Brand: PURPLE SYSTEM (spec v1.1.0)
    brand: string;      // Primary Purple #7C3AED — CTA fill, aktibong estado, progreso
    brandText: string;  // teksto SA LOOB ng brand fill (#111111 — itim, ayon sa spec)
    brandSoft: string;  // Pale Lavender #F3E8FF — soft surfaces, selected fill
    brandVivid: string; // Vivid Purple #8B5CF6 — badges, icon chips, split-CTA bg
    brandDeep: string;  // Deep Purple #4C1D95 — emphasis text sa lavender surfaces
    brandLight: string; // Light Purple #C4B5FD — dekorasyon, light progress

    // --- Feedback (legal app mapping: amber = babala sa panganib, pula = panganib, berde = tagumpay)
    success: string;
    successSoft: string;
    danger: string;
    dangerSoft: string;
    warning: string;
    warningSoft: string;
    info: string;
    infoSoft: string;

    // --- DEPRECATED (dilaw mula sa lumang interpretasyon — BAWAL na sa purple spec).
    // Naka-keep lang para hindi mabali ang mga lumang sanggunian; huwag gamitin sa bagong UI.
    highlight: string;
    highlightText: string;

    // --- Kulay ng shadow (light = itim na ink; dark = malapit sa puti para visible ang hard shadow)
    shadow: string;
}

export const lightTheme: ThemeColors = {
    // Legacy 5
    bg: '#FAF9F6',        // Warm Off-White (spec: primary screen background)
    card: '#FFFFFF',      // White (spec: main cards / form surfaces)
    text: '#111111',      // Near Black (spec: primary text, icons, outlines)
    subText: '#6B6B6B',   // Muted Gray (spec: secondary text)
    border: '#E5E5E5',    // Light Gray (spec: progress tracks, subtle separators)

    // Brutalism base
    cardHover: '#F4F3EF',
    ink: '#111111',       // Near Black — lahat ng brutal outlines
    overlay: 'rgba(17, 17, 17, 0.55)',

    // Purple system (spec v1.1.0)
    brand: '#7C3AED',     // Primary Purple
    brandText: '#111111', // itim na teksto sa loob ng purple (spec CTA)
    brandSoft: '#F3E8FF', // Pale Lavender
    brandVivid: '#8B5CF6',// Vivid Purple
    brandDeep: '#4C1D95', // Deep Purple
    brandLight: '#C4B5FD',// Light Purple

    // Feedback
    success: '#16A34A',
    successSoft: 'rgba(22, 163, 74, 0.10)',
    danger: '#DC2626',
    dangerSoft: 'rgba(220, 38, 38, 0.10)',
    warning: '#D97706',
    warningSoft: 'rgba(217, 119, 6, 0.12)',
    info: '#2563EB',
    infoSoft: 'rgba(37, 99, 235, 0.10)',

    // DEPRECATED yellow (huwag gamitin)
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

    // Purple system — dark: mas maliwanag na purple fills + itim na teksto sa loob
    brand: '#A78BFA',
    brandText: '#0A0A0A',
    brandSoft: 'rgba(167, 139, 250, 0.16)',
    brandVivid: '#C4B5FD',
    brandDeep: '#8B5CF6',
    brandLight: '#DDD6FE',

    // Feedback
    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.12)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.12)',
    warning: '#FBBF24',
    warningSoft: 'rgba(251, 191, 36, 0.12)',
    info: '#60A5FA',
    infoSoft: 'rgba(96, 165, 250, 0.12)',

    // DEPRECATED yellow (huwag gamitin)
    highlight: '#FFD54A',
    highlightText: '#111111',

    // Shadow
    shadow: '#E8E8E3',
};

// Ayos sa Platform — inilalantad kung sakaling kailangan ng isang primitive
// na mag-iba ang istilo sa Android (hal. palitan ang hard shadow ng
// "double-border" na paraan sa susunod).
export const IS_ANDROID = Platform.OS === 'android';