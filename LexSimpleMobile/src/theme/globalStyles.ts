import { StyleSheet, Platform, StatusBar, Dimensions } from 'react-native';

const { height, width } = Dimensions.get('window');

// 🛠️ EXPORT NATIN ANG EXACT DIMENSION PARA MAGAMIT SA ANIMATION NG SCANNER
export const SCAN_FRAME_WIDTH = width * 0.85;
export const SCAN_FRAME_HEIGHT = height * 0.55;

// 🎨 1. GLOBAL COLORS (DARK THEME)
export const COLORS = {
  primary: '#4B0082',       // Indigo
  primaryLight: '#818cf8',
  success: '#10b981',       // Emerald Green
  info: '#3b82f6',          // Blue
  warning: '#f59e0b',       // Amber/Orange
  danger: '#ef4444',        // Red

  // 🌑 THEME BACKGROUNDS
  background: '#050505',    // True Black
  cardBg: '#121212',        // Dark Gray container
  cameraBg: 'black',
  cardHover: '#0a0a0a',

  // ✍️ TEXT COLORS
  textDark: '#ffffff',
  textMuted: '#94a3b8',
  borderLight: '#1e293b',

  // ⚠️ Specific UI Colors
  warningBg: 'rgba(75, 0, 130, 0.15)',
  warningBorder: 'rgba(75, 0, 130, 0.5)',
  warningTextDark: '#cbd5e1',

  adviceBg: 'rgba(255, 255, 255, 0.03)',
  adviceBorder: '#3b82f6',

  snippetBg: '#0a0a0a',
  snippetBorder: '#475569',
  aiTagBg: '#1e293b',

  // 📸 Camera & Loading
  progressBg: '#1e293b',
  shutterOuter: 'rgba(255,255,255,0.4)',
  shutterInner: 'white',
  overlayDim: 'rgba(0,0,0,0.6)',
  btnDarkBg: 'rgba(0,0,0,0.6)'
};

// 💅 2. GLOBAL STYLES
export const globalStyles = StyleSheet.create({

  // ==========================================
  // 📐 LAYOUTS & CONTAINERS
  // ==========================================
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 44 : 44,
  },
  scrollContent: { padding: 20 },
  centerContent: { padding: 20, alignItems: 'center' },
  centerContainer: { flex: 1, backgroundColor: COLORS.cardBg, justifyContent: 'center', alignItems: 'center' },
  cameraContainer: { flex: 1, backgroundColor: COLORS.cameraBg },

  // ==========================================
  // 📝 TYPOGRAPHY & TEXT
  // ==========================================
  sectionTitle: { fontSize: 13, fontWeight: '900', color: COLORS.textMuted, marginBottom: 15, letterSpacing: 1.5, marginTop: 10, textTransform: 'uppercase' },
  label: { fontSize: 11, color: COLORS.textMuted, fontWeight: 'bold', marginTop: 15, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  snippetText: { fontSize: 14, color: '#cbd5e1', fontStyle: 'italic', marginBottom: 10, backgroundColor: COLORS.snippetBg, padding: 15, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.snippetBorder, lineHeight: 22 },
  analysisText: { fontSize: 15, color: COLORS.textDark, lineHeight: 24, marginBottom: 5 },
  fallbackText: { marginTop: 15, color: COLORS.textMuted, fontWeight: 'bold' },
  errorText: { color: COLORS.danger, fontSize: 15, textAlign: 'center', padding: 20, fontWeight: '500' },

  // ==========================================
  // 🗂 CARDS & LISTS
  // ==========================================
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: 22,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: COLORS.textDark, marginLeft: 12, lineHeight: 24 },
  emptyStateBox: { alignItems: 'center', padding: 40, backgroundColor: COLORS.cardBg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight },
  emptyStateText: { marginTop: 15, fontSize: 15, color: COLORS.textMuted, textAlign: 'center', fontWeight: '600', lineHeight: 22 },

  // ==========================================
  // 🚨 ALERTS, BADGES & FEEDBACK
  // ==========================================
  warningBox: { flexDirection: 'row', backgroundColor: COLORS.warningBg, padding: 15, borderRadius: 12, marginBottom: 25, borderWidth: 1, borderColor: COLORS.warningBorder, alignItems: 'flex-start' },
  warningText: { flex: 1, marginLeft: 12, fontSize: 13, color: COLORS.warningTextDark, lineHeight: 20 },

  adviceBox: { marginTop: 15, backgroundColor: COLORS.adviceBg, padding: 15, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: COLORS.adviceBorder },
  adviceTitle: { fontWeight: '900', color: COLORS.textDark, marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  adviceText: { color: '#e2e8f0', fontSize: 14, lineHeight: 22 },

  aiTag: { backgroundColor: COLORS.aiTagBg, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 15, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLight },
  aiTagText: { color: '#e2e8f0', fontSize: 11, fontWeight: 'bold', marginLeft: 6, letterSpacing: 0.5 },

  badge: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginBottom: 15 },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5 },

  // ==========================================
  // 📚 LIBRARY UI
  // ==========================================
  libraryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, backgroundColor: COLORS.background },
  libraryHeaderTitle: { fontSize: 28, fontWeight: '900', color: COLORS.textDark, letterSpacing: 0.5 },
  libraryHeaderSubtitle: { fontSize: 13, color: COLORS.primaryLight, marginTop: 2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  syncButton: { backgroundColor: COLORS.cardBg, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderLight },
  syncButtonText: { color: COLORS.textDark, fontWeight: 'bold', fontSize: 12 },
  searchContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10 },
  searchBarWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBg, borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderLight, paddingHorizontal: 15, height: 50 },
  searchInput: { flex: 1, color: COLORS.textDark, fontSize: 15, marginLeft: 10 },
  searchFeedback: { fontSize: 14, color: COLORS.textMuted, marginBottom: 15, paddingHorizontal: 20 },
  highlightWord: { fontWeight: 'bold', color: COLORS.textDark },
  termTitleAI: { fontSize: 26, fontWeight: '900', color: COLORS.textDark, marginBottom: 5 },
  tabContainer: { flexDirection: 'row', marginBottom: 20, backgroundColor: COLORS.cardBg, borderRadius: 10, padding: 4, borderWidth: 1, borderColor: COLORS.borderLight },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: COLORS.primary },
  tabBtnText: { fontSize: 13, fontWeight: 'bold', color: COLORS.textMuted },
  tabBtnTextActive: { color: 'white' },
  libraryContentBox: { backgroundColor: COLORS.cardBg, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight, minHeight: 150 },
  libraryCardLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  libraryCardText: { fontSize: 16, color: COLORS.textDark, lineHeight: 26 },
  disclaimerBox: { marginTop: 20, backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  disclaimerText: { color: '#fcd34d', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },

  // ==========================================
  // 🏠 LANDING / HOME UI (ScanScreen)
  // ==========================================
  scanHeader: { marginTop: 10, marginBottom: 25 },
  scanTitle: { fontSize: 32, fontWeight: '900', color: COLORS.textDark, letterSpacing: 0.5 },
  scanSubtitle: { fontSize: 14, color: COLORS.primaryLight, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  scanDisclaimer: { flexDirection: 'row', backgroundColor: COLORS.warningBg, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: COLORS.warningBorder, marginBottom: 30, alignItems: 'flex-start' },
  scanActionsContainer: { marginBottom: 35 },
  scanActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBg, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.borderLight },
  scanDisabledBtn: { opacity: 0.6, borderColor: COLORS.background },
  scanIconBox: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  scanBtnTextContainer: { flex: 1 },
  scanBtnTitle: { color: COLORS.textDark, fontSize: 16, fontWeight: 'bold', marginBottom: 3 },
  scanBtnSub: { color: COLORS.textMuted, fontSize: 12 },
  historyContainer: { flex: 1 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  historyTitle: { fontSize: 18, fontWeight: 'bold', color: COLORS.textDark },
  historySeeAll: { fontSize: 13, color: COLORS.primaryLight, fontWeight: 'bold' },
  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardHover, padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.borderLight },
  historyIconBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  historyTextContent: { flex: 1 },
  historyName: { color: '#e2e8f0', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  historyDate: { color: COLORS.textMuted, fontSize: 12 },

  // ==========================================
  // 📊 HERO SCORE CARD (Result Screen Base)
  // ==========================================
  heroCardBase: {
    borderRadius: 20,
    padding: 25,
    marginBottom: 25,
    borderWidth: 1,
    width: '100%',
    minHeight: 180
  },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  heroTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 'bold', letterSpacing: 1.5 },
  heroBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  scoreCircle: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 },
  scoreNumber: { fontSize: 72, fontWeight: '900', color: 'white', lineHeight: 80 },
  scoreTotal: { fontSize: 24, color: 'rgba(255,255,255,0.5)', marginLeft: 2 },
  scoreDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 22, marginTop: 5 },

  // ==========================================
  // 🪟 MODALS & BUTTONS
  // ==========================================
  fullInfoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  fullInfoText: { color: COLORS.textMuted, fontWeight: 'bold', fontSize: 12, marginHorizontal: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContent: { backgroundColor: COLORS.cardBg, width: '100%', maxHeight: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderLight },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.cardHover },
  modalHeaderTitleBox: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, marginLeft: 10, flexShrink: 1 },
  modalCloseBtn: { padding: 5 },
  detailModal_closeBtn: { padding: 8, justifyContent: 'center', alignItems: 'center' },
  modalBody: { padding: 25 },
  modalText: { fontSize: 15, color: '#e2e8f0', lineHeight: 26, paddingBottom: 40 },
  modalErrorText: { fontStyle: 'italic', color: COLORS.textMuted, textAlign: 'center', marginTop: 30 },

  // ==========================================
  // 📸 PREMIUM CAMERA & SCANNER UI
  // ==========================================
  scannerContainer: { flex: 1, backgroundColor: 'black' },
  scanOverlayBlock: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.70)' },
  scanMiddleRow: { flexDirection: 'row', height: SCAN_FRAME_HEIGHT },
  scanBottomOverlayContainer: { flex: 1.5 },
  scanBottomSafeZone: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  scanFrame: { width: SCAN_FRAME_WIDTH, height: SCAN_FRAME_HEIGHT, backgroundColor: 'transparent', overflow: 'hidden' },
  scanCorner: { position: 'absolute', width: 40, height: 40, borderColor: 'white' },
  scanTopLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  scanTopRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  scanBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  scanBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  scanLaser: { position: 'absolute', width: '100%', height: 3, backgroundColor: COLORS.primaryLight, shadowColor: COLORS.primaryLight, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 10, elevation: 8 },
  scanFeedbackPill: { flexDirection: 'row', backgroundColor: 'rgba(20, 20, 20, 0.8)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginBottom: 30 },
  scanFeedbackText: { color: 'white', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  scanTopControls: { position: 'absolute', top: Platform.OS === 'android' ? StatusBar.currentHeight! + 20 : 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', zIndex: 20 },
  scanIconBtn: { width: 44, height: 44, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  shutterOuter: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)' },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: 'white' },

  // ==========================================
  // ⏳ PREMIUM PROCESSING UI
  // ==========================================
  analysisContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  processingCard: { backgroundColor: COLORS.cardBg, width: width * 0.8, padding: 35, borderRadius: 24, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLight, elevation: 5 },
  pulseContainer: { padding: 25, backgroundColor: 'rgba(129, 140, 248, 0.1)', borderRadius: 100, marginBottom: 20 },
  analysisTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 10 },
  analysisSubtitle: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 30, height: 20 },
  progressBarBg: { width: '100%', height: 6, backgroundColor: COLORS.progressBg, borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: COLORS.primaryLight, borderRadius: 3 },

  // ==========================================
  // 📖 OFFLINE DICTIONARY UI (DictionaryDetailScreen)
  // ==========================================
  dictHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },
  dictBackBtn: { width: 44, height: 44, backgroundColor: '#121212', borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
  dictHeaderTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  dictSpacer: { width: 44 },
  dictCategoriesWrapper: { marginBottom: 20, height: 40 },
  dictCategoriesList: { paddingHorizontal: 20 },
  dictCategoryBtn: { backgroundColor: '#121212', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'center' },
  dictCategoryBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
  dictCategoryBtnText: { color: COLORS.textMuted, fontSize: 13, fontWeight: 'bold' },
  dictCategoryBtnTextActive: { color: 'white' },
  dictReadingList: { paddingHorizontal: 20, paddingBottom: 40 },
  dictReadingCard: { backgroundColor: '#121212', padding: 20, borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#1e293b', elevation: 3 },
  dictCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  dictIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center' },
  dictTitleContainer: { flex: 1, marginLeft: 15 },
  dictTermTitle: { color: 'white', fontSize: 18, fontWeight: '900', marginBottom: 4, letterSpacing: 0.5 },
  dictBasisText: { color: COLORS.primaryLight, fontSize: 13, fontWeight: 'bold' },
  dictChunkBox: { backgroundColor: '#0a0a0a', padding: 18, borderRadius: 14, borderLeftWidth: 4, borderLeftColor: '#475569' },
  dictChunkText: { fontSize: 14, color: '#cbd5e1', lineHeight: 24, fontStyle: 'italic' },
  dictExpandBtn: { marginTop: 15, alignSelf: 'flex-start' },
  dictShowMoreText: { color: COLORS.primaryLight, fontWeight: 'bold', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  dictEmptyContainer: { alignItems: 'center', marginTop: 50 },
  dictEmptyText: { color: COLORS.textMuted, marginTop: 15, fontWeight: 'bold' },

  // ==========================================
  // 🟢 RESULT SCREEN PREMIUM UI
  // ==========================================
  result_scrollContent: { padding: 20, paddingTop: 5 },
  result_noticeBox: { flexDirection: 'row', backgroundColor: 'rgba(75, 0, 130, 0.15)', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(75, 0, 130, 0.4)', marginBottom: 20, alignItems: 'center' },
  result_noticeText: { flex: 1, color: '#cbd5e1', fontSize: 12, lineHeight: 18 },
  result_scoreCard: { backgroundColor: '#121212', borderRadius: 20, padding: 20, borderWidth: 1, marginBottom: 25 },
  result_scoreHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  result_scoreLabel: { color: '#94a3b8', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  result_riskBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  result_riskBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },
  result_scoreCircleWrapper: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginVertical: 15 },
  result_scoreNumber: { fontSize: 72, fontWeight: '900', includeFontPadding: false },
  result_scoreMax: { fontSize: 24, fontWeight: 'bold', color: '#64748b', marginBottom: 12, marginLeft: 2 },
  result_scoreDesc: { textAlign: 'center', color: '#cbd5e1', fontSize: 14, lineHeight: 22 },
  result_sectionTitle: { fontSize: 13, fontWeight: '900', color: '#94a3b8', letterSpacing: 1.5, marginTop: 10, marginBottom: 15 },
  result_findingCard: { backgroundColor: '#121212', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1e293b', marginBottom: 16 },
  result_findingHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  result_findingTitle: { flex: 1, color: 'white', fontSize: 17, fontWeight: 'bold', marginLeft: 8, lineHeight: 24 },
  result_aiTagBox: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(129, 140, 248, 0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.2)', marginBottom: 15 },
  result_aiTagText: { color: COLORS.primaryLight, fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
  result_label: { fontSize: 11, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  result_descText: { color: '#f8fafc', fontSize: 15, lineHeight: 24, marginBottom: 15 },
  result_adviceBox: { backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 15, borderRadius: 8, borderLeftWidth: 3, marginBottom: 20 },
  result_adviceTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  result_adviceText: { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },
  result_snippetBox: { backgroundColor: '#0a0a0a', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#1e293b', marginBottom: 20 },
  result_snippetText: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic', lineHeight: 20 },
  result_expandBtn: { marginTop: 8, alignSelf: 'flex-start' },
  result_expandBtnText: { color: COLORS.primaryLight, fontSize: 12, fontWeight: 'bold' },
  result_dbButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b', paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#334155' },
  result_dbButtonText: { color: COLORS.primaryLight, fontSize: 14, fontWeight: 'bold', marginHorizontal: 8 },
  result_emptyStateBox: { alignItems: 'center', padding: 30, backgroundColor: '#121212', borderRadius: 16, borderWidth: 1, borderColor: '#1e293b' },
  result_emptyStateText: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center', marginTop: 15, lineHeight: 24 },
  result_modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 20 },
  result_modalCenterBox: { width: '100%', maxWidth: 560, maxHeight: '86%', backgroundColor: '#121212', borderRadius: 22, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  result_modalHeaderArea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b', backgroundColor: '#0a0a0a' },
  result_modalHeaderTitleArea: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  result_modalTitleText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginLeft: 8, flex: 1 },
  result_modalBodyArea: { padding: 20, paddingBottom: 26 },
  result_modalTextContent: { color: '#e2e8f0', fontSize: 15, lineHeight: 24, paddingBottom: 20 },
  result_errorItalicText: { color: COLORS.warning, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },

  // ==========================================
  // 📂 OFFLINE DETAIL SCREEN (Unscanned State)
  // ==========================================
  offline_container: { flex: 1, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  offline_imageWrapper: { width: '100%', height: 260, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', marginBottom: 20 },
  offline_image: { width: '100%', height: '100%' },
  offline_fullscreenIconOverlay: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },
  offline_documentWrapper: { width: '100%', borderRadius: 16, backgroundColor: '#121212', borderWidth: 1, borderColor: '#1e293b', marginBottom: 20, flexDirection: 'row', alignItems: 'center', padding: 15 },
  offline_docIconBox: { width: 60, height: 60, borderRadius: 12, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  offline_docInfoBox: { flex: 1 },
  offline_docNameText: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  offline_docDescText: { color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic' },
  offline_detailsHeader: { marginBottom: 25 },
  offline_badgeUnscanned: { alignSelf: 'flex-start', backgroundColor: 'rgba(245, 158, 11, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: COLORS.warning, marginBottom: 12 },
  offline_badgeText: { color: COLORS.warning, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },
  offline_title: { color: 'white', fontSize: 24, fontWeight: '900', marginBottom: 15, letterSpacing: 0.5 },
  offline_tagsRow: { flexDirection: 'row', alignItems: 'center' },
  offline_tagPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 10 },
  offline_tagText: { color: '#cbd5e1', fontSize: 11, fontWeight: 'bold', marginLeft: 6, letterSpacing: 0.5 },
  offline_offlineNoticeBox: { flexDirection: 'row', backgroundColor: 'rgba(245, 158, 11, 0.05)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)', alignItems: 'center' },
  offline_offlineNoticeText: { flex: 1, color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  offline_actionRowUnscanned: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 20 },
  offline_actionBtnPrimary: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  offline_actionBtnDanger: { width: 56, height: 56, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  offline_btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  offline_modalCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 999, padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25 },

  // ==========================================
  // 💬 ASK AI SCREEN (Chat UI)
  // ==========================================
  chat_container: { flex: 1, backgroundColor: COLORS.background },
  chat_chatContainer: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 15 },
  chat_messageWrapper: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 20 },
  chat_messageWrapperUser: { justifyContent: 'flex-end' },
  chat_messageWrapperAi: { justifyContent: 'flex-start' },
  chat_aiAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(129, 140, 248, 0.15)', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  chat_messageBubble: { maxWidth: '80%', paddingHorizontal: 18, paddingVertical: 14, borderRadius: 20 },
  chat_userBubble: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  chat_aiBubble: { backgroundColor: '#1e293b', borderBottomLeftRadius: 4 },
  chat_errorBubble: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: COLORS.danger },
  chat_messageText: { fontSize: 15, lineHeight: 24, letterSpacing: 0.3 },
  chat_userText: { color: 'white' },
  chat_aiText: { color: '#f1f5f9' },
  chat_loadingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  chat_loadingText: { color: COLORS.primaryLight, fontSize: 13, fontStyle: 'italic', marginLeft: 8 },
  chat_bottomWrapper: { backgroundColor: COLORS.background, paddingTop: 5, paddingBottom: Platform.OS === 'ios' ? 10 : 15 },
  chat_suggestionsWrapper: { marginBottom: 12 },
  chat_suggestionsScroll: { paddingHorizontal: 15 },
  chat_suggestionChip: { backgroundColor: '#1e293b', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#334155' },
  chat_suggestionText: { color: COLORS.primaryLight, fontSize: 13, fontWeight: 'bold' },
  chat_activeAttachmentPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, marginLeft: 15, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  chat_activeAttachmentIcon: { backgroundColor: COLORS.primary, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  chat_activeAttachmentText: { color: 'white', fontSize: 12, fontWeight: 'bold', maxWidth: 150 },
  chat_bubbleAttachmentPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, marginBottom: 8 },
  chat_bubbleAttachmentText: { color: 'white', fontSize: 12, fontWeight: 'bold', maxWidth: 180 },
  chat_inputContainerWrapper: { paddingHorizontal: 15 },
  chat_inputContainer: { flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#121212', borderRadius: 24, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 6, paddingVertical: 6 },
  chat_textInput: { flex: 1, color: 'white', fontSize: 15, minHeight: 40, maxHeight: 120, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  chat_sendButton: { width: 40, height: 40, backgroundColor: COLORS.primary, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  chat_sendButtonDisabled: { backgroundColor: 'transparent' },

  // ==========================================
  // 🔍 LIBRARY SCREEN NEW
  // ==========================================
  lib_container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 44 : 44 },
  lib_header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  lib_headerTitle: { fontSize: 28, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
  lib_headerSubtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  lib_headerSyncBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  lib_searchArea: { paddingHorizontal: 20, marginBottom: 15 },
  lib_searchWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', borderRadius: 24, borderWidth: 1, borderColor: '#1e293b', paddingHorizontal: 16, height: 50 },
  lib_searchInput: { flex: 1, color: 'white', fontSize: 15, marginLeft: 12 },
  lib_emptyStateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, marginTop: -40 },
  lib_emptyStateIconBg: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  lib_emptyStateTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 10, letterSpacing: 0.5 },
  lib_emptyStateSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 30 },
  lib_browseBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(129, 140, 248, 0.1)', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.3)' },
  lib_browseBtnText: { color: COLORS.primaryLight, fontSize: 13, fontWeight: 'bold', letterSpacing: 0.5 },
  lib_centerMessage: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  lib_loadingText: { marginTop: 15, color: COLORS.textMuted, fontWeight: 'bold', fontSize: 14, letterSpacing: 0.5 },
  lib_errorText: { color: COLORS.danger, fontSize: 14, textAlign: 'center', fontWeight: '500', lineHeight: 22 },
  lib_resultScrollContent: { paddingBottom: 20 },
  lib_feedbackText: { fontSize: 13, color: COLORS.textMuted, marginBottom: 15, paddingHorizontal: 20 },
  lib_highlightText: { fontWeight: 'bold', color: 'white' },
  lib_statusBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, marginBottom: 15, borderWidth: 1 },
  lib_statusBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  lib_termTitle: { fontSize: 28, fontWeight: '900', color: 'white', marginBottom: 20, letterSpacing: 0.5, textTransform: 'capitalize' },
  lib_tabsWrapper: { flexDirection: 'row', backgroundColor: '#121212', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#1e293b', marginBottom: 20 },
  lib_tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  lib_tabBtnActive: { backgroundColor: COLORS.primary },
  lib_tabBtnText: { fontSize: 12, fontWeight: 'bold', color: COLORS.textMuted },
  lib_tabBtnTextActive: { color: 'white' },
  lib_contentBox: { backgroundColor: '#121212', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', minHeight: 180 },
  lib_contentTitle: { fontSize: 11, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 1.2, marginBottom: 10 },
  lib_divider: { height: 1, backgroundColor: '#1e293b', marginVertical: 18 },
  lib_mainText: { fontSize: 15, color: '#f1f5f9', lineHeight: 24 },
  lib_basisText: { fontSize: 15, color: 'white', fontWeight: 'bold', lineHeight: 22 },
  lib_chunkBox: { backgroundColor: '#0a0a0a', padding: 16, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: COLORS.primaryLight, marginTop: 4 },
  lib_chunkText: { fontSize: 14, color: '#cbd5e1', fontStyle: 'italic', lineHeight: 22 },
  lib_expandBtn: { marginTop: 8, alignSelf: 'flex-start' },
  lib_expandBtnText: { color: COLORS.primaryLight, fontSize: 12, fontWeight: 'bold' },
  lib_exampleBox: { backgroundColor: 'rgba(129, 140, 248, 0.05)', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.15)' },
  lib_exampleText: { fontSize: 15, color: '#cbd5e1', lineHeight: 24 },
  lib_offlineWarningBox: { flexDirection: 'row', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)', alignItems: 'center', marginBottom: 20 },
  lib_offlineWarningText: { flex: 1, color: '#fcd34d', fontSize: 12, lineHeight: 18 },
  lib_aiHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },

  // ==========================================
  // 📖 DICTIONARY DETAIL SCREEN (Additional)
  // ==========================================
  dictDetail_safeTopPadding: { flex: 1, paddingTop: 15 },
  dictDetail_loadingMoreText: { color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20, fontSize: 12, fontStyle: 'italic' },
  dictDetail_categoryBtn: { backgroundColor: '#121212', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14, marginRight: 8, borderWidth: 1, borderColor: '#1e293b', justifyContent: 'center' },
  dictDetail_categoryBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
  dictDetail_categoryBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: 'bold' },
  dictDetail_categoryBtnTextActive: { color: 'white' },
  dictDetail_card: { backgroundColor: '#121212', marginBottom: 15, padding: 18, borderRadius: 10, borderWidth: 1, borderColor: '#1e293b' },
  dictDetail_termTitle: { fontSize: 20, fontWeight: '900', color: 'white', marginBottom: 4, lineHeight: 26, textTransform: 'capitalize' },
  dictDetail_basisText: { fontSize: 12, color: COLORS.primaryLight, fontWeight: 'bold' },
  dictDetail_divider: { height: 1, backgroundColor: '#1e293b', marginVertical: 12 },
  dictDetail_contentTitle: { fontSize: 10, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 1.2 },
  dictDetail_exampleBox: { padding: 14, marginTop: 8, borderRadius: 8, backgroundColor: '#0a0a0a' },
  dictDetail_chunkText: { fontStyle: 'italic', fontSize: 13, color: '#e2e8f0', lineHeight: 22 },
  dictDetail_expandBtn: { marginTop: 10 },
  dictDetail_expandBtnText: { color: COLORS.primaryLight, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  dictDetail_emptyContainer: { alignItems: 'center', marginTop: 50 },
  dictDetail_emptyText: { color: COLORS.textMuted, marginTop: 15, fontWeight: 'bold', fontSize: 14 },

  // ==========================================
  // 🏠 HOME / DASHBOARD SCREEN (ScanScreen)
  // ==========================================
  home_container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 44 : 44 },
  home_scrollContent: { paddingBottom: 40 },
  home_header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  home_headerTitle: { fontSize: 28, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
  home_settingsBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  home_disclaimerBox: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: 'rgba(75, 0, 130, 0.15)', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(75, 0, 130, 0.5)', marginBottom: 20, alignItems: 'center' },
  home_disclaimerText: { flex: 1, color: '#cbd5e1', fontSize: 11, lineHeight: 16 },
  home_gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 5 },
  home_gridItem: { width: '48%', aspectRatio: 1.1, borderRadius: 20, padding: 15, justifyContent: 'center', marginBottom: 12, borderWidth: 1 },
  home_gridItemScan: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
  home_gridItemUpload: { backgroundColor: '#121212', borderColor: '#1e40af' },
  home_gridItemConvert: { backgroundColor: '#121212', borderColor: '#6b21a8' },
  home_gridItemAsk: { backgroundColor: '#121212', borderColor: '#0f766e' },
  home_primaryIconWrapper: { backgroundColor: 'rgba(255,255,255,0.2)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  home_iconWrapperUpload: { backgroundColor: 'rgba(96, 165, 250, 0.15)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  home_iconWrapperConvert: { backgroundColor: 'rgba(167, 139, 250, 0.15)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  home_iconWrapperAsk: { backgroundColor: 'rgba(45, 212, 191, 0.15)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  home_gridTitleWhite: { color: 'white', fontSize: 16, fontWeight: '900', marginBottom: 2 },
  home_gridSubtitleWhite: { color: 'rgba(255,255,255,0.7)', fontSize: 10, lineHeight: 14 },
  home_gridTitle: { color: 'white', fontSize: 16, fontWeight: '900', marginBottom: 2 },
  home_gridSubtitle: { color: COLORS.textMuted, fontSize: 10, lineHeight: 14 },
  home_sectionTitle: { fontSize: 12, fontWeight: '900', color: '#94a3b8', letterSpacing: 1.2, marginTop: 15, marginBottom: 8, paddingHorizontal: 20 },
  home_filterRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12 },
  home_filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1e293b', marginRight: 8, borderWidth: 1, borderColor: '#334155' },
  home_filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
  home_filterText: { color: COLORS.textMuted, fontSize: 11, fontWeight: 'bold' },
  home_filterTextActive: { color: 'white' },
  home_historyListWrapper: { paddingHorizontal: 20 },
  home_historyCard: { flexDirection: 'row', backgroundColor: '#121212', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', marginBottom: 10, alignItems: 'center' },
  home_imageContainer: { marginRight: 12 },
  home_historyThumbnail: { width: 60, height: 75, borderRadius: 10, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  home_docThumbnail: { width: 60, height: 75, borderRadius: 10, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', padding: 5 },
  home_docThumbText: { color: COLORS.textMuted, fontSize: 9, marginTop: 4, textAlign: 'center', fontWeight: 'bold' },
  home_historyTextContent: { flex: 1, justifyContent: 'center' },
  home_titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  home_historyName: { color: COLORS.primaryLight, fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  home_renameIconBtn: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  home_historyDate: { color: COLORS.textMuted, fontSize: 10 },
  home_historyActions: { flexDirection: 'row', alignItems: 'center' },
  home_historyMiniBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b', paddingVertical: 6, borderRadius: 10, marginRight: 8, borderWidth: 1, borderColor: '#334155' },
  home_historyMiniBtnText: { color: COLORS.textMuted, fontSize: 11, marginLeft: 4, fontWeight: 'bold' },
  home_iconOnlyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', marginRight: 8, borderWidth: 1, borderColor: '#334155' },
  home_badgeWrapper: { marginTop: 6, alignSelf: 'flex-start' },
  home_statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  home_badgePending: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: COLORS.warning },
  home_badgeScanned: { backgroundColor: 'rgba(16, 185, 129, 0.15)', borderWidth: 1, borderColor: COLORS.success },
  home_badgeText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  home_modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  home_fullscreenImage: { width: '100%', height: '80%' },
  home_modalCloseBtn: { position: 'absolute', top: 50, right: 20, zIndex: 999, padding: 10, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 25 },
  home_textModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  home_textModalContainer: { width: '90%', maxHeight: '80%', backgroundColor: '#121212', borderRadius: 20, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  home_textModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  home_textModalTitle: { color: COLORS.primaryLight, fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 10 },
  home_textModalBody: { padding: 20 },
  home_textModalContent: { color: 'white', fontSize: 14, lineHeight: 24, paddingBottom: 20 },
  home_renameBox: { width: '85%', backgroundColor: '#121212', padding: 25, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  home_renameTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  home_renameInput: { backgroundColor: '#1e293b', color: 'white', padding: 15, borderRadius: 12, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#475569' },
  home_renameActionRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  home_renameCancelBtn: { paddingVertical: 10, paddingHorizontal: 20, marginRight: 10 },
  home_renameCancelText: { color: COLORS.textMuted, fontSize: 16, fontWeight: 'bold' },
  home_renameSaveBtn: { backgroundColor: COLORS.primaryLight, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  home_renameSaveText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },

  // ==========================================
  // 👤 PROFILE SCREEN
  // ==========================================
  profile_container: { flex: 1, backgroundColor: '#0a0a0a' },
  profile_header: { paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: '#0a0a0a' },
  profile_headerTitle: { color: 'white', fontSize: 28, fontWeight: '900', letterSpacing: 0.5 },
  profile_scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  profile_mainCard: { backgroundColor: '#121212', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', padding: 24, alignItems: 'center', marginBottom: 20 },
  profile_avatarWrapper: { marginBottom: 15 },
  profile_avatarImage: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#1e293b' },
  profile_avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#334155' },
  profile_avatarText: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  profile_welcomeText: { color: 'white', fontSize: 20, fontWeight: '900', marginBottom: 4 },
  profile_emailText: { color: COLORS.textMuted, fontSize: 14, marginBottom: 20 },
  profile_editBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  profile_editBtnText: { color: 'white', fontSize: 13, fontWeight: 'bold' },
  profile_statsCard: { backgroundColor: '#121212', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', padding: 20, marginBottom: 25 },
  profile_statsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  profile_statsIconBg: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  profile_statsTitle: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  profile_statsContent: { alignItems: 'center' },
  profile_statsBigNumber: { color: COLORS.primaryLight, fontSize: 36, fontWeight: '900', marginBottom: 2 },
  profile_statsSubtext: { color: COLORS.textMuted, fontSize: 12 },
  profile_sectionTitle: { color: '#64748b', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12, marginLeft: 4 },
  profile_actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', marginBottom: 12 },
  profile_actionIconBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  profile_actionTitle: { color: 'white', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  profile_actionSub: { color: COLORS.textMuted, fontSize: 12 },
  profile_modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)' },
  profile_kavWrapper: { flex: 1, justifyContent: 'center' },
  profile_centerScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 40 },
  profile_modalCard: { backgroundColor: '#121212', borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', padding: 24, width: '100%' },
  profile_modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  profile_modalTitle: { color: 'white', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  profile_closeBtn: { backgroundColor: '#1e293b', padding: 7, borderRadius: 8 },
  profile_modalAvatarBtn: { alignSelf: 'center', marginBottom: 22, position: 'relative' },
  profile_modalAvatarImage: { width: 86, height: 86, borderRadius: 43, borderWidth: 2, borderColor: '#1e293b' },
  profile_modalAvatarPlaceholder: { width: 86, height: 86, borderRadius: 43, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#334155' },
  profile_editBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.primaryLight, width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#121212' },
  profile_feedbackDesc: { color: COLORS.textMuted, fontSize: 13, lineHeight: 21, marginBottom: 20 },
  profile_categoryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  profile_categoryPill: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0a0a0a', alignItems: 'center', marginHorizontal: 3 },
  profile_categoryPillActive: { backgroundColor: 'rgba(129, 140, 248, 0.15)', borderColor: COLORS.primaryLight },
  profile_categoryText: { color: COLORS.textMuted, fontSize: 11, fontWeight: 'bold' },
  profile_categoryTextActive: { color: COLORS.primaryLight },
  profile_dropdownTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  profile_dropdownList: { backgroundColor: '#1e293b', borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  profile_dropdownOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  profile_dropdownOptionText: { color: '#cbd5e1', fontSize: 13 },
  profile_inputLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 'bold', marginBottom: 8, marginLeft: 2 },
  profile_inputField: { backgroundColor: '#0a0a0a', borderWidth: 1, borderColor: '#334155', borderRadius: 8, color: 'white', paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, marginBottom: 18 },
  profile_modalActions: { flexDirection: 'row' },
  profile_cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, borderWidth: 1, borderColor: '#334155', alignItems: 'center', marginRight: 10 },
  profile_cancelText: { color: COLORS.textMuted, fontWeight: 'bold', fontSize: 14 },
  profile_saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 8, backgroundColor: COLORS.primaryLight, alignItems: 'center' },
  profile_saveText: { color: 'white', fontWeight: 'bold', fontSize: 14 },

  // ==========================================
  // ℹ️ ABOUT SCREEN (App Information)
  // ==========================================
  about_scrollContent: { padding: 20, paddingBottom: 60 },
  about_logoContainer: { alignItems: 'center', marginBottom: 35, marginTop: 15 },
  about_appName: { color: 'white', fontSize: 28, fontWeight: '900', marginTop: 12, letterSpacing: 1 },
  about_appVersion: { color: COLORS.primaryLight, fontSize: 12, fontWeight: '900', marginTop: 4, letterSpacing: 2 },
  about_sectionTitle: { color: '#64748b', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10, marginLeft: 4 },
  about_card: { backgroundColor: '#121212', borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#1e293b', marginBottom: 24 },
  about_text: { color: '#cbd5e1', fontSize: 14, lineHeight: 24, textAlign: 'justify' },
  about_featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  about_featureIcon: { marginRight: 12 },
  about_featureText: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  about_devName: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  about_devRole: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  about_divider: { height: 1, backgroundColor: '#1e293b', marginVertical: 15 },
  about_disclaimerText: { color: COLORS.textMuted, fontSize: 12, textAlign: 'justify', lineHeight: 18, fontStyle: 'italic', marginTop: 10, paddingHorizontal: 10 },

  // ==========================================
  // ⚖️ LEGAL AID SCREEN (PAO / IBP Guides)
  // ==========================================
  legalAid_scrollContent: { padding: 20, paddingBottom: 40 },
  legalAid_headerBox: { alignItems: 'center', marginBottom: 25, marginTop: 10 },
  legalAid_title: { color: 'white', fontSize: 24, fontWeight: '900', marginTop: 12, letterSpacing: 0.5 },
  legalAid_subtitle: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 8, paddingHorizontal: 10 },
  legalAid_syncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#334155', marginTop: 15 },
  legalAid_syncBtnText: { color: 'white', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  legalAid_cardBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#121212', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, marginBottom: 12 },
  legalAid_cardIconBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(129, 140, 248, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  legalAid_guideTitle: { color: 'white', fontSize: 15, fontWeight: 'bold', lineHeight: 22, marginBottom: 2 },
  legalAid_guideSub: { color: COLORS.textMuted, fontSize: 12 },
  legalAid_emptyBox: { padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#1e293b', borderRadius: 12, borderStyle: 'dashed' },
  legalAid_emptyText: { color: COLORS.textMuted, textAlign: 'center', marginTop: 15, lineHeight: 22 },

  // Legal Aid Centered Modal
  legalAid_modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', paddingHorizontal: 20 },
  legalAid_modalContainer: { backgroundColor: '#0a0a0a', maxHeight: '85%', borderRadius: 16, borderWidth: 1, borderColor: '#1e293b', overflow: 'hidden' },
  legalAid_modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b', backgroundColor: '#121212' },
  legalAid_modalTitle: { color: 'white', fontSize: 17, fontWeight: '900', flex: 1, marginRight: 10, lineHeight: 24 },
  legalAid_closeBtn: { backgroundColor: '#1e293b', padding: 6, borderRadius: 8 },
  legalAid_modalContent: { padding: 24, paddingBottom: 40 },

  // Legal Aid Formatted Text
  legalAid_stepTitleText: { color: 'white', fontSize: 15, fontWeight: 'bold', marginTop: 18, marginBottom: 8, lineHeight: 22 },
  legalAid_normalText: { color: '#cbd5e1', fontSize: 14, lineHeight: 24, marginBottom: 10, textAlign: 'justify' },
  legalAid_bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, paddingLeft: 10 },
  legalAid_bulletPoint: { color: COLORS.primaryLight, fontSize: 16, marginRight: 8, lineHeight: 24, fontWeight: 'bold' },
  legalAid_bulletText: { flex: 1, color: '#cbd5e1', fontSize: 14, lineHeight: 24, textAlign: 'justify' },

  // ==========================================
  // 🔔 CUSTOM ALERT & POP-UP STYLES
  // ==========================================
  customAlert_overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.80)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customAlert_box: {
    width: width * 0.82,
    backgroundColor: '#121212',
    borderRadius: 16,
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  customAlert_iconWrapper: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  customAlert_title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  customAlert_message: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  customAlert_buttonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'center',
  },
  customAlert_button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAlert_buttonText: {
    letterSpacing: 0.5,
  },
  customAlert_primaryButton: { backgroundColor: COLORS.primary },
  customAlert_primaryText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  customAlert_cancelButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' },
  customAlert_cancelText: { color: COLORS.textMuted, fontSize: 14, fontWeight: 'bold' },
  customAlert_destructiveButton: { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
  customAlert_destructiveText: { color: '#f87171', fontSize: 14, fontWeight: 'bold' },

  // 💡 BAGONG REUSABLE STYLE PARA SA MGA LOADING POP-UPS / TEXTS!
  loadingSubText: {
    color: COLORS.textMuted,
    marginTop: 15,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5
  },
});