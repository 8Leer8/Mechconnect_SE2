import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { getDistanceKm } from '@/app/client/request/broadcast/LocationContext';
import { styles } from '@/style/mechanic/bookingLocationMapStyles';

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
