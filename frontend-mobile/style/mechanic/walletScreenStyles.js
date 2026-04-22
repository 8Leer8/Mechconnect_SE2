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

  /* ── Hero balance (premium card) ── */
  heroShell: {
    borderRadius: 20,
    padding: 1.5,
    marginBottom: 28,
    backgroundColor: 'rgba(255, 140, 0, 0.22)',
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  heroCard: {
    borderRadius: 18,
    backgroundColor: '#121418',
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.12)',
  },
  balanceIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 140, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  balanceLabel: { fontSize: 12, color: '#6B7280', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 },
  balanceValue: { fontSize: 42, fontWeight: '800', color: '#FF8C00', letterSpacing: -0.5 },
  balanceSub: { fontSize: 13, color: '#5C6370', marginTop: 8 },

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
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252830',
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
  txList: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2C2E',
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
