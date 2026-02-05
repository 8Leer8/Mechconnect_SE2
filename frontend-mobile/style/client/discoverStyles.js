import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#FFE4B3',
    backgroundColor: '#FFF5E6',
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#FF8C00',
  },
  tabText: {
    fontSize: 16,
    opacity: 0.6,
    color: '#666',
  },
  activeTabText: {
    opacity: 1,
    fontWeight: 'bold',
    color: '#FF8C00',
  },
  scrollView: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFF5E6',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE4B3',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#FF8C00',
  },
  cardText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#333',
  },
  shopBanner: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
  },
  servicePicture: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    color: '#FFB84D',
    marginBottom: 8,
    fontWeight: '600',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginTop: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  badge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 12,
    opacity: 0.7,
    color: '#666',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFE4B3',
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.6,
    fontStyle: 'italic',
    color: '#999',
  },
  errorText: {
    color: '#FF4500',
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
  },
});