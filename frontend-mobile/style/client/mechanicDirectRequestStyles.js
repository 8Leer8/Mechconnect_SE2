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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Picker
  pickerContainer: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    overflow: 'hidden',
  },
  picker: {
    color: '#fff',
    backgroundColor: 'transparent',
  },
  // Mechanic Display
  mechanicDisplayContainer: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 16,
  },
  mechanicDisplayText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  disabledContainer: {
    opacity: 0.35,
  },
  disabledPicker: {
    color: '#555',
  },
  disabledText: {
    color: '#555',
  },
  disabledInput: {
    backgroundColor: '#16181A',
    color: '#555',
  },
  // Add-ons
  addOnItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    gap: 12,
  },
  addOnItemSelected: {
    borderColor: '#FF8C00',
    backgroundColor: '#FF8C0010',
  },
  addOnCheck: {
    width: 24,
  },
  addOnInfo: {
    flex: 1,
  },
  addOnName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  addOnDescription: {
    fontSize: 12,
    color: '#8E8E93',
  },
  addOnPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF8C00',
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1C1E',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyText: {
    fontSize: 13,
    color: '#555',
    fontStyle: 'italic',
  },
  // Summary
  summaryCard: {
    backgroundColor: '#1A1C1E',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#ccc',
  },
  summaryValue: {
    fontSize: 14,
    color: '#ccc',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#2A2C2E',
    marginVertical: 10,
  },
  totalText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF8C00',
  },
  // Pill toggles
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1A1C1E',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  pillSelected: {
    backgroundColor: '#FF8C00',
    borderColor: '#FF8C00',
  },
  pillText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  pillTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  // Date Time
  dateTimeContainer: {
    gap: 10,
  },
  dateTimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
  },
  dateTimeText: {
    fontSize: 14,
    color: '#fff',
  },
  selectedDateTimeLabel: {
    fontSize: 13,
    color: '#FF8C00',
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '600',
  },
  // Map location selector
  selectLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
  },
  selectLocationText: {
    flex: 1,
    fontSize: 14,
    color: '#8E8E93',
  },
  currentLocationDisplayCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginTop: 10,
  },
  // Inputs
  inputGroup: {
    gap: 10,
  },
  input: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  // Current Location Display
  currentLocationContainer: {
    marginTop: 10,
  },
  locationLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  locationLoadingText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  currentLocationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  currentLocationText: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
  },
  locationPlaceholder: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    padding: 14,
  },
  // Send
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF8C00',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
