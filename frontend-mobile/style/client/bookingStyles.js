import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  refreshButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FF8C0015', justifyContent: 'center', alignItems: 'center',
  },
  tabContainer: { backgroundColor: '#1A1C1E', maxHeight: 56, paddingBottom: 12 },
  tabScrollContent: { paddingHorizontal: 16, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 20, backgroundColor: '#222426',
  },
  activeTab: { backgroundColor: '#FF8C00' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  activeTabText: { color: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 8 },
  loader: { marginTop: 40 },
  errorContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { fontSize: 16, color: '#FF3B30', marginTop: 16, textAlign: 'center' },
  retryButton: {
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: '#FF8C00', borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyContainer: {
    alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40,
  },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#1A1C1E', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: '#2A2C2E',
  },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#888' },
  emptySubtext: { fontSize: 13, color: '#555', marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  bookingsList: { paddingHorizontal: 16, paddingTop: 8 },
  bookingCard: {
    backgroundColor: '#1A1C1E', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2A2C2E',
  },
  cardTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusIconCircle: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: 'bold', color: '#fff', letterSpacing: 0.5 },
  bookingId: { fontSize: 12, color: '#666', fontWeight: '600' },
  requestType: { fontSize: 14, fontWeight: '600', color: '#ccc' },
  timeAgo: { fontSize: 11, color: '#666' },
  cardInfoSection: { gap: 6, marginBottom: 12, paddingLeft: 50 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 12, color: '#8E8E93', flex: 1 },
  detailBanner: {
    backgroundColor: '#222426', padding: 10, borderRadius: 8,
    marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#FF8C00',
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { fontSize: 12, color: '#8E8E93' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#222426',
  },
  amount: { fontSize: 18, fontWeight: 'bold', color: '#34C759' },
  detailsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, backgroundColor: '#FF8C0015',
  },
  detailsBtnText: { fontSize: 12, fontWeight: '600', color: '#FF8C00' },
  paginationContainer: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, marginTop: 8,
    backgroundColor: '#1A1C1E', marginHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: '#2A2C2E',
  },
  paginationBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FF8C0015', justifyContent: 'center', alignItems: 'center',
  },
  paginationBtnDisabled: {
    backgroundColor: '#222426',
  },
  paginationInfo: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  paginationText: {
    fontSize: 14, fontWeight: '600', color: '#fff',
  },
  paginationSubtext: {
    fontSize: 11, color: '#8E8E93', marginTop: 2,
  },
});
