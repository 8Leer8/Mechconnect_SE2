import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { getDistanceKm } from '@/context/LocationContext';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
// @ts-ignore
import { styles } from '@/style/mechanic/emergencyLocationMapStyles.js';

export default function EmergencyLocationMapScreen() {
  const { 
    latitude, 
    longitude, 
    street, 
    barangay, 
    city,
    clientName 
  } = useLocalSearchParams<{
    latitude: string;
    longitude: string;
    street: string;
    barangay: string;
    city: string;
    clientName: string;
  }>();

  const mapRef = useRef<MapView>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  const emergencyLocation = {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
  };

  useEffect(() => {
    initializeMap();
  }, []);

  useEffect(() => {
    if (userLocation && emergencyLocation) {
      const dist = getDistanceKm(userLocation, emergencyLocation);
      setDistance(dist);
    }
  }, [userLocation]);

  const initializeMap = async () => {
    try {
      // Get user's current location
      const permission = await ensureForegroundLocationAccess();
      if (permission.granted) {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }

      // Center map on emergency location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: emergencyLocation.latitude,
          longitude: emergencyLocation.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 1000);
      }
    } catch (err) {
      console.error('Error initializing map:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecenterMap = () => {
    if (emergencyLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: emergencyLocation.latitude,
        longitude: emergencyLocation.longitude,
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
          <FontAwesome name="chevron-left" size={16} color="#FF3B30" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Emergency Location</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#FF3B30" />
            <ThemedText style={styles.loadingText}>Loading map...</ThemedText>
          </View>
        )}

        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: emergencyLocation.latitude,
            longitude: emergencyLocation.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
          showsMyLocationButton={false}
        >
          {/* Emergency Location Marker */}
          <Marker
            coordinate={emergencyLocation}
            title="Emergency Location"
            description={`${street}, ${barangay}, ${city}`}
          >
            <View style={styles.markerContainer}>
              <View style={styles.emergencyPulse} />
              <FontAwesome name="exclamation-triangle" size={32} color="#FF3B30" />
            </View>
          </Marker>

          {/* User Location Marker */}
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
            <FontAwesome name="crosshairs" size={20} color="#FF3B30" />
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

        {/* Emergency Badge */}
        <View style={styles.emergencyBadge}>
          <FontAwesome name="bolt" size={14} color="#fff" />
          <ThemedText style={styles.emergencyBadgeText}>EMERGENCY</ThemedText>
        </View>
      </View>

      {/* Location Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={styles.iconCircle}>
            <FontAwesome name="exclamation-triangle" size={18} color="#FF3B30" />
          </View>
          <ThemedText style={styles.infoTitle}>Emergency Location</ThemedText>
        </View>

        <View style={styles.addressContainer}>
          {clientName && (
            <View style={styles.addressRow}>
              <ThemedText style={styles.addressLabel}>Client:</ThemedText>
              <ThemedText style={styles.addressValue}>{clientName}</ThemedText>
            </View>
          )}
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
          <View style={styles.addressRow}>
            <ThemedText style={styles.addressLabel}>Coordinates:</ThemedText>
            <ThemedText style={styles.coordsValue}>
              {emergencyLocation.latitude.toFixed(6)}, {emergencyLocation.longitude.toFixed(6)}
            </ThemedText>
          </View>
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
