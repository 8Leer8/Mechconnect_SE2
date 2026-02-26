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
import { TopNav } from '@/components/navigation';
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

  useEffect(() => {
    let cancelled = false;

    const fetchServices = async () => {
      try {
        if (!cancelled) {
          setFetchingServices(true);
        }
        const response = await fetch(`${API_URL}/services/`, {
          credentials: 'include',
        });
        
        if (cancelled) return;

        if (response.ok) {
          const data = await response.json() as ServicesResponse;
          if (!cancelled) {
            setServices(data.services || []);
          }
        } else if (!cancelled) {
          console.error('Failed to fetch services');
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error fetching services:', error);
          Alert.alert('Error', 'Failed to load services');
        }
      } finally {
        if (!cancelled) {
          setFetchingServices(false);
        }
      }
    };

    fetchServices();

    return () => {
      cancelled = true;
    };
  }, []);

  // Handle location data from map screen when returning to this screen
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
        // Clear the context after reading
        setSelectedLocation(null);
      }

      return () => {
        isMounted = false;
      };
    }, [selectedLocation, setSelectedLocation])
  );

  const toggleService = (serviceId: number) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  // Calculate total minimum price for selected services
  const getTotalMinimumPrice = () => {
    return services
      .filter((service) => selectedServiceIds.includes(service.id))
      .reduce((sum, service) => sum + service.minimum_price, 0);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setConcernPicture(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
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

      if (!result.canceled && result.assets[0]) {
        setConcernPicture(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const handleSelectLocation = () => {
    if (selectedAddress && latitude !== null && longitude !== null) {
      router.push({
        pathname: '/client/request/broadcast/map',
        params: {
          latitude: latitude.toString(),
          longitude: longitude.toString(),
        },
      });
    } else {
      router.push('/client/request/broadcast/map');
    }
  };

  const handleSend = async () => {
    // Validation
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
      
      // Add service IDs as a JSON array
      formData.append('service_ids', JSON.stringify(selectedServiceIds));
      formData.append('description', description);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
      
      // Add service location
      const serviceLocationData = {
        street_name: streetName,
        barangay: barangay,
        city_municipality: cityMunicipality,
        landmark: landmark || undefined,
      };
      
      formData.append('service_location', JSON.stringify(serviceLocationData));
      
      // Add concern picture if available
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

      const response = await fetch(`${API_URL}/bookings/requests/broadcast/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json() as CreateRequestResponse;

      if (response.ok) {
        Alert.alert(
          'Success', 
          'Broadcast request created! Nearby mechanics will be notified.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to create broadcast request');
      }
    } catch (error) {
      console.error('Error creating broadcast request:', error);
      Alert.alert('Error', 'An error occurred while creating the request');
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationPress = () => {
    console.log('Notification pressed');
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <ThemedText style={styles.title}>Broadcast Request</ThemedText>
          <ThemedText style={styles.subtitle}>
            Send your request to nearby mechanics
          </ThemedText>

          {/* Services Selection */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Select Services: *</ThemedText>
            {fetchingServices ? (
              <ActivityIndicator size="small" color="#FF8C00" />
            ) : (
              <View style={styles.servicesGrid}>
                {services.map((service) => (
                  <TouchableOpacity
                    key={service.id}
                    style={[
                      styles.serviceCard,
                      selectedServiceIds.includes(service.id) && styles.serviceCardSelected,
                    ]}
                    onPress={() => toggleService(service.id)}
                  >
                    <View style={styles.serviceCardContent}>
                      <ThemedText style={[
                        styles.serviceCardText,
                        selectedServiceIds.includes(service.id) && styles.serviceCardTextSelected,
                      ]}>
                        {service.name}
                      </ThemedText>
                      <ThemedText style={[
                        styles.servicePriceText,
                        selectedServiceIds.includes(service.id) && styles.servicePriceTextSelected,
                      ]}>
                        ₱{service.minimum_price.toFixed(2)}
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {selectedServiceIds.length > 0 && (
              <View style={styles.priceBreakdown}>
                <ThemedText style={styles.priceBreakdownText}>
                  Total Service Minimum Price: ₱{getTotalMinimumPrice().toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.priceBreakdownNote}>
                  + Distance charge: ₱10/km from mechanic location
                </ThemedText>
              </View>
            )}
          </View>

          {/* Description */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Description: *</ThemedText>
            <TextInput
              style={styles.textArea}
              placeholder="Describe your vehicle issue or service needed..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Concern Picture */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Concern Picture (Optional):</ThemedText>
            <View style={styles.imageButtons}>
              <TouchableOpacity style={styles.imageButton} onPress={takePhoto}>
                <ThemedText style={styles.imageButtonText}>Take Photo</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
                <ThemedText style={styles.imageButtonText}>Pick Image</ThemedText>
              </TouchableOpacity>
            </View>
            {concernPicture && (
              <View style={styles.previewContainer}>
                <Image 
                  source={{ uri: concernPicture }} 
                  style={styles.previewImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => setConcernPicture(null)}
                >
                  <ThemedText style={styles.removeImageText}>✕ Remove</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Location */}
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Location: *</ThemedText>
            
            {selectedAddress ? (
              <>
                <View style={styles.selectedLocationCard}>
                  <ThemedText style={styles.selectedLocationIcon}></ThemedText>
                  <View style={styles.selectedLocationTextContainer}>
                    <ThemedText style={styles.selectedLocationText}>
                      {selectedAddress}
                    </ThemedText>
                    {(streetName || cityMunicipality) && (
                      <ThemedText style={styles.selectedLocationDetails}>
                        {[streetName, barangay, cityMunicipality].filter(Boolean).join(', ')}
                      </ThemedText>
                    )}
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.changeLocationButton} 
                  onPress={handleSelectLocation}
                >
                  <ThemedText style={styles.changeLocationButtonText}>
                    Change Location
                  </ThemedText>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity 
                style={styles.locationButton} 
                onPress={handleSelectLocation}
              >
                <View style={styles.locationButtonContent}>
                  <View style={styles.locationButtonTextContainer}>
                    <ThemedText style={styles.locationButtonText}>
                      Select Location from Map
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.locationButtonArrow}>›</ThemedText>
                </View>
              </TouchableOpacity>
            )}
            
            {/* Optional Landmark Field */}
            {selectedAddress && (
              <TextInput
                style={[styles.input, { marginTop: 10 }]}
                placeholder="Add Landmark (Optional)"
                placeholderTextColor="#999"
                value={landmark}
                onChangeText={setLandmark}
              />
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.sendButton, loading && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <ThemedText style={styles.sendButtonText}>Send Broadcast</ThemedText>
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
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceCard: {
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    minWidth: '45%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceCardSelected: {
    backgroundColor: '#FF8C00',
    borderColor: '#FF8C00',
  },
  serviceCardContent: {
    flex: 1,
  },
  serviceCardText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  serviceCardTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  servicePriceText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  servicePriceTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  priceBreakdown: {
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FFE4B5',
  },
  priceBreakdownText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 4,
  },
  priceBreakdownNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  checkmark: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  textArea: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#DDD',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imageButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  imageButton: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  imageButtonText: {
    fontSize: 14,
    color: '#333',
  },
  previewContainer: {
    marginTop: 15,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  removeImageButton: {
    marginTop: 10,
    padding: 8,
  },
  removeImageText: {
    color: '#FF4500',
    fontSize: 14,
  },
  locationButton: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    padding: 15,
  },
  locationButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationButtonIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  locationButtonTextContainer: {
    flex: 1,
  },
  locationButtonText: {
    fontSize: 14,
    color: '#666',
  },
  locationButtonArrow: {
    fontSize: 24,
    color: '#999',
    marginLeft: 8,
  },
  selectedLocationCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  selectedLocationIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  selectedLocationTextContainer: {
    flex: 1,
  },
  selectedLocationText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedLocationDetails: {
    fontSize: 12,
    color: '#666',
  },
  changeLocationButton: {
    backgroundColor: '#FF8C00',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  changeLocationButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  manualLocationFields: {
    gap: 10,
  },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  sendButton: {
    backgroundColor: '#FF8C00',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  sendButtonDisabled: {
    backgroundColor: '#CCC',
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
