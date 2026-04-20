import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  AppState,
  AppStateStatus,
  StyleSheet,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
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

// ─── Modal font rule ──────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  modalTitle:   { fontSize: 16, fontWeight: '600' },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  cardTitle:    { fontSize: 14, fontWeight: '600' },
  body:         { fontSize: 14, fontWeight: '400' },
  label:        { fontSize: 12, fontWeight: '400' },
  value:        { fontSize: 14, fontWeight: '400' },
  valueBold:    { fontSize: 14, fontWeight: '600' },
  totalLabel:   { fontSize: 14, fontWeight: '600' },
  totalValue:   { fontSize: 16, fontWeight: '600' },
  timer:        { fontSize: 14, fontWeight: '600' },
  meta:         { fontSize: 12, fontWeight: '400' },
  disclaimer:   { fontSize: 12, fontWeight: '300' },
  warning:      { fontSize: 12, fontWeight: '400' },
});

interface BroadcastRequest {
  id: number;
  description: string;
  latitude: number;
  longitude: number;
  radius_km?: number;
  search_radius_km?: number;
  vehicle_type?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
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
  platformCommission: number;
  netIncome: number;
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

interface PricingConfig {
  base_distance_fee: number;
  price_per_km: number;
  free_distance_km: number;
  traffic_low_multiplier: number;
  traffic_medium_multiplier: number;
  traffic_high_multiplier: number;
  convenience_fee_percentage: number;
  convenience_fee_fixed: number;
  min_job_price: number;
  platform_commission_percentage: number;
  token_deduction_percentage: number;
}

const DEFAULT_PRICING_CONFIG: PricingConfig = {
  base_distance_fee: 50,
  price_per_km: 15,
  free_distance_km: 2,
  traffic_low_multiplier: 1,
  traffic_medium_multiplier: 1.25,
  traffic_high_multiplier: 1.5,
  convenience_fee_percentage: 5,
  convenience_fee_fixed: 0,
  min_job_price: 100,
  platform_commission_percentage: 10,
  token_deduction_percentage: 2,
};

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const userLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const isInitializingMapRef = useRef(false);
  const lastFetchedBroadcastId = useRef<number | null>(null);
  const cachedRouteData = useRef<CachedRouteData | null>(null);
  const markerTapRef = useRef<Record<number, number>>({});
  const lastBroadcastFetchLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
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
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
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
    fetchPricingConfig();
    fetchTokensBalance();
    return () => {
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (userLocationRef.current) {
        fetchBroadcasts(true);
      }
    }, [])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchPricingConfig();
        if (userLocationRef.current) {
          fetchBroadcasts(true);
        }
        fetchTokensBalance();
      }
    });
    return () => { subscription.remove(); };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => { setCurrentTime(Date.now()); }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  const setCurrentUserLocation = (location: { latitude: number; longitude: number }) => {
    userLocationRef.current = location;
    setUserLocation(location);
    if (!lastBroadcastFetchLocationRef.current) {
      lastBroadcastFetchLocationRef.current = location;
      fetchBroadcasts(true);
      return;
    }
    const movedKm = getDistanceKm(lastBroadcastFetchLocationRef.current, location);
    if (movedKm >= 0.1) {
      lastBroadcastFetchLocationRef.current = location;
      fetchBroadcasts(true);
    }
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
      const data = await res.json() as any;
      setTokensBalance(data.tokens_balance ?? 0);
    } catch { }
  };

  const fetchPricingConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/pricing/config/`, {
        method: 'GET', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json() as Partial<PricingConfig>;
      setPricingConfig({
        base_distance_fee: Number(data.base_distance_fee ?? DEFAULT_PRICING_CONFIG.base_distance_fee),
        price_per_km: Number(data.price_per_km ?? DEFAULT_PRICING_CONFIG.price_per_km),
        free_distance_km: Number(data.free_distance_km ?? DEFAULT_PRICING_CONFIG.free_distance_km),
        traffic_low_multiplier: Number(data.traffic_low_multiplier ?? DEFAULT_PRICING_CONFIG.traffic_low_multiplier),
        traffic_medium_multiplier: Number(data.traffic_medium_multiplier ?? DEFAULT_PRICING_CONFIG.traffic_medium_multiplier),
        traffic_high_multiplier: Number(data.traffic_high_multiplier ?? DEFAULT_PRICING_CONFIG.traffic_high_multiplier),
        convenience_fee_percentage: Number(data.convenience_fee_percentage ?? DEFAULT_PRICING_CONFIG.convenience_fee_percentage),
        convenience_fee_fixed: Number(data.convenience_fee_fixed ?? DEFAULT_PRICING_CONFIG.convenience_fee_fixed),
        min_job_price: Number(data.min_job_price ?? DEFAULT_PRICING_CONFIG.min_job_price),
        platform_commission_percentage: Number(data.platform_commission_percentage ?? DEFAULT_PRICING_CONFIG.platform_commission_percentage),
        token_deduction_percentage: Number(data.token_deduction_percentage ?? DEFAULT_PRICING_CONFIG.token_deduction_percentage),
      });
      cachedRouteData.current = null;
      lastFetchedBroadcastId.current = null;
    } catch { }
  };

  useEffect(() => {
    if (!modalVisible) return;
    fetchPricingConfig();
  }, [modalVisible]);

  const toFiniteNumber = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const isValidCoordinate = (latitude: number, longitude: number): boolean => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    if (latitude < -90 || latitude > 90) return false;
    if (longitude < -180 || longitude > 180) return false;
    if (latitude === 0 && longitude === 0) return false;
    return true;
  };

  const toValidCoordinate = (latitude: unknown, longitude: unknown) => {
    const lat = toFiniteNumber(latitude);
    const lng = toFiniteNumber(longitude);
    if (lat === null || lng === null) return null;
    if (!isValidCoordinate(lat, lng)) return null;
    return { latitude: lat, longitude: lng };
  };

  const sanitizeRouteCoordinates = (coords: any[]): { latitude: number; longitude: number }[] => {
    if (!Array.isArray(coords)) return [];
    return coords
      .map((coord: any) => {
        if (!Array.isArray(coord) || coord.length < 2) return null;
        return toValidCoordinate(coord[1], coord[0]);
      })
      .filter((coord): coord is { latitude: number; longitude: number } => coord !== null);
  };

  const normalizeBroadcast = (raw: any): BroadcastRequest | null => {
    if (!raw || typeof raw !== 'object') return null;
    const validCoord = toValidCoordinate(raw.latitude, raw.longitude);
    if (!validCoord) return null;
    return {
      ...raw,
      latitude: validCoord.latitude,
      longitude: validCoord.longitude,
      services: Array.isArray(raw.services) ? raw.services : [],
      add_ons: Array.isArray(raw.add_ons) ? raw.add_ons : [],
    } as BroadcastRequest;
  };

  const setRegionFromCoords = (latitude: number, longitude: number) => {
    if (!isValidCoordinate(latitude, longitude)) return;
    setRegion({ latitude, longitude, latitudeDelta: 0.0922, longitudeDelta: 0.0421 });
    setCurrentUserLocation({ latitude, longitude });
  };

  const getCurrentPositionWithTimeout = async (
    accuracy: Location.Accuracy,
    timeoutMs: number,
    mayShowUserSettingsDialog?: boolean
  ): Promise<Location.LocationObject | null> => {
    const locationPromise = Location.getCurrentPositionAsync({ accuracy, mayShowUserSettingsDialog });
    const timeoutPromise = new Promise<null>((resolve) => { setTimeout(() => resolve(null), timeoutMs); });
    return Promise.race([locationPromise, timeoutPromise]);
  };

  const initializeMap = async () => {
    if (isInitializingMapRef.current) return;
    isInitializingMapRef.current = true;
    try {
      setMapInitFailed(false);
      setMapInitMessage('Failed to load map location.');
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) { setMapInitFailed(true); setMapInitMessage('Map failed: location services are off. Please enable GPS and refresh.'); return; }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setMapInitFailed(true); setMapInitMessage('Map failed: location permission denied. Tap refresh to try again.'); return; }
      const lastKnown = await Location.getLastKnownPositionAsync({ requiredAccuracy: 150, maxAge: 3 * 60 * 1000 });
      if (lastKnown?.coords) setRegionFromCoords(lastKnown.coords.latitude, lastKnown.coords.longitude);
      let freshLocation: Location.LocationObject | null = null;
      try { freshLocation = await getCurrentPositionWithTimeout(Location.Accuracy.High, 25000, true); }
      catch { try { freshLocation = await getCurrentPositionWithTimeout(Location.Accuracy.Balanced, 15000); } catch { freshLocation = null; } }
      if (freshLocation?.coords) setRegionFromCoords(freshLocation.coords.latitude, freshLocation.coords.longitude);
      else if (!lastKnown?.coords) { setMapInitFailed(true); setMapInitMessage('Map failed: unable to fetch current location. Tap refresh to retry.'); return; }
      if (locationWatchRef.current) { locationWatchRef.current.remove(); locationWatchRef.current = null; }
      locationWatchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 8000, distanceInterval: 10, mayShowUserSettingsDialog: false },
        (loc) => {
          if (!loc?.coords) return;
          const next = toValidCoordinate(loc.coords.latitude, loc.coords.longitude);
          if (!next) return;
          setCurrentUserLocation(next);
        }
      );
    } catch { setMapInitFailed(true); setMapInitMessage('Map failed: location fetch error. Tap refresh to retry.'); }
    finally { isInitializingMapRef.current = false; }
  };

  const retryMapInitialization = async () => { await initializeMap(); };

  const getTrafficClass = (ratio: number) => {
    if (ratio < 1.2) return { level: 'light' as const, emoji: '🟢', label: 'Light Traffic', surchargePercent: Math.max(0, pricingConfig.traffic_low_multiplier - 1), color: '#34C759' };
    if (ratio < 1.5) return { level: 'moderate' as const, emoji: '🟡', label: 'Moderate Traffic', surchargePercent: Math.max(0, pricingConfig.traffic_medium_multiplier - 1), color: '#FFD60A' };
    if (ratio < 2.0) return { level: 'heavy' as const, emoji: '🟠', label: 'Heavy Traffic', surchargePercent: Math.max(0, pricingConfig.traffic_high_multiplier - 1), color: '#FF9500' };
    return { level: 'severe' as const, emoji: '🔴', label: 'Severe Traffic', surchargePercent: Math.max(0, pricingConfig.traffic_high_multiplier - 1), color: '#FF3B30' };
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
      light:    { emoji: '🟢', label: 'Light Traffic',    surchargePercent: Math.max(0, pricingConfig.traffic_low_multiplier - 1),    color: '#34C759' },
      moderate: { emoji: '🟡', label: 'Moderate Traffic', surchargePercent: Math.max(0, pricingConfig.traffic_medium_multiplier - 1), color: '#FFD60A' },
      severe:   { emoji: '🔴', label: 'Severe Traffic',   surchargePercent: Math.max(0, pricingConfig.traffic_high_multiplier - 1),   color: '#FF3B30' },
    };
    const info = mapByLevel[fallbackLevel];
    return { level: fallbackLevel, emoji: info.emoji, label: info.label, surchargePercent: info.surchargePercent, surchargeLabel: `${Math.round(info.surchargePercent * 100)}%`, color: info.color, currentSpeed: 0, freeFlowSpeed: 0, timeNote: '(estimated based on time of day)' };
  };

  const fetchRoute = async (broadcast: BroadcastRequest): Promise<RouteResult> => {
    const currentUserLocation = userLocationRef.current;
    if (!currentUserLocation) throw new Error('User location unavailable');
    if (!ORS_KEY) throw new Error('OpenRouteService key is missing');
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${encodeURIComponent(ORS_KEY)}&start=${currentUserLocation.longitude},${currentUserLocation.latitude}&end=${broadcast.longitude},${broadcast.latitude}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch route');
    const data = await response.json() as any;
    const coordinates = data?.features?.[0]?.geometry?.coordinates;
    const segment = data?.features?.[0]?.properties?.segments?.[0];
    if (!Array.isArray(coordinates) || !segment) throw new Error('Invalid route response');
    const parsedCoords = sanitizeRouteCoordinates(coordinates);
    if (parsedCoords.length < 2) throw new Error('Route has insufficient valid coordinates');
    const distanceKm = Number(segment?.distance || 0) / 1000;
    const etaMinutes = Math.round(Number(segment?.duration || 0) / 60);
    setRouteCoords(parsedCoords);
    return { distanceKm, etaMinutes, coords: parsedCoords };
  };

  const fetchTraffic = async (broadcast: BroadcastRequest): Promise<TrafficData> => {
    try {
      if (!TOMTOM_KEY) throw new Error('TomTom key is missing');
      const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${broadcast.latitude},${broadcast.longitude}&key=${encodeURIComponent(TOMTOM_KEY)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch traffic');
      const data = await response.json() as any;
      const flow = data?.flowSegmentData;
      const currentSpeed = Number(flow?.currentSpeed || 0);
      const freeFlowSpeed = Number(flow?.freeFlowSpeed || 0);
      if (currentSpeed <= 0 || freeFlowSpeed <= 0) throw new Error('Invalid traffic response');
      const classified = getTrafficClass(freeFlowSpeed / currentSpeed);
      return { level: classified.level, emoji: classified.emoji, label: classified.label, surchargePercent: classified.surchargePercent, surchargeLabel: `${Math.round(classified.surchargePercent * 100)}%`, color: classified.color, currentSpeed, freeFlowSpeed };
    } catch { return getTimeBasedTrafficFallback(); }
  };

  const calculateFee = (distanceKm: number, traffic: TrafficData, broadcast: BroadcastRequest) => {
    const freeDistance = Number(pricingConfig.free_distance_km || 0);
    const baseDistanceFee = Number(pricingConfig.base_distance_fee || 0);
    const pricePerKm = Number(pricingConfig.price_per_km || 0);
    const billableKm = Math.max(0, distanceKm - freeDistance);
    const baseFeeApplied = distanceKm > freeDistance ? baseDistanceFee : 0;
    const distanceComponent = billableKm * pricePerKm;
    const travelFee = baseFeeApplied + distanceComponent;
    const surcharge = travelFee * traffic.surchargePercent;
    const serviceTotal = broadcast.services.reduce((sum, s) => sum + (s.minimum_price || 0), 0);
    const addOnsTotal = broadcast.add_ons?.reduce((sum, a) => sum + (a.price || 0), 0) || 0;
    const serviceSubtotal = serviceTotal + addOnsTotal;
    const convFee = (serviceSubtotal * (Number(pricingConfig.convenience_fee_percentage || 0) / 100)) + Number(pricingConfig.convenience_fee_fixed || 0);
    const rawJobAmount = serviceSubtotal + travelFee + surcharge + convFee;
    const overallIncome = Math.max(rawJobAmount, Number(pricingConfig.min_job_price || 0));
    const platformCommission = overallIncome * (Number(pricingConfig.platform_commission_percentage || 0) / 100);
    const netIncome = Math.max(0, overallIncome - platformCommission);
    const minSurcharge = travelFee * Math.max(0, pricingConfig.traffic_low_multiplier - 1);
    const maxSurcharge = travelFee * Math.max(0, pricingConfig.traffic_high_multiplier - 1);
    const minFee = Math.max(serviceSubtotal + travelFee + minSurcharge + convFee, Number(pricingConfig.min_job_price || 0));
    const maxFee = Math.max(serviceSubtotal + travelFee + maxSurcharge + convFee, Number(pricingConfig.min_job_price || 0));
    return { baseFee: baseFeeApplied, distanceFee: distanceComponent, surchargeAmount: surcharge, convenienceFee: convFee, serviceTotal, addOnsTotal, overallIncome, platformCommission, netIncome, minFee, maxFee, isEstimate: true };
  };

  const fetchRouteAndTraffic = async (broadcast: BroadcastRequest) => {
    const currentUserLocation = await waitForUserLocation();
    if (!currentUserLocation) { setRouteError('Location is not available yet.'); return; }
    if (lastFetchedBroadcastId.current === broadcast.id && cachedRouteData.current) {
      setRouteCoords(cachedRouteData.current.routeCoords);
      setTrafficData(cachedRouteData.current.trafficData);
      setFeeData(cachedRouteData.current.feeData);
      setRouteError(null);
      const target = toValidCoordinate(broadcast.latitude, broadcast.longitude);
      if (mapRef.current && target) mapRef.current.fitToCoordinates([{ latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude }, target], { edgePadding: { top: 80, right: 40, bottom: 400, left: 40 }, animated: true });
      return;
    }
    setRouteLoading(true); setRouteError(null);
    try {
      const [routeResult, trafficResult] = await Promise.all([fetchRoute(broadcast), fetchTraffic(broadcast)]);
      const feeResult = calculateFee(routeResult.distanceKm, trafficResult, broadcast);
      const enrichedFee: FeeData = { ...feeResult, distanceKm: routeResult.distanceKm, etaMinutes: routeResult.etaMinutes };
      setTrafficData(trafficResult); setFeeData(enrichedFee);
      cachedRouteData.current = { routeCoords: routeResult.coords, trafficData: trafficResult, feeData: enrichedFee };
      lastFetchedBroadcastId.current = broadcast.id;
      const target = toValidCoordinate(broadcast.latitude, broadcast.longitude);
      if (mapRef.current && target) mapRef.current.fitToCoordinates([{ latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude }, target], { edgePadding: { top: 80, right: 40, bottom: 400, left: 40 }, animated: true });
    } catch {
      const fallbackTraffic = getTimeBasedTrafficFallback();
      const fallbackDistanceKm = getDistanceKm(currentUserLocation, { latitude: broadcast.latitude, longitude: broadcast.longitude });
      const fallbackEtaMinutes = Math.max(1, Math.round((fallbackDistanceKm / 25) * 60));
      const fallbackTarget = toValidCoordinate(broadcast.latitude, broadcast.longitude);
      const fallbackCoords = [{ latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude }, ...(fallbackTarget ? [fallbackTarget] : [])];
      const fallbackFee: FeeData = { ...calculateFee(fallbackDistanceKm, fallbackTraffic, broadcast), distanceKm: fallbackDistanceKm, etaMinutes: fallbackEtaMinutes };
      setRouteCoords(fallbackCoords.length >= 2 ? fallbackCoords : []);
      setTrafficData(fallbackTraffic); setFeeData(fallbackFee); setRouteError(null);
      if (mapRef.current && fallbackCoords.length >= 2) mapRef.current.fitToCoordinates(fallbackCoords, { edgePadding: { top: 80, right: 40, bottom: 400, left: 40 }, animated: true });
    } finally { setRouteLoading(false); }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (userLocationRef.current) fetchBroadcasts(true);
    else { setRefreshing(false); void initializeMap(); }
  };

  const fetchBroadcasts = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const query = new URLSearchParams();
      if (userLocationRef.current) { query.set('mechanic_lat', String(userLocationRef.current.latitude)); query.set('mechanic_lng', String(userLocationRef.current.longitude)); }
      const endpoint = `${API_URL}/bookings/broadcasts/active/${query.toString() ? `?${query.toString()}` : ''}`;
      const response = await fetch(endpoint, { method: 'GET', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error('Failed to fetch broadcasts');
      const data = await response.json() as any;
      const normalized = (Array.isArray(data.broadcasts) ? data.broadcasts : [])
        .map((item: any) => normalizeBroadcast(item))
        .filter((item: BroadcastRequest | null): item is BroadcastRequest => item !== null);
      setBroadcasts(normalized);
    } catch (err: any) { if (!silent) setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleBroadcastPress = async (broadcast: BroadcastRequest) => { setSelectedBroadcast(broadcast); await fetchRouteAndTraffic(broadcast); setModalVisible(true); void fetchTokensBalance(); };
  const handleCardPressShowRoute = async (broadcast: BroadcastRequest) => { setSelectedBroadcast(broadcast); await fetchRouteAndTraffic(broadcast); };
  const handleViewAndAccept = (broadcast: BroadcastRequest) => {
    setSelectedBroadcast(broadcast);
    if (lastFetchedBroadcastId.current === broadcast.id && cachedRouteData.current) {
      setRouteCoords(cachedRouteData.current.routeCoords); setTrafficData(cachedRouteData.current.trafficData); setFeeData(cachedRouteData.current.feeData); setRouteError(null); setRouteLoading(false);
    }
    setModalVisible(true); void fetchTokensBalance();
  };

  const handleBroadcastMarkerPress = (broadcast: BroadcastRequest) => {
    const now = Date.now(); const lastTap = markerTapRef.current[broadcast.id] ?? 0;
    markerTapRef.current[broadcast.id] = now;
    if (now - lastTap < 350) { void handleBroadcastPress(broadcast); return; }
    void handleCardPressShowRoute(broadcast);
  };

  const closeBroadcastModal = () => {
    setModalVisible(false); setRouteCoords([]); setRouteLoading(false); setRouteError(null);
    setTrafficData(null); setFeeData(null); setSelectedBroadcast(null);
    cachedRouteData.current = null; lastFetchedBroadcastId.current = null;
    if (userLocation && mapRef.current) mapRef.current.animateToRegion({ latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }, 1000);
  };

  const handleAcceptBroadcast = async () => {
    if (!selectedBroadcast || !userLocation) return;
    setAccepting(true);
    try {
      const response = await fetch(`${API_URL}/bookings/broadcasts/${selectedBroadcast.id}/accept/`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mechanic_latitude: userLocation.latitude, mechanic_longitude: userLocation.longitude, distance_km: feeData?.distanceKm, traffic_level: trafficData?.level ?? 'unknown', estimated_eta_minutes: feeData?.etaMinutes }),
      });
      const data = await response.json() as any;
      if (response.ok) {
        showNotification({ type: 'success', title: 'Accepted!', message: 'You have accepted the broadcast request. Check your bookings.' });
        closeBroadcastModal(); fetchBroadcasts(true); fetchTokensBalance();
        try { eventBus.emit('walletChanged'); } catch { }
      } else {
        showNotification({ type: 'warning', title: 'Already Taken', message: data.error || 'This broadcast is no longer available. Another mechanic was faster.' });
        closeBroadcastModal(); fetchBroadcasts(true);
      }
    } catch { showNotification({ type: 'error', message: 'Failed to accept broadcast request' }); }
    finally { setAccepting(false); }
  };

  const getTimeRemaining = (expiresAt: string): string => {
    const diff = new Date(expiresAt).getTime() - currentTime;
    if (diff <= 0) return 'Expired';
    return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
  };

  const filteredBroadcasts = useMemo(() => {
    if (!userLocation) return [];
    return broadcasts.filter((broadcast) => {
      const radiusKm = Number(broadcast.radius_km ?? broadcast.search_radius_km ?? 5);
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) return false;
      return getDistanceKm(userLocation, { latitude: broadcast.latitude, longitude: broadcast.longitude }) <= radiusKm;
    });
  }, [broadcasts, userLocation]);

  const routeDistanceDisplay = feeData?.distanceKm?.toFixed(2) ?? '--';
  const routeEtaDisplay = feeData?.etaMinutes ?? '--';
  const requiredTokensPreview = feeData
    ? Math.ceil(Math.max(0, feeData.overallIncome) * (Math.max(0, Number(pricingConfig.token_deduction_percentage || 0)) / 100))
    : (typeof selectedBroadcast?.required_tokens === 'number' ? selectedBroadcast.required_tokens : null);
  const hasInsufficientTokens = requiredTokensPreview !== null && tokensBalance !== null && tokensBalance < requiredTokensPreview;
  const selectedBroadcastCoordinate = selectedBroadcast ? toValidCoordinate(selectedBroadcast.latitude, selectedBroadcast.longitude) : null;
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
          <MapView ref={mapRef} style={styles.map} initialRegion={region} showsUserLocation={true} showsMyLocationButton={true}>
            {!!TOMTOM_KEY && (
              <UrlTile urlTemplate={`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`} maximumZ={22} flipY={false} zIndex={-1} />
            )}
            {routeCoords.length >= 2 && (
              <Polyline coordinates={routeCoords} strokeColor="#FF8C00" strokeWidth={5} geodesic lineCap="round" lineJoin="round" />
            )}
            {filteredBroadcasts.map((broadcast) => (
              <Marker key={`broadcast-${broadcast.id}`} coordinate={{ latitude: broadcast.latitude, longitude: broadcast.longitude }} title="Broadcast Request" description={broadcast.description} pinColor="#34C759" onPress={() => handleBroadcastMarkerPress(broadcast)} />
            ))}
            {selectedBroadcastCoordinate && modalVisible && (
              <Marker coordinate={selectedBroadcastCoordinate} pinColor="#FF3B30" />
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
            <ThemedText style={styles.mapStatsText}>{filteredBroadcasts.length} jobs nearby</ThemedText>
          </View>
          {broadcasts.length > 0 && (
            <View style={[styles.mapStats, { backgroundColor: '#34C75990', marginTop: 8 }]}>
              <FontAwesome name="volume-up" size={14} color="#34C759" />
              <ThemedText style={styles.mapStatsText}>{broadcasts.length} broadcast{broadcasts.length !== 1 ? 's' : ''}</ThemedText>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.myLocationButton} onPress={() => {
          if (userLocation && mapRef.current) { mapRef.current.animateToRegion({ latitude: userLocation.latitude, longitude: userLocation.longitude, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }, 1000); return; }
          void retryMapInitialization();
        }}>
          <FontAwesome name="crosshairs" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.jobListContainer}>
        <ThemedText style={styles.jobListTitle}>Available Jobs</ThemedText>
        <ScrollView style={styles.jobList} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}>
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
              <FontAwesome name="map-marker" size={64} color="#FF8C00" />
              <ThemedText style={styles.emptyText}>No broadcast requests in your area</ThemedText>
              <ThemedText style={styles.emptySubtext}>Check back later or expand your search area</ThemedText>
            </View>
          ) : (
            <>
              {filteredBroadcasts.map((broadcast) => (
                <TouchableOpacity key={`broadcast-${broadcast.id}`} style={[styles.jobCard, styles.broadcastCard]} activeOpacity={0.9} onPress={() => { void handleCardPressShowRoute(broadcast); }}>
                  <View style={styles.jobCardHeader}>
                    <View style={[styles.statusDot, { backgroundColor: '#34C759' }]} />
                    <ThemedText style={styles.jobTitle} numberOfLines={1}>Broadcast Request</ThemedText>
                    <View style={styles.urgentBadge}><ThemedText style={styles.urgentText}>NEW</ThemedText></View>
                  </View>
                  <ThemedText style={styles.broadcastDescription} numberOfLines={2}>{broadcast.description}</ThemedText>
                  <View style={styles.servicesContainer}>
                    {broadcast.services.slice(0, 2).map((service) => (
                      <View key={service.id} style={styles.serviceTag}><ThemedText style={styles.serviceTagText}>{service.name}</ThemedText></View>
                    ))}
                    {broadcast.services.length > 2 && (
                      <View style={styles.serviceTag}><ThemedText style={styles.serviceTagText}>+{broadcast.services.length - 2} more</ThemedText></View>
                    )}
                  </View>
                  <View style={styles.jobCardFooter}>
                    <View style={styles.timerContainer}>
                      <FontAwesome name="clock-o" size={14} color="#FF8C00" />
                      <ThemedText style={styles.timerText}>{getTimeRemaining(broadcast.expires_at)}</ThemedText>
                    </View>
                    <TouchableOpacity style={styles.acceptButton} onPress={() => handleViewAndAccept(broadcast)}>
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

      {/* ── Broadcast Request Detail Modal ── */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={closeBroadcastModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, ms.modalTitle]}>Broadcast Request Details</ThemedText>
              <TouchableOpacity onPress={closeBroadcastModal}>
                <FontAwesome name="times" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedBroadcast && (
                <>
                  <View style={styles.modalTimer}>
                    <FontAwesome name="clock-o" size={20} color="#FF8C00" />
                    <ThemedText style={[styles.modalTimerText, ms.timer]}>
                      Time Remaining: {getTimeRemaining(selectedBroadcast.expires_at)}
                    </ThemedText>
                  </View>

                  {selectedBroadcast.concern_picture && (
                    <View style={styles.modalSection}>
                      <ThemedText style={[styles.modalSectionTitle, ms.sectionTitle]}>Concern Photo</ThemedText>
                      <Image source={{ uri: getImageUrl(selectedBroadcast.concern_picture) || '' }} style={styles.modalConcernImage} resizeMode="cover" />
                    </View>
                  )}

                  <View style={styles.modalSection}>
                    <ThemedText style={[styles.modalSectionTitle, ms.sectionTitle]}>Description</ThemedText>
                    <ThemedText style={[styles.modalText, ms.body]}>{selectedBroadcast.description}</ThemedText>
                  </View>

                  <View style={sx.modalCard}>
                    <View style={sx.cardTitleRow}>
                      <FontAwesome name="car" size={14} color="#FF8C00" />
                      <ThemedText style={[sx.cardTitleText, ms.cardTitle]}>Vehicle Information</ThemedText>
                    </View>
                    <View style={sx.cardRow}>
                      <ThemedText style={[sx.cardRowLabel, ms.label]}>Vehicle Type</ThemedText>
                      <ThemedText style={[sx.cardRowValue, ms.value, !selectedBroadcast.vehicle_type ? { color: '#8E8E93' } : null]}>
                        {selectedBroadcast.vehicle_type || 'Not specified'}
                      </ThemedText>
                    </View>
                    <View style={sx.cardRow}>
                      <ThemedText style={[sx.cardRowLabel, ms.label]}>Brand</ThemedText>
                      <ThemedText style={[sx.cardRowValue, ms.value, !selectedBroadcast.vehicle_brand ? { color: '#8E8E93' } : null]}>
                        {selectedBroadcast.vehicle_brand || 'Not specified'}
                      </ThemedText>
                    </View>
                    <View style={sx.cardRow}>
                      <ThemedText style={[sx.cardRowLabel, ms.label]}>Model</ThemedText>
                      <ThemedText style={[sx.cardRowValue, ms.value, !selectedBroadcast.vehicle_model ? { color: '#8E8E93' } : null]}>
                        {selectedBroadcast.vehicle_model || 'Not specified'}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={sx.modalCard}>
                    <View style={sx.cardTitleRow}>
                      <FontAwesome name="map-marker" size={14} color="#FF8C00" />
                      <ThemedText style={[sx.cardTitleText, ms.cardTitle]}>Route to Client</ThemedText>
                    </View>
                    {routeLoading ? (
                      <View style={sx.routeLoadingWrap}><ActivityIndicator color="#FF8C00" /></View>
                    ) : (
                      <>
                        <ThemedText style={[sx.cardPrimaryText, ms.body]}>Distance: {routeDistanceDisplay} km (via road)</ThemedText>
                        <ThemedText style={[sx.cardSecondaryText, ms.meta]}>ETA: ~{routeEtaDisplay} mins</ThemedText>
                        {routeError ? <ThemedText style={[sx.routeErrorText, ms.meta]}>{routeError}</ThemedText> : null}
                      </>
                    )}
                  </View>

                  {trafficData && (
                    <View style={sx.modalCard}>
                      <View style={sx.cardTitleRow}>
                        <FontAwesome name="road" size={14} color="#FF8C00" />
                        <ThemedText style={[sx.cardTitleText, ms.cardTitle]}>Current Traffic</ThemedText>
                      </View>
                      <ThemedText style={[sx.cardPrimaryText, ms.body, { color: trafficData.color }]}>{trafficData.label}</ThemedText>
                      <ThemedText style={[sx.cardSecondaryText, ms.meta]}>Current speed: {trafficData.currentSpeed} km/h</ThemedText>
                      <ThemedText style={[sx.cardSecondaryText, ms.meta]}>Normal speed: {trafficData.freeFlowSpeed} km/h</ThemedText>
                      <ThemedText style={[sx.cardSecondaryText, ms.meta]}>Surcharge: {trafficData.surchargeLabel}</ThemedText>
                      {trafficData.timeNote ? <ThemedText style={[sx.trafficNoteText, ms.disclaimer]}>{trafficData.timeNote}</ThemedText> : null}
                    </View>
                  )}

                  {feeData && (
                    <View style={sx.modalCard}>
                      <View style={sx.cardTitleRow}>
                        <FontAwesome name="calculator" size={14} color="#FF8C00" />
                        <ThemedText style={[sx.cardTitleText, ms.cardTitle]}>Travel, Traffic & Convenience</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Base Fee</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.baseFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Distance ({feeData.distanceKm.toFixed(2)}km)</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.distanceFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Traffic Surcharge</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.surchargeAmount.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardDivider} />
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabelBold, ms.sectionTitle]}>Convenience Fee</ThemedText>
                        <ThemedText style={[sx.cardRowValueBold, ms.valueBold]}>₱{feeData.convenienceFee.toFixed(2)}</ThemedText>
                      </View>
                      <ThemedText style={[sx.rangeText, ms.meta]}>
                        Estimated total range: ₱{feeData.minFee.toFixed(2)} - ₱{feeData.maxFee.toFixed(2)}
                      </ThemedText>
                    </View>
                  )}

                  <View style={sx.disclaimerCard}>
                    <FontAwesome name="info-circle" size={16} color="#FF8C00" />
                    <ThemedText style={[sx.disclaimerText, ms.disclaimer]}>
                      Once you accept, distance is saved from your accept location. Traffic level and ETA shown here are estimated at acceptance and visible to the client.
                    </ThemedText>
                  </View>

                  <View style={styles.modalSection}>
                    <ThemedText style={[styles.modalSectionTitle, ms.sectionTitle]}>Services Requested</ThemedText>
                    {selectedBroadcast.services.map((service) => (
                      <View key={service.id} style={styles.modalServiceItem}>
                        <View style={styles.modalServiceInfo}>
                          <ThemedText style={[styles.modalServiceName, ms.body]}>{service.name}</ThemedText>
                          <ThemedText style={[styles.modalServiceDesc, ms.meta]}>{service.description}</ThemedText>
                        </View>
                        <ThemedText style={[styles.modalServicePrice, ms.valueBold]}>
                          ₱{parseFloat(String(service.minimum_price || '0')).toFixed(2)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>

                  {selectedBroadcast.add_ons && selectedBroadcast.add_ons.length > 0 && (
                    <View style={styles.modalSection}>
                      <ThemedText style={[styles.modalSectionTitle, ms.sectionTitle]}>Add-ons</ThemedText>
                      {selectedBroadcast.add_ons.map((addon) => (
                        <View key={addon.id} style={styles.modalServiceItem}>
                          <View style={styles.modalServiceInfo}>
                            <ThemedText style={[styles.modalServiceName, ms.body]}>{addon.name}</ThemedText>
                            <ThemedText style={[styles.modalServiceDesc, ms.meta]}>{addon.description}</ThemedText>
                          </View>
                          <ThemedText style={[styles.modalServicePrice, ms.valueBold]}>
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
                        <ThemedText style={[sx.incomeTitleStyle, ms.cardTitle]}>Job Amount Summary</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Services Total</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.serviceTotal.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Add-ons Total</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.addOnsTotal.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Travel Fee</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{(feeData.baseFee + feeData.distanceFee).toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Traffic Surcharge</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.surchargeAmount.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Convenience Fee</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.convenienceFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.cardRowLabel, ms.label]}>Platform Commission</ThemedText>
                        <ThemedText style={[sx.cardRowValue, ms.value]}>₱{feeData.platformCommission.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardDivider} />
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.totalStyleLabel, ms.totalLabel]}>JOB TOTAL</ThemedText>
                        <ThemedText style={[sx.totalStyleValue, ms.totalValue]}>₱{feeData.overallIncome.toFixed(2)}</ThemedText>
                      </View>
                      <View style={sx.cardRow}>
                        <ThemedText style={[sx.totalStyleLabel, ms.totalLabel]}>EST. NET</ThemedText>
                        <ThemedText style={[sx.totalStyleValue, ms.totalValue]}>₱{feeData.netIncome.toFixed(2)}</ThemedText>
                      </View>
                    </View>
                  )}

                  <View style={sx.tokensCard}>
                    <View style={sx.cardTitleRow}>
                      <FontAwesome name="ticket" size={14} color="#FF8C00" />
                      <ThemedText style={[sx.tokensTitle, ms.cardTitle]}>Credits</ThemedText>
                    </View>
                    <View style={sx.tokensRow}>
                      <ThemedText style={[sx.tokensLabel, ms.label]}>Required</ThemedText>
                      <ThemedText style={[sx.tokensValue, ms.value]}>{requiredTokensPreview ?? '--'}</ThemedText>
                    </View>
                    <View style={sx.tokensRow}>
                      <ThemedText style={[sx.tokensLabel, ms.label]}>Balance</ThemedText>
                      <ThemedText style={[sx.tokensValue, ms.value]}>{tokensBalance ?? '--'}</ThemedText>
                    </View>
                    {hasInsufficientTokens && (
                      <ThemedText style={[sx.tokensWarning, ms.warning]}>Insufficient credits. Please top up to accept this job.</ThemedText>
                    )}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalAcceptButton, accepting && styles.modalAcceptButtonDisabled, hasInsufficientTokens ? styles.modalAcceptButtonDisabled : null]}
                onPress={handleAcceptBroadcast}
                disabled={accepting || hasInsufficientTokens}
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
              <TouchableOpacity style={styles.modalCancelButton} onPress={closeBroadcastModal}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}