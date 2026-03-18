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
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
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

interface ContactSourceOption {
  label: string;
  value: string;
}

interface ProfileDetailsResponse {
  profile?: {
    current_role_profile?: {
      client?: { contact_number?: string | null };
      mechanic?: { contact_number?: string | null };
      shop_owner?: { contact_number?: string | null };
    };
  };
}

interface RoleStatusResponse {
  mechanic_verification_status?: string | null;
}

interface Document {
  id: string;
  name: string;
  type: string;
  file: any | null;
  dateIssued?: string;
  dateExpiry?: string;
}

interface ShopOwnerFieldErrors {
  profilePhoto?: string;
  ownerContactNumber?: string;
  shopName?: string;
  shopContactNumber?: string;
  shopEmail?: string;
  shopDocuments?: string;
  ownerDocuments?: string;
}

const createDocumentId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createEmptyDocument = (category: 'shop' | 'owner'): Document => ({
  id: createDocumentId(),
  name: '',
  type: category === 'shop' ? 'permit' : 'id',
  file: null,
});

export default function ShopOwnerRegister() {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  
  // Owner information
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [ownerContactNumber, setOwnerContactNumber] = useState('');
  const [ownerContactOptions, setOwnerContactOptions] = useState<ContactSourceOption[]>([]);
  
  // Shop information
  const [shopName, setShopName] = useState('');
  const [shopContactNumber, setShopContactNumber] = useState('');
  const [shopEmail, setShopEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [serviceBanner, setServiceBanner] = useState<string | null>(null);
  
  // Documents
  const [shopDocuments, setShopDocuments] = useState<Document[]>(() => [createEmptyDocument('shop')]);
  const [ownerDocuments, setOwnerDocuments] = useState<Document[]>(() => [createEmptyDocument('owner')]);
  
  const [showDatePicker, setShowDatePicker] = useState<{
    docId: string;
    type: 'issued' | 'expiry';
    docCategory: 'shop' | 'owner';
  } | null>(null);
  const [documentPickerTarget, setDocumentPickerTarget] = useState<{
    docId: string;
    category: 'shop' | 'owner';
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ShopOwnerFieldErrors>({});

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

  const addDocument = (category: 'shop' | 'owner') => {
    const newDoc: Document = createEmptyDocument(category);

    if (category === 'shop') {
      setShopDocuments((prev) => [...prev, newDoc]);
      setFieldErrors((prev) => ({ ...prev, shopDocuments: undefined }));
    } else {
      setOwnerDocuments((prev) => [...prev, newDoc]);
      setFieldErrors((prev) => ({ ...prev, ownerDocuments: undefined }));
    }
  };

  const closeDocumentPicker = () => {
    setDocumentPickerTarget(null);
  };

  const setDocumentFile = (docId: string, category: 'shop' | 'owner', file: any) => {
    if (category === 'shop') {
      setShopDocuments((prev) =>
        prev.map((doc) => (doc.id === docId ? { ...doc, file } : doc))
      );
      setFieldErrors((prev) => ({ ...prev, shopDocuments: undefined }));
      return;
    }

    setOwnerDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, file } : doc))
    );
    setFieldErrors((prev) => ({ ...prev, ownerDocuments: undefined }));
  };

  const pickDocumentFile = async (source: 'camera' | 'gallery' | 'file') => {
    const target = documentPickerTarget;
    if (!target) return;

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
          setDocumentFile(target.docId, target.category, result.assets[0]);
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
          setDocumentFile(target.docId, target.category, result.assets[0]);
        }
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setDocumentFile(target.docId, target.category, result.assets[0]);
      }
    } catch (err) {
      console.error('Failed to pick document file:', err);
      showNotification({ type: 'error', title: 'Upload Failed', message: 'Unable to select file right now. Please try again.' });
    }
  };

  const removeDocument = (id: string, category: 'shop' | 'owner') => {
    if (category === 'shop') {
      setShopDocuments((prev) => prev.filter((doc) => doc.id !== id));
      setFieldErrors((prev) => ({ ...prev, shopDocuments: undefined }));
    } else {
      setOwnerDocuments((prev) => prev.filter((doc) => doc.id !== id));
      setFieldErrors((prev) => ({ ...prev, ownerDocuments: undefined }));
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
      setShopDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, [fieldName]: value } : doc))
      );
      setFieldErrors((prev) => ({ ...prev, shopDocuments: undefined }));
    } else {
      setOwnerDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, [fieldName]: value } : doc))
      );
      setFieldErrors((prev) => ({ ...prev, ownerDocuments: undefined }));
    }
  };

  useEffect(() => {
    const fetchContactSources = async () => {
      try {
        const [profileResponse, roleStatusResponse] = await Promise.all([
          fetch(`${API_URL}/users/profile/details/`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`${API_URL}/users/profile/role-status/`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }),
        ]);

        if (!profileResponse.ok) return;

        const data = await profileResponse.json() as ProfileDetailsResponse;
        const roleStatus = roleStatusResponse.ok
          ? (await roleStatusResponse.json() as RoleStatusResponse)
          : null;
        const profiles = data.profile?.current_role_profile;
        const options: ContactSourceOption[] = [];

        if (
          roleStatus?.mechanic_verification_status === 'approved'
          && profiles?.mechanic?.contact_number?.trim()
        ) {
          options.push({ label: 'Use Mechanic Number', value: profiles.mechanic.contact_number.trim() });
        }
        if (profiles?.client?.contact_number?.trim()) {
          options.push({ label: 'Use Client Number', value: profiles.client.contact_number.trim() });
        }

        const deduped: ContactSourceOption[] = [];
        const seen = new Set<string>();
        for (const option of options) {
          if (!seen.has(option.value)) {
            deduped.push(option);
            seen.add(option.value);
          }
        }

        setOwnerContactOptions(deduped);
        if (!ownerContactNumber && deduped.length > 0) {
          setOwnerContactNumber(deduped[0].value);
        }
      } catch (err) {
        console.error('Failed to load owner contact options:', err);
      }
    };

    fetchContactSources();
  }, []);

  const handleRegister = async () => {
    const nextErrors: ShopOwnerFieldErrors = {};

    if (!profilePhoto) {
      nextErrors.profilePhoto = 'Required';
    }

    if (!ownerContactNumber.trim()) {
      nextErrors.ownerContactNumber = 'Required';
    } else if (!/^[\d\s\-\+\(\)]+$/.test(ownerContactNumber)) {
      nextErrors.ownerContactNumber = 'Invalid number';
    }

    if (!shopName.trim()) {
      nextErrors.shopName = 'Required';
    }

    if (!shopContactNumber.trim()) {
      nextErrors.shopContactNumber = 'Required';
    } else if (!/^[\d\s\-\+\(\)]+$/.test(shopContactNumber)) {
      nextErrors.shopContactNumber = 'Invalid number';
    }

    // Validate email if provided
    if (shopEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shopEmail)) {
      nextErrors.shopEmail = 'Invalid email';
    }

    const hasAnyDocumentInput = (doc: Document) =>
      Boolean(doc.file || doc.name.trim() || doc.dateIssued || doc.dateExpiry);

    const incompleteShopDocuments = shopDocuments.filter(
      (doc) => hasAnyDocumentInput(doc) && (!doc.file || !doc.name.trim() || !doc.type)
    );
    if (incompleteShopDocuments.length > 0) {
      nextErrors.shopDocuments = 'Complete or remove incomplete cards';
    }

    const incompleteOwnerDocuments = ownerDocuments.filter(
      (doc) => hasAnyDocumentInput(doc) && (!doc.file || !doc.name.trim() || !doc.type)
    );
    if (incompleteOwnerDocuments.length > 0) {
      nextErrors.ownerDocuments = 'Complete or remove incomplete cards';
    }

    if (
      nextErrors.profilePhoto
      || nextErrors.ownerContactNumber
      || nextErrors.shopName
      || nextErrors.shopContactNumber
      || nextErrors.shopEmail
      || nextErrors.shopDocuments
      || nextErrors.ownerDocuments
    ) {
      setFieldErrors(nextErrors);
      return;
    }

    setFieldErrors({});

    const profilePhotoUri = profilePhoto;
    if (!profilePhotoUri) {
      return;
    }

    try {
      setLoading(true);

      const formData = new FormData();
      
      // Add profile photo (required)
      const profileFilename = profilePhotoUri.split('/').pop() || 'profile.jpg';
      const profileMatch = /\.(\w+)$/.exec(profileFilename);
      const profileExt = profileMatch ? profileMatch[1].toLowerCase() : 'jpg';
      const profileType = profileExt === 'png' ? 'image/png' : 
                         profileExt === 'jpg' || profileExt === 'jpeg' ? 'image/jpeg' : 
                         'image/jpeg';

      formData.append('profile_photo', {
        uri: profilePhotoUri,
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
        const isTouched = Boolean(doc.file || doc.name.trim() || doc.dateIssued || doc.dateExpiry);
        if (isTouched && doc.file && doc.name.trim() && doc.type) {
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
          
          formData.append(`shop_document_name_${index}`, doc.name.trim());
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
        const isTouched = Boolean(doc.file || doc.name.trim() || doc.dateIssued || doc.dateExpiry);
        if (isTouched && doc.file && doc.name.trim() && doc.type) {
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
          
          formData.append(`owner_document_name_${index}`, doc.name.trim());
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
        showNotification({
          type: 'success',
          title: 'Success',
          message: (typeof data.message === 'string' && data.message) ? data.message : 'Shop owner profile created successfully!',
        });
        router.replace('/(auth)/switchAccount/switchPage');
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
            <FontAwesome name="chevron-left" size={24} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Register as Shop Owner</ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <FontAwesome name="building" size={40} color="#FF8C00" />
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
              <FontAwesome name="user" size={20} color="#FF8C00" />
              <ThemedText style={styles.sectionTitle}>Owner Information</ThemedText>
            </View>

            {/* Profile Photo */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <ThemedText style={styles.label}>
                  Profile Photo <ThemedText style={styles.required}>*</ThemedText>
                </ThemedText>
                {!!fieldErrors.profilePhoto && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.profilePhoto}</ThemedText>
                )}
              </View>
              <TouchableOpacity
                style={[styles.photoContainer, fieldErrors.profilePhoto && styles.inputError]}
                onPress={() => {
                  pickImage('profile');
                  if (fieldErrors.profilePhoto) {
                    setFieldErrors((prev) => ({ ...prev, profilePhoto: undefined }));
                  }
                }}
              >
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <FontAwesome name="user-circle" size={60} color="#8E8E93" />
                    <ThemedText style={styles.photoText}>Tap to upload</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
              <ThemedText style={styles.hint}>Square image recommended</ThemedText>
            </View>

            {/* Owner Contact Number */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <ThemedText style={styles.label}>
                  Owner Contact Number <ThemedText style={styles.required}>*</ThemedText>
                </ThemedText>
                {!!fieldErrors.ownerContactNumber && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.ownerContactNumber}</ThemedText>
                )}
              </View>
              {ownerContactOptions.length > 0 && (
                <>
                  <ThemedText style={styles.contactChoiceLabel}>Use existing number</ThemedText>
                  <View style={styles.contactChoiceRow}>
                    {ownerContactOptions.map((option) => (
                      <TouchableOpacity
                        key={`${option.label}-${option.value}`}
                        style={[
                          styles.contactChoiceChip,
                          ownerContactNumber === option.value && styles.contactChoiceChipActive,
                        ]}
                        onPress={() => setOwnerContactNumber(option.value)}
                        disabled={loading}
                      >
                        <ThemedText
                          style={[
                            styles.contactChoiceText,
                            ownerContactNumber === option.value && styles.contactChoiceTextActive,
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
                style={[styles.input, fieldErrors.ownerContactNumber && styles.inputError]}
                placeholder="e.g., +63 912 345 6789"
                placeholderTextColor="#6B7280"
                value={ownerContactNumber}
                onChangeText={(text) => {
                  setOwnerContactNumber(text);
                  if (fieldErrors.ownerContactNumber) {
                    setFieldErrors((prev) => ({ ...prev, ownerContactNumber: undefined }));
                  }
                }}
                keyboardType="phone-pad"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>
                Choose existing number or enter a new one for shop owner role
              </ThemedText>
            </View>
          </View>

          {/* Shop Information Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleContainer}>
              <FontAwesome name="building-o" size={20} color="#FF8C00" />
              <ThemedText style={styles.sectionTitle}>Shop Information</ThemedText>
            </View>

            {/* Shop Name */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <ThemedText style={styles.label}>
                  Shop Name <ThemedText style={styles.required}>*</ThemedText>
                </ThemedText>
                {!!fieldErrors.shopName && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.shopName}</ThemedText>
                )}
              </View>
              <TextInput
                style={[styles.input, fieldErrors.shopName && styles.inputError]}
                placeholder="e.g., AutoFix Garage"
                placeholderTextColor="#6B7280"
                value={shopName}
                onChangeText={(text) => {
                  setShopName(text);
                  if (fieldErrors.shopName) {
                    setFieldErrors((prev) => ({ ...prev, shopName: undefined }));
                  }
                }}
                editable={!loading}
              />
            </View>

            {/* Shop Contact Number */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <ThemedText style={styles.label}>
                  Shop Contact Number <ThemedText style={styles.required}>*</ThemedText>
                </ThemedText>
                {!!fieldErrors.shopContactNumber && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.shopContactNumber}</ThemedText>
                )}
              </View>
              <TextInput
                style={[styles.input, fieldErrors.shopContactNumber && styles.inputError]}
                placeholder="e.g., +63 912 345 6789"
                placeholderTextColor="#6B7280"
                value={shopContactNumber}
                onChangeText={(text) => {
                  setShopContactNumber(text);
                  if (fieldErrors.shopContactNumber) {
                    setFieldErrors((prev) => ({ ...prev, shopContactNumber: undefined }));
                  }
                }}
                keyboardType="phone-pad"
                editable={!loading}
              />
              <ThemedText style={styles.hint}>
                Customers will use this to contact your shop
              </ThemedText>
            </View>

            {/* Shop Email */}
            <View style={styles.formGroup}>
              <View style={styles.labelRow}>
                <ThemedText style={styles.label}>Shop Email</ThemedText>
                {!!fieldErrors.shopEmail && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.shopEmail}</ThemedText>
                )}
              </View>
              <TextInput
                style={[styles.input, fieldErrors.shopEmail && styles.inputError]}
                placeholder="e.g., contact@shop.com"
                placeholderTextColor="#6B7280"
                value={shopEmail}
                onChangeText={(text) => {
                  setShopEmail(text);
                  if (fieldErrors.shopEmail) {
                    setFieldErrors((prev) => ({ ...prev, shopEmail: undefined }));
                  }
                }}
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
                placeholderTextColor="#6B7280"
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
                placeholderTextColor="#6B7280"
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
                    <FontAwesome name="image" size={40} color="#8E8E93" />
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
              <View style={styles.labelRowCompact}>
                <ThemedText style={styles.label}>Shop Documents</ThemedText>
                {!!fieldErrors.shopDocuments && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.shopDocuments}</ThemedText>
                )}
              </View>
              <TouchableOpacity onPress={() => addDocument('shop')} style={styles.addButton}>
                <FontAwesome name="plus-circle" size={20} color="#FF8C00" />
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
                  <FontAwesome name="file-text-o" size={20} color="#FF8C00" />
                  <ThemedText style={styles.documentFileName}>
                    {doc.file?.fileName || doc.file?.name || 'No file selected'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeDocument(doc.id, 'shop')}>
                    <FontAwesome name="trash" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.fileActionButton}
                  onPress={() => setDocumentPickerTarget({ docId: doc.id, category: 'shop' })}
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
                  placeholder="Document Name (e.g., Business Permit)"
                  placeholderTextColor="#6B7280"
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
                    <FontAwesome name="calendar" size={16} color="#8E8E93" />
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
                    <FontAwesome name="calendar" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {/* Owner Documents Section */}
          <View style={styles.formGroup}>
            <View style={styles.sectionHeader}>
              <View style={styles.labelRowCompact}>
                <ThemedText style={styles.label}>Owner Documents</ThemedText>
                {!!fieldErrors.ownerDocuments && (
                  <ThemedText style={styles.inlineErrorText}>{fieldErrors.ownerDocuments}</ThemedText>
                )}
              </View>
              <TouchableOpacity onPress={() => addDocument('owner')} style={styles.addButton}>
                <FontAwesome name="plus-circle" size={20} color="#FF8C00" />
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
                  <FontAwesome name="file-text-o" size={20} color="#34C759" />
                  <ThemedText style={styles.documentFileName}>
                    {doc.file?.fileName || doc.file?.name || 'No file selected'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeDocument(doc.id, 'owner')}>
                    <FontAwesome name="trash" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.fileActionButton}
                  onPress={() => setDocumentPickerTarget({ docId: doc.id, category: 'owner' })}
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
                  placeholder="Document Name (e.g., Valid ID)"
                  placeholderTextColor="#6B7280"
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
                    <FontAwesome name="calendar" size={16} color="#8E8E93" />
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
                Set up your shop's services and pricing
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <FontAwesome name="check-circle" size={18} color="#34C759" />
              <ThemedText style={styles.requirementText}>
                Hire mechanics and manage your team
              </ThemedText>
            </View>
            <View style={styles.requirementItem}>
              <FontAwesome name="check-circle" size={18} color="#34C759" />
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
  sectionCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
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
    backgroundColor: '#2A2C2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#2F3133',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  descriptionInput: {
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
    backgroundColor: '#2A2C2E',
    borderWidth: 2,
    borderColor: '#2F3133',
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
  bannerContainer: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2A2C2E',
    borderWidth: 1,
    borderColor: '#2F3133',
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

