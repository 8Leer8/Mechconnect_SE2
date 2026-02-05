import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF5E6',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF8C00',
    textAlign: 'center',
    fontFamily: 'System',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    fontFamily: 'System',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFB84D',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  inputWrapperFocused: {
    borderColor: '#FF8C00',
    borderWidth: 2,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    fontFamily: 'System',
  },
  eyeButton: {
    padding: 8,
    marginLeft: 8,
  },
  eyeIcon: {
    fontSize: 20,
    color: '#FF8C00',
  },
  button: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    backgroundColor: '#FFB84D',
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'System',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
    fontFamily: 'System',
  },
  linkText: {
    color: '#FF8C00',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'System',
  },
});