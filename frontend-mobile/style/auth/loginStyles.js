import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  logoContainer: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    marginBottom: 16,
  },
  title: {
    fontSize: 35,
    fontWeight: '700',
    color: '#ECEDEE',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  inputContainer: {
    marginBottom: 16,
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
  inputWrapperFocused: {
    borderColor: '#FF8C00',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#ECEDEE',
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: -2,
    marginBottom: 12,
  },
  forgotPasswordText: {
    color: '#FF8C00',
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    backgroundColor: '#A85D00',
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2C2E',
    marginVertical: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  footerText: {
    color: '#A7ADB3',
    fontSize: 14,
  },
  linkText: {
    color: '#FF8C00',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomFooter: {
    marginTop: 'auto',
    paddingTop: 24,
    alignItems: 'center',
  },
  copyrightText: {
    color: '#6E7378',
    fontSize: 13,
  },
});