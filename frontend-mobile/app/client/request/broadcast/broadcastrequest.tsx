import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useLocation } from './LocationContext';

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

export default function BroadcastRequestScreen() {
  const { selectedLocation, setSelectedLocation } = useLocation();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [description, setDescription] = useState('');
  const [concernPicture, setConcernPicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingServices, setFetchingServices] = useState(false);

  // Location from map
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [streetName, setStreetName] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [barangay, setBarangay] = useState('');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // ─── Fetch Services ────────────────────────────────────────
  useEffect(() => {
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
  }, []);

  // Handle location data from map screen
  useFocusEffect(
    React.useCallback(() => {
      let isMounted = true;
      if (selectedLocation && isMounted) {
        setLatitude(selectedLocation.latitude);
        setLongitude(selectedLocation.longitude);
        setSelectedAddress(selectedLocation.address);
        setStreetName(selectedLocation.streetName);
        setCityMunicipality(selectedLocation.city);
        setBarangay(selectedLocation.barangay);
        setSelectedLocation(null);
      }
      return () => { isMounted = false; };
    }, [selectedLocation, setSelectedLocation])
  );

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

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) setConcernPicture(result.assets[0].uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Denied', 'Camera permission is required'); return; }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.8 });
      if (!result.canceled && result.assets[0]) setConcernPicture(result.assets[0].uri);
    } catch (error) {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleSelectLocation = () => {
    if (selectedAddress && latitude !== null && longitude !== null) {
      router.push({ pathname: '/client/request/broadcast/map', params: { latitude: latitude.toString(), longitude: longitude.toString() } });
    } else {
      router.push('/client/request/broadcast/map');
    }
  };

  // ─── Send ──────────────────────────────────────────────────
  const handleSend = async () => {
    if (selectedServiceIds.length === 0) { Alert.alert('Error', 'Please select at least one service'); return; }
    if (!description.trim()) { Alert.alert('Error', 'Please provide a description'); return; }
    if (!selectedAddress) { Alert.alert('Error', 'Please select a location from the map'); return; }
    if (!latitude || !longitude) { Alert.alert('Error', 'Please select a location from the map'); return; }

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

      const data = await response.json() as CreateRequestResponse;

      if (response.ok) {
        Alert.alert('Success', 'Broadcast request created! Nearby mechanics will be notified.', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Alert.alert('Error', data.error || 'Failed to create broadcast request');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while creating the request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Broadcast Request</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.subtitle}>Send your request to nearby mechanics</ThemedText>

        {/* Services Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="cogs" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Select Services *</ThemedText>
          </View>
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
                    <ThemedText style={[styles.serviceText, selected && styles.serviceTextSelected]}>{service.name}</ThemedText>
                    <ThemedText style={[styles.servicePrice, selected && styles.servicePriceSelected]}>₱{service.minimum_price.toFixed(2)}</ThemedText>
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
              <ThemedText style={styles.priceNote}>+ Distance charge: ₱10/km from mechanic location</ThemedText>
            </View>
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
            placeholder="Describe your vehicle issue or service needed..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={4}
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
              <Image source={{ uri: concernPicture }} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" />
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
            <ThemedText style={styles.sectionTitle}>Location *</ThemedText>
          </View>

          {selectedAddress ? (
            <>
              <View style={styles.locationCard}>
                <View style={styles.locationIconWrap}>
                  <FontAwesome name="map-pin" size={16} color="#FF8C00" />
                </View>
                <View style={styles.locationTextWrap}>
                  <ThemedText style={styles.locationAddress}>{selectedAddress}</ThemedText>
                  {(streetName || cityMunicipality) && (
                    <ThemedText style={styles.locationDetails}>
                      {[streetName, barangay, cityMunicipality].filter(Boolean).join(', ')}
                    </ThemedText>
                  )}
                </View>
              </View>
              <TouchableOpacity style={styles.changeLocationBtn} onPress={handleSelectLocation} activeOpacity={0.7}>
                <FontAwesome name="refresh" size={12} color="#fff" />
                <ThemedText style={styles.changeLocationText}>Change Location</ThemedText>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.selectLocationBtn} onPress={handleSelectLocation} activeOpacity={0.7}>
              <FontAwesome name="map" size={18} color="#FF8C00" />
              <ThemedText style={styles.selectLocationText}>Select Location from Map</ThemedText>
              <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
            </TouchableOpacity>
          )}

          {/* Optional Landmark */}
          {selectedAddress && (
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
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
              <FontAwesome name="bullhorn" size={16} color="#fff" />
              <ThemedText style={styles.sendBtnText}>Send Broadcast</ThemedText>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
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
  // Services grid
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceCard: {
    backgroundColor: '#1A1C1E',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    minWidth: '45%',
    flexGrow: 1,
    position: 'relative',
  },
  serviceCardSelected: {
    backgroundColor: '#FF8C0018',
    borderColor: '#FF8C00',
  },
  serviceCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF8C00',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 4,
  },
  serviceTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  servicePrice: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  servicePriceSelected: {
    color: '#FF8C00',
    fontWeight: '600',
  },
  priceBreakdown: {
    backgroundColor: '#FF8C0010',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FF8C0030',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  priceBreakdownText: {
    fontSize: 14,
    color: '#FF8C00',
    fontWeight: '600',
  },
  priceNote: {
    fontSize: 11,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginLeft: 18,
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
    minHeight: 100,
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
  // Location
  locationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FF8C00',
    gap: 12,
    marginBottom: 10,
  },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  locationTextWrap: {
    flex: 1,
  },
  locationAddress: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 3,
  },
  locationDetails: {
    fontSize: 12,
    color: '#8E8E93',
  },
  changeLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 12,
  },
  changeLocationText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  selectLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    gap: 12,
  },
  selectLocationText: {
    flex: 1,
    fontSize: 14,
    color: '#8E8E93',
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
