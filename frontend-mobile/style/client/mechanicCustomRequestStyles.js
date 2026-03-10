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
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 20,
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
  // Mechanic chips
  mechanicScroll: {
    flexDirection: 'row',
  },
  mechanicChip: {
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    width: 85,
  },
  mechanicChipSelected: {
    borderColor: '#FF8C00',
    backgroundColor: '#FF8C0010',
  },
  mechanicAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#222426',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  mechanicAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8E8E93',
  },
  mechanicChipText: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
  },
  mechanicChipTextSelected: {
    color: '#FF8C00',
    fontWeight: '600',
  },
  // Text area
  textArea: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    minHeight: 120,
  },
  // Image buttons
  imageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  imageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  imageBtnText: {
    fontSize: 14,
    color: '#FF8C00',
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  removeImageText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: '600',
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
  // Current location card
  currentLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FF8C00',
    gap: 12,
    marginBottom: 4,
  },
  currentLocationIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentLocationText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  currentLocationSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
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
  // Submit
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
    opacity: 0.5,
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
