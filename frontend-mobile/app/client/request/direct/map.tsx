import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, TouchableOpacity, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { useNotification } from '@/hooks/useNotification';
import { reverseGeocodeAddress } from '@/lib/locationAddress';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { styles } from '@/style/client/directRequestMapStyles';
import { useLocation } from '@/context/LocationContext';

export default function DirectRequestMapScreen() {
  const { showNotification } = useNotification();
  const { setSelectedLocation } = useLocation();
  const mapRef = useRef<MapView>(null);
  const geocodeDebounceRef = useRef<number | null>(null);
  const params = useLocalSearchParams();

  const initialLat = params.latitude ? parseFloat(params.latitude as string) : null;
  const initialLng = params.longitude ? parseFloat(params.longitude as string) : null;

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [locating, setLocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const [pinCenter, setPinCenter] = useState<{ latitude: number; longitude: number } | null>(null);

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
    return () => {
      if (geocodeDebounceRef.current !== null) {
        clearTimeout(geocodeDebounceRef.current);
      }
    };
  }, []);

  const reverseGeocodePoint = async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    const parsed = await reverseGeocodeAddress(latitude, longitude);
    setAddress(parsed.address);
    setIsGeocoding(false);
    return parsed;
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(clientTabs)/main/discover');
  };

  const initializeMap = async () => {
    if (initialLat !== null && initialLng !== null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)) {
      const initialRegion: Region = {
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      };
      setRegion(initialRegion);
      setPinCenter({ latitude: initialLat, longitude: initialLng });
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
      const permission = await ensureForegroundLocationAccess();
      if (!permission.granted) {
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

      const targetRegion: Region = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      };

      setRegion(targetRegion);
      setPinCenter({ latitude: current.coords.latitude, longitude: current.coords.longitude });

      if (animate) {
        mapRef.current?.animateToRegion(targetRegion, 450);
      }

      if (setAsSelected) {
        await reverseGeocodePoint(current.coords.latitude, current.coords.longitude);
      } else if (!pinCenter) {
        setAddress('');
      }
    } catch {
      setRegion(defaultRegion);
      showNotification({ type: 'error', message: 'Unable to get current location' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegionChange = (nextRegion: Region) => {
    setPinCenter({
      latitude: nextRegion.latitude,
      longitude: nextRegion.longitude,
    });
  };

  const handleRegionChangeComplete = (nextRegion: Region) => {
    setRegion(nextRegion);
    setPinCenter({
      latitude: nextRegion.latitude,
      longitude: nextRegion.longitude,
    });

    if (geocodeDebounceRef.current !== null) {
      clearTimeout(geocodeDebounceRef.current);
    }

    geocodeDebounceRef.current = setTimeout(async () => {
      try {
        await reverseGeocodePoint(nextRegion.latitude, nextRegion.longitude);
      } catch {
        // Keep the last successful address while dragging.
      }
    }, 450) as unknown as number;
  };

  const handleLocateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      await centerToCurrentLocation({ animate: true, setAsSelected: true });
      showNotification({ type: 'info', message: 'Centered to your current location.' });
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = async () => {
    if (!pinCenter) {
      showNotification({ type: 'error', message: 'Please wait for map location to settle.' });
      return;
    }

    setConfirming(true);
    try {
      const parsed = await reverseGeocodePoint(pinCenter.latitude, pinCenter.longitude);
      setSelectedLocation({
        latitude: pinCenter.latitude,
        longitude: pinCenter.longitude,
        address: parsed.address,
        streetName: parsed.streetName,
        city: parsed.city,
        barangay: parsed.region || parsed.barangay,
      });
      handleBack();
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
      <View style={styles.topBar}>
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleBack}
            activeOpacity={0.8}
          >
            <FontAwesome name="times" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Map</ThemedText>
          <View style={styles.spacer} />
        </View>
        <ThemedText style={styles.addressText} numberOfLines={2}>
          {isGeocoding ? 'Locating...' : (address || 'Move the map to choose your service location.')}
        </ThemedText>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
      />

      <View style={styles.centerPinWrap} pointerEvents="none">
        <View style={styles.centerPinDot}>
          <View style={styles.centerPinInner} />
        </View>
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
        <TouchableOpacity
          style={[styles.confirmButton, !pinCenter && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={!pinCenter || confirming}
          activeOpacity={0.85}
        >
          {confirming ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <ThemedText style={styles.confirmButtonText}>Confirm Location</ThemedText>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}