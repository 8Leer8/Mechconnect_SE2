import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Document {
  id: string;
  name: string;
  type: 'license' | 'certification' | 'id' | 'others';
  file: any;
  dateIssued?: string;
  dateExpiry?: string;
}

export default function MechanicRegister() {
  const [loading, setLoading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [contactNumber, setContactNumber] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showDatePicker, setShowDatePicker] = useState<{
    docId: string;
    type: 'issued' | 'expiry';
  } | null>(null);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library');
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

  const pickDocument = async () => {
    Alert.alert(
      'Select Document',
      'Choose how you want to add your document',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permission Required', 'Please allow camera access');
              return;
            }

            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              quality: 0.8,
            });

            if (!result.canceled) {
              const newDoc: Document = {
                id: Date.now().toString(),
                name: '',
                type: 'license',
                file: result.assets[0],
              };
              setDocuments([...documents, newDoc]);
            }
          },
        },
        {
          text: 'Choose Photo',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false,
              quality: 0.8,
            });

            if (!result.canceled) {
              const newDoc: Document = {
                id: Date.now().toString(),
                name: '',
                type: 'license',
                file: result.assets[0],
              };
              setDocuments([...documents, newDoc]);
            }
          },
        },
        {
          text: 'Choose File',
          onPress: async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['image/*', 'application/pdf'],
              copyToCacheDirectory: true,
            });

            if (!result.canceled) {
              const newDoc: Document = {
                id: Date.now().toString(),
                name: '',
                type: 'license',
                file: result.assets[0],
              };
              setDocuments([...documents, newDoc]);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removeDocument = (id: string) => {
    setDocuments(documents.filter(doc => doc.id !== id));
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
    setDocuments(documents.map(doc => 
      doc.id === id ? { ...doc, [fieldName]: value } : doc
    ));
  };

  const handleRegister = async () => {
    // Validate contact number
    if (!contactNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter your contact number');
      return;
    }

    if (!/^[\d\s\-\+\(\)]+$/.test(contactNumber)) {
      Alert.alert('Validation Error', 'Please enter a valid contact number');
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('contact_number', contactNumber);

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
        if (doc.file && doc.name && doc.type) {
          const filename = doc.file.uri.split('/').pop() || `document_${index}.pdf`;
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `application/${match[1]}` : 'application/pdf';

          formData.append(`document_file_${index}`, {
            uri: doc.file.uri,
            name: filename,
            type,
          } as any);
          
          formData.append(`document_name_${index}`, doc.name);
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
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Success',
          'Mechanic profile created successfully!',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to register as mechanic');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to register');
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
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Register as Mechanic</ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <IconSymbol name="wrench.fill" size={40} color="#007AFF" />
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
                  <IconSymbol name="person.circle.fill" size={60} color="#888" />
                  <ThemedText style={styles.photoText}>Tap to upload</ThemedText>
                </View>
              )}
            </TouchableOpacity>
            <ThemedText style={styles.hint}>Optional • Square image recommended</ThemedText>
          </View>

          {/* Contact Number */}
          <View style={styles.formGroup}>
            <ThemedText style={styles.label}>
              Contact Number <ThemedText style={styles.required}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., +63 912 345 6789"
              placeholderTextColor="#666"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <ThemedText style={styles.hint}>
              This will be used for clients to contact you
            </ThemedText>
          </View>

          {/* Documents Section */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.label}>Documents</ThemedText>
              <TouchableOpacity onPress={pickDocument} style={styles.addButton}>
                <IconSymbol name="plus.circle.fill" size={20} color="#007AFF" />
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
                  <IconSymbol name="doc.fill" size={20} color="#007AFF" />
                  <ThemedText style={styles.documentFileName}>
                    {doc.file.fileName || 'Document'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeDocument(doc.id)}>
                    <IconSymbol name="trash.fill" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Document Name (e.g., Driver's License)"
                  placeholderTextColor="#666"
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
                    <IconSymbol name="calendar" size={16} color="#888" />
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
                    <IconSymbol name="calendar" size={16} color="#888" />
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

          {/* Requirements Info */}
          <View style={styles.requirementsCard}>
            <View style={styles.requirementHeader}>
              <IconSymbol name="info.circle.fill" size={20} color="#007AFF" />
              <ThemedText style={styles.requirementTitle}>What's Next?</ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <IconSymbol name="checkmark.circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Complete your profile with your skills and expertise
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <IconSymbol name="checkmark.circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Set your service rates and availability
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <IconSymbol name="checkmark.circle" size={18} color="#34C759" />
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
              <IconSymbol name="arrow.right.circle.fill" size={20} color="#fff" />
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
    backgroundColor: '#151718',
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
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  infoCard: {
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
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
    color: '#888',
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  required: {
    color: '#FF3B30',
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  hint: {
    fontSize: 12,
    color: '#666',
  },
  photoContainer: {
    alignSelf: 'center',
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#1E1E1E',
    borderWidth: 2,
    borderColor: '#2A2A2A',
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
    color: '#888',
  },
  requirementsCard: {
    marginTop: 8,
    padding: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
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
    color: '#888',
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
    backgroundColor: '#007AFF',
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
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  documentCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
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
  pickerContainer: {
    gap: 8,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
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
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  pickerButtonActive: {
    backgroundColor: '#007AFF20',
    borderColor: '#007AFF',
  },
  pickerButtonText: {
    fontSize: 13,
    color: '#888',
    fontWeight: '500',
  },
  pickerButtonTextActive: {
    color: '#007AFF',
  },
  dateField: {
    gap: 6,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
  },
  dateText: {
    fontSize: 14,
    color: '#fff',
  },
  datePlaceholder: {
    fontSize: 14,
    color: '#666',
  },
});
