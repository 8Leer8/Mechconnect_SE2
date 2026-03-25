import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import WalletBadge from '@/components/wallet-badge';
import { eventBus } from '@/utils/eventBus';
import { getDistanceKm } from '@/app/client/request/main_request_form/LocationContext';
import { styles } from '@/style/mechanic/mapStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { useNotification } from '@/hooks/useNotification';
import { SkeletonMapJobList } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY;
const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY;

interface BroadcastRequest {
  id: number;
  description: string;
  latitude: number;
  longitude: number;
  services: {
    id: number;
    name: string;
    description: string;
    minimum_price: number;
  }[];
  add_ons: {
    id: number;
    name: string;
    description: string;
    price: number;
  }[];
  created_at: string;
  expires_at: string;
  status: string;
  concern_picture?: string;
  required_tokens?: number;
}

type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'severe' | 'unknown';

interface TrafficData {
  level: TrafficLevel;
  emoji: string;
  label: string;
  surchargePercent: number;
  surchargeLabel: string;
  color: string;
  currentSpeed: number;
  freeFlowSpeed: number;
  timeNote?: string;
}

interface RouteResult {
  distanceKm: number;
  etaMinutes: number;
  coords: { latitude: number; longitude: number }[];
}

interface FeeData {
  baseFee: number;
  distanceFee: number;
  surchargeAmount: number;
  convenienceFee: number;
  serviceTotal: number;
  addOnsTotal: number;
  overallIncome: number;
  minFee: number;
  maxFee: number;
  isEstimate: boolean;
  distanceKm: number;
  etaMinutes: number;
}

interface CachedRouteData {
  routeCoords: { latitude: number; longitude: number }[];
  trafficData: TrafficData;
  feeData: FeeData;
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const isInitializingMapRef = useRef(false);
  const lastFetchedBroadcastId = useRef<number | null>(null);
  const cachedRouteData = useRef<CachedRouteData | null>(null);
  const markerTapRef = useRef<Record<number, number>>({});
  const { showNotification } = useNotification();

  const [broadcasts, setBroadcasts] = useState<BroadcastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<BroadcastRequest | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [tokensBalance, setTokensBalance] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  const [feeData, setFeeData] = useState<FeeData | null>(null);
  const [mapInitFailed, setMapInitFailed] = useState(false);
  const [mapInitMessage, setMapInitMessage] = useState('Failed to load map location.');

  const [region, setRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    initializeMap();
    fetchBroadcasts();

    const interval = setInterval(() => {
      fetchBroadcasts(true);
    }, 8000);

    fetchTokensBalance();
    return () => {
      clearInterval(interval);
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  const setCurrentUserLocation = (location: { latitude: number; longitude: number }) => {
    userLocationRef.current = location;
    setUserLocation(location);
  };

  const waitForUserLocation = async (timeoutMs = 5000) => {
    const start = Date.now();
    while (!userLocationRef.current && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return userLocationRef.current;
  };

  const fetchTokensBalance = async () => {
    try {
      const res = await fetch(`${API_URL}/users/mechanic/wallet/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setTokensBalance(data.tokens_balance ?? 0);
    } catch {
      // ignore
    }
  };

  const toFiniteNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const normalizeBroadcast = (raw: any): BroadcastRequest | null => {
    if (!raw || typeof raw !== 'object') return null;

    const latitude = toFiniteNumber(raw.latitude);
    const longitude = toFiniteNumber(raw.longitude);

    if (latitude === null || longitude === null) return null;

    return {
      ...raw,
      latitude,
      longitude,
      services: Array.isArray(raw.services) ? raw.services : [],
      add_ons: Array.isArray(raw.add_ons) ? raw.add_ons : [],
    } as BroadcastRequest;
  };

  const setRegionFromCoords = (latitude: number, longitude: number) => {
    setRegion({
      latitude,
      longitude,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    });
    setCurrentUserLocation({ latitude, longitude });
  };

  const getCurrentPositionWithTimeout = async (
    accuracy: Location.Accuracy,
    timeoutMs: number,
    mayShowUserSettingsDialog?: boolean
  ): Promise<Location.LocationObject | null> => {
    const locationPromise = Location.getCurrentPositionAsync({
      accuracy,
      mayShowUserSettingsDialog,
    });
    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });
    return Promise.race([locationPromise, timeoutPromise]);
  };

  const initializeMap = async () => {
    if (isInitializingMapRef.current) return;
    isInitializingMapRef.current = true;

    try {
      setMapInitFailed(false);
      setMapInitMessage('Failed to load map location.');

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setMapInitFailed(true);
        setMapInitMessage('Map failed: location services are off. Please enable GPS and refresh.');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        setMapInitFailed(true);
        setMapInitMessage('Map failed: location permission denied. Tap refresh to try again.');
        return;
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        requiredAccuracy: 150,
        maxAge: 3 * 60 * 1000,
      });

      if (lastKnown?.coords) {
        setRegionFromCoords(lastKnown.coords.latitude, lastKnown.coords.longitude);
      }

      let freshLocation: Location.LocationObject | null = null;

      try {
        freshLocation = await getCurrentPositionWithTimeout(Location.Accuracy.High, 25000, true);
      } catch {
        try {
          freshLocation = await getCurrentPositionWithTimeout(Location.Accuracy.Balanced, 15000);
        } catch {
          freshLocation = null;
        }
      }

      if (freshLocation?.coords) {
        setRegionFromCoords(freshLocation.coords.latitude, freshLocation.coords.longitude);
      } else if (!lastKnown?.coords) {
        setMapInitFailed(true);
        setMapInitMessage('Map failed: unable to fetch current location. Tap refresh to retry.');
        return;
      }

      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }

      locationWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 8000,
          distanceInterval: 10,
          mayShowUserSettingsDialog: false,
        },
        (loc) => {
          if (!loc?.coords) return;
          setCurrentUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    } catch {
      setMapInitFailed(true);
      setMapInitMessage('Map failed: location fetch error. Tap refresh to retry.');
    } finally {
      isInitializingMapRef.current = false;
    }
  };

  const retryMapInitialization = async () => {
    await initializeMap();
  };

  const getTrafficClass = (ratio: number) => {
    if (ratio < 1.2) {
      return { level: 'light' as const, emoji: '🟢', label: 'Light Traffic', surchargePercent: 0.0, color: '#34C759' };
    }
    if (ratio < 1.5) {
      return { level: 'moderate' as const, emoji: '🟡', label: 'Moderate Traffic', surchargePercent: 0.1, color: '#FFD60A' };
    }
    if (ratio < 2.0) {
      return { level: 'heavy' as const, emoji: '🟠', label: 'Heavy Traffic', surchargePercent: 0.2, color: '#FF9500' };
    }
    return { level: 'severe' as const, emoji: '🔴', label: 'Severe Traffic', surchargePercent: 0.3, color: '#FF3B30' };
  };

  const getTimeBasedTrafficFallback = (): TrafficData => {
    const hour = new Date().getHours();

    let fallbackLevel: 'light' | 'moderate' | 'severe' = 'moderate';
    if (hour >= 0 && hour < 5) fallbackLevel = 'light';
    else if (hour >= 5 && hour < 7) fallbackLevel = 'moderate';
    else if (hour >= 7 && hour < 10) fallbackLevel = 'severe';
    else if (hour >= 10 && hour < 17) fallbackLevel = 'moderate';
    else if (hour >= 17 && hour < 21) fallbackLevel = 'severe';
    else fallbackLevel = 'moderate';

    const mapByLevel = {
      light: { emoji: '🟢', label: 'Light Traffic', surchargePercent: 0.0, color: '#34C759' },
      moderate: { emoji: '🟡', label: 'Moderate Traffic', surchargePercent: 0.1, color: '#FFD60A' },
      severe: { emoji: '🔴', label: 'Severe Traffic', surchargePercent: 0.3, color: '#FF3B30' },
    };

    const info = mapByLevel[fallbackLevel];

    return {
      level: fallbackLevel,
      emoji: info.emoji,
      label: info.label,
      surchargePercent: info.surchargePercent,
      surchargeLabel: `${Math.round(info.surchargePercent * 100)}%`,
      color: info.color,
      currentSpeed: 0,
      freeFlowSpeed: 0,
      timeNote: '(estimated based on time of day)',
    };
  };

  const fetchRoute = async (broadcast: BroadcastRequest): Promise<RouteResult> => {
    const currentUserLocation = userLocationRef.current;
    if (!currentUserLocation) throw new Error('User location unavailable');
    if (!ORS_KEY) throw new Error('OpenRouteService key is missing');

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${encodeURIComponent(ORS_KEY)}&start=${currentUserLocation.longitude},${currentUserLocation.latitude}&end=${broadcast.longitude},${broadcast.latitude}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch route');
    }

    const data = await response.json() as any;
    const coordinates = data?.features?.[0]?.geometry?.coordinates;
    const segment = data?.features?.[0]?.properties?.segments?.[0];

    if (!Array.isArray(coordinates) || !segment) {
      throw new Error('Invalid route response');
    }

    const parsedCoords = coordinates
      .filter((coord: any) => Array.isArray(coord) && coord.length >= 2)
      .map((coord: number[]) => ({ latitude: coord[1], longitude: coord[0] }));

    const distanceKm = Number(segment?.distance || 0) / 1000;
    const etaMinutes = Math.round(Number(segment?.duration || 0) / 60);

    setRouteCoords(parsedCoords);

    return {
      distanceKm,
      etaMinutes,
      coords: parsedCoords,
    };
  };

  const fetchTraffic = async (broadcast: BroadcastRequest): Promise<TrafficData> => {
    try {
      if (!TOMTOM_KEY) {
        throw new Error('TomTom key is missing');
      }

      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${broadcast.latitude},${broadcast.longitude}&key=${encodeURIComponent(TOMTOM_KEY)}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch traffic');
      }

      const data = await response.json() as any;
      const flow = data?.flowSegmentData;
      const currentSpeed = Number(flow?.currentSpeed || 0);
      const freeFlowSpeed = Number(flow?.freeFlowSpeed || 0);

      if (currentSpeed <= 0 || freeFlowSpeed <= 0) {
        throw new Error('Invalid traffic response');
      }

      const ratio = freeFlowSpeed / currentSpeed;
      const classified = getTrafficClass(ratio);

      return {
        level: classified.level,
        emoji: classified.emoji,
        label: classified.label,
        surchargePercent: classified.surchargePercent,
        surchargeLabel: `${Math.round(classified.surchargePercent * 100)}%`,
        color: classified.color,
        currentSpeed,
        freeFlowSpeed,
      };
    } catch {
      return getTimeBasedTrafficFallback();
    }
  };

  const calculateFee = (distanceKm: number, traffic: TrafficData, broadcast: BroadcastRequest) => {
    const BASE_FEE = 50;
    const RATE_PER_KM = 15;
    const distanceFee = distanceKm * RATE_PER_KM;
    const surcharge = distanceFee * traffic.surchargePercent;
    const convFee = BASE_FEE + distanceFee + surcharge;
    const serviceTotal = broadcast.services.reduce((sum, s) => sum + (s.minimum_price || 0), 0);
    const addOnsTotal = broadcast.add_ons?.reduce((sum, a) => sum + (a.price || 0), 0) || 0;
    const overallIncome = serviceTotal + addOnsTotal + convFee;
    const minFee = BASE_FEE + distanceFee;
    const maxFee = BASE_FEE + distanceFee + distanceFee * 0.3;

    return {
      baseFee: BASE_FEE,
      distanceFee,
      surchargeAmount: surcharge,
      convenienceFee: convFee,
      serviceTotal,
      addOnsTotal,
      overallIncome,
      minFee,
      maxFee,
      isEstimate: true,
    };
  };

  const fetchRouteAndTraffic = async (broadcast: BroadcastRequest) => {
    const currentUserLocation = await waitForUserLocation();

    if (!currentUserLocation) {
      setRouteError('Location is not available yet.');
      return;
    }

    if (lastFetchedBroadcastId.current === broadcast.id && cachedRouteData.current) {
      setRouteCoords(cachedRouteData.current.routeCoords);
      setTrafficData(cachedRouteData.current.trafficData);
      setFeeData(cachedRouteData.current.feeData);
      setRouteError(null);

      if (mapRef.current) {
        mapRef.current.fitToCoordinates(
          [
            { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
            { latitude: broadcast.latitude, longitude: broadcast.longitude },
          ],
          {
            edgePadding: { top: 80, right: 40, bottom: 400, left: 40 },
            animated: true,
          }
        );
      }
      return;
    }

    setRouteLoading(true);
    setRouteError(null);

    try {
      const [routeResult, trafficResult] = await Promise.all([
        fetchRoute(broadcast),
        fetchTraffic(broadcast),
      ]);

      const feeResult = calculateFee(routeResult.distanceKm, trafficResult, broadcast);
      const enrichedFee: FeeData = {
        ...feeResult,
        distanceKm: routeResult.distanceKm,
        etaMinutes: routeResult.etaMinutes,
      };

      setTrafficData(trafficResult);
      setFeeData(enrichedFee);

      cachedRouteData.current = {
        routeCoords: routeResult.coords,
        trafficData: trafficResult,
        feeData: enrichedFee,
      };
      lastFetchedBroadcastId.current = broadcast.id;

      if (mapRef.current) {
        mapRef.current.fitToCoordinates(
          [
            { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
            { latitude: broadcast.latitude, longitude: broadcast.longitude },
          ],
          {
            edgePadding: { top: 80, right: 40, bottom: 400, left: 40 },
            animated: true,
          }
        );
      }
    } catch {
      const fallbackTraffic = getTimeBasedTrafficFallback();
      const fallbackDistanceKm = getDistanceKm(currentUserLocation, {
        latitude: broadcast.latitude,
        longitude: broadcast.longitude,
      });
      const fallbackEtaMinutes = Math.max(1, Math.round((fallbackDistanceKm / 25) * 60));
      const fallbackCoords = [
        {
          latitude: currentUserLocation.latitude,
          longitude: currentUserLocation.longitude,
        },
        {
          latitude: broadcast.latitude,
          longitude: broadcast.longitude,
        },
      ];
      const fallbackFeeBase = calculateFee(fallbackDistanceKm, fallbackTraffic, broadcast);
      const fallbackFee: FeeData = {
        ...fallbackFeeBase,
        distanceKm: fallbackDistanceKm,
        etaMinutes: fallbackEtaMinutes,
      };

      setRouteCoords(fallbackCoords);
      setTrafficData(fallbackTraffic);
      setFeeData(fallbackFee);
      setRouteError(null);

      if (mapRef.current) {
        mapRef.current.fitToCoordinates(
          fallbackCoords,
          {
            edgePadding: { top: 80, right: 40, bottom: 400, left: 40 },
            animated: true,
          }
        );
      }
    } finally {
      setRouteLoading(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBroadcasts(true);
  };

  const fetchBroadcasts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/bookings/broadcasts/active/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch broadcasts');
      const data = await response.json() as any;
      const normalized = (Array.isArray(data.broadcasts) ? data.broadcasts : [])
        .map((item: any) => normalizeBroadcast(item))
        .filter((item: BroadcastRequest | null): item is BroadcastRequest => item !== null);
      setBroadcasts(normalized);
    } catch (err: any) {
      if (!silent) setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleBroadcastPress = async (broadcast: BroadcastRequest) => {
    setSelectedBroadcast(broadcast);
    await fetchRouteAndTraffic(broadcast);
    setModalVisible(true);
    void fetchTokensBalance();
  };

  const handleCardPressShowRoute = async (broadcast: BroadcastRequest) => {
    setSelectedBroadcast(broadcast);
    await fetchRouteAndTraffic(broadcast);
  };

  const handleBroadcastMarkerPress = (broadcast: BroadcastRequest) => {
    const now = Date.now();
    const lastTap = markerTapRef.current[broadcast.id] ?? 0;
    markerTapRef.current[broadcast.id] = now;

    if (now - lastTap < 350) {
      void handleBroadcastPress(broadcast);
      return;
    }

    void handleCardPressShowRoute(broadcast);
  };

  const closeBroadcastModal = () => {
    setModalVisible(false);
    setRouteCoords([]);
    setRouteLoading(false);
    setRouteError(null);
    setTrafficData(null);
    setFeeData(null);

    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        },
        1000
      );
    }
  };

  const handleAcceptBroadcast = async () => {
    if (!selectedBroadcast || !userLocation) return;

    setAccepting(true);
    try {
      const response = await fetch(`${API_URL}/bookings/broadcasts/${selectedBroadcast.id}/accept/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mechanic_latitude: userLocation.latitude,
          mechanic_longitude: userLocation.longitude,
          distance_km: feeData?.distanceKm,
          estimated_price: feeData?.overallIncome,
          convenience_fee: feeData?.convenienceFee,
          traffic_level: trafficData?.level ?? 'unknown',
          estimated_eta_minutes: feeData?.etaMinutes,
        }),
      });

      const data = await response.json() as any;

      if (response.ok) {
        showNotification({ type: 'success', title: 'Accepted!', message: 'You have accepted the broadcast request. Check your bookings.' });
        closeBroadcastModal();
        fetchBroadcasts(true);
        fetchTokensBalance();
        try { eventBus.emit('walletChanged'); } catch {}
      } else {
        showNotification({ type: 'warning', title: 'Already Taken', message: data.error || 'This broadcast is no longer available. Another mechanic was faster.' });
        closeBroadcastModal();
        fetchBroadcasts(true);
      }
    } catch {
      showNotification({ type: 'error', message: 'Failed to accept broadcast request' });
    } finally {
      setAccepting(false);
    }
  };

  const getTimeRemaining = (expiresAt: string): string => {
    const expiry = new Date(expiresAt).getTime();
    const diff = expiry - currentTime;

    if (diff <= 0) return 'Expired';

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    return `${minutes}m ${seconds}s`;
  };

  const filteredBroadcasts = broadcasts;
  const routeDistanceDisplay = feeData?.distanceKm?.toFixed(2) ?? '--';
  const routeEtaDisplay = feeData?.etaMinutes ?? '--';
  const sx = styles as any;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Nearby Jobs</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.locationButton}>
            <FontAwesome name="crosshairs" size={20} color="#fff" />
          </TouchableOpacity>
          <WalletBadge onPress={() => router.push('/mechanic/wallet')} />
        </View>
      </View>

      <View style={styles.mapContainer}>
        {mapInitFailed ? (
          <View style={styles.mapLoadingContainer}>
            <View style={styles.mapErrorCard}>
              <View style={styles.mapErrorHeader}>
                <FontAwesome name="exclamation-triangle" size={18} color="#FF3B30" />
                <ThemedText style={styles.mapErrorTitle}>Map Unavailable</ThemedText>
              </View>
              <ThemedText style={styles.mapErrorText}>{mapInitMessage}</ThemedText>
              <TouchableOpacity style={styles.mapRetryButton} onPress={retryMapInitialization}>
                <FontAwesome name="refresh" size={12} color="#fff" />
                <ThemedText style={styles.mapRetryText}>Retry</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        ) : region ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {!!TOMTOM_KEY && (
              <UrlTile
                urlTemplate={`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`}
                maximumZ={22}
                flipY={false}
                zIndex={-1}
              />
            )}

            {routeCoords.length > 0 && (
              <Polyline
                coordinates={routeCoords}
                strokeColor="#FF8C00"
                strokeWidth={5}
                geodesic
                lineCap="round"
                lineJoin="round"
              />
            )}

            {filteredBroadcasts.map((broadcast) => (
              <Marker
                key={`broadcast-${broadcast.id}`}
                coordinate={{
                  latitude: broadcast.latitude,
                  longitude: broadcast.longitude,
                }}
                title="Broadcast Request"
                description={broadcast.description}
                pinColor="#34C759"
                onPress={() => handleBroadcastMarkerPress(broadcast)}
              />
            ))}

            {selectedBroadcast && modalVisible && (
              <Marker
                coordinate={{
                  latitude: selectedBroadcast.latitude,
                  longitude: selectedBroadcast.longitude,
                }}
                pinColor="#FF3B30"
              />
            )}
          </MapView>
        ) : (
          <View style={styles.mapLoadingContainer}>
            <ActivityIndicator size="large" color="#FF8C00" />
            <ThemedText style={styles.mapLoadingText}>Loading map...</ThemedText>
          </View>
        )}

        <View style={styles.mapOverlay}>
          <View style={styles.mapStats}>
            <FontAwesome name="map-marker" size={16} color="#FF8C00" />
            <ThemedText style={styles.mapStatsText}>
              {filteredBroadcasts.length} jobs nearby
            </ThemedText>
          </View>
          {broadcasts.length > 0 && (
            <View style={[styles.mapStats, { backgroundColor: '#34C75990', marginTop: 8 }]}>
              <FontAwesome name="volume-up" size={14} color="#34C759" />
              <ThemedText style={styles.mapStatsText}>
                {broadcasts.length} broadcast{broadcasts.length !== 1 ? 's' : ''}
              </ThemedText>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.myLocationButton}
          onPress={() => {
            if (userLocation && mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.0922,
                longitudeDelta: 0.0421,
              }, 1000);
              return;
            }

            void retryMapInitialization();
          }}
        >
          <FontAwesome name="crosshairs" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.jobListContainer}>
        <ThemedText style={styles.jobListTitle}>Available Jobs</ThemedText>
        <ScrollView
          style={styles.jobList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
          }
        >
          {loading && !refreshing ? (
            <SkeletonMapJobList />
          ) : error ? (
            <View style={styles.errorContainer}>
              <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
              <TouchableOpacity style={styles.retryButton} onPress={() => fetchBroadcasts()}>
                <ThemedText style={styles.retryText}>Retry</ThemedText>
              </TouchableOpacity>
            </View>
          ) : filteredBroadcasts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome name="map-marker" size={64} color="#8E8E93" />
              <ThemedText style={styles.emptyText}>No jobs available</ThemedText>
              <ThemedText style={styles.emptySubtext}>Check back later for new jobs</ThemedText>
            </View>
          ) : (
            <>
              {filteredBroadcasts.map((broadcast) => (
                <TouchableOpacity
                  key={`broadcast-${broadcast.id}`}
                  style={[styles.jobCard, styles.broadcastCard]}
                  activeOpacity={0.9}
                  onPress={() => {
                    void handleCardPressShowRoute(broadcast);
                  }}
                >
                  <View style={styles.jobCardHeader}>
                    <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
                    <ThemedText style={styles.jobTitle} numberOfLines={1}>
                      Broadcast Request
                    </ThemedText>
                    <View style={styles.urgentBadge}>
                      <ThemedText style={styles.urgentText}>NEW</ThemedText>
                    </View>
                  </View>

                  <ThemedText style={styles.broadcastDescription} numberOfLines={2}>
                    {broadcast.description}
                  </ThemedText>

                  <View style={styles.servicesContainer}>
                    {broadcast.services.slice(0, 2).map((service) => (
                      <View key={service.id} style={styles.serviceTag}>
                        <ThemedText style={styles.serviceTagText}>{service.name}</ThemedText>
                      </View>
                    ))}
                    {broadcast.services.length > 2 && (
                      <View style={styles.serviceTag}>
                        <ThemedText style={styles.serviceTagText}>
                          +{broadcast.services.length - 2} more
                        </ThemedText>
                      </View>
                    )}
                  </View>

                  <View style={styles.jobCardFooter}>
                    <View style={styles.timerContainer}>
                      <FontAwesome name="clock-o" size={14} color="#FF8C00" />
                      <ThemedText style={styles.timerText}>
                        {getTimeRemaining(broadcast.expires_at)}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleBroadcastPress(broadcast)}
                    >
                      <ThemedText style={styles.acceptText}>View & Accept</ThemedText>
                      <FontAwesome name="arrow-right" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeBroadcastModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Broadcast Request Details</ThemedText>
              <TouchableOpacity onPress={closeBroadcastModal}>
                <FontAwesome name="times" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedBroadcast && (
                <>
                  <View style={styles.modalTimer}>
                    <FontAwesome name="clock-o" size={20} color="#FF8C00" />
                    <ThemedText style={styles.modalTimerText}>
                      Time Remaining: {getTimeRemaining(selectedBroadcast.expires_at)}
                    </ThemedText>
                  </View>

                  {selectedBroadcast.concern_picture && (
                    <View style={styles.modalSection}>
                      <ThemedText style={styles.modalSectionTitle}>Concern Photo</ThemedText>
                      <Image
                        source={{ uri: getImageUrl(selectedBroadcast.concern_picture) || '' }}
                        style={styles.modalConcernImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  <View style={styles.modalSection}>
                    <ThemedText style={styles.modalSectionTitle}>Description</ThemedText>
                    <ThemedText style={styles.modalText}>{selectedBroadcast.description}</ThemedText>
                  </View>

                  <View style={sx.modalCard}>
                    <View style={sx.cardTitleRow}>
                      <FontAwesome name="map-marker" size={14} color="#FF8C00" />
                      <ThemedText style={sx.cardTitleText}>Route to Client</ThemedText>
                    </View>
                    {routeLoading ? (
                      <View style={sx.routeLoadingWrap}>
                        <ActivityIndicator color="#FF8C00" />
                      </View>
                    ) : (
                      <>
                        <ThemedText style={sx.cardPrimaryText}>
                          Distance: {routeDistanceDisplay} km (via road)
                        </ThemedText>
                        <ThemedText style={sx.cardSecondaryText}>
                          ETA: ~{routeEtaDisplay} mins
                        </ThemedText>
                        {routeError ? (
                          <ThemedText style={sx.routeErrorText}>{routeError}</ThemedText>
                        ) : null}
                      </>
                    )}
                  </View>

                  {trafficData && (
                    <View style={sx.modalCard}>
                      <View style={sx.cardTitleRow}>
                        <FontAwesome name="road" size={14} color="#FF8C00" />
                        <ThemedText style={sx.cardTitleText}>Current Traffic</ThemedText>
                      </View>
                      <ThemedText style={[sx.cardPrimaryText, { color: trafficData.color }]}>
                        {trafficData.label}
                      </ThemedText>
                      <ThemedText style={sx.cardSecondaryText}>
                        Current speed: {trafficData.currentSpeed} km/h
                      </ThemedText>
                      <ThemedText style={sx.cardSecondaryText}>
                        Normal speed: {trafficData.freeFlowSpeed} km/h
                      </ThemedText>
                      <ThemedText style={sx.cardSecondaryText}>
                        Surcharge: {trafficData.surchargeLabel}
                      </ThemedText>
                      {trafficData.timeNote ? (
                        <ThemedText style={sx.trafficNoteText}>{trafficData.timeNote}</ThemedText>
                      ) : null}
                    </View>
                  )}

                  {feeData && (
                    <View style={sx.modalCard}>
                      <View style={sx.cardTitleRow}>
                        <FontAwesome name="calculator" size={14} color="#FF8C00" />
                        <ThemedText style={sx.cardTitleText}>Convenience Fee</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabel}>Base Fee</ThemedText>
                        <ThemedText style={sx.cardRowValue}>₱{feeData.baseFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabel}>Distance ({feeData.distanceKm.toFixed(2)}km)</ThemedText>
                        <ThemedText style={sx.cardRowValue}>₱{feeData.distanceFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabel}>Traffic Surcharge</ThemedText>
                        <ThemedText style={sx.cardRowValue}>₱{feeData.surchargeAmount.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardDivider} />
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabelBold}>Convenience Fee</ThemedText>
                        <ThemedText style={sx.cardRowValueBold}>₱{feeData.convenienceFee.toFixed(2)}</ThemedText>
                      </View>
                      <ThemedText style={sx.rangeText}>
                        Range: ₱{feeData.minFee.toFixed(2)} - ₱{feeData.maxFee.toFixed(2)}
                      </ThemedText>
                    </View>
                  )}

                  <View style={sx.disclaimerCard}>
                    <FontAwesome name="info-circle" size={16} color="#FF8C00" />
                    <ThemedText style={sx.disclaimerText}>
                      Once you accept, distance is saved from your accept location. Traffic level and ETA shown here are estimated at acceptance and visible to the client.
                    </ThemedText>
                  </View>

                  <View style={styles.modalSection}>
                    <ThemedText style={styles.modalSectionTitle}>Services Requested</ThemedText>
                    {selectedBroadcast.services.map((service) => (
                      <View key={service.id} style={styles.modalServiceItem}>
                        <View style={styles.modalServiceInfo}>
                          <ThemedText style={styles.modalServiceName}>{service.name}</ThemedText>
                          <ThemedText style={styles.modalServiceDesc}>{service.description}</ThemedText>
                        </View>
                        <ThemedText style={styles.modalServicePrice}>
                          ₱{parseFloat(String(service.minimum_price || '0')).toFixed(2)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>

                  {selectedBroadcast.add_ons && selectedBroadcast.add_ons.length > 0 && (
                    <View style={styles.modalSection}>
                      <ThemedText style={styles.modalSectionTitle}>Add-ons</ThemedText>
                      {selectedBroadcast.add_ons.map((addon) => (
                        <View key={addon.id} style={styles.modalServiceItem}>
                          <View style={styles.modalServiceInfo}>
                            <ThemedText style={styles.modalServiceName}>{addon.name}</ThemedText>
                            <ThemedText style={styles.modalServiceDesc}>{addon.description}</ThemedText>
                          </View>
                          <ThemedText style={styles.modalServicePrice}>
                            ₱{parseFloat(String(addon.price || '0')).toFixed(2)}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  )}

                  {feeData && (
                    <View style={sx.incomeCard}>
                      <View style={sx.cardTitleRow}>
                        <FontAwesome name="money" size={14} color="#34C759" />
                        <ThemedText style={sx.incomeTitleStyle}>Your Total Income</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabel}>Services Total</ThemedText>
                        <ThemedText style={sx.cardRowValue}>₱{feeData.serviceTotal.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabel}>Add-ons Total</ThemedText>
                        <ThemedText style={sx.cardRowValue}>₱{feeData.addOnsTotal.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.cardRowLabel}>Convenience Fee</ThemedText>
                        <ThemedText style={sx.cardRowValue}>₱{feeData.convenienceFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardDivider} />
                      <View style={sx.cardRow}>
                        <ThemedText style={sx.totalStyleLabel}>TOTAL</ThemedText>
                        <ThemedText style={sx.totalStyleValue}>₱{feeData.overallIncome.toFixed(2)}</ThemedText>
                      </View>
                    </View>
                  )}

                  <View style={sx.tokensCard}>
                    <View style={sx.cardTitleRow}>
                      <FontAwesome name="ticket" size={14} color="#FF8C00" />
                      <ThemedText style={sx.tokensTitle}>Tokens</ThemedText>
                    </View>
                    <View style={sx.tokensRow}>
                      <ThemedText style={sx.tokensLabel}>Required</ThemedText>
                      <ThemedText style={sx.tokensValue}>{selectedBroadcast?.required_tokens ?? '--'}</ThemedText>
                    </View>
                    <View style={sx.tokensRow}>
                      <ThemedText style={sx.tokensLabel}>Balance</ThemedText>
                      <ThemedText style={sx.tokensValue}>{tokensBalance ?? '--'}</ThemedText>
                    </View>
                    {selectedBroadcast && typeof selectedBroadcast.required_tokens === 'number' && tokensBalance !== null && tokensBalance < selectedBroadcast.required_tokens && (
                      <ThemedText style={sx.tokensWarning}>Insufficient tokens. Please top up to accept this job.</ThemedText>
                    )}
                  </View>

                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[
                  styles.modalAcceptButton,
                  accepting && styles.modalAcceptButtonDisabled,
                  (selectedBroadcast && typeof selectedBroadcast.required_tokens === 'number' && tokensBalance !== null && tokensBalance < selectedBroadcast.required_tokens) ? styles.modalAcceptButtonDisabled : null,
                ]}
                onPress={handleAcceptBroadcast}
                disabled={accepting || !!(selectedBroadcast && typeof selectedBroadcast.required_tokens === 'number' && tokensBalance !== null && tokensBalance < selectedBroadcast.required_tokens)}
              >
                {accepting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="check" size={18} color="#fff" />
                    <ThemedText style={styles.modalAcceptText}>Accept This Job</ThemedText>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={closeBroadcastModal}
              >
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
