import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocation } from '../main_request_form/LocationContext';
import { styles } from '@/style/client/mechanicDirectRequestStyles';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

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
  const { showNotification } = useNotification();
  const { selectedLocation, setSelectedLocation } = useLocation();
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

  // Date and time pickers
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [landmark, setLandmark] = useState('');

  // Selected map location data
  const [currentLatitude, setCurrentLatitude] = useState<number | null>(null);
  const [currentLongitude, setCurrentLongitude] = useState<number | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('');

  // Address components from map confirmation
  const [currentStreetName, setCurrentStreetName] = useState<string>('');
  const [currentBarangay, setCurrentBarangay] = useState<string>('');
  const [currentCity, setCurrentCity] = useState<string>('');

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
          showNotification({ type: 'warning', title: 'Mechanic Not Available', message: 'This mechanic is not currently available for direct requests. Please try again later.' });
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
    if (!selectedProviderId) { showNotification({ type: 'error', message: 'Please select a provider first' }); return; }
    if (!selectedServiceId) { showNotification({ type: 'error', message: 'Please select a service' }); return; }

    if (!currentAddress || currentLatitude === null || currentLongitude === null) {
      showNotification({ type: 'error', message: 'Please select a location from the map' });
      return;
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
        service_location: {
          street_name: currentStreetName || 'Selected map location',
          subdivision_village: undefined,
          barangay: currentBarangay || 'N/A',
          city_municipality: currentCity || 'N/A',
          landmark: landmark || undefined,
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
        showNotification({ type: 'success', message: data.message || 'Request created successfully!' });
        if (selectedProviderId) {
          router.replace({
            pathname: '/client/mechanic/mechanicprofile',
            params: { mechanicId: String(selectedProviderId) },
          });
        } else {
          router.replace('/(clientTabs)/main/discover');
        }
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to create request' });
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'An error occurred while creating the request' });
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

  useFocusEffect(
    React.useCallback(() => {
      if (selectedLocation) {
        setCurrentLatitude(selectedLocation.latitude);
        setCurrentLongitude(selectedLocation.longitude);
        setCurrentAddress(selectedLocation.address);
        setCurrentStreetName(selectedLocation.streetName);
        setCurrentBarangay(selectedLocation.barangay);
        setCurrentCity(selectedLocation.city);
        setSelectedLocation(null);
      }
    }, [selectedLocation, setSelectedLocation])
  );

  const handleSelectLocation = () => {
    if (currentLatitude !== null && currentLongitude !== null) {
      router.push({
        pathname: '/client/request/main_request_form/map',
        params: {
          latitude: currentLatitude.toString(),
          longitude: currentLongitude.toString(),
        },
      });
      return;
    }
    router.push('/client/request/main_request_form/map');
  };

  const formatDateTime = () => {
    const dateStr = selectedDate.toLocaleDateString();
    const timeStr = selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  };

  const selectedService = availableServices.find((s) => s.id === selectedServiceId);
  const disabled = !selectedProviderId;
  const handleBack = () => {
    const idFromParams = mechanicId ? parseInt(mechanicId, 10) : NaN;
    const targetMechanicId = selectedProviderId ?? (Number.isNaN(idFromParams) ? null : idFromParams);

    if (targetMechanicId) {
      router.replace({
        pathname: '/client/mechanic/mechanicprofile',
        params: { mechanicId: String(targetMechanicId) },
      });
      return;
    }

    router.replace('/(clientTabs)/main/discover');
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Direct Request</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Provider Display */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="user" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Provider:</ThemedText>
          </View>
          <View style={styles.mechanicDisplayContainer}>
            <ThemedText style={styles.mechanicDisplayText}>
              {selectedProviderId 
                ? mechanics.find(m => m.id === selectedProviderId)?.full_name || 'Loading provider name...'
                : (mechanicId && mechanics.length === 0) 
                  ? 'Loading provider name...' 
                  : 'No mechanic selected'}
            </ThemedText>
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
            <ThemedText style={styles.sectionTitle}>Service Location *</ThemedText>
          </View>

          <TouchableOpacity
            style={[styles.selectLocationBtn, disabled && styles.disabledContainer]}
            onPress={handleSelectLocation}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <FontAwesome name="map" size={14} color="#FF8C00" />
            <ThemedText style={[styles.selectLocationText, currentAddress && { color: '#fff' }]}>
              {currentAddress || 'Select Location on Map'}
            </ThemedText>
            <FontAwesome name="chevron-right" size={12} color="#8E8E93" />
          </TouchableOpacity>

          {currentAddress ? (
            <View style={styles.currentLocationDisplayCard}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Street</ThemedText>
                <ThemedText style={styles.summaryValue}>{currentStreetName || 'N/A'}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Barangay</ThemedText>
                <ThemedText style={styles.summaryValue}>{currentBarangay || 'N/A'}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>City</ThemedText>
                <ThemedText style={styles.summaryValue}>{currentCity || 'N/A'}</ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Coordinates</ThemedText>
                <ThemedText style={styles.summaryValue}>
                  {currentLatitude?.toFixed(6)}, {currentLongitude?.toFixed(6)}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {currentAddress ? (
            <TextInput
              style={[styles.input, disabled && styles.disabledInput]}
              placeholder="Landmark (Optional)"
              placeholderTextColor="#555"
              value={landmark}
              onChangeText={setLandmark}
              editable={!disabled}
            />
          ) : null}
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
