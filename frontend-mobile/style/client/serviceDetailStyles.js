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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Loading / Error
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
    gap: 16,
  },
  errorText: {
    fontSize: 15,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Service Card
  serviceCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    overflow: 'hidden',
  },
  servicePicture: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  serviceInfo: {
    padding: 16,
  },
  serviceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  serviceName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginRight: 12,
  },
  categoryBadge: {
    backgroundColor: '#FF8C0020',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C0040',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF8C00',
  },
  serviceDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 16,
  },

  // Pricing Section
  pricingSection: {
    gap: 10,
  },
  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222426',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  priceInfo: {
    flex: 1,
  },
  priceLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  priceRangeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF15',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  priceRangeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },

  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },

  // Provider Cards
  providerCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    overflow: 'hidden',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#FF8C0030',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  providerDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD60A',
  },
  detailDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#3A3A3C',
  },
  contactText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  providerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  providerPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#34C759',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Shop specific
  shopBanner: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  shopContent: {
    padding: 14,
  },
  shopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  shopOwner: {
    fontSize: 12,
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
  shopDescription: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 10,
  },
  shopFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shopContact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Empty State
  emptyCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
