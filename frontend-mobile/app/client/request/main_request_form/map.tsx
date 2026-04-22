import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import MapView, { Circle, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useNotification } from '@/hooks/useNotification';
import { reverseGeocodeAddress } from '@/lib/locationAddress';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { styles } from '@/style/client/broadcastLocationPickerStyles';
import { useLocation } from '@/context/LocationContext';

const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 50;
const RECOMMENDED_RADIUS_KM = 5;

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  streetName: string;
  city: string;
  barangay: string;
  radiusKm?: number;
  radius_km?: number;
}

export default function MapScreen() {
  const { showNotification } = useNotification();
  const { setSelectedLocation } = useLocation();
  const { bottom } = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const geocodeDebounceRef = useRef<number | null>(null);
  const locationRequestInFlight = useRef(false);
  const mapHeightAnim = useRef(new Animated.Value(340)).current;
  const params = useLocalSearchParams();

  const initialLat = params.latitude ? parseFloat(params.latitude as string) : null;
  const initialLng = params.longitude ? parseFloat(params.longitude as string) : null;
  const initialRadius = params.radiusKm ? parseInt(params.radiusKm as string, 10) : RECOMMENDED_RADIUS_KM;
  const returnTo = String(params.return_to || '');

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [locating, setLocating] = useState(false);
  const [showLocationHelp, setShowLocationHelp] = useState(false);
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState<Region | null>(null);
  const [circleCenter, setCircleCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusMode, setRadiusMode] = useState<'recommended' | 'custom'>(
    initialRadius === RECOMMENDED_RADIUS_KM ? 'recommended' : 'custom'
  );
  const [customRadiusKm, setCustomRadiusKm] = useState(
    Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Number.isNaN(initialRadius) ? RECOMMENDED_RADIUS_KM : initialRadius))
  );
  const [radiusInput, setRadiusInput] = useState(String(
    Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Number.isNaN(initialRadius) ? RECOMMENDED_RADIUS_KM : initialRadius))
  ));
  const [radiusError, setRadiusError] = useState('');
  const [topBarHeight, setTopBarHeight] = useState(0);
  const COLLAPSED_SHEET_CONTENT_HEIGHT = 220;
  const EXPANDED_SHEET_CONTENT_HEIGHT = 340;

  useEffect(() => {
    initializeMap();
  }, []);

  const effectiveRadiusKm = radiusMode === 'recommended' ? RECOMMENDED_RADIUS_KM : customRadiusKm;

  const reverseGeocodePoint = async (latitude: number, longitude: number) => {
    const parsed = await reverseGeocodeAddress(latitude, longitude);
    setAddress(parsed.address);
    return parsed;
  };

  useEffect(() => {
    return () => {
      if (geocodeDebounceRef.current !== null) {
        clearTimeout(geocodeDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loading || region || (initialLat !== null && initialLng !== null)) {
      setShowLocationHelp(false);
      return;
    }

    const timerId = setTimeout(() => {
      setShowLocationHelp(true);
    }, 10000);

    return () => clearTimeout(timerId);
  }, [initialLat, initialLng, loading, region]);

  useEffect(() => {
    if (!loading || region || (initialLat !== null && initialLng !== null)) {
      return;
    }

    const retryId = setInterval(async () => {
      const resolved = await centerToCurrentLocation({
        animate: false,
        setAsSelected: false,
        silentFailure: true,
      });

      if (resolved) {
        setLoading(false);
        setShowLocationHelp(false);
      }
    }, 4000);

    return () => clearInterval(retryId);
  }, [initialLat, initialLng, loading, region]);

  useEffect(() => {
    if (!topBarHeight) return;

    // Safe area is already applied via paddingBottom on the sheet container.
    // Do not add it again to animated height to avoid extra bottom gap.
    const targetSheetHeight =
      radiusMode === 'custom' ? EXPANDED_SHEET_CONTENT_HEIGHT : COLLAPSED_SHEET_CONTENT_HEIGHT;
    const targetMapHeight = Math.max(220, screenHeight - topBarHeight - targetSheetHeight);

    Animated.timing(mapHeightAnim, {
      toValue: targetMapHeight,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [
    bottom,
    mapHeightAnim,
    radiusMode,
    screenHeight,
    topBarHeight,
    COLLAPSED_SHEET_CONTENT_HEIGHT,
    EXPANDED_SHEET_CONTENT_HEIGHT,
  ]);

  const initializeMap = async () => {
    if (initialLat !== null && initialLng !== null && !Number.isNaN(initialLat) && !Number.isNaN(initialLng)) {
      const initialRegion: Region = {
        latitude: initialLat,
        longitude: initialLng,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      };
      setRegion(initialRegion);
      setCircleCenter({ latitude: initialLat, longitude: initialLng });
      await reverseGeocodePoint(initialLat, initialLng);
      setLoading(false);
      return;
    }

    const resolved = await centerToCurrentLocation({
      animate: false,
      setAsSelected: false,
      silentFailure: true,
    });

    if (resolved) {
      setLoading(false);
      setShowLocationHelp(false);
    }
  };

  const centerToCurrentLocation = async ({
    animate,
    setAsSelected,
    silentFailure = false,
  }: {
    animate: boolean;
    setAsSelected: boolean;
    silentFailure?: boolean;
  }): Promise<boolean> => {
    if (locationRequestInFlight.current) {
      return false;
    }

    locationRequestInFlight.current = true;

    try {
      const permission = await ensureForegroundLocationAccess();
      if (!permission.granted) {
        if (!silentFailure) {
          showNotification({
            type: 'warning',
            message: 'Location permission is needed to open the map.',
          });
        }
        return false;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (!silentFailure) {
          showNotification({ type: 'warning', message: 'Please enable location services first.' });
        }
        return false;
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
      setCircleCenter({ latitude: targetRegion.latitude, longitude: targetRegion.longitude });

      if (animate) {
        mapRef.current?.animateToRegion(targetRegion, 450);
      }

      if (setAsSelected) {
        await reverseGeocodePoint(current.coords.latitude, current.coords.longitude);
      } else if (!circleCenter) {
        setAddress('');
      }
      return true;
    } catch {
      if (!silentFailure) {
        showNotification({ type: 'error', message: 'Unable to get current location' });
      }
      return false;
    } finally {
      locationRequestInFlight.current = false;
    }
  };

  const handleOpenLocationSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Location.enableNetworkProviderAsync();
      }
    } catch {
      // If the OS prompt fails, fall back to app settings.
    }

    try {
      await Linking.openSettings();
    } catch {
      showNotification({ type: 'info', message: 'Open your device settings and enable Location.' });
    }
  };

  const handleRegionChange = (nextRegion: Region) => {
    setCircleCenter({
      latitude: nextRegion.latitude,
      longitude: nextRegion.longitude,
    });
  };

  const handleRegionChangeComplete = (nextRegion: Region) => {
    setRegion(nextRegion);
    setCircleCenter({
      latitude: nextRegion.latitude,
      longitude: nextRegion.longitude,
    });

    if (geocodeDebounceRef.current !== null) {
      clearTimeout(geocodeDebounceRef.current);
    }

    geocodeDebounceRef.current = setTimeout(async () => {
      const point = {
        latitude: nextRegion.latitude,
        longitude: nextRegion.longitude,
      };
      try {
        await reverseGeocodePoint(point.latitude, point.longitude);
      } catch {
        // Keep existing address if geocoding fails during drag.
      }
    }, 450) as unknown as number;
  };

  const handleLocateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const resolved = await centerToCurrentLocation({ animate: true, setAsSelected: false });
      if (resolved) {
        showNotification({ type: 'info', message: 'Centered to your current location.' });
      }
    } finally {
      setLocating(false);
    }
  };

  const applyCustomRadius = (nextValue: number) => {
    const clamped = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(nextValue)));
    setCustomRadiusKm(clamped);
    setRadiusInput(String(clamped));
    setRadiusError('');
  };

  const handleRadiusInputChange = (text: string) => {
    const sanitized = text.replace(/[^0-9]/g, '');
    setRadiusInput(sanitized);

    if (!sanitized) {
      setRadiusError('Enter 1-50 km.');
      return;
    }

    const parsed = parseInt(sanitized, 10);
    if (Number.isNaN(parsed) || parsed < MIN_RADIUS_KM || parsed > MAX_RADIUS_KM) {
      setRadiusError('Radius must be between 1 and 50 km.');
      return;
    }

    setCustomRadiusKm(parsed);
    setRadiusError('');
  };

  const handleConfirm = async () => {
    if (!circleCenter) {
      showNotification({ type: 'error', message: 'Please wait for map location to settle.' });
      return;
    }

    if (radiusMode === 'custom' && radiusError) {
      showNotification({ type: 'error', message: radiusError });
      return;
    }

    setConfirming(true);
    try {
      const parsed = await reverseGeocodePoint(circleCenter.latitude, circleCenter.longitude);
      const locationData: LocationData = {
        latitude: circleCenter.latitude,
        longitude: circleCenter.longitude,
        address: parsed.address,
        streetName: parsed.streetName,
        city: parsed.city,
        barangay: parsed.region || parsed.barangay,
        radiusKm: effectiveRadiusKm,
        radius_km: effectiveRadiusKm,
      };
      setSelectedLocation(locationData);
      if (returnTo === 'emergency') {
        const encodedAddress = encodeURIComponent(parsed.address || '');
        router.replace(
          `/(clientTabs)/main/home?openEmergency=1&emLat=${circleCenter.latitude}&emLng=${circleCenter.longitude}&emAddr=${encodedAddress}`
        );
      } else {
        router.back();
      }
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
        <ThemedText style={styles.loadingText}>Getting your location...</ThemedText>
        {showLocationHelp && (
          <View style={styles.loadingNoticeCard}>
            <ThemedText style={styles.loadingNoticeTitle}>Still waiting for location</ThemedText>
            <ThemedText style={styles.loadingNoticeText}>
              Turn on location services, then try again.
            </ThemedText>
            <TouchableOpacity style={styles.loadingNoticeButton} onPress={handleOpenLocationSettings} activeOpacity={0.85}>
              <ThemedText style={styles.loadingNoticeButtonText}>Open Location Settings</ThemedText>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={styles.topBar}
        onLayout={(event) => setTopBarHeight(event.nativeEvent.layout.height)}
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <FontAwesome name="times" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <ThemedText style={styles.title}>Map</ThemedText>
          <View style={styles.spacer} />
        </View>
        <ThemedText style={styles.addressText} numberOfLines={2}>
          {address || 'Move the map to choose your exact service area center.'}
        </ThemedText>
      </View>

      <Animated.View style={[styles.mapWrap, { height: mapHeightAnim }]}> 
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {circleCenter && (
          <Circle
            center={circleCenter}
            radius={effectiveRadiusKm * 1000}
            strokeColor="rgba(255, 140, 0, 0.9)"
            fillColor="rgba(255, 140, 0, 0.18)"
            strokeWidth={2}
          />
        )}
      </MapView>

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
      </Animated.View>

      <View style={[styles.bottomSheet, { paddingBottom: bottom > 0 ? bottom : 8 }]}> 
        {Platform.OS === 'ios' ? (
          <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={topBarHeight}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.bottomSheetContent}
            >
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setRadiusMode('recommended');
                  setRadiusError('');
                  setRadiusInput(String(RECOMMENDED_RADIUS_KM));
                  setCustomRadiusKm(RECOMMENDED_RADIUS_KM);
                }}
                activeOpacity={0.85}
              >
                <View style={styles.optionTextWrap}>
                  <ThemedText style={styles.optionTitle}>Recommended ({RECOMMENDED_RADIUS_KM} km)</ThemedText>
                  <ThemedText style={styles.optionSubtitle}>Balanced reach for nearby providers</ThemedText>
                </View>
                <View style={[styles.radioOuter, radiusMode === 'recommended' && styles.radioOuterSelected]}>
                  {radiusMode === 'recommended' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setRadiusMode('custom');
                  setRadiusError('');
                }}
                activeOpacity={0.85}
              >
                <View style={styles.optionTextWrap}>
                  <ThemedText style={styles.optionTitle}>Custom Radius</ThemedText>
                  <ThemedText style={styles.optionSubtitle}>Set exactly how far your request should broadcast</ThemedText>
                </View>
                <View style={[styles.radioOuter, radiusMode === 'custom' && styles.radioOuterSelected]}>
                  {radiusMode === 'custom' && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>

              {radiusMode === 'custom' && (
                <>
                  <View style={styles.sliderWrap}>
                    <Slider
                      minimumValue={MIN_RADIUS_KM}
                      maximumValue={MAX_RADIUS_KM}
                      step={1}
                      value={customRadiusKm}
                      onValueChange={applyCustomRadius}
                      minimumTrackTintColor="#FF8C00"
                      maximumTrackTintColor="#3A3C40"
                      thumbTintColor="#FF8C00"
                    />
                    <View style={styles.sliderRangeRow}>
                      <ThemedText style={styles.sliderRangeText}>{MIN_RADIUS_KM} km</ThemedText>
                      <ThemedText style={styles.sliderRangeText}>{MAX_RADIUS_KM} km</ThemedText>
                    </View>
                  </View>

                  <View style={styles.kmInputWrap}>
                    <ThemedText style={styles.kmLabel}>Radius (km)</ThemedText>
                    <TextInput
                      style={styles.kmInput}
                      value={radiusInput}
                      onChangeText={handleRadiusInputChange}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="5"
                      placeholderTextColor="#666"
                    />
                    {!!radiusError && <ThemedText style={styles.inlineError}>{radiusError}</ThemedText>}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.confirmButton, (!circleCenter || confirming) && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={!circleCenter || confirming}
                activeOpacity={0.88}
              >
                {confirming ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <ThemedText style={styles.confirmButtonText}>Set Location and Radius ({effectiveRadiusKm} km)</ThemedText>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.bottomSheetContent}
          >
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                setRadiusMode('recommended');
                setRadiusError('');
                setRadiusInput(String(RECOMMENDED_RADIUS_KM));
                setCustomRadiusKm(RECOMMENDED_RADIUS_KM);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.optionTextWrap}>
                <ThemedText style={styles.optionTitle}>Recommended ({RECOMMENDED_RADIUS_KM} km)</ThemedText>
                <ThemedText style={styles.optionSubtitle}>Balanced reach for nearby providers</ThemedText>
              </View>
              <View style={[styles.radioOuter, radiusMode === 'recommended' && styles.radioOuterSelected]}>
                {radiusMode === 'recommended' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => {
                setRadiusMode('custom');
                setRadiusError('');
              }}
              activeOpacity={0.85}
            >
              <View style={styles.optionTextWrap}>
                <ThemedText style={styles.optionTitle}>Custom Radius</ThemedText>
                <ThemedText style={styles.optionSubtitle}>Set exactly how far your request should broadcast</ThemedText>
              </View>
              <View style={[styles.radioOuter, radiusMode === 'custom' && styles.radioOuterSelected]}>
                {radiusMode === 'custom' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            {radiusMode === 'custom' && (
              <>
                <View style={styles.sliderWrap}>
                  <Slider
                    minimumValue={MIN_RADIUS_KM}
                    maximumValue={MAX_RADIUS_KM}
                    step={1}
                    value={customRadiusKm}
                    onValueChange={applyCustomRadius}
                    minimumTrackTintColor="#FF8C00"
                    maximumTrackTintColor="#3A3C40"
                    thumbTintColor="#FF8C00"
                  />
                  <View style={styles.sliderRangeRow}>
                    <ThemedText style={styles.sliderRangeText}>{MIN_RADIUS_KM} km</ThemedText>
                    <ThemedText style={styles.sliderRangeText}>{MAX_RADIUS_KM} km</ThemedText>
                  </View>
                </View>

                <View style={styles.kmInputWrap}>
                  <ThemedText style={styles.kmLabel}>Radius (km)</ThemedText>
                  <TextInput
                    style={styles.kmInput}
                    value={radiusInput}
                    onChangeText={handleRadiusInputChange}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="5"
                    placeholderTextColor="#666"
                  />
                  {!!radiusError && <ThemedText style={styles.inlineError}>{radiusError}</ThemedText>}
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.confirmButton, (!circleCenter || confirming) && styles.confirmButtonDisabled]}
              onPress={handleConfirm}
              disabled={!circleCenter || confirming}
              activeOpacity={0.88}
            >
              {confirming ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <ThemedText style={styles.confirmButtonText}>Set Location and Radius ({effectiveRadiusKm} km)</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
