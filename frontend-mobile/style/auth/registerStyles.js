import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 12,
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FF6B35',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  tagline: {
    color: '#6c757d',
    fontSize: 14,
    fontWeight: '400',
  },
  progressContainer: {
    marginVertical: 20,
    marginBottom: 30,
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  progressLine: {
    position: 'absolute',
    top: 15,
    left: 35,
    right: 35,
    height: 2,
    backgroundColor: '#e0e0e0',
    zIndex: 1,
  },
  progressBar: {
    position: 'absolute',
    top: 15,
    left: 35,
    height: 2,
    backgroundColor: '#FF6B35',
    zIndex: 2,
  },
  stepContainer: {
    alignItems: 'center',
    zIndex: 3,
  },
  step: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepActive: {
    borderColor: '#FF6B35',
    backgroundColor: '#FF6B35',
  },
  stepCompleted: {
    borderColor: '#28a745',
    backgroundColor: '#28a745',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6c757d',
  },
  stepNumberActive: {
    color: '#ffffff',
  },
  stepLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 8,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: '#FF6B35',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#212529',
    marginBottom: 6,
  },
  required: {
    color: '#FF6B35',
    marginLeft: 2,
  },
  optional: {
    fontStyle: 'italic',
    color: '#6c757d',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
  },
  inputWrapperFocused: {
    borderColor: '#FF6B35',
  },
  input: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212529',
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  dateButton: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 10,
    backgroundColor: '#ffffff',
  },
  dateText: {
    fontSize: 15,
    color: '#212529',
  },
  placeholderText: {
    fontSize: 15,
    color: '#999',
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  button: {
    width: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  buttonTextSecondary: {
    color: '#212529',
  },
  buttonSubmit: {
    backgroundColor: '#28a745',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  footerText: {
    color: '#6c757d',
    fontSize: 15,
  },
  linkText: {
    color: '#FF6B35',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 4,
  },
  copyright: {
    marginTop: 'auto',
    paddingTop: 20,
    alignItems: 'center',
  },
  copyrightText: {
    color: '#6c757d',
    fontSize: 13,
  },
});