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
  backBtn: {
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
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 6,
    color: '#fff',
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 30,
  },
  buttonContainer: {
    gap: 14,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    gap: 14,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 3,
  },
  optionDescription: {
    fontSize: 13,
    color: '#8E8E93',
  },
});
