import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { styles } from '@/style/client/mechanicDirectRequestStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const PSGC_API_BASE = 'https://psgc.gitlab.io/api';

interface PSGCLocation {
  code: string;
  name: string;
  [key: string]: any;
}

interface Mechanic {
  id: number;
  name: string;
  full_name: string;
  services: Service[];
}

interface Service {
  id: number;
  name: string;
  description?: string;
  price: number;
  add_ons?: AddOn[];
}

interface AddOn {
  id: number;
  name: string;
  description: string;
  price: number;
}

interface MechanicsResponse {
  mechanics: Mechanic[];
}

interface ServicesResponse {
  services: Service[];
}

interface AddOnsResponse {
  add_ons: AddOn[];
}

interface CreateRequestResponse {
  message?: string;
  error?: string;
  [key: string]: any;
}

export default function MechanicDirectRequestScreen() {
  const params = useLocalSearchParams<{ mechanicId?: string | string[] }>();
  const mechanicId = typeof params.mechanicId === 'string' ? params.mechanicId : Array.isArray(params.mechanicId) ? params.mechanicId[0] : undefined;
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<number[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [availableAddOns, setAvailableAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(false);
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);

  // Date and time pickers
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Manual location input fields
  const [streetName, setStreetName] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [barangay, setBarangay] = useState('');
  const [landmark, setLandmark] = useState('');

  // Current location data
  const [currentLatitude, setCurrentLatitude] = useState<number | null>(null);
  const [currentLongitude, setCurrentLongitude] = useState<number | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // Individual location components from reverse geocoding
  const [currentStreetName, setCurrentStreetName] = useState<string>('');
  const [currentSubdivision, setCurrentSubdivision] = useState<string>('');
  const [currentBarangay, setCurrentBarangay] = useState<string>('');
  const [currentCity, setCurrentCity] = useState<string>('');

  // PSGC Location data
  const [regions, setRegions] = useState<PSGCLocation[]>([]);
  const [provinces, setProvinces] = useState<PSGCLocation[]>([]);
  const [cities, setCities] = useState<PSGCLocation[]>([]);
  const [barangays, setBarangays] = useState<PSGCLocation[]>([]);

  const [selectedRegionCode, setSelectedRegionCode] = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedCityCode, setSelectedCityCode] = useState('');

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  // ─── Fetch PSGC Regions on mount ───────────────────────────
  useEffect(() => {
    fetchRegions();
  }, []);

  // Fetch provinces when region is selected
  useEffect(() => {
    if (selectedRegionCode) {
      setSelectedProvinceCode('');
      setSelectedCityCode('');
      setCityMunicipality('');
      setBarangay('');
      fetchProvinces(selectedRegionCode);
    }
  }, [selectedRegionCode]);

  // Fetch cities when province is selected
  useEffect(() => {
    if (selectedProvinceCode) {
      setSelectedCityCode('');
      setCityMunicipality('');
      setBarangay('');
      fetchCities(selectedProvinceCode);
    }
  }, [selectedProvinceCode]);

  // Fetch barangays when city is selected
  useEffect(() => {
    if (selectedCityCode) {
      setBarangay('');
      fetchBarangays(selectedCityCode);
    }
  }, [selectedCityCode]);

  // ─── Fetch Mechanics ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchMechanics = async () => {
      try {
        const response = await fetch(`${API_URL}/bookings/direct/mechanics/`, { credentials: 'include' });
        if (cancelled) return;
        const data = await response.json() as MechanicsResponse;
        if (response.ok && !cancelled) setMechanics(data.mechanics || []);
      } catch (error) {
        if (!cancelled) console.error('Error fetching mechanics:', error);
      }
    };
    fetchMechanics();
    return () => { cancelled = true; };
  }, []);

  // ─── Pre-select mechanic from params ───────────────────────
  useEffect(() => {
    let cancelled = false;
    if (mechanicId && mechanics.length > 0) {
      try {
        const mechanicIdNum = parseInt(mechanicId, 10);
        const mechanicExists = mechanics.some(m => m.id === mechanicIdNum);
        if (!cancelled && !isNaN(mechanicIdNum) && mechanicExists) {
          setSelectedProviderId(mechanicIdNum);
        } else if (!isNaN(mechanicIdNum) && !mechanicExists && !cancelled) {
          Alert.alert('Mechanic Not Available', 'This mechanic is not currently available for direct requests. Please select another mechanic from the dropdown.', [{ text: 'OK' }]);
        }
      } catch (error) {
        if (!cancelled) console.error('Error parsing mechanicId:', error);
      }
    }
    return () => { cancelled = true; };
  }, [mechanicId, mechanics]);

  // Reset dependent state when mechanicId changes
  useEffect(() => {
    setSelectedServiceId(null);
    setSelectedAddOnIds([]);
    setAvailableServices([]);
    setAvailableAddOns([]);
  }, [mechanicId]);

  // ─── Fetch Services ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchServices = async () => {
      if (selectedProviderId) {
        try {
          const response = await fetch(`${API_URL}/bookings/direct/mechanics/${selectedProviderId}/services/`, { credentials: 'include' });
          if (cancelled) return;
          const data = await response.json() as ServicesResponse;
          if (response.ok && !cancelled) setAvailableServices(data.services || []);
        } catch (error) {
          if (!cancelled) console.error('Error fetching mechanic services:', error);
        }
      } else {
        setAvailableServices([]);
        setSelectedServiceId(null);
      }
    };
    fetchServices();
    return () => { cancelled = true; };
  }, [selectedProviderId]);

  // ─── Fetch Add-ons ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchAddOns = async () => {
      if (selectedServiceId) {
        try {
          const response = await fetch(`${API_URL}/bookings/direct/services/${selectedServiceId}/addons/`, { credentials: 'include' });
          if (cancelled) return;
          const data = await response.json() as AddOnsResponse;
          if (response.ok && !cancelled) setAvailableAddOns(data.add_ons || []);
        } catch (error) {
          if (!cancelled) console.error('Error fetching service add-ons:', error);
        }
      } else {
        setAvailableAddOns([]);
        setSelectedAddOnIds([]);
      }
    };
    fetchAddOns();
    return () => { cancelled = true; };
  }, [selectedServiceId]);

  // ─── PSGC Location API Functions ───────────────────────────
  const fetchRegions = async () => {
    setLoadingRegions(true);
    try {
      const response = await fetch(`${PSGC_API_BASE}/regions`);
      const data = await response.json() as PSGCLocation[];
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setRegions(sorted);
    } catch (error) {
      console.error('Error fetching regions:', error);
      Alert.alert('Error', 'Failed to load regions');
    } finally {
      setLoadingRegions(false);
    }
  };

  const fetchProvinces = async (regionCode: string) => {
    setLoadingProvinces(true);
    setCities([]);
    setBarangays([]);
    try {
      const response = await fetch(`${PSGC_API_BASE}/regions/${regionCode}/provinces`);
      const data = await response.json() as PSGCLocation[];
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setProvinces(sorted);
    } catch (error) {
      console.error('Error fetching provinces:', error);
      Alert.alert('Error', 'Failed to load provinces');
    } finally {
      setLoadingProvinces(false);
    }
  };

  const fetchCities = async (provinceCode: string) => {
    setLoadingCities(true);
    setBarangays([]);
    try {
      const response = await fetch(`${PSGC_API_BASE}/provinces/${provinceCode}/cities-municipalities`);
      const data = await response.json() as PSGCLocation[];
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setCities(sorted);
    } catch (error) {
      console.error('Error fetching cities:', error);
      Alert.alert('Error', 'Failed to load cities/municipalities');
    } finally {
      setLoadingCities(false);
    }
  };

  const fetchBarangays = async (cityCode: string) => {
    setLoadingBarangays(true);
    try {
      const response = await fetch(`${PSGC_API_BASE}/cities-municipalities/${cityCode}/barangays`);
      const data = await response.json() as PSGCLocation[];
      const sorted = data.sort((a, b) => a.name.localeCompare(b.name));
      setBarangays(sorted);
    } catch (error) {
      console.error('Error fetching barangays:', error);
      Alert.alert('Error', 'Failed to load barangays');
    } finally {
      setLoadingBarangays(false);
    }
  };

  // ─── Get Current Location ──────────────────────────────────
  const getCurrentLocation = async () => {
    if (!selectedProviderId) return;
    
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is needed to use current location.'
        );
        setFetchingLocation(false);
        return;
      }

      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 10000); // 10 second timeout
      });

      const location = await Promise.race([locationPromise, timeoutPromise]);

      if (location) {
        setCurrentLatitude(location.coords.latitude);
        setCurrentLongitude(location.coords.longitude);

        // Reverse geocode to get address
        const results = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        if (results && results.length > 0) {
          const loc = results[0];
          
          // Store individual components for database mapping
          setCurrentStreetName(loc.street || loc.name || '');
          setCurrentSubdivision(loc.district || '');
          setCurrentBarangay(loc.subregion || loc.district || '');
          setCurrentCity(loc.city || '');
          
          // Build display address
          const addressParts = [];
          if (loc.street) addressParts.push(loc.street);
          if (loc.subregion) addressParts.push(loc.subregion);
          if (loc.city) addressParts.push(loc.city);
          if (loc.region) addressParts.push(loc.region);
          
          const fullAddress = addressParts.join(', ');
          setCurrentAddress(fullAddress || 'GPS Location');
        } else {
          // Fallback when reverse geocoding fails
          setCurrentAddress('GPS Location');
          setCurrentStreetName('');
          setCurrentSubdivision('');
          setCurrentBarangay('');
          setCurrentCity('');
        }
      } else {
        Alert.alert('Timeout', 'Could not fetch location. Please try again.');
      }
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setFetchingLocation(false);
    }
  };

  // ─── Get current location when switching to Current Location ───
  useEffect(() => {
    if (useCurrentLocation && selectedProviderId) {
      getCurrentLocation();
    }
  }, [useCurrentLocation, selectedProviderId]);

  const toggleAddOn = (addOnId: number) => {
    if (!selectedProviderId) return;
    setSelectedAddOnIds((prev) =>
      prev.includes(addOnId) ? prev.filter((id) => id !== addOnId) : [...prev, addOnId]
    );
  };

  const totalPrice = useMemo(() => {
    let total = 0;
    if (selectedServiceId) {
      const service = availableServices.find((s) => s.id === selectedServiceId);
      if (service) total += service.price;
    }
    selectedAddOnIds.forEach((addOnId) => {
      const addOn = availableAddOns.find((a) => a.id === addOnId);
      if (addOn) total += addOn.price;
    });
    return total;
  }, [selectedServiceId, selectedAddOnIds, availableServices, availableAddOns]);

  // ─── Send ──────────────────────────────────────────────────
  const handleSend = async () => {
    if (!selectedProviderId) { Alert.alert('Error', 'Please select a provider first'); return; }
    if (!selectedServiceId) { Alert.alert('Error', 'Please select a service'); return; }
    
    if (useCurrentLocation) {
      if (!currentLatitude || !currentLongitude) {
        Alert.alert('Error', 'Please wait while we fetch your current location');
        return;
      }
    } else {
      if (!streetName || !barangay || !cityMunicipality) {
        Alert.alert('Error', 'Please fill in all required location fields');
        return;
      }
    }

    setLoading(true);
    try {
      const scheduledDateTime = new Date(selectedDate);
      scheduledDateTime.setHours(selectedTime.getHours());
      scheduledDateTime.setMinutes(selectedTime.getMinutes());

      const requestData = {
        provider_id: selectedProviderId,
        service_id: selectedServiceId,
        add_on_ids: selectedAddOnIds,
        service_location: useCurrentLocation
          ? { 
              street_name: currentStreetName || 'GPS Location', 
              subdivision_village: currentSubdivision || undefined,
              barangay: currentBarangay || 'GPS Location', 
              city_municipality: currentCity || 'GPS Location', 
              landmark: `Lat: ${currentLatitude}, Lng: ${currentLongitude}` 
            }
          : { 
              street_name: streetName, 
              subdivision_village: undefined,
              barangay, 
              city_municipality: cityMunicipality, 
              landmark: landmark || undefined 
            },
        scheduled_time: useCurrentTime ? new Date().toISOString() : scheduledDateTime.toISOString(),
      };

      const response = await fetch(`${API_URL}/bookings/direct/mechanic/create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestData),
      });

      const data = await response.json() as CreateRequestResponse;

      if (response.ok) {
        Alert.alert('Success', data.message || 'Request created successfully!', [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        Alert.alert('Error', data.error || 'Failed to create request');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while creating the request');
    } finally {
      setLoading(false);
    }
  };

  const onDateChange = (_event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) setSelectedDate(date);
  };

  const onTimeChange = (_event: any, time?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (time) setSelectedTime(time);
  };

  const formatDateTime = () => {
    const dateStr = selectedDate.toLocaleDateString();
    const timeStr = selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  };

  const selectedService = availableServices.find((s) => s.id === selectedServiceId);
  const disabled = !selectedProviderId;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Direct Request</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Provider Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="user" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Select Mechanic *</ThemedText>
          </View>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedProviderId}
              onValueChange={(value) => setSelectedProviderId(value)}
              style={styles.picker}
              dropdownIconColor="#FF8C00"
            >
              <Picker.Item label="Choose a mechanic..." value={null} />
              {mechanics.map((mechanic) => (
                <Picker.Item key={mechanic.id} label={mechanic.full_name} value={mechanic.id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Service Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="cog" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Select Service *</ThemedText>
          </View>
          <View style={[styles.pickerContainer, disabled && styles.disabledContainer]}>
            <Picker
              enabled={!!selectedProviderId}
              selectedValue={selectedServiceId}
              onValueChange={(value) => setSelectedServiceId(value)}
              style={[styles.picker, disabled && styles.disabledPicker]}
              dropdownIconColor={selectedProviderId ? '#FF8C00' : '#555'}
            >
              <Picker.Item label="Choose a service..." value={null} />
              {availableServices.map((service) => (
                <Picker.Item key={service.id} label={`${service.name} - ₱${service.price.toFixed(2)}`} value={service.id} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Add-ons */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="plus-circle" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Add-ons</ThemedText>
          </View>
          {availableAddOns.length > 0 ? (
            availableAddOns.map((addOn) => (
              <TouchableOpacity
                key={addOn.id}
                style={[styles.addOnItem, selectedAddOnIds.includes(addOn.id) && styles.addOnItemSelected, disabled && styles.disabledContainer]}
                onPress={() => toggleAddOn(addOn.id)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <View style={styles.addOnCheck}>
                  <FontAwesome
                    name={selectedAddOnIds.includes(addOn.id) ? 'check-square' : 'square-o'}
                    size={18}
                    color={selectedAddOnIds.includes(addOn.id) ? '#FF8C00' : '#555'}
                  />
                </View>
                <View style={styles.addOnInfo}>
                  <ThemedText style={[styles.addOnName, disabled && styles.disabledText]}>{addOn.name}</ThemedText>
                  <ThemedText style={[styles.addOnDescription, disabled && styles.disabledText]}>{addOn.description}</ThemedText>
                </View>
                <ThemedText style={[styles.addOnPrice, disabled && styles.disabledText]}>₱{addOn.price.toFixed(2)}</ThemedText>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="info-circle" size={14} color="#555" />
              <ThemedText style={styles.emptyText}>
                {selectedServiceId ? 'No add-ons available for this service' : 'Select a service to view add-ons'}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Summary */}
        <View style={[styles.summaryCard, disabled && styles.disabledContainer]}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="list-alt" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Summary</ThemedText>
          </View>
          {selectedService && (
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>{selectedService.name}</ThemedText>
              <ThemedText style={styles.summaryValue}>₱{selectedService.price.toFixed(2)}</ThemedText>
            </View>
          )}
          {selectedAddOnIds.map((addOnId) => {
            const addOn = availableAddOns.find((a) => a.id === addOnId);
            return addOn ? (
              <View key={addOnId} style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>{addOn.name}</ThemedText>
                <ThemedText style={styles.summaryValue}>₱{addOn.price.toFixed(2)}</ThemedText>
              </View>
            ) : null;
          })}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <ThemedText style={styles.totalText}>Total</ThemedText>
            <ThemedText style={styles.totalPrice}>₱{totalPrice.toFixed(2)}</ThemedText>
          </View>
        </View>

        {/* Time Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="clock-o" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
          </View>
          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, useCurrentTime && styles.pillSelected, disabled && styles.disabledContainer]}
              onPress={() => selectedProviderId && setUseCurrentTime(true)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <FontAwesome name="bolt" size={12} color={useCurrentTime ? '#fff' : '#8E8E93'} />
              <ThemedText style={[styles.pillText, useCurrentTime && styles.pillTextSelected]}>Now</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, !useCurrentTime && styles.pillSelected, disabled && styles.disabledContainer]}
              onPress={() => selectedProviderId && setUseCurrentTime(false)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <FontAwesome name="calendar" size={12} color={!useCurrentTime ? '#fff' : '#8E8E93'} />
              <ThemedText style={[styles.pillText, !useCurrentTime && styles.pillTextSelected]}>Custom</ThemedText>
            </TouchableOpacity>
          </View>
          {!useCurrentTime && (
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={[styles.dateTimeBtn, disabled && styles.disabledContainer]}
                onPress={() => selectedProviderId && setShowDatePicker(true)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <FontAwesome name="calendar-o" size={14} color="#FF8C00" />
                <ThemedText style={styles.dateTimeText}>{selectedDate.toLocaleDateString()}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dateTimeBtn, disabled && styles.disabledContainer]}
                onPress={() => selectedProviderId && setShowTimePicker(true)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <FontAwesome name="clock-o" size={14} color="#FF8C00" />
                <ThemedText style={styles.dateTimeText}>{selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</ThemedText>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker value={selectedDate} mode="date" display="default" onChange={onDateChange} minimumDate={new Date()} />
              )}
              {showTimePicker && (
                <DateTimePicker value={selectedTime} mode="time" display="default" onChange={onTimeChange} />
              )}
              <ThemedText style={styles.selectedDateTimeLabel}>Selected: {formatDateTime()}</ThemedText>
            </View>
          )}
        </View>

        {/* Location Selection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="map-marker" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Location</ThemedText>
          </View>
          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, useCurrentLocation && styles.pillSelected, disabled && styles.disabledContainer]}
              onPress={() => selectedProviderId && setUseCurrentLocation(true)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <FontAwesome name="crosshairs" size={12} color={useCurrentLocation ? '#fff' : '#8E8E93'} />
              <ThemedText style={[styles.pillText, useCurrentLocation && styles.pillTextSelected]}>Current</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, !useCurrentLocation && styles.pillSelected, disabled && styles.disabledContainer]}
              onPress={() => selectedProviderId && setUseCurrentLocation(false)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <FontAwesome name="pencil" size={12} color={!useCurrentLocation ? '#fff' : '#8E8E93'} />
              <ThemedText style={[styles.pillText, !useCurrentLocation && styles.pillTextSelected]}>Manual</ThemedText>
            </TouchableOpacity>
          </View>
          
          {/* Current Location Display */}
          {useCurrentLocation && (
            <View style={styles.currentLocationContainer}>
              {fetchingLocation ? (
                <View style={styles.locationLoadingContainer}>
                  <ActivityIndicator color="#FF8C00" size="small" />
                  <ThemedText style={styles.locationLoadingText}>Fetching your location...</ThemedText>
                </View>
              ) : currentAddress ? (
                <View style={styles.currentLocationDisplay}>
                  <FontAwesome name="map-marker" size={16} color="#FF8C00" />
                  <ThemedText style={styles.currentLocationText}>{currentAddress}</ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.locationPlaceholder}>Location will be fetched automatically</ThemedText>
              )}
            </View>
          )}

          {/* Manual Location Input */}
          {!useCurrentLocation && (
            <View style={styles.inputGroup}>
              {/* Region Picker */}
              <View style={[styles.pickerContainer, disabled && styles.disabledContainer]}>
                {loadingRegions ? (
                  <ActivityIndicator color="#FF8C00" />
                ) : (
                  <Picker
                    enabled={!disabled}
                    selectedValue={selectedRegionCode}
                    onValueChange={(value) => {
                      setSelectedRegionCode(value);
                      const region = regions.find(r => r.code === value);
                      if (region) {
                        // Region name is stored automatically via selection
                      }
                    }}
                    style={styles.picker}
                    dropdownIconColor="#FF8C00"
                  >
                    <Picker.Item label="Select Region *" value="" />
                    {regions.map((region) => (
                      <Picker.Item key={region.code} label={region.name} value={region.code} />
                    ))}
                  </Picker>
                )}
              </View>

              {/* Province Picker */}
              <View style={[styles.pickerContainer, disabled && styles.disabledContainer]}>
                {loadingProvinces ? (
                  <ActivityIndicator color="#FF8C00" />
                ) : (
                  <Picker
                    enabled={!disabled && !!selectedRegionCode}
                    selectedValue={selectedProvinceCode}
                    onValueChange={(value) => {
                      setSelectedProvinceCode(value);
                    }}
                    style={styles.picker}
                    dropdownIconColor="#FF8C00"
                  >
                    <Picker.Item label="Select Province *" value="" />
                    {provinces.map((province) => (
                      <Picker.Item key={province.code} label={province.name} value={province.code} />
                    ))}
                  </Picker>
                )}
              </View>

              {/* City/Municipality Picker */}
              <View style={[styles.pickerContainer, disabled && styles.disabledContainer]}>
                {loadingCities ? (
                  <ActivityIndicator color="#FF8C00" />
                ) : (
                  <Picker
                    enabled={!disabled && !!selectedProvinceCode}
                    selectedValue={selectedCityCode}
                    onValueChange={(value) => {
                      setSelectedCityCode(value);
                      const city = cities.find(c => c.code === value);
                      if (city) {
                        setCityMunicipality(city.name);
                      }
                    }}
                    style={styles.picker}
                    dropdownIconColor="#FF8C00"
                  >
                    <Picker.Item label="Select City/Municipality *" value="" />
                    {cities.map((city) => (
                      <Picker.Item key={city.code} label={city.name} value={city.code} />
                    ))}
                  </Picker>
                )}
              </View>

              {/* Barangay Picker */}
              <View style={[styles.pickerContainer, disabled && styles.disabledContainer]}>
                {loadingBarangays ? (
                  <ActivityIndicator color="#FF8C00" />
                ) : (
                  <Picker
                    enabled={!disabled && !!selectedCityCode}
                    selectedValue={barangay}
                    onValueChange={(value) => {
                      setBarangay(value);
                    }}
                    style={styles.picker}
                    dropdownIconColor="#FF8C00"
                  >
                    <Picker.Item label="Select Barangay *" value="" />
                    {barangays.map((brgy) => (
                      <Picker.Item key={brgy.code} label={brgy.name} value={brgy.name} />
                    ))}
                  </Picker>
                )}
              </View>

              {/* Street Name */}
              <TextInput
                style={[styles.input, disabled && styles.disabledInput]}
                placeholder="Street Name *"
                placeholderTextColor="#555"
                value={streetName}
                onChangeText={setStreetName}
                editable={!disabled}
              />

              {/* Landmark */}
              <TextInput
                style={[styles.input, disabled && styles.disabledInput]}
                placeholder="Landmark (Optional)"
                placeholderTextColor="#555"
                value={landmark}
                onChangeText={setLandmark}
                editable={!disabled}
              />
            </View>
          )}
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendBtn, (disabled || loading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={disabled || loading}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <FontAwesome name="paper-plane" size={16} color="#fff" />
              <ThemedText style={styles.sendBtnText}>Send Request</ThemedText>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}
