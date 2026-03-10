import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Animated } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useLocation } from './LocationContext';
import { styles } from '@/style/client/broadcastRequestStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Service {
  id: number;
  name: string;
  description?: string;
  minimum_price: number;
}

interface ServicesResponse {
  services: Service[];
}

interface CreateRequestResponse {
  message?: string;
  error?: string;
  request_id?: number;
}

export default function MainRequestFormScreen() {
  const { selectedLocation, setSelectedLocation } = useLocation();
  
  // Mode state
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customDropdownExpanded, setCustomDropdownExpanded] = useState(false);
  const [dropdownHeight] = useState(new Animated.Value(0));
  
  // Services (Broadcast mode)
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [fetchingServices, setFetchingServices] = useState(false);
  
  // Common fields
  const [description, setDescription] = useState('');
  const [concernPicture, setConcernPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Location fields (Broadcast mode only)
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [streetName, setStreetName] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [barangay, setBarangay] = useState('');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // ─── Fetch Services (only for Broadcast mode) ─────────────
  useEffect(() => {
    if (isCustomMode) return; // Don't fetch services in custom mode
    
    let cancelled = false;
    const fetchServices = async () => {
      try {
        if (!cancelled) setFetchingServices(true);
        const response = await fetch(`${API_URL}/services/`, { credentials: 'include' });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json() as ServicesResponse;
          if (!cancelled) setServices(data.services || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching services:', error);
          Alert.alert('Error', 'Failed to load services');
        }
      } finally {
        if (!cancelled) setFetchingServices(false);
      }
    };
    fetchServices();
    return () => { cancelled = true; };
  }, [isCustomMode]);

  // ─── Handle location data from map screen (Broadcast mode) ────
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      if (selectedLocation && isMounted && !isCustomMode) {
        setLatitude(selectedLocation.latitude);
        setLongitude(selectedLocation.longitude);
        setSelectedAddress(selectedLocation.address);
        setStreetName(selectedLocation.streetName);
        setCityMunicipality(selectedLocation.city);
        setBarangay(selectedLocation.barangay);
        setSelectedLocation(null);
      }
      return () => { isMounted = false; };
    }, [selectedLocation, setSelectedLocation, isCustomMode])
  );

  // ─── Toggle Custom Mode ────────────────────────────────────
  const handleToggleCustomMode = () => {
    const newCustomMode = !isCustomMode;
    setIsCustomMode(newCustomMode);
    setCustomDropdownExpanded(newCustomMode);
    
    // Animate dropdown
    Animated.timing(dropdownHeight, {
      toValue: newCustomMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
    
    // Clear service selection when switching modes
    if (newCustomMode) {
      setSelectedServiceIds([]);
    }
  };

  const toggleService = (serviceId: number) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const getTotalMinimumPrice = () => {
    return services
      .filter((service) => selectedServiceIds.includes(service.id))
      .reduce((sum, service) => sum + service.minimum_price, 0);
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setConcernPicture(result.assets[0].uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleSelectLocation = () => {
    if (selectedAddress && latitude !== null && longitude !== null) {
      router.push({
        pathname: '/client/request/main_request_form/map',
        params: { latitude: latitude.toString(), longitude: longitude.toString() },
      });
    } else {
      router.push('/client/request/main_request_form/map');
    }
  };

  // ─── Submit Broadcast Request ──────────────────────────────
  const sendBroadcastRequest = async () => {
    if (selectedServiceIds.length === 0) {
      Alert.alert('Error', 'Please select at least one service');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a description');
      return;
    }
    if (!selectedAddress) {
      Alert.alert('Error', 'Please select a location from the map');
      return;
    }
    if (!latitude || !longitude) {
      Alert.alert('Error', 'Please select a location from the map');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('service_ids', JSON.stringify(selectedServiceIds));
      formData.append('description', description);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());

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
        formData.append('concern_picture', { uri: concernPicture, name: filename, type } as any);
      }

      const response = await fetch(`${API_URL}/bookings/requests/broadcast/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = (await response.json()) as CreateRequestResponse;

      if (response.ok) {
        Alert.alert('Success', 'Broadcast request created! Nearby mechanics will be notified.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', data.error || 'Failed to create broadcast request');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while creating the request');
    } finally {
      setLoading(false);
    }
  };

  // ─── Submit Custom Request ─────────────────────────────────
  const sendCustomRequest = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please provide a description of your concern');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('description', description);

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
        Alert.alert('Success', 'Custom request created successfully!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Error', (data as any).error || 'Failed to create custom request');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while creating the request');
    } finally {
      setLoading(false);
    }
  };

  // ─── Handle Submit ─────────────────────────────────────────
  const handleSubmit = async () => {
    if (isCustomMode) {
      await sendCustomRequest();
    } else {
      await sendBroadcastRequest();
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>
          {isCustomMode ? 'Custom Request' : 'Broadcast Request'}
        </ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={styles.subtitle}>
          {isCustomMode
            ? 'Describe your concern and we\'ll match you with a mechanic'
            : 'Send your request to nearby mechanics'}
        </ThemedText>

        {/* Mode Toggle Section */}
        {!isCustomMode && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome name="cogs" size={14} color="#FF8C00" />
              <ThemedText style={styles.sectionTitle}>Select Services *</ThemedText>
            </View>

            {/* "OR" Divider with Custom Mode Toggle */}
            <TouchableOpacity
              onPress={handleToggleCustomMode}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginVertical: 16,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: '#FF8C0010',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#FF8C00',
                borderStyle: 'dashed',
              }}
              activeOpacity={0.7}
            >
              <FontAwesome name="chevron-down" size={14} color="#FF8C00" style={{ marginRight: 8 }} />
              <ThemedText style={{ fontSize: 14, fontWeight: '600', color: '#FF8C00' }}>
                Describe Problem Instead
              </ThemedText>
            </TouchableOpacity>

            {/* Services Selection */}
            {fetchingServices ? (
              <ActivityIndicator size="small" color="#FF8C00" style={{ paddingVertical: 20 }} />
            ) : (
              <View style={styles.servicesGrid}>
                {services.map((service) => {
                  const selected = selectedServiceIds.includes(service.id);
                  return (
                    <TouchableOpacity
                      key={service.id}
                      style={[styles.serviceCard, selected && styles.serviceCardSelected]}
                      onPress={() => toggleService(service.id)}
                      activeOpacity={0.7}
                    >
                      {selected && (
                        <View style={styles.serviceCheck}>
                          <FontAwesome name="check" size={10} color="#fff" />
                        </View>
                      )}
                      <ThemedText
                        style={[styles.serviceText, selected && styles.serviceTextSelected]}
                      >
                        {service.name}
                      </ThemedText>
                      <ThemedText
                        style={[styles.servicePrice, selected && styles.servicePriceSelected]}
                      >
                        ₱{service.minimum_price.toFixed(2)}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {selectedServiceIds.length > 0 && (
              <View style={styles.priceBreakdown}>
                <View style={styles.priceRow}>
                  <FontAwesome name="tag" size={12} color="#FF8C00" />
                  <ThemedText style={styles.priceBreakdownText}>
                    Total Min Price: ₱{getTotalMinimumPrice().toFixed(2)}
                  </ThemedText>
                </View>
                <ThemedText style={styles.priceNote}>
                  + Distance charge: ₱10/km from mechanic location
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Custom Mode Toggle (when in custom mode) */}
        {isCustomMode && (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={handleToggleCustomMode}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                paddingVertical: 12,
                paddingHorizontal: 16,
                backgroundColor: '#FF8C00',
                borderRadius: 8,
              }}
              activeOpacity={0.7}
            >
              <FontAwesome name="chevron-up" size={14} color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                Switch to Service Selection
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="pencil" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>
              {isCustomMode ? 'Describe Your Problem *' : 'Description *'}
            </ThemedText>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                height: isCustomMode ? 150 : 100,
                textAlignVertical: 'top',
              },
            ]}
            value={description}
            onChangeText={setDescription}
            placeholder={
              isCustomMode
                ? 'Tell us what\'s wrong with your vehicle... (e.g., "Engine making strange noise when accelerating")'
                : 'Describe your issue...'
            }
            placeholderTextColor="#8E8E93"
            multiline
          />
        </View>

        {/* Location (Broadcast mode only) */}
        {!isCustomMode && (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="map-marker" size={14} color="#FF8C00" />
                <ThemedText style={styles.sectionTitle}>Service Location *</ThemedText>
              </View>
              <TouchableOpacity
                style={styles.selectLocationBtn}
                onPress={handleSelectLocation}
                activeOpacity={0.7}
              >
                <FontAwesome name="map" size={14} color="#FF8C00" />
                <ThemedText style={[styles.selectLocationText, selectedAddress && { color: '#fff' }]}>
                  {selectedAddress || 'Select Location on Map'}
                </ThemedText>
                <FontAwesome name="chevron-right" size={12} color="#8E8E93" />
              </TouchableOpacity>

              {selectedAddress && (
                <View style={{ backgroundColor: '#1A1C1E', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#2A2C2E' }}>
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <ThemedText style={{ fontSize: 12, color: '#8E8E93', width: 100 }}>Street:</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#fff', flex: 1 }}>{streetName}</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <ThemedText style={{ fontSize: 12, color: '#8E8E93', width: 100 }}>Barangay:</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#fff', flex: 1 }}>{barangay}</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    <ThemedText style={{ fontSize: 12, color: '#8E8E93', width: 100 }}>City:</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#fff', flex: 1 }}>{cityMunicipality}</ThemedText>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    <ThemedText style={{ fontSize: 12, color: '#8E8E93', width: 100 }}>Coordinates:</ThemedText>
                    <ThemedText style={{ fontSize: 12, color: '#fff', flex: 1 }}>
                      {latitude?.toFixed(6)}, {longitude?.toFixed(6)}
                    </ThemedText>
                  </View>
                </View>
              )}

              {/* Optional Landmark */}
              {selectedAddress && (
                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontSize: 13, color: '#8E8E93', marginBottom: 8 }}>Landmark (Optional)</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={landmark}
                    onChangeText={setLandmark}
                    placeholder="e.g., Near SM Mall..."
                    placeholderTextColor="#8E8E93"
                  />
                </View>
              )}
            </View>
          </>
        )}

        {/* Image Upload */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="camera" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>
              Add Photo {isCustomMode ? '(Optional)' : '(Optional)'}
            </ThemedText>
          </View>
          <View style={styles.imageRow}>
            <TouchableOpacity style={styles.imageBtn} onPress={takePhoto} activeOpacity={0.7}>
              <FontAwesome name="camera" size={16} color="#FF8C00" />
              <ThemedText style={styles.imageBtnText}>Take Photo</ThemedText>
            </TouchableOpacity>
          </View>
          {concernPicture && (
            <View style={styles.previewContainer}>
              <Image source={{ uri: concernPicture }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeImageBtn}
                onPress={() => setConcernPicture(null)}
                activeOpacity={0.7}
              >
                <FontAwesome name="times-circle" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Submit Button */}
        <View style={{ paddingHorizontal: 16, marginTop: 24, marginBottom: 40 }}>
          <TouchableOpacity
            style={[
              styles.sendBtn,
              loading && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <FontAwesome name="paper-plane" size={14} color="#fff" />
                <ThemedText style={styles.sendBtnText}>
                  {isCustomMode ? 'Submit Custom Request' : 'Send Broadcast Request'}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}
