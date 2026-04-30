import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const GAP = 12;
const PAGE_PAD = 16;
const colWidth = (width - PAGE_PAD * 2 - GAP) / 2;

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0C0E' },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#0F1012',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2124',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Scroll ── */
  scrollContent: { paddingHorizontal: PAGE_PAD, paddingTop: 20, paddingBottom: 32 },

  /* ── Balance Card - Horizontal Layout ── */
  balanceCard: {
    backgroundColor: '#17171A',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2E',
    marginBottom: 16,
    gap: 16,
  },
  balanceIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  balanceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.3,
  },
  balanceValueContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  balanceValue: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FF8C00',
    includeFontPadding: false,
    lineHeight: 48,
  },
  balanceValueLarge: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FF8C00',
    includeFontPadding: false,
    lineHeight: 40,
  },
  sharedWalletNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 140, 0, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.15)',
  },
  sharedWalletNoteText: {
    fontSize: 11,
    color: '#B0B0B5',
    fontWeight: '500',
    lineHeight: 15,
  },

  /* ── Section ── */
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  sectionSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 6, marginBottom: 14, lineHeight: 18 },

  /* ── Token Package Grid ── */
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  packageCard: {
    width: colWidth,
    backgroundColor: '#121418',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2E',
  },
  packageIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 140, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageAmount: { fontSize: 20, fontWeight: '800', color: '#fff' },
  packageMeta: { fontSize: 11, color: '#8E8E93', marginTop: 4, marginBottom: 10, textAlign: 'center' },
  packagePrice: { fontSize: 13, fontWeight: '700', color: '#FF8C00', marginBottom: 10 },
  packageBuyBtn: {
    width: '100%',
    backgroundColor: '#FF8C00',
    paddingVertical: 9,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 38,
    justifyContent: 'center',
  },
  packageBuyText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  /* ── Empty State ── */
  emptyCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyTitle: { color: '#ccc', fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySubtext: { color: '#555', fontSize: 13, marginTop: 4 },

  /* ── Transactions ── */
  txListContainer: {
    maxHeight: 400,
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  txList: {
    backgroundColor: '#1A1C1E',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#222426',
  },
  txIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#34C75915',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txInfo: { flex: 1 },
  txType: { fontSize: 14, fontWeight: '600', color: '#fff' },
  txTime: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  txRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  txAmount: { fontSize: 16, fontWeight: '700', color: '#34C759' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusCompleted: {
    backgroundColor: '#34C75922',
    borderColor: '#34C75966',
  },
  statusCompletedText: {
    color: '#34C759',
  },
  statusPending: {
    backgroundColor: '#FFD60A22',
    borderColor: '#FFD60A66',
  },
  statusPendingText: {
    color: '#FFD60A',
  },
  statusFailed: {
    backgroundColor: '#FF3B3022',
    borderColor: '#FF3B3066',
  },
  statusFailedText: {
    color: '#FF6B60',
  },

  /* ── Cash Out Card ── */
  cashoutCard: {
    backgroundColor: '#17171A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  cashoutInfo: {
    flex: 1,
    paddingRight: 12,
  },
  cashoutTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cashoutSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
  },
  cashoutBtn: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  cashoutBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* ── Modal Styles ── */
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modalContent: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },

  /* ── Cashout Modal Styles ── */
  cashoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 100,
  },
  cashoutModal: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 20,
  },
  cashoutModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  cashoutModalSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
    marginBottom: 16,
  },
  cashoutField: {
    marginBottom: 14,
  },
  cashoutDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cashoutDetailLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  cashoutDetailValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  cashoutLabel: {
    fontSize: 12,
    color: '#C7C7CC',
    marginBottom: 6,
    fontWeight: '600',
  },
  cashoutChangeBtn: {
    marginTop: 6,
    marginBottom: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#2A2A2E',
  },
  cashoutChangeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 40,
  },
  eyeBtn: {
    position: 'absolute',
    right: 10,
    height: 40,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashoutInput: {
    borderWidth: 1,
    borderColor: '#2A2A2E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#fff',
    backgroundColor: '#151515',
  },
  cashoutHint: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 6,
  },
  cashoutActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  cashoutActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cashoutCancelBtn: {
    backgroundColor: '#2A2A2E',
  },
  cashoutConfirmBtn: {
    backgroundColor: '#FF8C00',
  },
  cashoutCancelText: {
    color: '#C7C7CC',
    fontWeight: '700',
  },
  cashoutConfirmText: {
    color: '#121212',
    fontWeight: '700',
  },
});
