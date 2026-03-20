import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useNotification } from '@/hooks/useNotification';
import { reverseGeocodeAddress } from '@/lib/locationAddress';
import { styles } from '@/style/client/directRequestMapStyles';
import { useLocation } from '../main_request_form/LocationContext';

interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface PinLocation {
  latitude: number;
  longitude: number;
}

export default function DirectRequestMapScreen() {
  const { showNotification } = useNotification();
  const { setSelectedLocation } = useLocation();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams();

  const initialLat = params.latitude ? parseFloat(params.latitude as string) : null;
  const initialLng = params.longitude ? parseFloat(params.longitude as string) : null;

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [markerLocation, setMarkerLocation] = useState<PinLocation | null>(null);

  const defaultRegion = useMemo(
    () => ({
      latitude: 14.5995,
      longitude: 120.9842,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    }),
    []
  );

  useEffect(() => {
    initializeMap();
  }, []);

  const reverseGeocodePoint = async (latitude: number, longitude: number) => {
    const parsed = await reverseGeocodeAddress(latitude, longitude);
    setAddress(parsed.address);
    return parsed;
  };

  const initializeMap = async () => {
    if (initialLat !== null && initialLng !== null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)) {
      const initialRegion: MapRegion = {
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      };
      setRegion(initialRegion);
      setMarkerLocation({ latitude: initialLat, longitude: initialLng });
      await reverseGeocodePoint(initialLat, initialLng);
      setLoading(false);
      return;
    }

    await centerToCurrentLocation({ animate: false, setAsSelected: false });
  };

  const centerToCurrentLocation = async ({
    animate,
    setAsSelected,
  }: {
    animate: boolean;
    setAsSelected: boolean;
  }) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showNotification({
          type: 'warning',
          message: 'Location permission is needed. Showing default map area.',
        });

        setRegion(defaultRegion);
        setLoading(false);
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const targetRegion: MapRegion = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      };

      setRegion(targetRegion);

      if (animate) {
        mapRef.current?.animateToRegion(targetRegion, 450);
      }

      if (setAsSelected) {
        setMarkerLocation({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        await reverseGeocodePoint(current.coords.latitude, current.coords.longitude);
      } else if (!markerLocation) {
        setAddress('');
      }
    } catch {
      setRegion(defaultRegion);
      showNotification({ type: 'error', message: 'Unable to get current location' });
    } finally {
      setLoading(false);
    }
  };

  const handleMapPress = async (event: any) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setMarkerLocation({ latitude, longitude });
    await reverseGeocodePoint(latitude, longitude);
  };

  const handleLocateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      await centerToCurrentLocation({ animate: true, setAsSelected: false });
      showNotification({ type: 'info', message: 'Centered to your current location. Tap map to select pin.' });
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = async () => {
    if (!markerLocation) {
      showNotification({ type: 'error', message: 'Please select a location on the map' });
      return;
    }

    setConfirming(true);
    try {
      const parsed = await reverseGeocodePoint(markerLocation.latitude, markerLocation.longitude);
      setSelectedLocation({
        latitude: markerLocation.latitude,
        longitude: markerLocation.longitude,
        address: parsed.address,
        streetName: parsed.streetName,
        city: parsed.city,
        barangay: parsed.region || parsed.barangay,
      });
      router.back();
    } catch {
      showNotification({ type: 'error', message: 'Failed to confirm location' });
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
        showsMyLocationButton={false}
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

      <View style={styles.addressContainer}>
        <ThemedText style={styles.addressText}>{address || 'Tap map to pick location'}</ThemedText>
      </View>

      <TouchableOpacity
        style={styles.locateButton}
        onPress={handleLocateMe}
        activeOpacity={0.8}
        disabled={locating}
      >
        {locating ? (
          <ActivityIndicator size="small" color="#FF8C00" />
        ) : (
          <FontAwesome name="location-arrow" size={20} color="#FF8C00" />
        )}
      </TouchableOpacity>

      <View style={styles.bottomContainer}>
        <ThemedText style={styles.instructionText}>Tap on the map to select your location</ThemedText>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.confirmButton, !markerLocation && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!markerLocation || confirming}
          >
            {confirming ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <ThemedText style={styles.confirmButtonText}>Confirm Location</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}