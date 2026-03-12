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
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface ShopOwnerRegisterResponse {
  error?: string;
  message?: string;
  [key: string]: any;
}

interface Document {
  id: string;
  name: string;
  type: string;
  file: any;
  dateIssued?: string;
  dateExpiry?: string;
}

export default function ShopOwnerRegister() {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  
  // Owner information
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [ownerContactNumber, setOwnerContactNumber] = useState('');
  
  // Shop information
  const [shopName, setShopName] = useState('');
  const [shopContactNumber, setShopContactNumber] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [serviceBanner, setServiceBanner] = useState<string | null>(null);
  
  // Documents
  const [shopDocuments, setShopDocuments] = useState<Document[]>([]);
  const [ownerDocuments, setOwnerDocuments] = useState<Document[]>([]);
  
  const [showDatePicker, setShowDatePicker] = useState<{
    docId: string;
    type: 'issued' | 'expiry';
    docCategory: 'shop' | 'owner';
  } | null>(null);

  const pickImage = async (type: 'profile' | 'banner') => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      showNotification({ type: 'warning', title: 'Permission Required', message: 'Please allow access to your photo library' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'profile' ? [1, 1] : [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      if (type === 'profile') {
        setProfilePhoto(result.assets[0].uri);
      } else {
        setServiceBanner(result.assets[0].uri);
      }
    }
  };

  const pickDocument = async (category: 'shop' | 'owner') => {
    Alert.alert(
      'Select Document',
      'Choose how you want to add your document',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
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
              const newDoc: Document = {
                id: Date.now().toString(),
                name: '',
                type: category === 'shop' ? 'permit' : 'id',
                file: result.assets[0],
              };
              
              if (category === 'shop') {
                setShopDocuments([...shopDocuments, newDoc]);
              } else {
                setOwnerDocuments([...ownerDocuments, newDoc]);
              }
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
                type: category === 'shop' ? 'permit' : 'id',
                file: result.assets[0],
              };
              
              if (category === 'shop') {
                setShopDocuments([...shopDocuments, newDoc]);
              } else {
                setOwnerDocuments([...ownerDocuments, newDoc]);
              }
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
                type: category === 'shop' ? 'permit' : 'id',
                file: result.assets[0],
              };
              
              if (category === 'shop') {
                setShopDocuments([...shopDocuments, newDoc]);
              } else {
                setOwnerDocuments([...ownerDocuments, newDoc]);
              }
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removeDocument = (id: string, category: 'shop' | 'owner') => {
    if (category === 'shop') {
      setShopDocuments(shopDocuments.filter(doc => doc.id !== id));
    } else {
      setOwnerDocuments(ownerDocuments.filter(doc => doc.id !== id));
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (event.type === 'set' && selectedDate && showDatePicker) {
      const formattedDate = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD
      updateDocument(
        showDatePicker.docId,
        showDatePicker.type === 'issued' ? 'dateIssued' : 'dateExpiry',
        formattedDate,
        showDatePicker.docCategory
      );
    }
    setShowDatePicker(null);
  };

  const updateDocument = (id: string, fieldName: keyof Document, value: any, category: 'shop' | 'owner') => {
    if (category === 'shop') {
      setShopDocuments(shopDocuments.map(doc => 
        doc.id === id ? { ...doc, [fieldName]: value } : doc
      ));
    } else {
      setOwnerDocuments(ownerDocuments.map(doc => 
        doc.id === id ? { ...doc, [fieldName]: value } : doc
      ));
    }
  };

  const handleRegister = async () => {
    // Validate required fields
    if (!profilePhoto) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please upload your profile photo' });
      return;
    }

    if (!ownerContactNumber.trim()) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please enter your contact number' });
      return;
    }

    if (!/^[\d\s\-\+\(\)]+$/.test(ownerContactNumber)) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please enter a valid owner contact number' });
      return;
    }

    if (!shopName.trim()) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please enter your shop name' });
      return;
    }

    if (!shopContactNumber.trim()) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please enter your shop contact number' });
      return;
    }

    if (!/^[\d\s\-\+\(\)]+$/.test(shopContactNumber)) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please enter a valid shop contact number' });
      return;
    }

    // Validate email if provided
    if (shopEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shopEmail)) {
      showNotification({ type: 'error', title: 'Validation Error', message: 'Please enter a valid email address' });
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      
      // Add profile photo (required)
      const profileFilename = profilePhoto.split('/').pop() || 'profile.jpg';
      const profileMatch = /\.(\w+)$/.exec(profileFilename);
      const profileExt = profileMatch ? profileMatch[1].toLowerCase() : 'jpg';
      const profileType = profileExt === 'png' ? 'image/png' : 
                         profileExt === 'jpg' || profileExt === 'jpeg' ? 'image/jpeg' : 
                         'image/jpeg';

      formData.append('profile_photo', {
        uri: profilePhoto,
        name: profileFilename,
        type: profileType,
      } as any);

      // Add required fields
      formData.append('owner_contact_number', ownerContactNumber);
      formData.append('shop_name', shopName);
      formData.append('shop_contact_number', shopContactNumber);
      
      // Add optional fields
      if (shopEmail.trim()) {
        formData.append('shop_email', shopEmail.trim());
      }
      if (website.trim()) {
        formData.append('website', website.trim());
      }
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      // Add service banner if selected
      if (serviceBanner) {
        const bannerFilename = serviceBanner.split('/').pop() || 'banner.jpg';
        const bannerMatch = /\.(\w+)$/.exec(bannerFilename);
        const bannerExt = bannerMatch ? bannerMatch[1].toLowerCase() : 'jpg';
        const bannerType = bannerExt === 'png' ? 'image/png' : 
                          bannerExt === 'jpg' || bannerExt === 'jpeg' ? 'image/jpeg' : 
                          'image/jpeg';

        formData.append('service_banner', {
          uri: serviceBanner,
          name: bannerFilename,
          type: bannerType,
        } as any);
      }

      // Add shop documents
      shopDocuments.forEach((doc, index) => {
        if (doc.file && doc.name && doc.type) {
          const filename = doc.file.uri.split('/').pop() || `shop_document_${index}.pdf`;
          const match = /\.(\w+)$/.exec(filename);
          const ext = match ? match[1].toLowerCase() : 'pdf';
          const fileType = ext === 'pdf' ? 'application/pdf' : 
                          ext === 'png' ? 'image/png' : 
                          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                          'application/pdf';

          formData.append(`shop_document_file_${index}`, {
            uri: doc.file.uri,
            name: filename,
            type: fileType,
          } as any);
          
          formData.append(`shop_document_name_${index}`, doc.name);
          formData.append(`shop_document_type_${index}`, doc.type);
          
          if (doc.dateIssued) {
            formData.append(`shop_date_issued_${index}`, doc.dateIssued);
          }
          if (doc.dateExpiry) {
            formData.append(`shop_date_expiry_${index}`, doc.dateExpiry);
          }
        }
      });

      // Add owner documents
      ownerDocuments.forEach((doc, index) => {
        if (doc.file && doc.name && doc.type) {
          const filename = doc.file.uri.split('/').pop() || `owner_document_${index}.pdf`;
          const match = /\.(\w+)$/.exec(filename);
          const ext = match ? match[1].toLowerCase() : 'pdf';
          const fileType = ext === 'pdf' ? 'application/pdf' : 
                          ext === 'png' ? 'image/png' : 
                          ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                          'application/pdf';

          formData.append(`owner_document_file_${index}`, {
            uri: doc.file.uri,
            name: filename,
            type: fileType,
          } as any);
          
          formData.append(`owner_document_name_${index}`, doc.name);
          formData.append(`owner_document_type_${index}`, doc.type);
          
          if (doc.dateIssued) {
            formData.append(`owner_date_issued_${index}`, doc.dateIssued);
          }
          if (doc.dateExpiry) {
            formData.append(`owner_date_expiry_${index}`, doc.dateExpiry);
          }
        }
      });

      console.log('Sending registration request to:', `${API_URL}/users/register-shop-owner/`);
      
      const response = await fetch(`${API_URL}/users/register-shop-owner/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      console.log('Response status:', response.status);
      
      const responseText = await response.text();
      console.log('Response text:', responseText);
      
      let data: ShopOwnerRegisterResponse;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Invalid response from server');
      }

      if (response.ok) {
        showNotification({ type: 'success', title: 'Success', message: 'Shop owner profile created successfully!' });
        router.back();
      } else {
        console.error('Registration failed:', data);
        showNotification({ type: 'error', message: data.error || 'Failed to register as shop owner' });
      }
    } catch (err) {
      console.error('Registration error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to register';
      showNotification({ type: 'error', message: errorMessage });
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
          <ThemedText style={styles.headerTitle}>Register as Shop Owner</ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <IconSymbol name="building.2.fill" size={40} color="#007AFF" />
          <ThemedText style={styles.infoTitle}>Become a Shop Owner</ThemedText>
          <ThemedText style={styles.infoText}>
            Register your shop to manage services, mechanics, and grow your business.
          </ThemedText>
        </View>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Owner Information Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol name="person.fill" size={20} color="#007AFF" />
              <ThemedText style={styles.sectionTitle}>Owner Information</ThemedText>
            </View>

            {/* Profile Photo */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>
                Profile Photo <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TouchableOpacity style={styles.photoContainer} onPress={() => pickImage('profile')}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <IconSymbol name="person.circle.fill" size={60} color="#888" />
                    <ThemedText style={styles.photoText}>Tap to upload</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
              <ThemedText style={styles.hint}>Square image recommended</ThemedText>
            </View>

            {/* Owner Contact Number */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>
                Owner Contact Number <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="e.g., +63 912 345 6789"
                placeholderTextColor="#666"
                value={ownerContactNumber}
                onChangeText={setOwnerContactNumber}
                keyboardType="phone-pad"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>
                Your personal contact number
              </ThemedText>
            </View>
          </View>

          {/* Shop Information Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol name="storefront.fill" size={20} color="#007AFF" />
              <ThemedText style={styles.sectionTitle}>Shop Information</ThemedText>
            </View>

            {/* Shop Name */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>
                Shop Name <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="e.g., AutoFix Garage"
                placeholderTextColor="#666"
                value={shopName}
                onChangeText={setShopName}
                editable={!loading}
              />
            </View>

            {/* Shop Contact Number */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>
                Shop Contact Number <ThemedText style={styles.required}>*</ThemedText>
              </ThemedText>
              <TextInput
                style={styles.input}
                placeholder="e.g., +63 912 345 6789"
                placeholderTextColor="#666"
                value={shopContactNumber}
                onChangeText={setShopContactNumber}
                keyboardType="phone-pad"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>
                Customers will use this to contact your shop
              </ThemedText>
            </View>

            {/* Shop Email */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Shop Email</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="e.g., contact@shop.com"
                placeholderTextColor="#666"
                value={shopEmail}
                onChangeText={setShopEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>Optional</ThemedText>
            </View>

            {/* Website */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Website</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="e.g., https://yourshop.com"
                placeholderTextColor="#666"
                value={website}
                onChangeText={setWebsite}
                keyboardType="url"
                autoCapitalize="none"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>Optional</ThemedText>
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Description</ThemedText>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                placeholder="Tell customers about your shop, services, and specialties..."
                placeholderTextColor="#666"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>Optional • Recommended</ThemedText>
            </View>

            {/* Service Banner */}
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Service Banner</ThemedText>
              <TouchableOpacity style={styles.bannerContainer} onPress={() => pickImage('banner')}>
                {serviceBanner ? (
                  <Image source={{ uri: serviceBanner }} style={styles.banner} />
                ) : (
                  <View style={styles.bannerPlaceholder}>
                    <IconSymbol name="photo.fill" size={40} color="#888" />
                    <ThemedText style={styles.photoText}>Tap to upload banner</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
              <ThemedText style={styles.hint}>Optional • 16:9 ratio recommended</ThemedText>
            </View>
          </View>

          {/* Shop Documents Section */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.label}>Shop Documents</ThemedText>
              <TouchableOpacity onPress={() => pickDocument('shop')} style={styles.addButton}>
                <IconSymbol name="plus.circle.fill" size={20} color="#007AFF" />
                <ThemedText style={styles.addButtonText}>Add Document</ThemedText>
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.hint}>
              Upload business permits, licenses, etc. (Optional)
            </ThemedText>

            {/* Shop Document List */}
            {shopDocuments.map((doc) => (
              <View key={doc.id} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <IconSymbol name="doc.fill" size={20} color="#007AFF" />
                  <ThemedText style={styles.documentFileName}>
                    {doc.file.fileName || 'Shop Document'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeDocument(doc.id, 'shop')}>
                    <IconSymbol name="trash.fill" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Document Name (e.g., Business Permit)"
                  placeholderTextColor="#666"
                  value={doc.name}
                  onChangeText={(text) => updateDocument(doc.id, 'name', text, 'shop')}
                />

                <View style={styles.pickerContainer}>
                  <ThemedText style={styles.pickerLabel}>Type:</ThemedText>
                  <View style={styles.pickerButtons}>
                    {['permit', 'license', 'certificate', 'others'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.pickerButton,
                          doc.type === type && styles.pickerButtonActive,
                        ]}
                        onPress={() => updateDocument(doc.id, 'type', type, 'shop')}
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
                    onPress={() => setShowDatePicker({ docId: doc.id, type: 'issued', docCategory: 'shop' })}
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
                    onPress={() => setShowDatePicker({ docId: doc.id, type: 'expiry', docCategory: 'shop' })}
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

          {/* Owner Documents Section */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.label}>Owner Documents</ThemedText>
              <TouchableOpacity onPress={() => pickDocument('owner')} style={styles.addButton}>
                <IconSymbol name="plus.circle.fill" size={20} color="#007AFF" />
                <ThemedText style={styles.addButtonText}>Add Document</ThemedText>
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.hint}>
              Upload valid IDs, certifications, etc. (Optional)
            </ThemedText>

            {/* Owner Document List */}
            {ownerDocuments.map((doc) => (
              <View key={doc.id} style={styles.documentCard}>
                <View style={styles.documentHeader}>
                  <IconSymbol name="doc.fill" size={20} color="#34C759" />
                  <ThemedText style={styles.documentFileName}>
                    {doc.file.fileName || 'Owner Document'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeDocument(doc.id, 'owner')}>
                    <IconSymbol name="trash.fill" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Document Name (e.g., Valid ID)"
                  placeholderTextColor="#666"
                  value={doc.name}
                  onChangeText={(text) => updateDocument(doc.id, 'name', text, 'owner')}
                />

                <View style={styles.pickerContainer}>
                  <ThemedText style={styles.pickerLabel}>Type:</ThemedText>
                  <View style={styles.pickerButtons}>
                    {['id', 'certificate', 'license', 'others'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.pickerButton,
                          doc.type === type && styles.pickerButtonActive,
                        ]}
                        onPress={() => updateDocument(doc.id, 'type', type, 'owner')}
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
                    onPress={() => setShowDatePicker({ docId: doc.id, type: 'issued', docCategory: 'owner' })}
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
                    onPress={() => setShowDatePicker({ docId: doc.id, type: 'expiry', docCategory: 'owner' })}
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
                  const docs = showDatePicker.docCategory === 'shop' ? shopDocuments : ownerDocuments;
                  const doc = docs.find(d => d.id === showDatePicker.docId);
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
                Set up your shop's services and pricing
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <IconSymbol name="checkmark.circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Hire mechanics and manage your team
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <IconSymbol name="checkmark.circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Start accepting bookings from customers
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
  sectionCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
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
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  descriptionInput: {
    minHeight: 100,
    paddingTop: 14,
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
    backgroundColor: '#2A2A2A',
    borderWidth: 2,
    borderColor: '#333',
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
  bannerContainer: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#333',
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  bannerPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
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
