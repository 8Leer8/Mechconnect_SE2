import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
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
import { TopNav } from '@/components/navigation';
import { router } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

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

export default function MechanicDirectRequestScreen() {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<number[]>([]);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [availableAddOns, setAvailableAddOns] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(false);
  const [useCurrentTime, setUseCurrentTime] = useState(true);
  const [useCurrentLocation, setUseCurrentLocation] = useState(true);
  const [requestNumber, setRequestNumber] = useState('02');
  
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

  useEffect(() => {
    fetchMechanics();
  }, []);

  useEffect(() => {
    if (selectedProviderId) {
      fetchMechanicServices(selectedProviderId);
    } else {
      setAvailableServices([]);
      setSelectedServiceId(null);
    }
  }, [selectedProviderId]);

  useEffect(() => {
    if (selectedServiceId) {
      fetchServiceAddOns(selectedServiceId);
    } else {
      setAvailableAddOns([]);
      setSelectedAddOnIds([]);
    }
  }, [selectedServiceId]);

  const fetchMechanics = async () => {
    try {
      const response = await fetch(`${API_URL}/bookings/direct/mechanics/`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (response.ok) {
        setMechanics(data.mechanics || []);
      }
    } catch (error) {
      console.error('Error fetching mechanics:', error);
    }
  };

  const fetchMechanicServices = async (mechanicId: number) => {
    try {
      const response = await fetch(
        `${API_URL}/bookings/direct/mechanics/${mechanicId}/services/`,
        {
          credentials: 'include',
        }
      );
      const data = await response.json();
      if (response.ok) {
        setAvailableServices(data.services || []);
      }
    } catch (error) {
      console.error('Error fetching mechanic services:', error);
    }
  };

  const fetchServiceAddOns = async (serviceId: number) => {
    try {
      const response = await fetch(
        `${API_URL}/bookings/direct/services/${serviceId}/addons/`,
        {
          credentials: 'include',
        }
      );
      const data = await response.json();
      if (response.ok) {
        setAvailableAddOns(data.add_ons || []);
      }
    } catch (error) {
      console.error('Error fetching service add-ons:', error);
    }
  };

  const toggleAddOn = (addOnId: number) => {
    if (!selectedProviderId) return; // Disable if no provider selected
    
    setSelectedAddOnIds((prev) =>
      prev.includes(addOnId)
        ? prev.filter((id) => id !== addOnId)
        : [...prev, addOnId]
    );
  };

  const calculateTotal = () => {
    let total = 0;
    
    // Add service price
    if (selectedServiceId) {
      const service = availableServices.find((s) => s.id === selectedServiceId);
      if (service) {
        total += service.price;
      }
    }
    
    // Add selected add-ons prices
    selectedAddOnIds.forEach((addOnId) => {
      const addOn = availableAddOns.find((a) => a.id === addOnId);
      if (addOn) {
        total += addOn.price;
      }
    });
    
    return total;
  };

  const handleSend = async () => {
    if (!selectedProviderId) {
      Alert.alert('Error', 'Please select a provider first');
      return;
    }
    
    if (!selectedServiceId) {
      Alert.alert('Error', 'Please select a service');
      return;
    }

    if (!useCurrentLocation) {
      if (!streetName || !barangay || !cityMunicipality) {
        Alert.alert('Error', 'Please fill in all required location fields');
        return;
      }
    }

    setLoading(true);

    try {
      // Combine date and time
      const scheduledDateTime = new Date(selectedDate);
      scheduledDateTime.setHours(selectedTime.getHours());
      scheduledDateTime.setMinutes(selectedTime.getMinutes());

      const requestData = {
        provider_id: selectedProviderId,
        service_id: selectedServiceId,
        add_on_ids: selectedAddOnIds,
        service_location: useCurrentLocation
          ? {
              street_name: 'Current Location',
              barangay: 'Current',
              city_municipality: 'Current',
              landmark: 'User current location',
            }
          : {
              street_name: streetName,
              barangay: barangay,
              city_municipality: cityMunicipality,
              landmark: landmark || undefined,
            },
        scheduled_time: useCurrentTime ? new Date().toISOString() : scheduledDateTime.toISOString(),
      };

      const response = await fetch(`${API_URL}/bookings/direct/mechanic/create/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', data.message || 'Request created successfully!', [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]);
      } else {
        Alert.alert('Error', data.error || 'Failed to create request');
      }
    } catch (error) {
      console.error('Error creating request:', error);
      Alert.alert('Error', 'An error occurred while creating the request');
    } finally {
      setLoading(false);
    }
  };

  const onDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
    }
  };

  const onTimeChange = (event: any, time?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (time) {
      setSelectedTime(time);
    }
  };

  const formatDateTime = () => {
    const dateStr = selectedDate.toLocaleDateString();
    const timeStr = selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateStr} ${timeStr}`;
  };

  const handleNotificationPress = () => {
    console.log('Notification pressed');
  };

  const selectedProvider = mechanics.find((m) => m.id === selectedProviderId);
  const selectedService = availableServices.find((s) => s.id === selectedServiceId);

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <ThemedText style={styles.title}>Direct Request Form</ThemedText>
          <ThemedText style={styles.requestNumber}>Request No. {requestNumber}</ThemedText>

          {/* Provider Selection - Always enabled at top */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Provider:</ThemedText>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedProviderId}
                onValueChange={(value) => setSelectedProviderId(value)}
                style={styles.picker}
                dropdownIconColor="#fff"
              >
                <Picker.Item label="Select Mechanic" value={null} />
                {mechanics.map((mechanic) => (
                  <Picker.Item
                    key={mechanic.id}
                    label={mechanic.full_name}
                    value={mechanic.id}
                  />
                ))}
              </Picker>
            </View>
          </View>

          {/* Service Selection - Disabled until provider selected */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Service:</ThemedText>
            <View
              style={[
                styles.pickerContainer,
                !selectedProviderId && styles.disabledContainer,
              ]}
            >
              <Picker
                enabled={!!selectedProviderId}
                selectedValue={selectedServiceId}
                onValueChange={(value) => setSelectedServiceId(value)}
                style={[styles.picker, !selectedProviderId && styles.disabledPicker]}
                dropdownIconColor={selectedProviderId ? '#fff' : '#666'}
              >
                <Picker.Item label="Select Service" value={null} />
                {availableServices.map((service) => (
                  <Picker.Item
                    key={service.id}
                    label={`${service.name} - $${service.price.toFixed(2)}`}
                    value={service.id}
                  />
                ))}
              </Picker>
            </View>
          </View>

          {/* Add-ons Section - Disabled until provider selected */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Add-ons:</ThemedText>
            {availableAddOns.length > 0 ? (
              availableAddOns.map((addOn) => (
                <TouchableOpacity
                  key={addOn.id}
                  style={[
                    styles.addOnItem,
                    selectedAddOnIds.includes(addOn.id) && styles.addOnItemSelected,
                    !selectedProviderId && styles.disabledContainer,
                  ]}
                  onPress={() => toggleAddOn(addOn.id)}
                  disabled={!selectedProviderId}
                >
                  <View style={styles.addOnInfo}>
                    <ThemedText
                      style={[
                        styles.addOnName,
                        !selectedProviderId && styles.disabledText,
                      ]}
                    >
                      {addOn.name}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.addOnDescription,
                        !selectedProviderId && styles.disabledText,
                      ]}
                    >
                      {addOn.description}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[
                      styles.addOnPrice,
                      !selectedProviderId && styles.disabledText,
                    ]}
                  >
                    ${addOn.price.toFixed(2)}
                  </ThemedText>
                </TouchableOpacity>
              ))
            ) : (
              <ThemedText
                style={[styles.noAddOns, !selectedProviderId && styles.disabledText]}
              >
                {selectedServiceId
                  ? 'No add-ons available for this service'
                  : 'Select a service to view add-ons'}
              </ThemedText>
            )}
          </View>

          {/* Summary - Disabled until provider selected */}
          <View
            style={[
              styles.section,
              styles.summarySection,
              !selectedProviderId && styles.disabledContainer,
            ]}
          >
            <ThemedText style={styles.sectionTitle}>Summary:</ThemedText>
            {selectedService && (
              <View style={styles.summaryItem}>
                <ThemedText
                  style={[
                    styles.summaryItemText,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  {selectedService.name}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.summaryItemPrice,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  ${selectedService.price.toFixed(2)}
                </ThemedText>
              </View>
            )}
            {selectedAddOnIds.map((addOnId) => {
              const addOn = availableAddOns.find((a) => a.id === addOnId);
              return addOn ? (
                <View key={addOnId} style={styles.summaryItem}>
                  <ThemedText
                    style={[
                      styles.summaryItemText,
                      !selectedProviderId && styles.disabledText,
                    ]}
                  >
                    {addOn.name}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.summaryItemPrice,
                      !selectedProviderId && styles.disabledText,
                    ]}
                  >
                    ${addOn.price.toFixed(2)}
                  </ThemedText>
                </View>
              ) : null;
            })}
            <View style={[styles.summaryItem, styles.totalItem]}>
              <ThemedText
                style={[
                  styles.totalText,
                  !selectedProviderId && styles.disabledText,
                ]}
              >
                Total:
              </ThemedText>
              <ThemedText
                style={[
                  styles.totalPrice,
                  !selectedProviderId && styles.disabledText,
                ]}
              >
                ${calculateTotal().toFixed(2)}
              </ThemedText>
            </View>
          </View>

          {/* Time Section - Disabled until provider selected */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Time:</ThemedText>
            <View style={styles.timeOptions}>
              <TouchableOpacity
                style={[
                  styles.timeOption,
                  useCurrentTime && styles.timeOptionSelected,
                  !selectedProviderId && styles.disabledContainer,
                ]}
                onPress={() => selectedProviderId && setUseCurrentTime(true)}
                disabled={!selectedProviderId}
              >
                <ThemedText
                  style={[
                    styles.timeOptionText,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  Now
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.timeOption,
                  !useCurrentTime && styles.timeOptionSelected,
                  !selectedProviderId && styles.disabledContainer,
                ]}
                onPress={() => selectedProviderId && setUseCurrentTime(false)}
                disabled={!selectedProviderId}
              >
                <ThemedText
                  style={[
                    styles.timeOptionText,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  Input time --- date and time
                </ThemedText>
              </TouchableOpacity>
            </View>
            {!useCurrentTime && (
              <View style={styles.dateTimeContainer}>
                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    !selectedProviderId && styles.disabledContainer,
                  ]}
                  onPress={() => selectedProviderId && setShowDatePicker(true)}
                  disabled={!selectedProviderId}
                >
                  <ThemedText
                    style={[
                      styles.dateTimeButtonText,
                      !selectedProviderId && styles.disabledText,
                    ]}
                  >
                    📅 {selectedDate.toLocaleDateString()}
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dateTimeButton,
                    !selectedProviderId && styles.disabledContainer,
                  ]}
                  onPress={() => selectedProviderId && setShowTimePicker(true)}
                  disabled={!selectedProviderId}
                >
                  <ThemedText
                    style={[
                      styles.dateTimeButtonText,
                      !selectedProviderId && styles.disabledText,
                    ]}
                  >
                    🕐 {selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </ThemedText>
                </TouchableOpacity>

                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                    minimumDate={new Date()}
                  />
                )}

                {showTimePicker && (
                  <DateTimePicker
                    value={selectedTime}
                    mode="time"
                    display="default"
                    onChange={onTimeChange}
                  />
                )}

                <ThemedText
                  style={[
                    styles.selectedDateTime,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  Selected: {formatDateTime()}
                </ThemedText>
              </View>
            )}
          </View>

          {/* Location Section - Disabled until provider selected */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Location:</ThemedText>
            <View style={styles.timeOptions}>
              <TouchableOpacity
                style={[
                  styles.timeOption,
                  useCurrentLocation && styles.timeOptionSelected,
                  !selectedProviderId && styles.disabledContainer,
                ]}
                onPress={() => selectedProviderId && setUseCurrentLocation(true)}
                disabled={!selectedProviderId}
              >
                <ThemedText
                  style={[
                    styles.timeOptionText,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  Currently location
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.timeOption,
                  !useCurrentLocation && styles.timeOptionSelected,
                  !selectedProviderId && styles.disabledContainer,
                ]}
                onPress={() => selectedProviderId && setUseCurrentLocation(false)}
                disabled={!selectedProviderId}
              >
                <ThemedText
                  style={[
                    styles.timeOptionText,
                    !selectedProviderId && styles.disabledText,
                  ]}
                >
                  Input location --- street, barangay etc...
                </ThemedText>
              </TouchableOpacity>
            </View>
            {!useCurrentLocation && (
              <View style={styles.locationInputs}>
                <TextInput
                  style={[
                    styles.input,
                    !selectedProviderId && styles.disabledInput,
                  ]}
                  placeholder="Street name"
                  placeholderTextColor="#888"
                  value={streetName}
                  onChangeText={setStreetName}
                  editable={!!selectedProviderId}
                />
                <TextInput
                  style={[
                    styles.input,
                    !selectedProviderId && styles.disabledInput,
                  ]}
                  placeholder="City/Municipality"
                  placeholderTextColor="#888"
                  value={cityMunicipality}
                  onChangeText={setCityMunicipality}
                  editable={!!selectedProviderId}
                />
                <TextInput
                  style={[
                    styles.input,
                    !selectedProviderId && styles.disabledInput,
                  ]}
                  placeholder="Barangay"
                  placeholderTextColor="#888"
                  value={barangay}
                  onChangeText={setBarangay}
                  editable={!!selectedProviderId}
                />
                <TextInput
                  style={[
                    styles.input,
                    !selectedProviderId && styles.disabledInput,
                  ]}
                  placeholder="Landmark (optional)"
                  placeholderTextColor="#888"
                  value={landmark}
                  onChangeText={setLandmark}
                  editable={!!selectedProviderId}
                />
              </View>
            )}
          </View>

          {/* Send Button - Disabled until provider selected */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!selectedProviderId || loading) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!selectedProviderId || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.sendButtonText}>Send</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#ffffff',
  },
  requestNumber: {
    fontSize: 16,
    marginBottom: 20,
    color: '#aaa',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#ffffff',
  },
  pickerContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    overflow: 'hidden',
  },
  picker: {
    color: '#ffffff',
    backgroundColor: 'transparent',
  },
  disabledContainer: {
    opacity: 0.4,
    backgroundColor: '#1a1a1a',
  },
  disabledPicker: {
    color: '#666',
  },
  disabledText: {
    color: '#666',
  },
  disabledInput: {
    backgroundColor: '#1a1a1a',
    color: '#666',
  },
  addOnItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  addOnItemSelected: {
    backgroundColor: '#3a5a3a',
    borderColor: '#4a7a4a',
  },
  addOnInfo: {
    flex: 1,
  },
  addOnName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    marginBottom: 4,
  },
  addOnDescription: {
    fontSize: 12,
    color: '#aaa',
  },
  addOnPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 12,
  },
  noAddOns: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  summarySection: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryItemText: {
    fontSize: 14,
    color: '#ddd',
  },
  summaryItemPrice: {
    fontSize: 14,
    color: '#ddd',
  },
  totalItem: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  totalText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  timeOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  timeOption: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
  },
  timeOptionSelected: {
    backgroundColor: '#3a5a3a',
    borderColor: '#4a7a4a',
  },
  timeOptionText: {
    fontSize: 14,
    color: '#ffffff',
  },
  input: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    padding: 12,
    fontSize: 14,
    color: '#ffffff',
  },
  locationInputs: {
    gap: 12,
  },
  dateTimeContainer: {
    gap: 12,
  },
  dateTimeButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    padding: 12,
    alignItems: 'center',
  },
  dateTimeButtonText: {
    fontSize: 14,
    color: '#ffffff',
  },
  selectedDateTime: {
    fontSize: 14,
    color: '#4a7a4a',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: '#4a7a4a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
