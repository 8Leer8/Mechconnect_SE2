import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { getDistanceKm } from '@/app/client/request/broadcast/LocationContext';

export default function BookingLocationMapScreen() {
  const { address, street, barangay, city } = useLocalSearchParams<{
    address: string;
    street: string;
    barangay: string;
    city: string;
  }>();

  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [destinationLocation, setDestinationLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  useEffect(() => {
    initializeMap();
  }, []);

  useEffect(() => {
    if (userLocation && destinationLocation) {
      const dist = getDistanceKm(userLocation, destinationLocation);
      setDistance(dist);
    }
  }, [userLocation, destinationLocation]);

  const initializeMap = async () => {
    try {
      // Get user's current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }

      // Geocode the destination address
      const fullAddress = address || `${street}, ${barangay}, ${city}`;
      const geocoded = await Location.geocodeAsync(fullAddress);
      
      if (geocoded && geocoded.length > 0) {
        setDestinationLocation({
          latitude: geocoded[0].latitude,
          longitude: geocoded[0].longitude,
        });

        // Center map on destination
        if (mapRef.current) {
          mapRef.current.animateToRegion({
            latitude: geocoded[0].latitude,
            longitude: geocoded[0].longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }, 1000);
        }
      }
    } catch (err) {
      console.error('Error initializing map:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecenterMap = () => {
    if (destinationLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: destinationLocation.latitude,
        longitude: destinationLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  const handleShowMyLocation = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Service Location</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FF8C00" />
            <ThemedText style={styles.loadingText}>Loading map...</ThemedText>
          </View>
        )}

        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: 14.5995,
            longitude: 120.9842,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          {/* Destination Marker */}
          {destinationLocation && (
            <Marker
              coordinate={destinationLocation}
              title="Service Location"
              description={address || `${street}, ${barangay}, ${city}`}
            >
              <View style={styles.markerContainer}>
                <FontAwesome name="map-marker" size={40} color="#FF3B30" />
              </View>
            </Marker>
          )}

          {/* User Location Marker (if different from default) */}
          {userLocation && (
            <Marker
              coordinate={userLocation}
              title="Your Location"
            >
              <View style={styles.userMarkerContainer}>
                <View style={styles.userMarkerCircle}>
                  <FontAwesome name="user" size={16} color="#fff" />
                </View>
              </View>
            </Marker>
          )}
        </MapView>

        {/* Map Controls */}
        <View style={styles.mapControls}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleRecenterMap}
            activeOpacity={0.7}
          >
            <FontAwesome name="crosshairs" size={20} color="#FF8C00" />
          </TouchableOpacity>

          {userLocation && (
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleShowMyLocation}
              activeOpacity={0.7}
            >
              <FontAwesome name="location-arrow" size={18} color="#007AFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Address Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={styles.iconCircle}>
            <FontAwesome name="map-marker" size={18} color="#FF3B30" />
          </View>
          <ThemedText style={styles.infoTitle}>Client Location</ThemedText>
        </View>

        <View style={styles.addressContainer}>
          {street && (
            <View style={styles.addressRow}>
              <ThemedText style={styles.addressLabel}>Street:</ThemedText>
              <ThemedText style={styles.addressValue}>{street}</ThemedText>
            </View>
          )}
          {barangay && (
            <View style={styles.addressRow}>
              <ThemedText style={styles.addressLabel}>Barangay:</ThemedText>
              <ThemedText style={styles.addressValue}>{barangay}</ThemedText>
            </View>
          )}
          {city && (
            <View style={styles.addressRow}>
              <ThemedText style={styles.addressLabel}>City:</ThemedText>
              <ThemedText style={styles.addressValue}>{city}</ThemedText>
            </View>
          )}
          {distance !== null && (
            <View style={styles.addressRow}>
              <ThemedText style={styles.addressLabel}>Distance:</ThemedText>
              <ThemedText style={styles.distanceValue}>{distance.toFixed(2)} km</ThemedText>
            </View>
          )}
        </View>
      </View>
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
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#1A1C1E',
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  backButton: {
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
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#111214',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8E8E93',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMarkerContainer: {
    alignItems: 'center',
  },
  userMarkerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  mapControls: {
    position: 'absolute',
    right: 16,
    top: 16,
    gap: 10,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  infoCard: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF3B3015',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  addressContainer: {
    gap: 10,
  },
  addressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addressLabel: {
    fontSize: 13,
    color: '#8E8E93',
    width: 80,
  },
  addressValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ddd',
    flex: 1,
    textAlign: 'right',
  },
  distanceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF8C00',
    flex: 1,
    textAlign: 'right',
  },
});
