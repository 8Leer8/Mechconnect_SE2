import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5E6',
  },
  scrollView: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFF5E6',
  },
  quickStartSection: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#FF8C00',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  quickButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    minHeight: 80,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  servicesButton: {
    backgroundColor: '#FF8C00',
  },
  requestButton: {
    backgroundColor: '#FFB84D',
  },
  mechanicsButton: {
    backgroundColor: '#FF6B35',
  },
  shopsButton: {
    backgroundColor: '#FFA500',
  },
  emergencyButton: {
    backgroundColor: '#FF4500',
  },
  emergencyCentered: {
    flex: 0.5,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  buttonContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginBottom: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#FFF5E6',
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
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#FF8C00',
  },
  cardText: {
    fontSize: 14,
    marginBottom: 4,
    color: '#333',
  },
  emptyCard: {
    backgroundColor: '#FFF5E6',
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