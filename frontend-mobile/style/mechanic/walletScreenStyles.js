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
});
