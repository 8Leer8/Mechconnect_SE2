import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { router, useLocalSearchParams } from 'expo-router';
import { useLocation } from './LocationContext';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  streetName: string;
  city: string;
  barangay: string;
}

export default function MapScreen() {
  const params = useLocalSearchParams();
  const { setSelectedLocation } = useLocation();
  const mapRef = useRef<MapView>(null);
  
  // Get initial coordinates if passed from broadcast screen
  const initialLat = params.latitude ? parseFloat(params.latitude as string) : null;
  const initialLng = params.longitude ? parseFloat(params.longitude as string) : null;
  
  const [region, setRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  
  const [markerLocation, setMarkerLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [address, setAddress] = useState<string>('');

  useEffect(() => {
    initializeMap();
  }, []);

  const initializeMap = async () => {
    if (initialLat && initialLng) {
      const initialRegion = {
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
      setRegion(initialRegion);
      setMarkerLocation({ latitude: initialLat, longitude: initialLng });
      await getAddressFromCoords(initialLat, initialLng);
      setLoading(false);
      return;
    }
    await getCurrentLocation();
  };

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is needed to show your current location on the map. Please select a location manually.'
        );
        const fallbackRegion = {
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(fallbackRegion);
        setLoading(false);
        return;
      }

      // Get current location with timeout
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000); // 5 second timeout
      });

      const location = await Promise.race([locationPromise, timeoutPromise]);

      if (location) {
        const currentRegion = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(currentRegion);
      } else {
        // Timeout - use default location
        console.log('Location fetch timeout, using default location');
        const fallbackRegion = {
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        };
        setRegion(fallbackRegion);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error getting location:', error);
      const fallbackRegion = {
        latitude: 14.5995,
        longitude: 120.9842,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };
      setRegion(fallbackRegion);
      setLoading(false);
    }
  };

  const getAddressFromCoords = async (latitude: number, longitude: number) => {
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (results && results.length > 0) {
        const location = results[0];
        const addressParts = [];
        
        if (location.street) addressParts.push(location.street);
        if (location.subregion) addressParts.push(location.subregion);
        if (location.city) addressParts.push(location.city);
        if (location.region) addressParts.push(location.region);
        
        const fullAddress = addressParts.join(', ');
        setAddress(fullAddress);
      }
    } catch (error) {
      console.error('Error getting address:', error);
      setAddress('Address not available');
    }
  };

  const handleMapPress = async (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    
    setMarkerLocation({ latitude, longitude });
    await getAddressFromCoords(latitude, longitude);
  };

  const handleConfirm = async () => {
    if (!markerLocation) {
      Alert.alert('Error', 'Please select a location on the map');
      return;
    }

    setConfirming(true);

    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: markerLocation.latitude,
        longitude: markerLocation.longitude,
      });

      let locationData: LocationData = {
        latitude: markerLocation.latitude,
        longitude: markerLocation.longitude,
        address: address || 'Location selected',
        streetName: '',
        city: '',
        barangay: '',
      };

      if (results && results.length > 0) {
        const location = results[0];
        locationData = {
          latitude: markerLocation.latitude,
          longitude: markerLocation.longitude,
          address: address,
          streetName: location.street || location.name || '',
          city: location.city || location.region || '',
          barangay: location.district || location.subregion || '',
        };
      }
      
      // Save location to context and go back
      setSelectedLocation(locationData);
      router.back();
    } catch (error) {
      console.error('Error confirming location:', error);
      Alert.alert('Error', 'Failed to confirm location');
    } finally {
      setConfirming(false);
    }
  };

  if (loading || !region) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF8C00" />
        <ThemedText style={styles.loadingText}>Loading map...</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton
      >
        {markerLocation && (
          <Marker
            coordinate={markerLocation}
            title="Selected Location"
            description={address}
            pinColor="#FF8C00"
          />
        )}
      </MapView>
      {address && (
        <View style={styles.addressContainer}>
          <ThemedText style={styles.addressText}>{address}</ThemedText>
        </View>
      )}

      {/* Bottom Controls */}
      <View style={styles.bottomContainer}>
        <ThemedText style={styles.instructionText}>
          Tap on the map to select your location
        </ThemedText>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.confirmButton,
              !markerLocation && styles.confirmButtonDisabled,
            ]}
            onPress={handleConfirm}
            disabled={!markerLocation || confirming}
          >
            {confirming ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <ThemedText style={styles.confirmButtonText}>
                Confirm Location
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  addressContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    right: 20,
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addressText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFF',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  confirmButton: {
    flex: 2,
    backgroundColor: '#FF8C00',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#CCC',
  },
  confirmButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: 'bold',
  },
});
