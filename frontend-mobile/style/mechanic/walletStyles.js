import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
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
  scrollContent: { padding: 16, paddingTop: 20 },

  /* ── Balance Card ── */
  balanceCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF8C0025',
    marginBottom: 24,
  },
  balanceIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 13, color: '#8E8E93', marginBottom: 4 },
  balanceValue: { fontSize: 40, fontWeight: '800', color: '#FF8C00' },
  balanceSub: { fontSize: 13, color: '#666', marginTop: 4 },

  /* ── Section ── */
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },

  /* ── Token Package Grid ── */
  packagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  packageCard: {
    width: (width - 44) / 2,
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  packageIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  packageAmount: { fontSize: 24, fontWeight: '800', color: '#fff' },
  packageLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2, marginBottom: 12 },
  packageBuyBtn: {
    width: '100%',
    backgroundColor: '#FF8C00',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  packageBuyText: { color: '#fff', fontWeight: '700', fontSize: 14 },

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
