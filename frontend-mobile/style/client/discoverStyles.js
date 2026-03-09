import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  // Header
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  activeTab: {
    backgroundColor: '#FF8C00',
    borderColor: '#FF8C00',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#fff',
  },
  // List
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  // Card
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#FF8C0020',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD60A',
  },
  cardRight: {
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 11,
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  // Shop
  shopBanner: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
  },
  shopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  shopInfo: {
    flex: 1,
  },
  shopOwner: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C75915',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34C759',
  },
  descText: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
    marginBottom: 4,
  },
  // Service
  servicePicture: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginBottom: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF8C0015',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF8C00',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  // Empty
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
  },
  // Error
  errorCard: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF8C00',
  },
});
