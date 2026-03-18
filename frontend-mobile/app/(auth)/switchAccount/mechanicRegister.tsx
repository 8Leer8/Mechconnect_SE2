import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Image,
} from 'react-native';
import { useNotification } from '@/hooks/useNotification';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface MechanicRegisterResponse {
  error?: string;
  message?: string;
  [key: string]: any;
}

interface ContactSourceOption {
  label: string;
  value: string;
}

interface ProfileDetailsResponse {
  profile?: {
    current_role_profile?: {
      client?: { contact_number?: string | null };
      shop_owner?: { contact_number?: string | null };
      mechanic?: { contact_number?: string | null };
    };
  };
}

interface Document {
  id: string;
  name: string;
  type: 'license' | 'certification' | 'id' | 'others';
  file: any | null;
  dateIssued?: string;
  dateExpiry?: string;
}

interface MechanicFieldErrors {
  contactNumber?: string;
  documents?: string;
}

const createDocumentId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createEmptyDocument = (): Document => ({
  id: createDocumentId(),
  name: '',
  type: 'license',
  file: null,
});

export default function MechanicRegister() {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [contactNumber, setContactNumber] = useState('');
  const [contactOptions, setContactOptions] = useState<ContactSourceOption[]>([]);
  const [bio, setBio] = useState('');
  const [documents, setDocuments] = useState<Document[]>(() => [createEmptyDocument()]);
  const [showDatePicker, setShowDatePicker] = useState<{
    docId: string;
    type: 'issued' | 'expiry';
  } | null>(null);
  const [documentPickerTarget, setDocumentPickerTarget] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<MechanicFieldErrors>({});

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      showNotification({ type: 'warning', title: 'Permission Required', message: 'Please allow access to your photo library' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const addDocument = () => {
    setDocuments((prev) => [...prev, createEmptyDocument()]);
  };

  const closeDocumentPicker = () => {
    setDocumentPickerTarget(null);
  };

  const setDocumentFile = (docId: string, file: any) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, file } : doc))
    );
    setFieldErrors((prev) => ({ ...prev, documents: undefined }));
  };

  const pickDocumentFile = async (source: 'camera' | 'gallery' | 'file') => {
    const docId = documentPickerTarget;
    if (!docId) return;

    closeDocumentPicker();

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showNotification({ type: 'warning', title: 'Permission Required', message: 'Please allow camera access' });
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          quality: 0.8,
        });

        if (!result.canceled) {
          setDocumentFile(docId, result.assets[0]);
        }
        return;
      }

      if (source === 'gallery') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          showNotification({ type: 'warning', title: 'Permission Required', message: 'Please allow photo library access' });
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.8,
        });

        if (!result.canceled) {
          setDocumentFile(docId, result.assets[0]);
        }
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setDocumentFile(docId, result.assets[0]);
      }
    } catch (err) {
      console.error('Failed to pick document file:', err);
      showNotification({ type: 'error', title: 'Upload Failed', message: 'Unable to select file right now. Please try again.' });
    }
  };

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setFieldErrors((prev) => ({ ...prev, documents: undefined }));
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate && showDatePicker) {
      const formattedDate = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD
      updateDocument(
        showDatePicker.docId,
        showDatePicker.type === 'issued' ? 'dateIssued' : 'dateExpiry',
        formattedDate
      );
    }
    setShowDatePicker(null);
  };

  const updateDocument = (id: string, fieldName: keyof Document, value: any) => {
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === id ? { ...doc, [fieldName]: value } : doc))
    );
    setFieldErrors((prev) => ({ ...prev, documents: undefined }));
  };

  useEffect(() => {
    const fetchContactSources = async () => {
      try {
        const response = await fetch(`${API_URL}/users/profile/details/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) return;

        const data = await response.json() as ProfileDetailsResponse;
        const profiles = data.profile?.current_role_profile;
        const options: ContactSourceOption[] = [];

        if (profiles?.client?.contact_number?.trim()) {
          options.push({ label: 'Use Client Number', value: profiles.client.contact_number.trim() });
        }
        if (profiles?.shop_owner?.contact_number?.trim()) {
          options.push({ label: 'Use Shop Owner Number', value: profiles.shop_owner.contact_number.trim() });
        }

        const deduped: ContactSourceOption[] = [];
        const seen = new Set<string>();
        for (const option of options) {
          if (!seen.has(option.value)) {
            deduped.push(option);
            seen.add(option.value);
          }
        }

        setContactOptions(deduped);
        if (!contactNumber && deduped.length > 0) {
          setContactNumber(deduped[0].value);
        }
      } catch (err) {
        console.error('Failed to load contact source options:', err);
      }
    };

    fetchContactSources();
  }, []);

  const handleRegister = async () => {
    const nextErrors: MechanicFieldErrors = {};

    if (!contactNumber.trim()) {
      nextErrors.contactNumber = 'Required';
    } else if (!/^[\d\s\-\+\(\)]+$/.test(contactNumber)) {
      nextErrors.contactNumber = 'Invalid number';
    }

    const hasAnyDocumentInput = (doc: Document) =>
      Boolean(doc.file || doc.name.trim() || doc.dateIssued || doc.dateExpiry);

    const incompleteDocuments = documents.filter(
      (doc) => hasAnyDocumentInput(doc) && (!doc.file || !doc.name.trim() || !doc.type)
    );
    if (incompleteDocuments.length > 0) {
      nextErrors.documents = 'Complete or remove incomplete cards';
    }

    if (nextErrors.contactNumber || nextErrors.documents) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('contact_number', contactNumber);
      
      // Add bio if provided
      if (bio.trim()) {
        formData.append('bio', bio.trim());
      }

      // Add profile photo if selected
      if (profilePhoto) {
        const filename = profilePhoto.split('/').pop() || 'profile.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';

        formData.append('profile_photo', {
          uri: profilePhoto,
          name: filename,
          type,
        } as any);
      }

      // Add documents
      documents.forEach((doc, index) => {
        const isTouched = Boolean(doc.file || doc.name.trim() || doc.dateIssued || doc.dateExpiry);
        if (isTouched && doc.file && doc.name.trim() && doc.type) {
          const filename = doc.file.uri.split('/').pop() || `document_${index}.pdf`;
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `application/${match[1]}` : 'application/pdf';

          formData.append(`document_file_${index}`, {
            uri: doc.file.uri,
            name: filename,
            type,
          } as any);
          
          formData.append(`document_name_${index}`, doc.name.trim());
          formData.append(`document_type_${index}`, doc.type);
          
          if (doc.dateIssued) {
            formData.append(`date_issued_${index}`, doc.dateIssued);
          }
          if (doc.dateExpiry) {
            formData.append(`date_expiry_${index}`, doc.dateExpiry);
          }
        }
      });

      const response = await fetch(`${API_URL}/users/register-mechanic/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json() as MechanicRegisterResponse;

      if (response.ok) {
        showNotification({
          type: 'success',
          title: 'Success',
          message: (typeof data.message === 'string' && data.message) ? data.message : 'Mechanic profile created successfully!',
        });
        router.replace('/(auth)/switchAccount/switchPage');
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to register as mechanic' });
      }
    } catch (err) {
      showNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to register' });
      console.error('Registration error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Register as Mechanic</ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <FontAwesome name="wrench" size={40} color="#FF8C00" />
          <ThemedText style={styles.infoTitle}>Become a Mechanic</ThemedText>
          <ThemedText style={styles.infoText}>
            Register as a mechanic to offer your services and connect with clients who need your expertise.
          </ThemedText>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Profile Photo */}
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>Profile Photo</ThemedText>
            <TouchableOpacity style={styles.photoContainer} onPress={pickImage}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.photo} />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <FontAwesome name="user-circle" size={60} color="#8E8E93" />
                  <ThemedText style={styles.photoText}>Tap to upload</ThemedText>
                </View>
              )}
            </TouchableOpacity>
            <ThemedText style={styles.hint}>Optional • Square image recommended</ThemedText>
          </View>

          {/* Contact Number */}
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <ThemedText style={styles.label}>
                Contact Number <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              {!!fieldErrors.contactNumber && (
                <ThemedText style={styles.inlineErrorText}>{fieldErrors.contactNumber}</ThemedText>
              )}
            </View>
            {contactOptions.length > 0 && (
              <>
                <ThemedText style={styles.contactChoiceLabel}>Use existing number</ThemedText>
                <View style={styles.contactChoiceRow}>
                  {contactOptions.map((option) => (
                    <TouchableOpacity
                      key={`${option.label}-${option.value}`}
                      style={[
                        styles.contactChoiceChip,
                        contactNumber === option.value && styles.contactChoiceChipActive,
                      ]}
                      onPress={() => setContactNumber(option.value)}
                      disabled={loading}
                    >
                      <ThemedText
                        style={[
                          styles.contactChoiceText,
                          contactNumber === option.value && styles.contactChoiceTextActive,
                        ]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <TextInput
              style={[styles.input, fieldErrors.contactNumber && styles.inputError]}
              placeholder="e.g., +63 912 345 6789"
              placeholderTextColor="#6B7280"
              value={contactNumber}
              onChangeText={(text) => {
                setContactNumber(text);
                if (fieldErrors.contactNumber) {
                  setFieldErrors((prev) => ({ ...prev, contactNumber: undefined }));
                }
              }}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <ThemedText style={styles.hint}>
              Choose an existing number or enter a new number for mechanic role
            </ThemedText>
          </View>

          {/* Bio */}
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>Bio</ThemedText>
            <TextInput
              style={[styles.input, styles.bioInput]}
              placeholder="Tell clients about your experience, specialties, and expertise..."
              placeholderTextColor="#6B7280"
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
            <ThemedText style={styles.hint}>
              Optional • Describe your skills and experience (recommended)
            </ThemedText>
          </View>

          {/* Documents Section */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeader}>
              <View style={styles.labelRowCompact}>
                <ThemedText style={styles.label}>Documents</ThemedText>
                {!!fieldErrors.documents && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.documents}</ThemedText>
                )}
              </View>
              <TouchableOpacity onPress={addDocument} style={styles.addButton}>
                <FontAwesome name="plus-circle" size={20} color="#FF8C00" />
                <ThemedText style={styles.addButtonText}>Add Document</ThemedText>
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.hint}>
              Upload your license, certifications, or ID (Optional)
            </ThemedText>

            {/* Document List */}
            {documents.map((doc) => (
              <View key={doc.id} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <FontAwesome name="file-text-o" size={20} color="#FF8C00" />
                  <ThemedText style={styles.documentFileName}>
                    {doc.file?.fileName || doc.file?.name || 'No file selected'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeDocument(doc.id)}>
                    <FontAwesome name="trash" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.fileActionButton}
                  onPress={() => setDocumentPickerTarget(doc.id)}
                >
                  <FontAwesome name="upload" size={14} color="#FF8C00" />
                  <ThemedText style={styles.fileActionButtonText}>
                    {doc.file ? 'Replace File' : 'Choose File'}
                  </ThemedText>
                </TouchableOpacity>
                {!doc.file && (
                  <ThemedText style={styles.fileMissingText}>No file attached yet</ThemedText>
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Document Name (e.g., Driver's License)"
                  placeholderTextColor="#6B7280"
                  value={doc.name}
                  onChangeText={(text) => updateDocument(doc.id, 'name', text)}
                />

                <View style={styles.pickerContainer}>
                  <ThemedText style={styles.pickerLabel}>Type:</ThemedText>
                  <View style={styles.pickerButtons}>
                    {['license', 'certification', 'id', 'others'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.pickerButton,
                          doc.type === type && styles.pickerButtonActive,
                        ]}
                        onPress={() => updateDocument(doc.id, 'type', type)}
                      >
                        <ThemedText
                          style={[
                            styles.pickerButtonText,
                            doc.type === type && styles.pickerButtonTextActive,
                          ]}
                        >
                          {type}
                        </ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.dateField}>
                  <ThemedText style={styles.dateLabel}>Date Issued</ThemedText>
                  <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => setShowDatePicker({ docId: doc.id, type: 'issued' })}
                  >
                    <ThemedText style={doc.dateIssued ? styles.dateText : styles.datePlaceholder}>
                      {doc.dateIssued || 'Select date'}
                    </ThemedText>
                    <FontAwesome name="calendar" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <View style={styles.dateField}>
                  <ThemedText style={styles.dateLabel}>Date Expiry</ThemedText>
                  <TouchableOpacity
                    style={styles.dateInput}
                    onPress={() => setShowDatePicker({ docId: doc.id, type: 'expiry' })}
                  >
                    <ThemedText style={doc.dateExpiry ? styles.dateText : styles.datePlaceholder}>
                      {doc.dateExpiry || 'Select date'}
                    </ThemedText>
                    <FontAwesome name="calendar" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Date Picker Modal */}
          {showDatePicker && (
            <DateTimePicker
              value={
                (() => {
                  const doc = documents.find(d => d.id === showDatePicker.docId);
                  const dateStr = showDatePicker.type === 'issued' ? doc?.dateIssued : doc?.dateExpiry;
                  return dateStr ? new Date(dateStr) : new Date();
                })()
              }
              mode="date"
              display="default"
              onChange={handleDateChange}
            />
          )}

          <Modal
            visible={Boolean(documentPickerTarget)}
            transparent
            animationType="fade"
            onRequestClose={closeDocumentPicker}
          >
            <Pressable style={styles.documentModalBackdrop} onPress={closeDocumentPicker}>
              <Pressable style={styles.documentModalCard}>
                <View style={styles.documentModalHeader}>
                  <ThemedText style={styles.documentModalTitle}>Select Document Source</ThemedText>
                  <TouchableOpacity onPress={closeDocumentPicker} style={styles.documentModalCloseButton}>
                    <FontAwesome name="times" size={16} color="#C8CDD2" />
                  </TouchableOpacity>
                </View>
                <ThemedText style={styles.documentModalHint}>Choose where to get your document file.</ThemedText>

                <TouchableOpacity style={styles.documentModalAction} onPress={() => pickDocumentFile('camera')}>
                  <FontAwesome name="camera" size={16} color="#FF8C00" />
                  <ThemedText style={styles.documentModalActionText}>Take Photo</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.documentModalAction} onPress={() => pickDocumentFile('gallery')}>
                  <FontAwesome name="image" size={16} color="#FF8C00" />
                  <ThemedText style={styles.documentModalActionText}>Choose Photo</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity style={styles.documentModalAction} onPress={() => pickDocumentFile('file')}>
                  <FontAwesome name="file-o" size={16} color="#FF8C00" />
                  <ThemedText style={styles.documentModalActionText}>Choose File</ThemedText>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>

          {/* Requirements Info */}
          <View style={styles.requirementsCard}>
            <View style={styles.requirementHeader}>
              <FontAwesome name="info-circle" size={20} color="#FF8C00" />
              <ThemedText style={styles.requirementTitle}>What's Next?</ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <FontAwesome name="check-circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Complete your profile with your skills and expertise
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <FontAwesome name="check-circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Set your service rates and availability
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <FontAwesome name="check-circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Start receiving service requests from clients
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Register Button */}
        <TouchableOpacity
          style={[styles.registerButton, loading && styles.registerButtonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <ThemedText style={styles.registerButtonText}>Complete Registration</ThemedText>
              <FontAwesome name="arrow-right" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  headerPlaceholder: {
    width: 40,
  },
  infoCard: {
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  infoTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  formContainer: {
    paddingHorizontal: 20,
    gap: 24,
  },
  formGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  labelRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  inlineErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
    flexShrink: 1,
    textAlign: 'right',
  },
  required: {
    color: '#FF3B30',
  },
  input: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 14,
  },
  hint: {
    fontSize: 12,
    color: '#6B7280',
  },
  contactChoiceLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  contactChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactChoiceChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#202224',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  contactChoiceChipActive: {
    borderColor: '#FF8C00',
    backgroundColor: '#FF8C001F',
  },
  contactChoiceText: {
    fontSize: 12,
    color: '#C8CDD2',
    fontWeight: '600',
  },
  contactChoiceTextActive: {
    color: '#FF8C00',
  },
  photoContainer: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#1A1C1E',
    borderWidth: 2,
    borderColor: '#2A2C2E',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoText: {
    fontSize: 12,
    color: '#8E8E93',
  },
  requirementsCard: {
    marginTop: 8,
    padding: 20,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    gap: 16,
  },
  requirementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  requirementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  requirementText: {
    flex: 1,
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 32,
    paddingVertical: 16,
    backgroundColor: '#FF8C00',
    borderRadius: 12,
  },
  registerButtonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1A1C1E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF8C00',
  },
  documentCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginTop: 12,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentFileName: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  fileActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF8C00',
    backgroundColor: '#FF8C0017',
    paddingVertical: 10,
  },
  fileActionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF8C00',
  },
  fileMissingText: {
    fontSize: 12,
    color: '#FCA5A5',
  },
  pickerContainer: {
    gap: 8,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  pickerButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pickerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2A2C2E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  pickerButtonActive: {
    backgroundColor: '#FF8C0020',
    borderColor: '#FF8C00',
  },
  pickerButtonText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  pickerButtonTextActive: {
    color: '#FF8C00',
  },
  dateField: {
    gap: 6,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2C2E',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2F3133',
  },
  dateText: {
    fontSize: 14,
    color: '#fff',
  },
  datePlaceholder: {
    fontSize: 14,
    color: '#6B7280',
  },
  documentModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  documentModalCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 16,
    gap: 10,
  },
  documentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  documentModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  documentModalCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202224',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  documentModalHint: {
    fontSize: 13,
    color: '#9AA0A6',
    marginBottom: 4,
  },
  documentModalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#202224',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  documentModalActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ECEDEE',
  },
});

