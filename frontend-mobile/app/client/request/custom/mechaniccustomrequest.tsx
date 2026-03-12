import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { styles } from '@/style/client/mechanicCustomRequestStyles';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Mechanic {
  id: number;
  name: string;
  full_name?: string;
  profile_photo?: string | null;
  average_rating?: number;
}

interface MechanicsResponse {
  mechanics: Mechanic[];
}

interface ProfileAddress {
  street_name?: string;
  subdivision_village?: string;
  barangay?: string;
  city_municipality?: string;
  house_building_number?: string;
  province?: string;
  region?: string;
  postal_code?: string;
}

export default function MechanicCustomRequestScreen() {
  const { showNotification } = useNotification();
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [concernPicture, setConcernPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingMechanics, setFetchingMechanics] = useState(false);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [profileAddress, setProfileAddress] = useState<ProfileAddress | null>(null);

  // Location fields
  const [streetName, setStreetName] = useState('');
  const [barangay, setBarangay] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [landmark, setLandmark] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchMechanics = async () => {
      try {
        setFetchingMechanics(true);
        const response = await fetch(`${API_URL}/users/mechanics/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json() as MechanicsResponse;
          if (!cancelled) setMechanics(data.mechanics || []);
        }
      } catch (err) {
        if (!cancelled) console.error('Error fetching mechanics:', err);
      } finally {
        if (!cancelled) setFetchingMechanics(false);
      }
    };
    fetchMechanics();
    return () => { cancelled = true; };
  }, []);

  const fetchCurrentLocation = async () => {
    try {
      setFetchingLocation(true);
      const response = await fetch(`${API_URL}/users/profile/details/`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        const profile = data?.profile || data;
        const address = profile?.address as ProfileAddress | undefined;
        if (address) {
          setProfileAddress(address);
          setStreetName(address.street_name || '');
          setBarangay(address.barangay || '');
          setCityMunicipality(address.city_municipality || '');
          setLandmark('');
          setUseCurrentLocation(true);
        } else {
          showNotification({ type: 'warning', title: 'No Address Found', message: 'No address found in your profile. Please enter your location manually.' });
          setUseCurrentLocation(false);
        }
      } else {
        showNotification({ type: 'error', message: 'Failed to fetch your profile address' });
        setUseCurrentLocation(false);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      showNotification({ type: 'error', message: 'Failed to fetch your location' });
      setUseCurrentLocation(false);
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleToggleCurrentLocation = () => {
    if (!useCurrentLocation) {
      fetchCurrentLocation();
    } else {
      setUseCurrentLocation(false);
      setStreetName('');
      setBarangay('');
      setCityMunicipality('');
      setLandmark('');
      setProfileAddress(null);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setConcernPicture(result.assets[0].uri);
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'Failed to pick image' });
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showNotification({ type: 'warning', title: 'Permission Denied', message: 'Camera permission is required' });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setConcernPicture(result.assets[0].uri);
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'Failed to take photo' });
    }
  };

  const handleSend = async () => {
    if (!description.trim()) {
      showNotification({ type: 'error', message: 'Please provide a description of your concern' });
      return;
    }
    if (!streetName || !barangay || !cityMunicipality) {
      showNotification({ type: 'error', message: 'Please fill in all required location fields' });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      if (selectedProviderId) {
        formData.append('provider_id', selectedProviderId.toString());
      }
      formData.append('description', description);

      const serviceLocationData = {
        street_name: streetName,
        barangay: barangay,
        city_municipality: cityMunicipality,
        landmark: landmark || undefined,
      };
      formData.append('service_location', JSON.stringify(serviceLocationData));

      if (concernPicture) {
        const filename = concernPicture.split('/').pop() || 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('concern_picture', {
          uri: concernPicture,
          name: filename,
          type: type,
        } as any);
      }

      const response = await fetch(`${API_URL}/bookings/requests/custom/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json();

      if (response.ok) {
        showNotification({ type: 'success', message: 'Custom request created successfully!' });
        router.back();
      } else {
        showNotification({ type: 'error', message: (data as any).error || 'Failed to create custom request' });
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'An error occurred while creating the request' });
    } finally {
      setLoading(false);
    }
  };

  const selectedMechanic = mechanics.find((m) => m.id === selectedProviderId);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Custom Request</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.subtitle}>Describe your concern and we'll match you with a mechanic</ThemedText>

        {/* Provider Selection (Optional) */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="wrench" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Select Mechanic (Optional)</ThemedText>
          </View>
          {fetchingMechanics ? (
            <ActivityIndicator size="small" color="#FF8C00" style={{ paddingVertical: 20 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mechanicScroll}>
              {/* None option */}
              <TouchableOpacity
                style={[styles.mechanicChip, !selectedProviderId && styles.mechanicChipSelected]}
                onPress={() => setSelectedProviderId(null)}
                activeOpacity={0.7}
              >
                <View style={[styles.mechanicAvatar, !selectedProviderId && { backgroundColor: '#FF8C0030' }]}>
                  <FontAwesome name="users" size={16} color={!selectedProviderId ? '#FF8C00' : '#8E8E93'} />
                </View>
                <ThemedText style={[styles.mechanicChipText, !selectedProviderId && styles.mechanicChipTextSelected]}>
                  Any
                </ThemedText>
              </TouchableOpacity>
              {mechanics.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.mechanicChip, selectedProviderId === m.id && styles.mechanicChipSelected]}
                  onPress={() => setSelectedProviderId(m.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.mechanicAvatar, selectedProviderId === m.id && { backgroundColor: '#FF8C0030' }]}>
                    <ThemedText style={[styles.mechanicAvatarText, selectedProviderId === m.id && { color: '#FF8C00' }]}>
                      {(m.full_name || m.name).charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.mechanicChipText, selectedProviderId === m.id && styles.mechanicChipTextSelected]} numberOfLines={1}>
                    {m.full_name || m.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Description */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="pencil" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Description *</ThemedText>
          </View>
          <TextInput
            style={styles.textArea}
            placeholder="Describe your vehicle issue or concern..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={5}
            value={description}
            onChangeText={setDescription}
            textAlignVertical="top"
          />
        </View>

        {/* Concern Picture */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="camera" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Concern Picture (Optional)</ThemedText>
          </View>
          <View style={styles.imageRow}>
            <TouchableOpacity style={styles.imageBtn} onPress={takePhoto} activeOpacity={0.7}>
              <FontAwesome name="camera" size={18} color="#FF8C00" />
              <ThemedText style={styles.imageBtnText}>Take Photo</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageBtn} onPress={pickImage} activeOpacity={0.7}>
              <FontAwesome name="image" size={18} color="#FF8C00" />
              <ThemedText style={styles.imageBtnText}>Gallery</ThemedText>
            </TouchableOpacity>
          </View>
          {concernPicture && (
            <View style={styles.previewContainer}>
              <Image source={{ uri: concernPicture }} style={styles.previewImage} contentFit="cover" />
              <TouchableOpacity style={styles.removeImageBtn} onPress={() => setConcernPicture(null)}>
                <FontAwesome name="times-circle" size={14} color="#FF3B30" />
                <ThemedText style={styles.removeImageText}>Remove</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="map-marker" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Service Location *</ThemedText>
          </View>

          {/* Current / Manual toggle */}
          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, useCurrentLocation && styles.pillSelected]}
              onPress={handleToggleCurrentLocation}
              activeOpacity={0.7}
              disabled={fetchingLocation}
            >
              {fetchingLocation ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome name="crosshairs" size={12} color={useCurrentLocation ? '#fff' : '#8E8E93'} />
                  <ThemedText style={[styles.pillText, useCurrentLocation && styles.pillTextSelected]}>Current</ThemedText>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, !useCurrentLocation && styles.pillSelected]}
              onPress={() => {
                setUseCurrentLocation(false);
                setStreetName('');
                setBarangay('');
                setCityMunicipality('');
                setLandmark('');
                setProfileAddress(null);
              }}
              activeOpacity={0.7}
            >
              <FontAwesome name="pencil" size={12} color={!useCurrentLocation ? '#fff' : '#8E8E93'} />
              <ThemedText style={[styles.pillText, !useCurrentLocation && styles.pillTextSelected]}>Manual</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Show fetched address summary when using current */}
          {useCurrentLocation && profileAddress && (
            <View style={styles.currentLocationCard}>
              <View style={styles.currentLocationIcon}>
                <FontAwesome name="map-pin" size={14} color="#FF8C00" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.currentLocationText}>
                  {[profileAddress.street_name, profileAddress.barangay, profileAddress.city_municipality].filter(Boolean).join(', ')}
                </ThemedText>
                {profileAddress.province && (
                  <ThemedText style={styles.currentLocationSub}>{profileAddress.province}</ThemedText>
                )}
              </View>
            </View>
          )}

          {/* Manual input fields */}
          {!useCurrentLocation && (
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="Street Name"
                placeholderTextColor="#555"
                value={streetName}
                onChangeText={setStreetName}
              />
              <TextInput
                style={styles.input}
                placeholder="Barangay"
                placeholderTextColor="#555"
                value={barangay}
                onChangeText={setBarangay}
              />
              <TextInput
                style={styles.input}
                placeholder="City / Municipality"
                placeholderTextColor="#555"
                value={cityMunicipality}
                onChangeText={setCityMunicipality}
              />
              <TextInput
                style={styles.input}
                placeholder="Landmark (Optional)"
                placeholderTextColor="#555"
                value={landmark}
                onChangeText={setLandmark}
              />
            </View>
          )}

          {/* Landmark field when using current location */}
          {useCurrentLocation && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="Add Landmark (Optional)"
              placeholderTextColor="#555"
              value={landmark}
              onChangeText={setLandmark}
            />
          )}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.sendBtn, loading && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <FontAwesome name="paper-plane" size={16} color="#fff" />
              <ThemedText style={styles.sendBtnText}>Submit Request</ThemedText>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}
