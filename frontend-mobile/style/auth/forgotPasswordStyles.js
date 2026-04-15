import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 30,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#A7ADB3',
  },
  subtitleSecondary: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  inputContainer: {
    marginBottom: 14,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#3A3D40',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#151718',
  },
  stepBadgeActive: {
    borderColor: '#FF8C00',
    backgroundColor: '#FF8C00',
  },
  stepBadgeText: {
    color: '#A7ADB3',
    fontSize: 12,
    fontWeight: '700',
  },
  stepBadgeTextActive: {
    color: '#111214',
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#3A3D40',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#FF8C00',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 10,
    backgroundColor: '#151718',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#ECEDEE',
    paddingVertical: 12,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },
  buttonPrimary: {
    marginTop: 4,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#111214',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonSecondary: {
    marginTop: 10,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#151718',
  },
  buttonSecondaryText: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '600',
  },
  verifiedCodeRow: {
    marginBottom: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#151718',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  verifiedCodeLabel: {
    color: '#A7ADB3',
    fontSize: 13,
    fontWeight: '600',
  },
  verifiedCodeValue: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#2A2C2E',
    marginVertical: 14,
  },
  backToLogin: {
    marginTop: 16,
    alignItems: 'center',
  },
  backToLoginText: {
    color: '#FF8C00',
    fontSize: 14,
    fontWeight: '600',
  },
});
