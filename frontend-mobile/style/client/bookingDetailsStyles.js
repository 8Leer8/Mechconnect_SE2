import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 220,
  },
  // Status Card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  statusIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  statusInfo: {
    flex: 1,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  serviceType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ccc',
  },
  amountLarge: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#34C759',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginTop: 4,
  },
  // Section Card
  sectionCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  // Info Grid
  infoGrid: {
    gap: 10,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ddd',
  },
  // Location
  locationDetails: {
    gap: 8,
    marginBottom: 14,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 13,
    color: '#8E8E93',
    width: 100,
  },
  locationValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ddd',
    flex: 1,
    textAlign: 'right',
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C0012',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FF8C0030',
  },
  navigateIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  navigateTextContainer: {
    flex: 1,
  },
  navigateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF8C00',
  },
  navigateSubtitle: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  noLocationCard: {
    alignItems: 'center',
    padding: 20,
    gap: 8,
  },
  noLocationText: {
    fontSize: 13,
    color: '#666',
  },
  // Timeline
  timeline: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
  },
  timelineDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  timelineLine: {
    width: 2,
    height: 16,
    backgroundColor: '#333',
    marginLeft: 5,
    marginVertical: 2,
  },
  // Chips
  detailChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chipDefault: {
    backgroundColor: '#222426',
  },
  chipSuccess: {
    backgroundColor: '#34C75915',
  },
  chipWarning: {
    backgroundColor: '#FFD60A15',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  // Note
  noteBox: {
    backgroundColor: '#222426',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 18,
  },
  // Completion
  completionInfo: {
    gap: 10,
  },
  completionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completionLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  completionAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#34C759',
  },
  // Tap Hint
  tapHintContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 11,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
});
