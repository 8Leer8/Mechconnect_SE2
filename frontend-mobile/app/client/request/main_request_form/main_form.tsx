import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Animated } from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useLocation } from './LocationContext';
import { styles } from '@/style/client/broadcastRequestStyles';
import { useNotification } from '@/hooks/useNotification';
import VehicleTypeModal from '@/components/VehicleTypeModal';
import PriceSummarySheet from '@/components/PriceSummarySheet';
import { usePricing } from '@/hooks/usePricing';
import { calculateBroadcastFee, FeeBreakdown } from '@/utils/trafficutils';

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

interface AIPredictResponse {
  ai_recommendations?: unknown;
  matched_shops?: unknown;
  matched_mechanics?: unknown;
  error?: string;
}

interface NearbyProvider {
  id: number;
  provider_type: 'mechanic' | 'shop';
  name: string;
  distance_km: number;
  rating: number | null;
  specialization: string | null;
  profile_photo: string | null;
}

interface NearbyProvidersResponse {
  providers?: NearbyProvider[];
  mechanics?: NearbyProvider[];
  shops?: NearbyProvider[];
  count: number;
}

export default function MainRequestFormScreen() {
  const { showNotification } = useNotification();
  const { selectedLocation, setSelectedLocation } = useLocation();
  const { pricing, loading: pricingLoading } = usePricing();

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
  const [searchRadiusKm, setSearchRadiusKm] = useState(5);
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');

  // Location fields (shared by both modes)
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [streetName, setStreetName] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [barangay, setBarangay] = useState('');
  const [landmark, setLandmark] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [nearbyProviders, setNearbyProviders] = useState<NearbyProvider[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [showNearbySection, setShowNearbySection] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);

  // ─── Fetch Services (only for Broadcast mode) ─────────────
  useEffect(() => {
    if (isCustomMode) return;
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
          showNotification({ type: 'error', message: 'Failed to load services' });
        }
      } finally {
        if (!cancelled) setFetchingServices(false);
      }
    };
    fetchServices();
    return () => { cancelled = true; };
  }, [isCustomMode]);

  // ─── Handle location data from map screen ────────────────
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
        if (selectedLocation.radiusKm) {
          setSearchRadiusKm(selectedLocation.radiusKm);
        }
        setSelectedLocation(null);
      }
      return () => { isMounted = false; };
    }, [selectedLocation, setSelectedLocation])
  );

  useEffect(() => {
    if (isCustomMode || latitude === null || longitude === null || !selectedAddress) {
      setNearbyProviders([]);
      setShowNearbySection(false);
      setLoadingNearby(false);
      return;
    }

    let cancelled = false;
    const fetchNearbyMechanics = async () => {
      try {
        if (!cancelled) {
          setShowNearbySection(true);
          setLoadingNearby(true);
        }

        const query = new URLSearchParams({
          lat: String(latitude),
          lng: String(longitude),
          radius_km: '5',
        });

        const response = await fetch(`${API_URL}/users/mechanics/nearby/?${query.toString()}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch nearby mechanics');
        }

        const data = await response.json() as NearbyProvidersResponse;
        if (!cancelled) {
          const providers = Array.isArray(data.providers)
            ? data.providers
            : Array.isArray(data.mechanics)
              ? data.mechanics
              : [];
          setNearbyProviders(providers);
        }
      } catch {
        if (!cancelled) {
          // Keep this section silent on API errors per UX requirement.
          setShowNearbySection(false);
          setNearbyProviders([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingNearby(false);
        }
      }
    };

    fetchNearbyMechanics();
    return () => {
      cancelled = true;
    };
  }, [isCustomMode, latitude, longitude, selectedAddress]);

  // ─── Toggle Custom Mode ────────────────────────────────────
  const handleToggleCustomMode = () => {
    const newCustomMode = !isCustomMode;
    setIsCustomMode(newCustomMode);
    setCustomDropdownExpanded(newCustomMode);
    Animated.timing(dropdownHeight, {
      toValue: newCustomMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
    if (newCustomMode) setSelectedServiceIds([]);
  };

  const toggleService = (serviceId: number) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
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
      if (!result.canceled && result.assets[0]) setConcernPicture(result.assets[0].uri);
    } catch (error) {
      showNotification({ type: 'error', message: 'Failed to take photo' });
    }
  };

  const handleSelectLocation = () => {
    if (selectedAddress && latitude !== null && longitude !== null) {
      router.push({
        pathname: '/client/request/main_request_form/map',
        params: {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          radiusKm: searchRadiusKm.toString(),
        },
      });
    } else {
      router.push({
        pathname: '/client/request/main_request_form/map',
        params: { radiusKm: searchRadiusKm.toString() },
      });
    }
  };

  // ─── Location Section (shared UI) ─────────────────────────
  const renderLocationSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <FontAwesome name="map-marker" size={14} color="#FF8C00" />
        <ThemedText style={styles.sectionTitle}>Service Location *</ThemedText>
      </View>
      <TouchableOpacity style={styles.selectLocationBtn} onPress={handleSelectLocation} activeOpacity={0.7}>
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
            <ThemedText style={{ fontSize: 12, color: '#8E8E93', width: 100 }}>Region:</ThemedText>
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
          {!isCustomMode && (
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <ThemedText style={{ fontSize: 12, color: '#8E8E93', width: 100 }}>Broadcast Radius:</ThemedText>
              <ThemedText style={{ fontSize: 12, color: '#fff', flex: 1 }}>{searchRadiusKm} km</ThemedText>
            </View>
          )}
        </View>
      )}

      {selectedAddress && !isCustomMode && showNearbySection && (
        <View style={styles.nearbySection}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="wrench" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Nearby Providers</ThemedText>
          </View>
          <ThemedText style={styles.nearbySubtitle}>Top 3 closest within 5 km</ThemedText>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nearbyScrollContent}>
            {loadingNearby ? (
              [0, 1, 2].map((idx) => (
                <View key={`nearby-skeleton-${idx}`} style={[styles.nearbyChip, styles.nearbyChipSkeleton]}>
                  <View style={styles.nearbyIconSkeleton} />
                  <View style={styles.nearbyLineLg} />
                </View>
              ))
            ) : nearbyProviders.length === 0 ? (
              <View style={styles.nearbyEmptyWrap}>
                <ThemedText style={styles.nearbyEmptyText}>No providers found nearby</ThemedText>
              </View>
            ) : (
              nearbyProviders.map((provider) => (
                <TouchableOpacity
                  key={`nearby-provider-${provider.provider_type}-${provider.id}`}
                  style={styles.nearbyChip}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (provider.provider_type === 'shop') {
                      router.push({
                        pathname: '/client/request/main_request_form/shop-profile/[id]',
                        params: {
                          id: String(provider.id),
                          shopId: String(provider.id),
                          distance_km: String(provider.distance_km),
                        },
                      });
                    } else {
                      router.push({
                        pathname: '/client/request/main_request_form/mechanic-profile/[id]',
                        params: {
                          id: String(provider.id),
                          mechanicId: String(provider.id),
                          distance_km: String(provider.distance_km),
                        },
                      });
                    }
                  }}
                >
                  <View style={styles.nearbyHeaderRow}>
                    <View style={styles.nearbyTypeIconWrap}>
                      <FontAwesome
                        name={provider.provider_type === 'shop' ? 'building-o' : 'wrench'}
                        size={12}
                        color="#FF8C00"
                      />
                    </View>
                    <ThemedText style={styles.nearbyName} numberOfLines={1}>{provider.name}</ThemedText>
                  </View>

                  <View style={styles.nearbyStatRow}>
                    <FontAwesome name="map-marker" size={11} color="#FF8C00" />
                    <ThemedText style={styles.nearbyStatText}>{provider.distance_km.toFixed(2)} km away</ThemedText>
                  </View>

                  <View style={styles.nearbyStatRow}>
                    <FontAwesome name="star" size={11} color="#FF8C00" />
                    <ThemedText style={styles.nearbyStatText}>
                      {provider.rating !== null ? `${provider.rating.toFixed(1)} rating` : 'New provider'}
                    </ThemedText>
                  </View>

                  <ThemedText style={styles.nearbyMeta} numberOfLines={1}>
                    {provider.specialization || (provider.provider_type === 'shop' ? 'General automotive services' : 'General mechanic')}
                  </ThemedText>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      )}

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
  );

  // ─── Submit Broadcast Request ──────────────────────────────
  const validateBroadcastForm = () => {
    if (selectedServiceIds.length === 0) {
      showNotification({ type: 'error', message: 'Please select at least one service' });
      return false;
    }
    if (!description.trim()) {
      showNotification({ type: 'error', message: 'Please provide a description' });
      return false;
    }
    if (!selectedAddress) {
      showNotification({ type: 'error', message: 'Please select a location from the map' });
      return false;
    }
    if (!latitude || !longitude) {
      showNotification({ type: 'error', message: 'Please select a location from the map' });
      return false;
    }
    if (!vehicleType || !vehicleBrand || !vehicleModel) {
      showNotification({ type: 'error', message: 'Please select your vehicle type, brand, and model' });
      return false;
    }

    return true;
  };

  const sendBroadcastRequest = async () => {
    if (!validateBroadcastForm()) return;

    const latValue = latitude;
    const lngValue = longitude;
    if (latValue === null || lngValue === null) {
      showNotification({ type: 'error', message: 'Please select a location from the map' });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('service_ids', JSON.stringify(selectedServiceIds));
      formData.append('description', description);
      formData.append('search_radius_km', String(searchRadiusKm));
      formData.append('radius_km', String(searchRadiusKm));
      formData.append('vehicle_type', vehicleType);
      formData.append('vehicle_brand', vehicleBrand);
      formData.append('vehicle_model', vehicleModel);
      formData.append('latitude', latValue.toString());
      formData.append('longitude', lngValue.toString());
      formData.append('service_location', JSON.stringify({
        street_name: streetName,
        barangay,
        city_municipality: cityMunicipality,
        landmark: landmark || undefined,
      }));
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
        showNotification({ type: 'success', message: 'Broadcast request created! Nearby mechanics will be notified.' });
        router.back();
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to create broadcast request' });
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'An error occurred while creating the request' });
    } finally {
      setLoading(false);
    }
  };

  // ─── Submit Custom Request (AI Flow) ──────────────────────
  const sendCustomRequest = async () => {
    if (!description.trim()) {
      showNotification({ type: 'error', message: 'Please provide a description of your concern' });
      return;
    }
    if (!selectedAddress) {
      showNotification({ type: 'error', message: 'Please select a location from the map' });
      return;
    }
    if (!latitude || !longitude) {
      showNotification({ type: 'error', message: 'Please select a location from the map' });
      return;
    }
    if (!vehicleType || !vehicleBrand || !vehicleModel) {
      showNotification({ type: 'error', message: 'Please select your vehicle type, brand, and model' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/ai/predict/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });

      const data = await response.json() as AIPredictResponse;

      if (response.ok) {
        router.push({
          pathname: '/client/request/aiRecommend/recommendprovider',
          params: {
            description,
            concern_picture: concernPicture || '',
            street_name: streetName,
            barangay,
            city_municipality: cityMunicipality,
            landmark: landmark || '',
            ai_recommendations: JSON.stringify(data.ai_recommendations),
            matched_shops: JSON.stringify(data.matched_shops),
            matched_mechanics: JSON.stringify(data.matched_mechanics),
            vehicle_type: vehicleType,
            vehicle_brand: vehicleBrand,
            vehicle_model: vehicleModel,
          },
        });
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to get AI recommendations' });
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'An error occurred while fetching recommendations' });
    } finally {
      setLoading(false);
    }
  };

  // ─── Handle Submit ─────────────────────────────────────────
  const handleBroadcastSummary = () => {
    if (!validateBroadcastForm()) return;
    if (!pricing || pricingLoading) {
      showNotification({ type: 'warning', message: 'Pricing configuration is still loading. Please try again.' });
      return;
    }

    const medianDistance = Math.max(0, searchRadiusKm / 2);
    const breakdown = calculateBroadcastFee(medianDistance);
    setFeeBreakdown(breakdown);
    setShowSummary(true);
  };

  const handleSubmit = async () => {
    if (isCustomMode) {
      await sendCustomRequest();
    } else {
      handleBroadcastSummary();
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
          {isCustomMode ? 'AI Recommend' : 'Broadcast Request'}
        </ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.subtitle}>
          {isCustomMode
            ? 'Describe your problem and AI will find the right mechanics and shops for you'
            : 'Send your request to nearby mechanics'}
        </ThemedText>

        {/* Mode Toggle Section */}
        {!isCustomMode && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <FontAwesome name="cogs" size={14} color="#FF8C00" />
              <ThemedText style={styles.sectionTitle}>Select Services *</ThemedText>
            </View>
            <TouchableOpacity
              onPress={handleToggleCustomMode}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                marginVertical: 16, paddingVertical: 12, paddingHorizontal: 16,
                backgroundColor: '#FF8C0010', borderRadius: 8,
                borderWidth: 1, borderColor: '#FF8C00', borderStyle: 'dashed',
              }}
              activeOpacity={0.7}
            >
              <FontAwesome name="magic" size={14} color="#FF8C00" style={{ marginRight: 8 }} />
              <ThemedText style={{ fontSize: 14, fontWeight: '600', color: '#FF8C00' }}>
                Let AI Find Mechanics For You
              </ThemedText>
            </TouchableOpacity>

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
                      <ThemedText style={[styles.serviceText, selected && styles.serviceTextSelected]}>
                        {service.name}
                      </ThemedText>
                      <ThemedText style={[styles.servicePrice, selected && styles.servicePriceSelected]}>
                        ₱{service.minimum_price.toFixed(2)}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {selectedServiceIds.length > 0 && (
              <View style={styles.priceBreakdown}>
                <ThemedText style={styles.priceNote}>
                  + Distance pricing: ₱{(pricing?.base_distance_fee ?? 0).toFixed(2)} base + ₱{(pricing?.price_per_km ?? 0).toFixed(2)}/km after {(pricing?.free_distance_km ?? 0).toFixed(2)} km free distance. Traffic and convenience fees apply.
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* AI Mode Toggle back button */}
        {isCustomMode && (
          <View style={styles.section}>
            <TouchableOpacity
              onPress={handleToggleCustomMode}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16, paddingVertical: 12, paddingHorizontal: 16,
                backgroundColor: '#FF8C00', borderRadius: 8,
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
            <FontAwesome name="car" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Vehicle Information *</ThemedText>
          </View>
          <VehicleTypeModal
            vehicleType={vehicleType}
            vehicleBrand={vehicleBrand}
            vehicleModel={vehicleModel}
            onVehicleTypeChange={setVehicleType}
            onVehicleBrandChange={setVehicleBrand}
            onVehicleModelChange={setVehicleModel}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="pencil" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>
              {isCustomMode ? 'Describe Your Problem *' : 'Description *'}
            </ThemedText>
          </View>
          <TextInput
            style={[styles.input, { height: isCustomMode ? 150 : 100, textAlignVertical: 'top' }]}
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

        {/* Location — shown in BOTH modes */}
        {renderLocationSection()}

        {/* Image Upload */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="camera" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Add Photo (Optional)</ThemedText>
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
            style={[styles.sendBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <FontAwesome name={isCustomMode ? 'magic' : 'paper-plane'} size={14} color="#fff" />
                <ThemedText style={styles.sendBtnText}>
                  {isCustomMode ? 'Find Mechanics & Shops' : 'Send Broadcast Request'}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showSummary && feeBreakdown && pricing ? (
        <PriceSummarySheet
          visible={showSummary}
          onClose={() => setShowSummary(false)}
          onConfirm={async () => {
            setShowSummary(false);
            await sendBroadcastRequest();
          }}
          confirming={loading}
          serviceType={services
            .filter((s) => selectedServiceIds.includes(s.id))
            .map((s) => `${s.name} (₱${s.minimum_price.toFixed(2)})`)
            .join(', ')}
          serviceAmount={services
            .filter((s) => selectedServiceIds.includes(s.id))
            .reduce((sum, s) => sum + s.minimum_price, 0)}
          vehicleModel={vehicleModel}
          description={description}
          locationAddress={selectedAddress}
          radiusKm={searchRadiusKm}
          feeBreakdown={feeBreakdown}
          pricingConfig={pricing}
        />
      ) : null}
    </ThemedView>
  );
}