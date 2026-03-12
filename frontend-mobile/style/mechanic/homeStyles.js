import { StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },

  /* ── Header ── */
  headerContainer: {
    backgroundColor: '#1A1C1E',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {},
  greeting: { fontSize: 14, color: '#8E8E93' },
  mechanicName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 2 },

  notificationButton: { position: 'relative' },
  notifCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2A2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  /* ── Quick Stats ── */
  quickStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#22242780',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  quickStat: { flex: 1, alignItems: 'center' },
  quickStatIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickStatValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  quickStatLabel: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  quickStatDivider: { width: 1, backgroundColor: '#333', marginVertical: 6 },

  /* ── Scroll ── */
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  /* ── Earnings Banner ── */
  earningsBanner: {
    flexDirection: 'row',
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    alignItems: 'center',
  },
  earningsLeft: { flex: 1 },
  earningsLabel: { fontSize: 13, color: '#8E8E93', marginBottom: 4 },
  earningsValue: { fontSize: 26, fontWeight: 'bold', color: '#FF8C00' },
  earningsIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* ── Loading / Error ── */
  loader: { marginTop: 60 },
  errorContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  errorText: { color: '#ccc', fontSize: 15, marginTop: 14, textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#FF8C00',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  /* ── Section ── */
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
  seeAll: { fontSize: 13, color: '#FF8C00', fontWeight: '500' },

  /* ── Job Card ── */
  jobCard: {
    flexDirection: 'row',
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    alignItems: 'center',
  },
  jobCardLeft: { marginRight: 12 },
  jobIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCenter: { flex: 1 },
  jobCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  jobTitle: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  jobInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  jobInfoText: { fontSize: 12, color: '#8E8E93', flex: 1 },
  jobCardRight: { alignItems: 'flex-end', marginLeft: 8 },
  jobAmount: { fontSize: 14, fontWeight: 'bold', color: '#FF8C00', marginBottom: 4 },

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

  /* ── Request Card ── */
  requestCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  requestCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestTypeContainer: {},
  requestTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  requestTypeText: { fontSize: 13, fontWeight: '600' },
  requestTime: { fontSize: 12, color: '#8E8E93' },
  requestInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  requestInfoText: { fontSize: 13, color: '#aaa', flex: 1 },
  requestActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
  },
  declineButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  declineText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FF8C00',
  },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  /* ── Quick Actions Grid ── */
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickActionCard: {
    width: (width - 32 - 10) / 2,
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginBottom: 10,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickActionLabel: { fontSize: 13, color: '#ccc', fontWeight: '500' },
});