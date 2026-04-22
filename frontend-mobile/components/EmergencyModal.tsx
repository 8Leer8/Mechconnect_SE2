import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useNotification } from '@/hooks/useNotification';
import VehicleTypeModal from '@/components/VehicleTypeModal';
import { useLocation } from '@/context/LocationContext';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const { height } = Dimensions.get('window');
const MAX_EMERGENCY_PHOTOS = 5;
type EmergencyLocationData = {
  latitude: number;
  longitude: number;
  address?: string;
  street_name?: string;
  subdivision_village?: string;
  barangay?: string;
  city_municipality?: string;
  landmark?: string;
};

const PLACEHOLDER_LOCATION_TEXT = new Set(['emergency', 'emergency location', 'unknown barangay', 'unknown city']);
const EMPTY_DRAFT = {
  description: '',
  concernPictures: [] as string[],
  autoLocation: null as EmergencyLocationData | null,
  pinnedLocation: null as EmergencyLocationData | null,
  locationMode: 'auto' as 'auto' | 'pinned',
  vehicleType: '',
  vehicleBrand: '',
  vehicleModel: '',
  vehicleDescription: '',
};
let emergencyDraftCache = { ...EMPTY_DRAFT };
const emergencyPhrases = [
  "Engine won't start / Dead battery",
  'Flat tire / Need help installing spare',
  'Engine is overheating',
  "Car stalled while driving and won't restart",
  'Locked keys inside the car',
  'Brakes failed / Unsafe to drive',
  'Major fluid leak under the car',
  'Ran out of fuel',
];

interface EmergencyModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EmergencyModal({ visible, onClose, onSuccess }: EmergencyModalProps) {
  const { showNotification } = useNotification();
  const { selectedLocation, setSelectedLocation } = useLocation();
  const [description, setDescription] = useState(emergencyDraftCache.description);
  const [concernPictures, setConcernPictures] = useState<string[]>(emergencyDraftCache.concernPictures);
  const [loading, setLoading] = useState(false);
  const [autoLocation, setAutoLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
    street_name?: string;
    subdivision_village?: string;
    barangay?: string;
    city_municipality?: string;
    landmark?: string;
  } | null>(emergencyDraftCache.autoLocation);
  const [pinnedLocation, setPinnedLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
    street_name?: string;
    subdivision_village?: string;
    barangay?: string;
    city_municipality?: string;
    landmark?: string;
  } | null>(emergencyDraftCache.pinnedLocation);
  const [locationMode, setLocationMode] = useState<'auto' | 'pinned'>(emergencyDraftCache.locationMode);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [vehicleType, setVehicleType] = useState(emergencyDraftCache.vehicleType);
  const [vehicleBrand, setVehicleBrand] = useState(emergencyDraftCache.vehicleBrand);
  const [vehicleModel, setVehicleModel] = useState(emergencyDraftCache.vehicleModel);
  const [vehicleDescription, setVehicleDescription] = useState(emergencyDraftCache.vehicleDescription);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const wasVisibleRef = useRef(false);

  const formatCooldown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchEmergencyCooldown = async () => {
    try {
      const response = await fetch(`${API_URL}/bookings/requests/emergency/cooldown/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) return;

      const data = await response.json() as {
        can_request?: boolean;
        remaining_seconds?: number;
      };

      setCooldownSeconds(data.can_request ? 0 : (data.remaining_seconds || 0));
    } catch (_error) {
      // Non-blocking for modal experience; backend will still enforce cooldown on submit.
    }
  };

  useEffect(() => {
    emergencyDraftCache = {
      description,
      concernPictures,
      autoLocation,
      pinnedLocation,
      locationMode,
      vehicleType,
      vehicleBrand,
      vehicleModel,
      vehicleDescription,
    };
  }, [description, concernPictures, autoLocation, pinnedLocation, locationMode, vehicleType, vehicleBrand, vehicleModel, vehicleDescription]);

  const clearDraft = () => {
    emergencyDraftCache = { ...EMPTY_DRAFT };
    setDescription('');
    setConcernPictures([]);
    setAutoLocation(null);
    setPinnedLocation(null);
    setLocationMode('auto');
    setVehicleType('');
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleDescription('');
  };

  const activeLocation = locationMode === 'pinned' && pinnedLocation ? pinnedLocation : autoLocation;

  const cleanLocationText = (value?: string | null): string | undefined => {
    const text = String(value || '').trim();
    if (!text) return undefined;
    if (PLACEHOLDER_LOCATION_TEXT.has(text.toLowerCase())) return undefined;
    return text;
  };

  const buildLocationDataFromGeocode = (
    latitude: number,
    longitude: number,
    result?: Location.LocationGeocodedAddress | null
  ): EmergencyLocationData => {
    const streetName = cleanLocationText(result?.street || result?.name || '');
    const subdivisionVillage = cleanLocationText(result?.district || result?.subregion || '');
    const barangay = cleanLocationText(result?.district || result?.subregion || '');
    const cityMunicipality = cleanLocationText(result?.city || result?.subregion || result?.region || '');
    const landmark = cleanLocationText(result?.name || '');
    const compactAddress = [streetName, barangay || cityMunicipality].filter(Boolean).join(', ');

    return {
      latitude,
      longitude,
      address: compactAddress || 'Location detected',
      street_name: streetName || undefined,
      subdivision_village: subdivisionVillage || undefined,
      barangay: barangay || undefined,
      city_municipality: cityMunicipality || undefined,
      landmark: landmark || undefined,
    };
  };

  useEffect(() => {
    const isOpening = visible && !wasVisibleRef.current;
    wasVisibleRef.current = visible;

    if (isOpening) {
      // If coming back from map picker, keep current form values.
      if (isPickingLocation) {
        setIsPickingLocation(false);
        fetchEmergencyCooldown();
        return;
      }

      // Keep draft values on open. If no saved auto location, auto-detect one.
      if (!autoLocation) getCurrentLocation();
      fetchEmergencyCooldown();
    }
  }, [visible, isPickingLocation, autoLocation]);

  useEffect(() => {
    if (!selectedLocation) return;

    const applySelectedLocation = async () => {
      const baseLocation: EmergencyLocationData = {
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        address: selectedLocation.address,
      };

      try {
        const [reverseResult] = await Location.reverseGeocodeAsync({
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
        });
        const geocoded = buildLocationDataFromGeocode(
          selectedLocation.latitude,
          selectedLocation.longitude,
          reverseResult
        );
        setPinnedLocation({
          ...baseLocation,
          ...geocoded,
          address: geocoded.address || baseLocation.address,
        });
      } catch {
        setPinnedLocation(baseLocation);
      } finally {
        setLocationMode('pinned');
        setSelectedLocation(null);
      }
    };

    applySelectedLocation();
  }, [visible, selectedLocation, setSelectedLocation]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const getCurrentLocation = async () => {
    try {
      setFetchingLocation(true);
      const permission = await ensureForegroundLocationAccess();
      if (!permission.granted) {
        showNotification({ type: 'warning', title: 'Location Permission Required', message: 'Emergency requests require your location to help mechanics find you quickly.' });
        setFetchingLocation(false);
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Get address from coordinates
      const [addressResult] = await Location.reverseGeocodeAsync({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      setAutoLocation(
        buildLocationDataFromGeocode(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
          addressResult
        )
      );
    } catch (error) {
      console.error('Error getting location:', error);
      showNotification({ type: 'error', message: 'Failed to get your current location. Please try again.' });
    } finally {
      setFetchingLocation(false);
    }
  };

  const takePhoto = async () => {
    if (concernPictures.length >= MAX_EMERGENCY_PHOTOS) {
      showNotification({ type: 'warning', message: `You can only upload up to ${MAX_EMERGENCY_PHOTOS} photos.` });
      return;
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showNotification({ type: 'warning', title: 'Permission Denied', message: 'Camera permission is required to take photos' });
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setConcernPictures((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'Failed to take photo' });
    }
  };

  const pickPhotos = async () => {
    if (concernPictures.length >= MAX_EMERGENCY_PHOTOS) {
      showNotification({ type: 'warning', message: `You can only upload up to ${MAX_EMERGENCY_PHOTOS} photos.` });
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showNotification({ type: 'warning', title: 'Permission Denied', message: 'Photo library permission is required.' });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        setConcernPictures((prev) => {
          const remainingSlots = MAX_EMERGENCY_PHOTOS - prev.length;
          const incoming = result.assets.map((a) => a.uri);
          const toAdd = incoming.slice(0, remainingSlots);
          if (incoming.length > remainingSlots) {
            showNotification({
              type: 'warning',
              message: `Only ${MAX_EMERGENCY_PHOTOS} photos are allowed. Extra photos were skipped.`,
            });
          }
          return [...prev, ...toAdd];
        });
      }
    } catch (_error) {
      showNotification({ type: 'error', message: 'Failed to select photos' });
    }
  };

  const openLocationPicker = () => {
    setIsPickingLocation(true);

    // Close modal first so map screen is not rendered behind it.
    onClose();

    const navigate = () => {
      // Prefer existing custom pin when available so edits start from pinned point.
      const locationForMap = pinnedLocation || activeLocation || autoLocation;
      if (locationForMap) {
        router.push({
          pathname: '/client/request/main_request_form/map',
          params: {
            latitude: String(locationForMap.latitude),
            longitude: String(locationForMap.longitude),
            radiusKm: '5',
            return_to: 'emergency',
          },
        });
        return;
      }
      router.push({
        pathname: '/client/request/main_request_form/map',
        params: { radiusKm: '5', return_to: 'emergency' },
      });
    };

    // Give the modal close animation a moment before navigating.
    setTimeout(navigate, 200);
  };

  const handleSelectAutoLocation = () => {
    setLocationMode('auto');
  };

  const handleSelectCustomLocation = () => {
    // If we already have a pinned location, just select it.
    // Open map only when custom location is not set yet.
    if (pinnedLocation) {
      setLocationMode('pinned');
      return;
    }
    setLocationMode('pinned');
    openLocationPicker();
  };

  const handleSubmit = async () => {
    if (cooldownSeconds > 0) {
      showNotification({
        type: 'warning',
        title: 'Emergency Cooldown Active',
        message: `Please wait ${formatCooldown(cooldownSeconds)} before sending another emergency request.`,
      });
      return;
    }

    if (!activeLocation) {
      showNotification({ type: 'error', message: 'Location is required for emergency requests. Please enable location services.' });
      return;
    }

    if (!vehicleType || !vehicleBrand || !vehicleModel) {
      showNotification({ type: 'error', message: 'Please select your vehicle type, brand, and model.' });
      return;
    }

    if (!vehicleDescription.trim()) {
      showNotification({ type: 'error', message: 'Please add a vehicle description (color or identifiers).' });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      
      // Add description (optional)
      if (description.trim()) {
        formData.append('description', description.trim());
      }

      let resolvedLocationData: EmergencyLocationData = {
        ...activeLocation,
      };

      if (!resolvedLocationData.barangay || !resolvedLocationData.city_municipality || !resolvedLocationData.street_name) {
        try {
          const [reverseResult] = await Location.reverseGeocodeAsync({
            latitude: activeLocation.latitude,
            longitude: activeLocation.longitude,
          });
          const geocodedData = buildLocationDataFromGeocode(
            activeLocation.latitude,
            activeLocation.longitude,
            reverseResult
          );
          resolvedLocationData = {
            ...resolvedLocationData,
            ...geocodedData,
            address: resolvedLocationData.address || geocodedData.address,
          };
        } catch {
          // Keep available location text even if reverse geocoding fails.
        }
      }

      const finalStreet =
        cleanLocationText(resolvedLocationData.street_name) ||
        cleanLocationText(resolvedLocationData.address) ||
        `${activeLocation.latitude.toFixed(6)}, ${activeLocation.longitude.toFixed(6)}`;
      const finalSubdivision = cleanLocationText(resolvedLocationData.subdivision_village);
      const finalBarangay = cleanLocationText(resolvedLocationData.barangay) || 'Unavailable';
      const finalCity = cleanLocationText(resolvedLocationData.city_municipality) || 'Unavailable';
      const finalLandmark = cleanLocationText(resolvedLocationData.landmark);

      // Add location data
      const serviceLocationData = {
        street_name: finalStreet,
        subdivision_village: finalSubdivision,
        barangay: finalBarangay,
        city_municipality: finalCity,
        landmark: finalLandmark,
        latitude: activeLocation.latitude,
        longitude: activeLocation.longitude,
      };
      formData.append('service_location', JSON.stringify(serviceLocationData));
      formData.append('vehicle_type', vehicleType);
      formData.append('vehicle_brand', vehicleBrand);
      formData.append('vehicle_model', vehicleModel);
      formData.append('vehicle_description', vehicleDescription.trim());

      // Add picture (optional)
      if (concernPictures.length > 0) {
        const firstPicture = concernPictures[0];
        const filename = firstPicture.split('/').pop() || 'emergency.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('concern_picture', {
          uri: firstPicture,
          name: filename,
          type: type,
        } as any);
      }

      concernPictures.forEach((uri, idx) => {
        const filename = uri.split('/').pop() || `emergency_${idx + 1}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('concern_pictures', { uri, name: filename, type } as any);
      });

      const response = await fetch(`${API_URL}/bookings/requests/emergency/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json();

      if (response.ok) {
        setCooldownSeconds(5 * 60);
        showNotification({ type: 'success', title: 'Emergency Request Sent', message: 'Your emergency request has been sent to nearby mechanics. Help is on the way!' });
        clearDraft();
        onClose();
        onSuccess?.();
      } else {
        const dataAny = data as any;
        if (response.status === 429 && typeof dataAny?.remaining_seconds === 'number') {
          setCooldownSeconds(dataAny.remaining_seconds);
        }
        showNotification({ type: 'error', message: (data as any).error || 'Failed to send emergency request' });
      }
    } catch (error) {
      console.error('Error sending emergency request:', error);
      showNotification({ type: 'error', message: 'An error occurred while sending the emergency request' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <View style={styles.modalBox}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <FontAwesome name="exclamation-triangle" size={20} color="#FF3B30" />
                <ThemedText style={styles.modalTitle}>Emergency Request</ThemedText>
              </View>
              <TouchableOpacity onPress={onClose}>
                <FontAwesome name="times" size={22} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalContent}>
            {/* Location Status */}
            <View style={styles.sectionHeader}>
              <FontAwesome name="crosshairs" size={14} color="#8E8E93" />
              <ThemedText style={styles.sectionTitle}>Choose Location Source *</ThemedText>
            </View>
            {cooldownSeconds > 0 && (
              <View style={styles.cooldownCard}>
                <FontAwesome name="clock-o" size={18} color="#FF3B30" />
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.cooldownLabel}>Emergency Cooldown</ThemedText>
                  <ThemedText style={styles.cooldownValue}>You can send another SOS in {formatCooldown(cooldownSeconds)}</ThemedText>
                </View>
              </View>
            )}

            {fetchingLocation ? (
              <View style={styles.statusCard}>
                <ActivityIndicator size="small" color="#FF3B30" />
                <ThemedText style={styles.statusText}>Getting your location...</ThemedText>
              </View>
            ) : autoLocation ? (
              <TouchableOpacity
                style={[styles.statusCard, locationMode === 'auto' && styles.statusCardSelected]}
                onPress={handleSelectAutoLocation}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View style={styles.radioBtn}>
                  <FontAwesome name={locationMode === 'auto' ? 'dot-circle-o' : 'circle-o'} size={18} color="#34C759" />
                </View>
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.statusLabel}>Auto Location (Your current location)</ThemedText>
                  <ThemedText style={styles.statusValue} numberOfLines={4}>{autoLocation.address || 'Current Location'}</ThemedText>
                  <ThemedText style={styles.coordsText}>
                    {autoLocation.latitude.toFixed(6)}, {autoLocation.longitude.toFixed(6)}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.statusCard}>
                <FontAwesome name="exclamation-circle" size={24} color="#FF3B30" />
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.statusLabel}>Location Required</ThemedText>
                  <ThemedText style={styles.statusValue}>Unable to detect location</ThemedText>
                </View>
                <TouchableOpacity style={styles.retryIconBtn} onPress={getCurrentLocation}>
                  <FontAwesome name="refresh" size={16} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}
            {pinnedLocation ? (
              <TouchableOpacity
                style={[styles.statusCard, locationMode === 'pinned' && styles.statusCardSelected]}
                onPress={handleSelectCustomLocation}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View style={styles.radioBtn}>
                  <FontAwesome name={locationMode === 'pinned' ? 'dot-circle-o' : 'circle-o'} size={18} color="#FF8C00" />
                </View>
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.statusLabel}>Custom Location</ThemedText>
                  <ThemedText style={styles.statusValue} numberOfLines={5}>{pinnedLocation.address || 'Pinned on map'}</ThemedText>
                  <ThemedText style={styles.coordsText}>
                    {pinnedLocation.latitude.toFixed(6)}, {pinnedLocation.longitude.toFixed(6)}
                  </ThemedText>
                </View>
                <TouchableOpacity
                  style={styles.editCustomBtn}
                  onPress={openLocationPicker}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <FontAwesome name="pencil" size={12} color="#FF8C00" />
                </TouchableOpacity>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.statusCard, styles.statusCardPlaceholder]}
                onPress={handleSelectCustomLocation}
                disabled={loading}
                activeOpacity={0.85}
              >
                <View style={styles.radioBtn}>
                  <FontAwesome name={locationMode === 'pinned' ? 'dot-circle-o' : 'circle-o'} size={18} color="#8E8E93" />
                </View>
                <View style={styles.statusInfo}>
                  <ThemedText style={styles.statusLabel}>Custom Location</ThemedText>
                  <ThemedText style={styles.statusValue}>Set location from map</ThemedText>
                  <ThemedText style={styles.coordsText}>Tap this card to pin custom location</ThemedText>
                </View>
              </TouchableOpacity>
            )}
            {/* Description Input (Optional) */}
            <View style={styles.inputSection}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="align-left" size={14} color="#8E8E93" />
                <ThemedText style={styles.sectionTitle}>Description (Optional)</ThemedText>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsScrollContent}
                style={styles.chipsScrollView}
              >
                {emergencyPhrases.map((phrase) => {
                  const isSelected = description === phrase;
                  return (
                    <TouchableOpacity
                      key={phrase}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setDescription(phrase)}
                      activeOpacity={0.8}
                      disabled={loading}
                    >
                      <ThemedText style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {phrase}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TextInput
                style={styles.textArea}
                placeholder="Describe the issue or situation..."
                placeholderTextColor="#6C6C70"
                multiline
                numberOfLines={3}
                value={description}
                onChangeText={setDescription}
                editable={!loading}
              />
            </View>

            <View style={styles.inputSection}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="car" size={14} color="#8E8E93" />
                <ThemedText style={styles.sectionTitle}>Vehicle Information *</ThemedText>
              </View>
              <VehicleTypeModal
                vehicleType={vehicleType}
                vehicleBrand={vehicleBrand}
                vehicleModel={vehicleModel}
                onVehicleTypeChange={setVehicleType}
                onVehicleBrandChange={setVehicleBrand}
                onVehicleModelChange={setVehicleModel}
                disabled={loading}
              />
            </View>

            <View style={styles.inputSection}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="list-alt" size={14} color="#8E8E93" />
                <ThemedText style={styles.sectionTitle}>Vehicle Description *</ThemedText>
              </View>
              <TextInput
                style={styles.textArea}
                placeholder="Example: Red Toyota Vios, plate ABC-1234, with roof rack."
                placeholderTextColor="#6C6C70"
                multiline
                numberOfLines={3}
                value={vehicleDescription}
                onChangeText={setVehicleDescription}
                editable={!loading}
              />
            </View>

            {/* Photo Section (Optional) */}
            <View style={styles.inputSection}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="camera" size={14} color="#8E8E93" />
                <ThemedText style={styles.sectionTitle}>Photo (Optional) {`(${concernPictures.length}/${MAX_EMERGENCY_PHOTOS})`}</ThemedText>
              </View>
              <View style={styles.photoActionRow}>
                <TouchableOpacity
                  style={styles.addPhotoBtn}
                  onPress={takePhoto}
                  disabled={loading}
                >
                  <FontAwesome name="camera" size={24} color="#8E8E93" />
                  <ThemedText style={styles.addPhotoText}>Take Photo</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addPhotoBtn}
                  onPress={pickPhotos}
                  disabled={loading}
                >
                  <FontAwesome name="image" size={24} color="#8E8E93" />
                  <ThemedText style={styles.addPhotoText}>Choose Photos</ThemedText>
                </TouchableOpacity>
              </View>
              {concernPictures.length > 0 && (
                <View style={styles.photoGrid}>
                  {concernPictures.map((uri, index) => (
                    <View key={`${uri}-${index}`} style={styles.thumbWrap}>
                      <Image source={{ uri }} style={styles.previewImage} />
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() => setConcernPictures((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <FontAwesome name="times-circle" size={20} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Info Message */}
            <View style={styles.infoCard}>
              <FontAwesome name="info-circle" size={16} color="#007AFF" />
              <ThemedText style={styles.infoText}>
                Your current location will be shared with nearby mechanics for quick assistance.
              </ThemedText>
            </View>
              </View>
            </ScrollView>

          {/* Action Buttons */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
            >
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!activeLocation || loading || cooldownSeconds > 0 || !vehicleDescription.trim()) && styles.sendBtnDisabled]}
              onPress={handleSubmit}
              disabled={!activeLocation || loading || cooldownSeconds > 0 || !vehicleDescription.trim()}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <FontAwesome name="send" size={14} color="#FFFFFF" />
                  <ThemedText style={styles.sendBtnText}>Send Emergency</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
    maxHeight: height * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  scrollView: {
    maxHeight: height * 0.6,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  statusCardSelected: {
    borderColor: '#FF8C00',
    backgroundColor: '#FF8C0015',
  },
  statusCardPlaceholder: {
    opacity: 0.85,
  },
  editCustomBtn: {
    marginLeft: 8,
    marginTop: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF8C001A',
    borderWidth: 1,
    borderColor: '#FF8C0040',
  },
  cooldownCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FF3B3015',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FF3B3040',
  },
  cooldownLabel: {
    fontSize: 12,
    color: '#FF3B30',
    marginBottom: 4,
    fontWeight: '600',
  },
  cooldownValue: {
    fontSize: 14,
    color: '#FFB3AE',
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 11,
    color: '#B0B0B5',
    marginBottom: 3,
  },
  statusText: {
    fontSize: 14,
    color: '#ECEDEE',
    marginLeft: 10,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F5F5F7',
    marginBottom: 3,
  },
  coordsText: {
    fontSize: 10,
    color: '#FFB46A',
    fontFamily: 'monospace',
  },
  retryIconBtn: {
    padding: 8,
    backgroundColor: '#FF3B3020',
    borderRadius: 8,
  },
  radioBtn: {
    paddingRight: 2,
    paddingTop: 1,
  },
  inputSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  textArea: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#ECEDEE',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  chipsScrollView: {
    marginBottom: 10,
  },
  chipsScrollContent: {
    paddingRight: 6,
  },
  chip: {
    backgroundColor: '#2C2C2E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  chipSelected: {
    backgroundColor: '#FF3B301A',
    borderColor: '#FF3B30',
  },
  chipText: {
    color: '#C7C7CC',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#FFD7D4',
  },
  pickerContainer: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    overflow: 'hidden',
  },
  picker: {
    color: '#ECEDEE',
    backgroundColor: 'transparent',
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#2C2C2E',
  },
  photoActionRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 6,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 6,
  },
  thumbWrap: {
    position: 'relative',
    width: '33.33%',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  previewImage: {
    width: '100%',
    height: 92,
    borderRadius: 10,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 6,
    right: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 20,
    padding: 2,
  },
  addPhotoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 92,
    marginHorizontal: 4,
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3A3A3C',
    borderStyle: 'dashed',
  },
  addPhotoText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#007AFF15',
    borderRadius: 10,
    padding: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#007AFF',
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#FF3B3060',
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
