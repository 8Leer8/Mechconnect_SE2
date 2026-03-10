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
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  // Status Card
  statusCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: {
    flex: 1,
    gap: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  broadcastType: {
    fontSize: 13,
    color: '#8E8E93',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FF8C0015',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF8C00',
  },
  bookedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#34C75915',
    borderRadius: 8,
  },
  bookedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  // Section Cards
  sectionCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Description
  descriptionText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  // Services List
  servicesList: {
    gap: 12,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#222426',
    borderRadius: 8,
  },
  serviceName: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: '500',
  },
  // Provider Info
  providerInfo: {
    gap: 12,
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  providerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
    flex: 1,
    textAlign: 'right',
  },
  noteBox: {
    backgroundColor: '#222426',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
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
  // Location
  locationDetails: {
    gap: 12,
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
    color: '#ccc',
    flex: 1,
    textAlign: 'right',
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
});
