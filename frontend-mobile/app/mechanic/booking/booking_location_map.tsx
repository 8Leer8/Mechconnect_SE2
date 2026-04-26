import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Callout, Marker, Polyline, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { fetchPricingConfig } from '@/hooks/usePricing';

export const screenOptions = { headerShown: false } as const;

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.EXPO_PUBLIC_ORS_KEY;
const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY;

const LIVE_MAP_STATUSES = new Set(['on_the_way', 'at_location', 'diagnosing']);
function bookingStatusIsLiveTracking(s: string | undefined | null): boolean {
  return LIVE_MAP_STATUSES.has(String(s || '').toLowerCase());
}

type Role = 'mechanic' | 'client';
type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'severe';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type ServiceLocation = {
  street_name?: string | null;
  subdivision_village?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  landmark?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

type BookingDetail = {
  id: number;
  status?: string;
  request?: {
    id?: number;
    type?: string;
    broadcast_request?: {
      latitude?: number | string | null;
      longitude?: number | string | null;
    } | null;
  } | null;
  broadcast_latitude?: number | string | null;
  broadcast_longitude?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location?: {
    barangay?: string | null;
    lat?: number | string | null;
    lng?: number | string | null;
    navigation_allowed?: boolean;
  } | null;
  service_location?: ServiceLocation | null;
  mechanic_location?: {
    latitude?: number | string | null;
    longitude?: number | string | null;
    lat?: number | string | null;
    lng?: number | string | null;
  } | null;
  convenience_fee?: number | string | null;
  distance_km?: number | string | null;
  traffic_level?: string | null;
  estimated_eta_minutes?: number | string | null;
};

type TrafficData = {
  level: TrafficLevel;
  label: 'Light' | 'Moderate' | 'Heavy' | 'Severe';
  emoji: string;
  color: string;
  surchargePercent: number;
  currentSpeed: number;
  freeFlowSpeed: number;
  estimated: boolean;
};

type TrafficMultiplierConfig = {
  traffic_low_multiplier: number;
  traffic_medium_multiplier: number;
  traffic_high_multiplier: number;
};

const DEFAULT_TRAFFIC_MULTIPLIERS: TrafficMultiplierConfig = {
  traffic_low_multiplier: 1,
  traffic_medium_multiplier: 1.25,
  traffic_high_multiplier: 1.5,
};

const MANILA_FALLBACK: Coordinates = {
  latitude: 14.5995,
  longitude: 120.9842,
};

const DEFAULT_TRAFFIC: TrafficData = {
  level: 'moderate',
  label: 'Moderate',
  emoji: '🟡',
  color: '#FFD60A',
  surchargePercent: Math.round(Math.max(0, DEFAULT_TRAFFIC_MULTIPLIERS.traffic_medium_multiplier - 1) * 100),
  currentSpeed: 0,
  freeFlowSpeed: 0,
  estimated: true,
};

function multiplierToPercent(multiplier: number): number {
  return Math.round(Math.max(0, multiplier - 1) * 100);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

function toValidCoordinate(lat: unknown, lng: unknown): Coordinates | null {
  const latitude = toNumber(lat);
  const longitude = toNumber(lng);
  if (latitude === null || longitude === null) return null;
  if (!isValidCoordinate(latitude, longitude)) return null;
  return { latitude, longitude };
}

function isEmergencyPlaceholderText(value: unknown): boolean {
  const text = String(value || '').trim().toLowerCase();
  return text === 'emergency' || text === 'emergency location';
}

function hasValidCoord(lat: unknown, lng: unknown): lat is number {
  return toValidCoordinate(lat, lng) !== null;
}

function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const aHarv = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));

  return R * c;
}

function classifyTraffic(
  ratio: number,
  multipliers: TrafficMultiplierConfig
): Omit<TrafficData, 'currentSpeed' | 'freeFlowSpeed' | 'estimated'> {
  if (ratio < 1.2) {
    return {
      level: 'light',
      label: 'Light',
      emoji: '🟢',
      color: '#34C759',
      surchargePercent: multiplierToPercent(multipliers.traffic_low_multiplier),
    };
  }
  if (ratio < 1.5) {
    return {
      level: 'moderate',
      label: 'Moderate',
      emoji: '🟡',
      color: '#FFD60A',
      surchargePercent: multiplierToPercent(multipliers.traffic_medium_multiplier),
    };
  }
  if (ratio < 2.0) {
    return {
      level: 'heavy',
      label: 'Heavy',
      emoji: '🟠',
      color: '#FF9500',
      surchargePercent: multiplierToPercent(multipliers.traffic_high_multiplier),
    };
  }
  return {
    level: 'severe',
    label: 'Severe',
    emoji: '🔴',
    color: '#FF3B30',
    surchargePercent: multiplierToPercent(multipliers.traffic_high_multiplier),
  };
}

function timeBasedTrafficFallback(multipliers: TrafficMultiplierConfig): TrafficData {
  const hour = new Date().getHours();
  let level: TrafficLevel = 'moderate';

  if (hour >= 0 && hour < 5) level = 'light';
  else if (hour >= 5 && hour < 7) level = 'moderate';
  else if (hour >= 7 && hour < 10) level = 'severe';
  else if (hour >= 10 && hour < 16) level = 'moderate';
  else if (hour >= 17 && hour < 21) level = 'severe';
  else level = 'moderate';

  const byLevel = {
    light: {
      label: 'Light' as const,
      emoji: '🟢',
      color: '#34C759',
      surchargePercent: multiplierToPercent(multipliers.traffic_low_multiplier),
    },
    moderate: {
      label: 'Moderate' as const,
      emoji: '🟡',
      color: '#FFD60A',
      surchargePercent: multiplierToPercent(multipliers.traffic_medium_multiplier),
    },
    heavy: {
      label: 'Heavy' as const,
      emoji: '🟠',
      color: '#FF9500',
      surchargePercent: multiplierToPercent(multipliers.traffic_high_multiplier),
    },
    severe: {
      label: 'Severe' as const,
      emoji: '🔴',
      color: '#FF3B30',
      surchargePercent: multiplierToPercent(multipliers.traffic_high_multiplier),
    },
  };

  const selected = byLevel[level] || byLevel.moderate;

  return {
    level,
    label: selected.label,
    emoji: selected.emoji,
    color: selected.color,
    surchargePercent: selected.surchargePercent,
    currentSpeed: 0,
    freeFlowSpeed: 0,
    estimated: true,
  };
}

function parseMechanicLocationPayload(payload: any): Coordinates | null {
  if (!payload || typeof payload !== 'object') return null;

  const latCandidate =
    payload.latitude ??
    payload.lat ??
    payload.mechanic_location?.latitude ??
    payload.mechanic_location?.lat ??
    payload.location?.latitude ??
    payload.location?.lat;

  const lngCandidate =
    payload.longitude ??
    payload.lng ??
    payload.lon ??
    payload.mechanic_location?.longitude ??
    payload.mechanic_location?.lng ??
    payload.mechanic_location?.lon ??
    payload.location?.longitude ??
    payload.location?.lng ??
    payload.location?.lon;

  return toValidCoordinate(latCandidate, lngCandidate);
}

function parseMechanicLocationFromBooking(bookingData: BookingDetail | null | undefined): Coordinates | null {
  if (!bookingData) return null;
  return parseMechanicLocationPayload(bookingData.mechanic_location);
}

export default function BookingLocationMapScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; role?: Role }>();
  const bookingId = String(params.bookingId || '');
  const role: Role = params.role === 'client' ? 'client' : 'mechanic';

  const mapRef = useRef<MapView>(null);
  const centerOnMeInFlightRef = useRef(false);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRouteRefreshAtRef = useRef(0);
  const routeRequestIdRef = useRef(0);
  const didInitialFitRef = useRef(false);
  /** Only auto fit-to-bounds once when both markers exist; refitting every GPS tick zooms Android map. */
  const didFitBothMarkersRef = useRef(false);
  const lastLocationPushAtRef = useRef(0);
  const lastPushedMechanicCoordsRef = useRef<Coordinates | null>(null);

  const clientCoordsRef = useRef<Coordinates | null>(null);
  const mechanicCoordsRef = useRef<Coordinates | null>(null);

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [status, setStatus] = useState<string>('');

  const [screenLoading, setScreenLoading] = useState(true);
  const [waitingForMechanic, setWaitingForMechanic] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [clientCoords, setClientCoords] = useState<Coordinates | null>(null);
  const [mechanicCoords, setMechanicCoords] = useState<Coordinates | null>(null);
  const [routeCoords, setRouteCoords] = useState<Coordinates[]>([]);
  const routeCoordsRef = useRef<Coordinates[]>([]);

  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [routeEstimated, setRouteEstimated] = useState(false);
  const routeEstimatedRef = useRef(false);

  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [trafficEstimatedNote, setTrafficEstimatedNote] = useState(false);
  const [trafficMultipliers, setTrafficMultipliers] = useState<TrafficMultiplierConfig>(DEFAULT_TRAFFIC_MULTIPLIERS);
  const trafficMultipliersRef = useRef(trafficMultipliers);
  const statusRef = useRef(status);
  const { lastMessage } = useWebSocketContext();
  const lastClientWsRouteRefreshRef = useRef(0);

  useEffect(() => {
    trafficMultipliersRef.current = trafficMultipliers;
  }, [trafficMultipliers]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [lastMechanicUpdateAt, setLastMechanicUpdateAt] = useState<number | null>(null);
  const lastMechanicUpdateAtRef = useRef<number | null>(null);
  const [showSignalLost, setShowSignalLost] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [permissionModalMessage, setPermissionModalMessage] = useState('Please enable location access to continue live tracking.');
  const [arrivedSuccessModalVisible, setArrivedSuccessModalVisible] = useState(false);
  const [travelActionLoading, setTravelActionLoading] = useState<'arrived' | 'cancel' | null>(null);
  const [routeAccordionOpen, setRouteAccordionOpen] = useState(false);
  /** Device GPS speed (km/h) while mechanic is tracking; not the same as TomTom road-segment flow speed. */
  const [gpsSpeedKmh, setGpsSpeedKmh] = useState<number | null>(null);
  const [locatingMe, setLocatingMe] = useState(false);

  const headerTitle = bookingStatusIsLiveTracking(status) ? 'Live Tracking' : 'Route to Client';
  const isOnTheWay = bookingStatusIsLiveTracking(status);
  const isMechanicOnTheWay = role === 'mechanic' && String(status).toLowerCase() === 'on_the_way';

  useEffect(() => {
    clientCoordsRef.current = clientCoords;
  }, [clientCoords]);

  useEffect(() => {
    mechanicCoordsRef.current = mechanicCoords;
  }, [mechanicCoords]);

  useEffect(() => {
    routeCoordsRef.current = routeCoords;
  }, [routeCoords]);

  useEffect(() => {
    routeEstimatedRef.current = routeEstimated;
  }, [routeEstimated]);

  useEffect(() => {
    lastMechanicUpdateAtRef.current = lastMechanicUpdateAt;
  }, [lastMechanicUpdateAt]);

  useEffect(() => {
    let isMounted = true;
    const fetchTrafficMultipliers = async () => {
      try {
        const data = await fetchPricingConfig() as Partial<TrafficMultiplierConfig>;
        if (!isMounted) return;
        setTrafficMultipliers({
          traffic_low_multiplier: Number(data.traffic_low_multiplier ?? DEFAULT_TRAFFIC_MULTIPLIERS.traffic_low_multiplier),
          traffic_medium_multiplier: Number(data.traffic_medium_multiplier ?? DEFAULT_TRAFFIC_MULTIPLIERS.traffic_medium_multiplier),
          traffic_high_multiplier: Number(data.traffic_high_multiplier ?? DEFAULT_TRAFFIC_MULTIPLIERS.traffic_high_multiplier),
        });
      } catch {
        // Keep defaults when config endpoint is unavailable.
      }
    };

    fetchTrafficMultipliers();
    return () => {
      isMounted = false;
    };
  }, []);

  const cleanupLiveResources = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }

    if (staleCheckIntervalRef.current) {
      clearInterval(staleCheckIntervalRef.current);
      staleCheckIntervalRef.current = null;
    }

    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }

    setGpsSpeedKmh(null);
  }, []);

  const openTrackingPermissionModal = useCallback((message: string) => {
    setPermissionModalMessage(message);
    setPermissionModalVisible(true);
  }, []);

  const openAppLocationSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // Ignore settings launch errors and keep modal visible.
    }
  }, []);

  const fetchBooking = useCallback(async (): Promise<BookingDetail> => {
    if (!API_URL) throw new Error('Missing API URL configuration');
    if (!bookingId) throw new Error('Missing booking ID');

    const endpoint =
      role === 'mechanic'
        ? `${API_URL}/bookings/mechanic/bookings/${bookingId}/`
        : `${API_URL}/bookings/bookings/${bookingId}/`;

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) throw new Error('Failed to fetch booking details');

    const data = await response.json();
    return (data?.booking || data) as BookingDetail;
  }, [bookingId, role]);

  const resolveClientCoordinates = useCallback(async (bookingData: BookingDetail | null | undefined): Promise<Coordinates | null> => {
    if (!bookingData) return null;

    if (bookingData.location?.navigation_allowed === false) {
      return null;
    }

    const serviceLat = bookingData?.service_location?.latitude;
    const serviceLng = bookingData?.service_location?.longitude;
    if (hasValidCoord(serviceLat, serviceLng)) {
      return toValidCoordinate(serviceLat, serviceLng);
    }

    const bookingLocLat = bookingData?.location?.lat;
    const bookingLocLng = bookingData?.location?.lng;
    if (hasValidCoord(bookingLocLat, bookingLocLng)) {
      return toValidCoordinate(bookingLocLat, bookingLocLng);
    }

    const broadcastLat =
      bookingData?.request?.broadcast_request?.latitude ??
      bookingData?.broadcast_latitude ??
      bookingData?.latitude;
    const broadcastLng =
      bookingData?.request?.broadcast_request?.longitude ??
      bookingData?.broadcast_longitude ??
      bookingData?.longitude;

    if (hasValidCoord(broadcastLat, broadcastLng)) {
      return toValidCoordinate(broadcastLat, broadcastLng);
    }

    const loc = bookingData.service_location;
    if (!loc) return null;

    const street = String(loc.street_name || '').trim();
    const barangay = String(loc.barangay || '').trim();
    const city = String(loc.city_municipality || '').trim();
    const looksLikeEmergencyPlaceholder =
      isEmergencyPlaceholderText(street) ||
      isEmergencyPlaceholderText(barangay) ||
      isEmergencyPlaceholderText(city);

    if (looksLikeEmergencyPlaceholder) {
      return null;
    }

    const isPlusCode = street.includes('+') || /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}$/i.test(street);

    if (!isPlusCode) {
      const strictAddress = [
        street,
        barangay,
        city,
        'Philippines',
      ]
        .filter(Boolean)
        .join(', ');

      if (strictAddress.trim()) {
        const query = encodeURIComponent(strictAddress);
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ph`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'MechConnect/1.0' },
        });

        if (response.ok) {
          const result = await response.json();
          if (Array.isArray(result) && result.length > 0) {
            const coord = toValidCoordinate(result[0]?.lat, result[0]?.lon);
            if (coord) return coord;
          }
        }
      }
    }

    if (city) {
      const cityQuery = encodeURIComponent(`${city}, Philippines`);
      const cityUrl = `https://nominatim.openstreetmap.org/search?q=${cityQuery}&format=json&limit=1&countrycodes=ph`;
      const cityResponse = await fetch(cityUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'MechConnect/1.0' },
      });

      if (cityResponse.ok) {
        const cityResult = await cityResponse.json();
        if (Array.isArray(cityResult) && cityResult.length > 0) {
          const coord = toValidCoordinate(cityResult[0]?.lat, cityResult[0]?.lon);
          if (coord) return coord;
        }
      }
    }

    return null;
  }, []);

  const fetchMechanicCoordinatesForClient = useCallback(async (): Promise<Coordinates | null> => {
    if (!API_URL || !bookingId) return null;

    const response = await fetch(`${API_URL}/bookings/${bookingId}/mechanic-location/`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) throw new Error('Mechanic location unavailable');

    const payload = await response.json();
    return parseMechanicLocationPayload(payload);
  }, [bookingId]);

  const refreshBookingForClientTracking = useCallback(async (): Promise<Coordinates | null> => {
    const bookingData = await fetchBooking();
    const bookingStatus = String(bookingData?.status || '');
    const nextClientCoords = await resolveClientCoordinates(bookingData);
    const nextMechanicCoords = parseMechanicLocationFromBooking(bookingData);

    setBooking(bookingData);
    setStatus(bookingStatus);
    if (nextClientCoords) setClientCoords(nextClientCoords);
    if (nextMechanicCoords) {
      setMechanicCoords(nextMechanicCoords);
      setWaitingForMechanic(false);
      setLastMechanicUpdateAt(Date.now());
      setShowSignalLost(false);

      if (nextClientCoords && bookingStatusIsLiveTracking(bookingStatus)) {
        refreshRouteAndTraffic(nextMechanicCoords, nextClientCoords, bookingStatus).catch(() => {
          // Keep existing route if a recalculation fails.
        });
      }
    }

    return nextMechanicCoords;
  }, [fetchBooking, refreshRouteAndTraffic, resolveClientCoordinates]);

  const resolveMechanicCoordinates = useCallback(async (currentStatus: string): Promise<Coordinates | null> => {
    if (role === 'mechanic') {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (bookingStatusIsLiveTracking(currentStatus)) {
            openTrackingPermissionModal('Location services are turned off. Please enable GPS for live tracking.');
          }
          return MANILA_FALLBACK;
        }

        const permission = await ensureForegroundLocationAccess();
        if (!permission.granted) {
          if (bookingStatusIsLiveTracking(currentStatus)) {
            openTrackingPermissionModal('Location permission is required for live tracking. Please allow location access.');
          }
          return MANILA_FALLBACK;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        return toValidCoordinate(current.coords.latitude, current.coords.longitude) ?? MANILA_FALLBACK;
      } catch {
        return MANILA_FALLBACK;
      }
    }

    if (bookingStatusIsLiveTracking(currentStatus)) {
      try {
        return await fetchMechanicCoordinatesForClient();
      } catch {
        return null;
      }
    }

    return null;
  }, [fetchMechanicCoordinatesForClient, openTrackingPermissionModal, role]);

  const parseRouteResponse = useCallback(async (response: Response) => {
    if (!response.ok) throw new Error('Failed to fetch route from ORS');
    const data = await response.json();
    const feature = data?.features?.[0];
    const segment = feature?.properties?.segments?.[0];
    const coordinates = feature?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || !segment) {
      throw new Error('Invalid ORS response');
    }

    const points = coordinates
      .map((c: number[]) => {
        if (!Array.isArray(c) || c.length < 2) return null;
        return toValidCoordinate(c[1], c[0]);
      })
      .filter((point): point is Coordinates => point !== null);

    if (points.length < 2) throw new Error('Empty route coordinates');

    return {
      points,
      distanceKm: Number(segment.distance || 0) / 1000,
      etaMinutes: Math.round(Number(segment.duration || 0) / 60),
    };
  }, []);

  const calculateRoute = useCallback(async (from: Coordinates, to: Coordinates) => {
    if (!ORS_KEY) throw new Error('Missing ORS key');

    const queryUrl =
      `https://api.openrouteservice.org/v2/directions/driving-car` +
      `?api_key=${encodeURIComponent(ORS_KEY)}` +
      `&start=${from.longitude},${from.latitude}` +
      `&end=${to.longitude},${to.latitude}`;

    try {
      return await parseRouteResponse(await fetch(queryUrl));
    } catch {
      const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: ORS_KEY,
        },
        body: JSON.stringify({
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
          radiuses: [1000, 1000],
        }),
      });

      return parseRouteResponse(response);
    }
  }, [parseRouteResponse]);

  const calculateTraffic = useCallback(async (from: Coordinates, to: Coordinates): Promise<TrafficData> => {
    if (!TOMTOM_KEY) throw new Error('Missing TomTom key');

    const midLat = (from.latitude + to.latitude) / 2;
    const midLng = (from.longitude + to.longitude) / 2;

    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${midLat},${midLng}&key=${encodeURIComponent(TOMTOM_KEY)}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error('Failed to fetch traffic data');

    const payload = await response.json();
    const flow = payload?.flowSegmentData;
    const currentSpeed = Number(flow?.currentSpeed || 0);
    const freeFlowSpeed = Number(flow?.freeFlowSpeed || 0);

    if (!currentSpeed || !freeFlowSpeed) throw new Error('Invalid traffic response');

    const ratio = freeFlowSpeed / currentSpeed;
    const classified = classifyTraffic(ratio, trafficMultipliersRef.current);

    return {
      ...classified,
      currentSpeed,
      freeFlowSpeed,
      estimated: false,
    };
  }, []);

  const refreshRouteAndTraffic = useCallback(async (from: Coordinates, to: Coordinates, currentStatus: string) => {
    const routeRequestId = routeRequestIdRef.current + 1;
    routeRequestIdRef.current = routeRequestId;
    let nextDistance: number | null = null;
    let nextEta: number | null = null;
    const isLatestRouteRequest = () => routeRequestId === routeRequestIdRef.current;

    try {
      const routeResult = await calculateRoute(from, to);
      if (!isLatestRouteRequest()) return null;
      setRouteCoords(routeResult.points);
      setDistanceKm(routeResult.distanceKm);
      setEtaMinutes(routeResult.etaMinutes);
      setRouteEstimated(false);
      nextDistance = routeResult.distanceKm;
      nextEta = routeResult.etaMinutes;
    } catch {
      const fallbackDistance = haversineDistanceKm(from, to);
      const fallbackEta = Math.max(1, Math.round((fallbackDistance / 25) * 60));
      const previousRoute = routeCoordsRef.current;
      const hasLastGoodRoadRoute = previousRoute.length >= 2 && !routeEstimatedRef.current;

      if (!isLatestRouteRequest()) return null;
      setRouteCoords(hasLastGoodRoadRoute ? previousRoute : [from, to]);
      setDistanceKm(fallbackDistance);
      setEtaMinutes(fallbackEta);
      setRouteEstimated(!hasLastGoodRoadRoute);

      nextDistance = fallbackDistance;
      nextEta = fallbackEta;
    }

    if (bookingStatusIsLiveTracking(currentStatus)) {
      try {
        const trafficData = await calculateTraffic(from, to);
        if (!isLatestRouteRequest()) return null;
        setTraffic(trafficData);
        setTrafficEstimatedNote(false);
      } catch {
        const fallback = timeBasedTrafficFallback(trafficMultipliersRef.current);
        if (!isLatestRouteRequest()) return null;
        setTraffic(fallback);
        setTrafficEstimatedNote(true);
      }
    } else {
      setTraffic(null);
      setTrafficEstimatedNote(false);
    }

    if (nextDistance !== null && nextEta !== null) {
      return { distanceKm: nextDistance, etaMinutes: nextEta };
    }

    return null;
  }, [calculateRoute, calculateTraffic]);

  const initializeScreen = useCallback(async () => {
    cleanupLiveResources();
    didInitialFitRef.current = false;
    didFitBothMarkersRef.current = false;

    setScreenLoading(true);
    setWaitingForMechanic(false);
    setBookingError(null);
    setLocationError(null);
    setShowSignalLost(false);
    setLastMechanicUpdateAt(null);
    setGpsSpeedKmh(null);

    try {
      const bookingData = await fetchBooking();
      const bookingStatus = String(bookingData?.status || '');

      setBooking(bookingData);
      setStatus(bookingStatus);

      if (bookingData?.location?.navigation_allowed === false || bookingStatus === 'completed') {
        setLocationError('Exact client location is hidden after job completion.');
        setScreenLoading(false);
        return;
      }

      const resolvedClientCoords = await resolveClientCoordinates(bookingData);
      if (!resolvedClientCoords) {
        const city = bookingData?.service_location?.city_municipality || 'client location';
        setLocationError(`Could not load map for ${city}`);
        setScreenLoading(false);
        return;
      }

      setClientCoords(resolvedClientCoords);

      const resolvedMechanicCoords =
        role === 'client'
          ? (parseMechanicLocationFromBooking(bookingData) || await resolveMechanicCoordinates(bookingStatus))
          : await resolveMechanicCoordinates(bookingStatus);
      setMechanicCoords(resolvedMechanicCoords);

      if (resolvedMechanicCoords) {
        await refreshRouteAndTraffic(resolvedMechanicCoords, resolvedClientCoords, bookingStatus);
        setLastMechanicUpdateAt(Date.now());
      } else {
        if (role === 'client' && bookingStatusIsLiveTracking(bookingStatus)) {
          setWaitingForMechanic(true);
        }

        setRouteCoords([]);

        const bookingDistance = toNumber(bookingData.distance_km);
        const bookingEta = toNumber(bookingData.estimated_eta_minutes);

        setDistanceKm(bookingDistance);
        setEtaMinutes(bookingEta ? Math.round(bookingEta) : null);
        setRouteEstimated(false);

        if (bookingStatusIsLiveTracking(bookingStatus)) {
          const baselineTraffic = String(bookingData.traffic_level || '').toLowerCase();
          if (baselineTraffic === 'light' || baselineTraffic === 'low' || baselineTraffic === 'moderate' || baselineTraffic === 'medium' || baselineTraffic === 'heavy' || baselineTraffic === 'high' || baselineTraffic === 'severe') {
            const preset = classifyTraffic(
              baselineTraffic === 'light' || baselineTraffic === 'low' ? 1.1 :
              (baselineTraffic === 'moderate' || baselineTraffic === 'medium' ? 1.3 :
                (baselineTraffic === 'heavy' || baselineTraffic === 'high' ? 1.7 : 2.1)),
              trafficMultipliersRef.current
            );
            setTraffic({
              ...preset,
              currentSpeed: 0,
              freeFlowSpeed: 0,
              estimated: true,
            });
            setTrafficEstimatedNote(true);
          } else {
            setTraffic({
              ...DEFAULT_TRAFFIC,
              surchargePercent: multiplierToPercent(trafficMultipliersRef.current.traffic_medium_multiplier),
            });
            setTrafficEstimatedNote(true);
          }
        } else {
          setTraffic(null);
          setTrafficEstimatedNote(false);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load booking details';
      setBookingError(message);
    } finally {
      setScreenLoading(false);
    }
  }, [cleanupLiveResources, fetchBooking, refreshRouteAndTraffic, resolveClientCoordinates, resolveMechanicCoordinates, role]);

  const postMechanicBookingAction = useCallback(
    async (endpoint: string, body: Record<string, unknown> = {}) => {
      if (!API_URL || !bookingId) throw new Error('Missing configuration');
      const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/${endpoint}/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        const msg = typeof data.error === 'string' && data.error.trim() ? data.error : `Update failed (${res.status})`;
        throw new Error(msg);
      }
      return data;
    },
    [bookingId]
  );

  const handleCenterOnMyLocation = useCallback(async () => {
    if (role !== 'mechanic') return;
    if (centerOnMeInFlightRef.current) return;
    centerOnMeInFlightRef.current = true;
    setLocatingMe(true);
    try {
      const permission = await ensureForegroundLocationAccess();
      if (!permission.granted) {
        Alert.alert('Location', 'Allow location access to center the map on your position.');
        return;
      }

      let target: Coordinates | null = null;
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        target = toValidCoordinate(pos.coords.latitude, pos.coords.longitude);
      } catch {
        target = null;
      }

      if (!target) {
        target = mechanicCoordsRef.current;
      }

      if (!target || !isValidCoordinate(target.latitude, target.longitude)) {
        Alert.alert('Location', 'Could not get your current position. Try again.');
        return;
      }

      setMechanicCoords(target);
      mapRef.current?.animateToRegion(
        {
          latitude: target.latitude,
          longitude: target.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        500
      );
    } finally {
      centerOnMeInFlightRef.current = false;
      setLocatingMe(false);
    }
  }, [role]);

  const openNavToClient = useCallback(() => {
    const c = clientCoordsRef.current;
    if (!c || !isValidCoordinate(c.latitude, c.longitude)) {
      Alert.alert('Location', 'Client location is not ready yet.');
      return;
    }
    const lat = c.latitude;
    const lng = c.longitude;
    const web = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const primary =
      Platform.OS === 'ios'
        ? `maps:/?daddr=${lat},${lng}&dirflg=d`
        : `google.navigation:q=${lat},${lng}`;
    Linking.canOpenURL(primary)
      .then((ok) => (ok ? Linking.openURL(primary) : Linking.openURL(web)))
      .catch(() => {
        Linking.openURL(web).catch(() => {});
      });
  }, []);

  const handleMechanicArrivedFromMap = useCallback(async () => {
    if (travelActionLoading) return;
    setTravelActionLoading('arrived');
    try {
      await postMechanicBookingAction('arrived');
      await initializeScreen();
      setArrivedSuccessModalVisible(true);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setTravelActionLoading(null);
    }
  }, [travelActionLoading, postMechanicBookingAction, initializeScreen]);

  const handleMechanicCancelTravelFromMap = useCallback(() => {
    Alert.alert('Cancel travel?', 'Your booking will go back to booked.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Cancel travel',
        style: 'destructive',
        onPress: () => {
          setTravelActionLoading('cancel');
          postMechanicBookingAction('cancel-travel')
            .then(() => {
              Alert.alert('Travel cancelled');
              router.back();
            })
            .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not cancel'))
            .finally(() => setTravelActionLoading(null));
        },
      },
    ]);
  }, [postMechanicBookingAction]);

  const retryLocationResolution = useCallback(async () => {
    if (!booking) return;

    setLocationError(null);
    setScreenLoading(true);

    try {
      const resolved = await resolveClientCoordinates(booking);
      if (!resolved) {
        const city = booking?.service_location?.city_municipality || 'client location';
        setLocationError(`Could not load map for ${city}`);
        return;
      }

      setClientCoords(resolved);

      if (mechanicCoordsRef.current) {
        await refreshRouteAndTraffic(mechanicCoordsRef.current, resolved, status);
      }
    } catch {
      const city = booking?.service_location?.city_municipality || 'client location';
      setLocationError(`Could not load map for ${city}`);
    } finally {
      setScreenLoading(false);
    }
  }, [booking, refreshRouteAndTraffic, resolveClientCoordinates, status]);

  useEffect(() => {
    initializeScreen();
    return () => cleanupLiveResources();
  }, [initializeScreen, cleanupLiveResources]);

  useEffect(() => {
    if (!isOnTheWay || !clientCoords) {
      cleanupLiveResources();
      return;
    }

    if (role === 'mechanic') {
      let isMounted = true;

      const pushLocationToBackend = (coords: Coordinates, forceRefresh = false) => {
        if (!API_URL || !bookingId) return;
        const now = Date.now();
        const lastCoords = lastPushedMechanicCoordsRef.current;
        const movedEnough = !lastCoords || haversineDistanceKm(lastCoords, coords) >= 0.01;
        const waitedEnough = now - lastLocationPushAtRef.current >= 8000;

        if (!forceRefresh && (!movedEnough || !waitedEnough)) return;
        if (forceRefresh && !movedEnough && now - lastLocationPushAtRef.current < 15000) return;

        lastLocationPushAtRef.current = now;
        lastPushedMechanicCoordsRef.current = coords;
        fetch(`${API_URL}/bookings/${bookingId}/mechanic-location/`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: coords.latitude, longitude: coords.longitude }),
        }).catch(() => {
          // Non-fatal: backend push failures don't affect local tracking.
        });
      };

      (async () => {
        try {
          const servicesEnabled = await Location.hasServicesEnabledAsync();
          if (!servicesEnabled) {
            openTrackingPermissionModal('Location services are turned off. Please enable GPS for live tracking.');
            return;
          }

          const permission = await ensureForegroundLocationAccess();
          if (!permission.granted) {
            openTrackingPermissionModal('Location permission is required for live tracking. Please allow location access.');
            return;
          }

          const watcher = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 10,
            },
            (location) => {
              if (!isMounted) return;
              const next = toValidCoordinate(location.coords.latitude, location.coords.longitude);
              if (!next) return;
              setMechanicCoords(next);
              setLastMechanicUpdateAt(Date.now());
              pushLocationToBackend(next);

              const speedMs = location.coords.speed;
              if (speedMs != null && Number.isFinite(speedMs) && speedMs >= 0) {
                setGpsSpeedKmh(Math.round(speedMs * 3.6));
              } else {
                setGpsSpeedKmh(null);
              }

              // Near-realtime reroute while moving (GTA-like line updates), throttled to protect APIs.
              const to = clientCoordsRef.current;
              const now = Date.now();
              if (to && now - lastRouteRefreshAtRef.current >= 10000) {
                lastRouteRefreshAtRef.current = now;
                refreshRouteAndTraffic(next, to, status).catch(() => {
                  // Keep existing route if a recalculation fails.
                });
              }
            }
          );

          watcherRef.current = watcher;

          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          const immediateCoords = toValidCoordinate(current.coords.latitude, current.coords.longitude);
          if (immediateCoords && isMounted) {
            setMechanicCoords(immediateCoords);
            setLastMechanicUpdateAt(Date.now());
            pushLocationToBackend(immediateCoords);
          }
        } catch {
          // Keep existing coordinates if watcher setup fails.
        }
      })();

      // Keep a slower backup push in case the GPS watcher fires less often.
      const locationPushInterval = setInterval(() => {
        const coords = mechanicCoordsRef.current;
        if (coords) pushLocationToBackend(coords, true);
      }, 15000);

      updateIntervalRef.current = setInterval(() => {
        const from = mechanicCoordsRef.current;
        const to = clientCoordsRef.current;
        if (!from || !to) return;
        refreshRouteAndTraffic(from, to, status).catch(() => {
          // Realtime refresh failures are reflected by existing fallback state.
        });
      }, 30000);

      return () => {
        isMounted = false;
        clearInterval(locationPushInterval);
        cleanupLiveResources();
      };
    }

    // Client follows mechanic via websocket first, with HTTP polling fallback.

    let isMounted = true;

    const pullMechanicLocation = async () => {
      try {
        let coords: Coordinates | null = null;
        try {
          coords = await fetchMechanicCoordinatesForClient();
        } catch {
          coords = null;
        }
        if (!coords) {
          coords = await refreshBookingForClientTracking();
        }
        if (!isMounted || !coords) return;
        setMechanicCoords(coords);
        setWaitingForMechanic(false);
        setLastMechanicUpdateAt(Date.now());
        setShowSignalLost(false);

        const to = clientCoordsRef.current;
        if (!to || !bookingStatusIsLiveTracking(statusRef.current)) return;
        refreshRouteAndTraffic(coords, to, statusRef.current).catch(() => {
          // Keep last polyline if routing fails.
        });
      } catch {
        // Keep waiting banner visible while mechanic has not shared GPS.
      }
    };

    pullMechanicLocation();
    pollIntervalRef.current = setInterval(() => {
      pullMechanicLocation();
    }, 10000);

    staleCheckIntervalRef.current = setInterval(() => {
      const last = lastMechanicUpdateAtRef.current;
      if (last === null) {
        setShowSignalLost(false);
        return;
      }
      setShowSignalLost(Date.now() - last > 30000);
    }, 5000);

    return () => {
      isMounted = false;
      cleanupLiveResources();
    };
  }, [bookingId, cleanupLiveResources, clientCoords, fetchMechanicCoordinatesForClient, isOnTheWay, openTrackingPermissionModal, refreshBookingForClientTracking, refreshRouteAndTraffic, role, status]);

  // Client: mechanic GPS from websocket (backend broadcasts after each POST /mechanic-location/).
  useEffect(() => {
    if (role !== 'client') return;
    if (!lastMessage) return;
    if (String(lastMessage.action || '').toLowerCase() !== 'mechanic_location_update') return;
    if (!bookingId || String(lastMessage.booking_id || '') !== String(bookingId)) return;

    const coords = parseMechanicLocationPayload(lastMessage);
    if (!coords) return;

    setMechanicCoords(coords);
    setWaitingForMechanic(false);
    setLastMechanicUpdateAt(Date.now());
    setShowSignalLost(false);

    const to = clientCoordsRef.current;
    if (!to || !bookingStatusIsLiveTracking(statusRef.current)) return;

    const now = Date.now();
    if (now - lastClientWsRouteRefreshRef.current < 10000) return;
    lastClientWsRouteRefreshRef.current = now;

    refreshRouteAndTraffic(coords, to, statusRef.current).catch(() => {
      // Keep last polyline if routing fails.
    });
  }, [lastMessage, role, bookingId, refreshRouteAndTraffic]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (clientCoords && mechanicCoords) {
      if (!didFitBothMarkersRef.current) {
        didFitBothMarkersRef.current = true;
        const mechanic = mechanicCoords;
        const client = clientCoords;
        setTimeout(() => {
          try {
            mapRef.current?.fitToCoordinates([mechanic, client], {
              edgePadding: { top: 80, right: 40, bottom: 250, left: 40 },
              animated: true,
            });
            didInitialFitRef.current = true;
          } catch {
            // Keep current map viewport if fitting fails.
          }
        }, 500);
      }
      return;
    }

    if (!mechanicCoords) {
      didFitBothMarkersRef.current = false;
    }

    if (clientCoords && !didInitialFitRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: clientCoords.latitude,
          longitude: clientCoords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
      didInitialFitRef.current = true;
      return;
    }

    if (mechanicCoords && !didInitialFitRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: mechanicCoords.latitude,
          longitude: mechanicCoords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
      didInitialFitRef.current = true;
    }
  }, [clientCoords, mechanicCoords]);

  const formattedLastUpdated = useMemo(() => {
    if (!lastMechanicUpdateAt) return '--';

    const diffSeconds = Math.max(0, Math.floor((Date.now() - lastMechanicUpdateAt) / 1000));
    if (diffSeconds < 10) return 'just now';
    if (diffSeconds < 60) return `${diffSeconds} seconds ago`;

    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }, [lastMechanicUpdateAt]);

  const initialRegion = useMemo(() => {
    const anchor = clientCoords || mechanicCoords || MANILA_FALLBACK;
    return {
      latitude: anchor.latitude,
      longitude: anchor.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [clientCoords, mechanicCoords]);

  if (bookingError) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>{headerTitle}</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{bookingError}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={initializeScreen}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  if (locationError) {
    const isPrivacyLocked = locationError.toLowerCase().includes('hidden after job completion');
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>{headerTitle}</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{locationError}</ThemedText>
          {!isPrivacyLocked && (
            <TouchableOpacity style={styles.retryButton} onPress={retryLocationResolution}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>
    );
  }

  if (screenLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>{headerTitle}</ThemedText>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <ThemedText style={styles.loadingText}>Loading route details...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const routeColor = routeEstimated ? '#64748B' : '#007AFF';
  const routeDashPattern = routeEstimated ? [10, 8] : undefined;
  const distanceLabel = distanceKm !== null ? `${distanceKm.toFixed(1)} km` : '--';
  const etaLabel = etaMinutes !== null ? `~${etaMinutes} mins` : '--';
  const clientCalloutTitle = role === 'client' ? 'You' : 'Client';
  const mechanicCalloutTitle = role === 'mechanic' ? 'You' : 'Mechanic';
  const safeMechanicCoords = mechanicCoords && isValidCoordinate(mechanicCoords.latitude, mechanicCoords.longitude)
    ? mechanicCoords
    : null;
  const safeClientCoords = clientCoords && isValidCoordinate(clientCoords.latitude, clientCoords.longitude)
    ? clientCoords
    : null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{headerTitle}</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      {waitingForMechanic && role === 'client' ? (
        <View style={styles.waitingBanner}>
          <ThemedText style={styles.waitingBannerText}>
            Waiting for mechanic GPS. Your map is ready — it will jump to their location when they share it.
          </ThemedText>
        </View>
      ) : null}

      <View style={styles.mapWrap}>
        <MapView ref={mapRef} style={styles.map} initialRegion={initialRegion}>
          {!!TOMTOM_KEY && (
            <UrlTile
              urlTemplate={`https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${TOMTOM_KEY}`}
              maximumZ={22}
              flipY={false}
              zIndex={-1}
            />
          )}

          {routeCoords.length >= 2 && (
            <>
              <Polyline
                coordinates={routeCoords}
                strokeWidth={8}
                strokeColor="rgba(255,255,255,0.9)"
                lineCap="round"
                lineJoin="round"
                lineDashPattern={routeDashPattern}
                zIndex={1}
              />
              <Polyline
                coordinates={routeCoords}
                strokeWidth={4}
                strokeColor={routeColor}
                lineCap="round"
                lineJoin="round"
                lineDashPattern={routeDashPattern}
                zIndex={2}
              />
            </>
          )}

          {/* Client service location — always a clear pin (custom view works better than pinColor on iOS). */}
          {safeClientCoords ? (
            <Marker
              identifier="client-service-location"
              coordinate={safeClientCoords}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={2}
            >
              <View style={[styles.preciseMarkerDot, styles.clientMarkerDot]} pointerEvents="box-none">
                <View style={[styles.preciseMarkerCore, styles.clientMarkerCore]} />
              </View>
              <Callout tooltip>
                <View style={styles.calloutBox}>
                  <ThemedText style={styles.calloutTitle}>{clientCalloutTitle}</ThemedText>
                  <ThemedText style={styles.calloutSub}>
                    {role === 'client' ? 'Your service location' : 'Client service location'}
                  </ThemedText>
                </View>
              </Callout>
            </Marker>
          ) : null}

          {safeMechanicCoords ? (
            <Marker
              identifier="mechanic-position"
              coordinate={safeMechanicCoords}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={3}
            >
              <View style={[styles.preciseMarkerDot, styles.mechanicMarkerDot]} pointerEvents="box-none">
                <View style={[styles.preciseMarkerCore, styles.mechanicMarkerCore]} />
              </View>
              <Callout tooltip>
                <View style={styles.calloutBox}>
                  <ThemedText style={styles.calloutTitle}>{mechanicCalloutTitle}</ThemedText>
                  <ThemedText style={styles.calloutSub}>
                    {role === 'mechanic' ? 'Your current location' : 'Mechanic live location'}
                  </ThemedText>
                </View>
              </Callout>
            </Marker>
          ) : null}
        </MapView>

        <View style={styles.legendChip} pointerEvents="none">
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#FF8C00' }]} />
            <ThemedText style={styles.legendText}>{role === 'mechanic' ? 'You' : 'Mechanic'}</ThemedText>
          </View>
          <View style={styles.legendDivider} />
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
            <ThemedText style={styles.legendText}>{role === 'client' ? 'You' : 'Client'}</ThemedText>
          </View>
        </View>

        {role === 'mechanic' ? (
          <TouchableOpacity
            style={styles.locateMeButton}
            onPress={handleCenterOnMyLocation}
            activeOpacity={0.8}
            disabled={locatingMe}
          >
            {locatingMe ? (
              <ActivityIndicator size="small" color="#FF8C00" />
            ) : (
              <FontAwesome name="location-arrow" size={20} color="#FF8C00" />
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        style={[
          styles.infoCard,
          isOnTheWay && styles.infoCardLiveRouteCollapsed,
          isOnTheWay && routeAccordionOpen && styles.infoCardLiveRouteExpanded,
        ]}
      >
        {isOnTheWay ? (
          <>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => setRouteAccordionOpen((open) => !open)}
              activeOpacity={0.75}
            >
              <View style={styles.accordionHeaderTextWrap}>
                <ThemedText style={styles.infoTitleAccordion}>Mechanic Route</ThemedText>
                <ThemedText style={styles.accordionSummary}>
                  Distance: {distanceLabel} remaining · ETA: {etaLabel}
                </ThemedText>
                <ThemedText style={styles.accordionTapHint}>Tap to show details</ThemedText>
              </View>
              <FontAwesome
                name={routeAccordionOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#A1A1AA"
              />
            </TouchableOpacity>

            {routeAccordionOpen ? (
              <View style={styles.accordionBody}>
                <ThemedText style={styles.infoRow}>
                  Traffic: {traffic ? `${traffic.label} ${traffic.emoji}` : '--'}
                </ThemedText>
                <ThemedText style={styles.infoRow}>
                  Road traffic speed (TomTom):{' '}
                  {traffic && traffic.currentSpeed > 0 ? `${traffic.currentSpeed} km/h` : '--'}
                </ThemedText>
                <ThemedText style={styles.noteText}>
                  This is typical speed on the road segment near your route, not your vehicle speed.
                </ThemedText>
                {role === 'mechanic' ? (
                  <ThemedText style={styles.infoRow}>
                    Your speed (GPS):{' '}
                    {gpsSpeedKmh !== null ? `${gpsSpeedKmh} km/h` : '--'}
                  </ThemedText>
                ) : null}
                <ThemedText style={styles.infoRow}>Last updated: {formattedLastUpdated}</ThemedText>
                {trafficEstimatedNote && (
                  <ThemedText style={styles.noteText}>Traffic data is estimated.</ThemedText>
                )}
                {showSignalLost && role === 'client' && (
                  <ThemedText style={styles.warnText}>
                    ⚠️ Location signal lost. Mechanic may be in low signal area.
                  </ThemedText>
                )}
                {isMechanicOnTheWay ? (
                  <>
                    <ThemedText style={styles.mechanicTravelHint}>
                      Road route follows the orange line. Use Maps for voice turn-by-turn.
                    </ThemedText>
                    <TouchableOpacity style={styles.mtBtnMapsFull} onPress={openNavToClient} activeOpacity={0.85}>
                      <FontAwesome name="external-link" size={14} color="#E4E4E7" />
                      <ThemedText style={styles.mtBtnSecondaryText}>Maps app</ThemedText>
                    </TouchableOpacity>
                  </>
                ) : null}
                {routeEstimated && (
                  <ThemedText style={styles.warnText}>⚠️ Showing estimated route.</ThemedText>
                )}
              </View>
            ) : null}

            {isMechanicOnTheWay ? (
              <View style={styles.mechanicTravelBar}>
                <View style={styles.mechanicTravelRow}>
                  <TouchableOpacity
                    style={[styles.mtBtnDanger, travelActionLoading && styles.mtBtnDisabled]}
                    onPress={handleMechanicCancelTravelFromMap}
                    disabled={!!travelActionLoading}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={styles.mtBtnDangerText}>Cancel travel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.mtBtnPrimary, travelActionLoading && styles.mtBtnDisabled]}
                    onPress={handleMechanicArrivedFromMap}
                    disabled={!!travelActionLoading}
                    activeOpacity={0.85}
                  >
                    {travelActionLoading === 'arrived' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <ThemedText style={styles.mtBtnPrimaryText}>Arrived</ThemedText>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <ThemedText style={styles.infoTitle}>📍 Route to Client</ThemedText>

            <ThemedText style={styles.infoRow}>
              Distance: {distanceLabel}
              {routeEstimated ? ' (estimated)' : ' (via road)'}
            </ThemedText>
            <ThemedText style={styles.infoRow}>ETA: {etaLabel}</ThemedText>

            <ThemedText style={styles.infoRow}>Traffic: -- (checked on travel)</ThemedText>

            {routeEstimated && (
              <ThemedText style={styles.warnText}>⚠️ Showing estimated route.</ThemedText>
            )}
          </>
        )}
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={permissionModalVisible}
        onRequestClose={() => setPermissionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <FontAwesome name="location-arrow" size={30} color="#FF8C00" />
            <ThemedText style={styles.modalTitle}>Enable Location for Tracking</ThemedText>
            <ThemedText style={styles.modalMessage}>{permissionModalMessage}</ThemedText>
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={openAppLocationSettings}>
              <ThemedText style={styles.modalPrimaryText}>Open Settings</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setPermissionModalVisible(false)}>
              <ThemedText style={styles.modalSecondaryText}>Not Now</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={arrivedSuccessModalVisible}
        onRequestClose={() => setArrivedSuccessModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <FontAwesome name="check-circle" size={36} color="#22C55E" />
            <ThemedText style={styles.modalTitle}>Updated</ThemedText>
            <ThemedText style={styles.modalMessage}>Marked at client location.</ThemedText>
            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => setArrivedSuccessModalVisible(false)}
              activeOpacity={0.85}
            >
              <ThemedText style={styles.modalPrimaryText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  header: {
    height: 84,
    paddingTop: 40,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2F3235',
    backgroundColor: '#222426',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  waitingBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#2A2418',
    borderBottomWidth: 1,
    borderBottomColor: '#3D3318',
  },
  waitingBannerText: {
    color: '#FDE68A',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  legendChip: {
    position: 'absolute',
    top: 12,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,21,23,0.92)',
    borderWidth: 1,
    borderColor: '#2F3235',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    zIndex: 10,
    elevation: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F4F4F5',
  },
  legendDivider: {
    width: 1,
    height: 14,
    marginHorizontal: 10,
    backgroundColor: '#3A3D40',
  },
  map: {
    flex: 1,
  },
  locateMeButton: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#A1A1AA',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  errorText: {
    textAlign: 'center',
    color: '#D4D4D8',
    fontSize: 15,
  },
  retryButton: {
    marginTop: 4,
    backgroundColor: '#FF8C00',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
  infoCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    maxHeight: '46%',
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  infoCardLiveRouteCollapsed: {
    maxHeight: '36%',
  },
  infoCardLiveRouteExpanded: {
    maxHeight: '52%',
  },
  accordionTapHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#71717A',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accordionHeaderTextWrap: {
    flex: 1,
    marginRight: 10,
  },
  infoTitleAccordion: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    color: '#FFFFFF',
  },
  accordionSummary: {
    fontSize: 13,
    color: '#A1A1AA',
    lineHeight: 18,
  },
  accordionBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
  },
  mtBtnMapsFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2A2C2E',
    borderWidth: 1,
    borderColor: '#3F4144',
    width: '100%',
  },
  mechanicTravelBar: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
    gap: 10,
  },
  mechanicTravelHint: {
    fontSize: 12,
    color: '#A1A1AA',
    lineHeight: 16,
  },
  mechanicTravelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mtBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2A2C2E',
    borderWidth: 1,
    borderColor: '#3F4144',
  },
  mtBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E4E4E7',
  },
  mtBtnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#007AFF',
  },
  mtBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  mtBtnDanger: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#3A2A2A',
    borderWidth: 1,
    borderColor: '#7F1D1D',
  },
  mtBtnDangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  mtBtnDisabled: {
    opacity: 0.55,
  },
  preciseMarkerDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 4,
  },
  preciseMarkerCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  clientMarkerDot: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FF3B30',
  },
  clientMarkerCore: {
    backgroundColor: '#FF3B30',
  },
  mechanicMarkerDot: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FF8C00',
  },
  mechanicMarkerCore: {
    backgroundColor: '#FF8C00',
  },
  calloutBox: {
    padding: 10,
    minWidth: 160,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  calloutTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },
  calloutSub: {
    marginTop: 4,
    fontSize: 12,
    color: '#555',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
    color: '#FFFFFF',
  },
  infoRow: {
    fontSize: 14,
    color: '#E4E4E7',
    marginBottom: 6,
  },
  noteText: {
    marginTop: 2,
    fontSize: 13,
    color: '#A1A1AA',
  },
  warnText: {
    marginTop: 6,
    fontSize: 13,
    color: '#D97706',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2F3238',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F4F4F5',
    marginTop: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: '#A1A1AA',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 18,
    lineHeight: 20,
  },
  modalPrimaryButton: {
    width: '100%',
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E67E00',
  },
  modalPrimaryText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 15,
  },
  modalSecondaryButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  modalSecondaryText: {
    color: '#9CA3AF',
    fontWeight: '600',
    fontSize: 14,
  },
});
