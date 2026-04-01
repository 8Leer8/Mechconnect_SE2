import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export const screenOptions = { headerShown: false } as const;

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const ORS_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || process.env.EXPO_PUBLIC_ORS_KEY;
const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY;

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
  service_location?: ServiceLocation | null;
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

const MANILA_FALLBACK: Coordinates = {
  latitude: 14.5995,
  longitude: 120.9842,
};

const DEFAULT_TRAFFIC: TrafficData = {
  level: 'moderate',
  label: 'Moderate',
  emoji: '🟡',
  color: '#FFD60A',
  surchargePercent: 10,
  currentSpeed: 0,
  freeFlowSpeed: 0,
  estimated: true,
};

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

function classifyTraffic(ratio: number): Omit<TrafficData, 'currentSpeed' | 'freeFlowSpeed' | 'estimated'> {
  if (ratio < 1.2) {
    return { level: 'light', label: 'Light', emoji: '🟢', color: '#34C759', surchargePercent: 0 };
  }
  if (ratio < 1.5) {
    return { level: 'moderate', label: 'Moderate', emoji: '🟡', color: '#FFD60A', surchargePercent: 10 };
  }
  if (ratio < 2.0) {
    return { level: 'heavy', label: 'Heavy', emoji: '🟠', color: '#FF9500', surchargePercent: 20 };
  }
  return { level: 'severe', label: 'Severe', emoji: '🔴', color: '#FF3B30', surchargePercent: 30 };
}

function timeBasedTrafficFallback(): TrafficData {
  const hour = new Date().getHours();
  let level: TrafficLevel = 'moderate';

  if (hour >= 0 && hour < 5) level = 'light';
  else if (hour >= 5 && hour < 7) level = 'moderate';
  else if (hour >= 7 && hour < 10) level = 'severe';
  else if (hour >= 10 && hour < 16) level = 'moderate';
  else if (hour >= 17 && hour < 21) level = 'severe';
  else level = 'moderate';

  const byLevel = {
    light: { label: 'Light' as const, emoji: '🟢', color: '#34C759', surchargePercent: 0 },
    moderate: { label: 'Moderate' as const, emoji: '🟡', color: '#FFD60A', surchargePercent: 10 },
    heavy: { label: 'Heavy' as const, emoji: '🟠', color: '#FF9500', surchargePercent: 20 },
    severe: { label: 'Severe' as const, emoji: '🔴', color: '#FF3B30', surchargePercent: 30 },
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

export default function BookingLocationMapScreen() {
  const params = useLocalSearchParams<{ bookingId?: string; role?: Role }>();
  const bookingId = String(params.bookingId || '');
  const role: Role = params.role === 'client' ? 'client' : 'mechanic';

  const mapRef = useRef<MapView>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didInitialFitRef = useRef(false);

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

  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [routeEstimated, setRouteEstimated] = useState(false);

  const [traffic, setTraffic] = useState<TrafficData | null>(null);
  const [trafficEstimatedNote, setTrafficEstimatedNote] = useState(false);

  const [lastMechanicUpdateAt, setLastMechanicUpdateAt] = useState<number | null>(null);
  const [showSignalLost, setShowSignalLost] = useState(false);
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [permissionModalMessage, setPermissionModalMessage] = useState('Please enable location access to continue live tracking.');

  const headerTitle = status === 'on_the_way' ? 'Live Tracking' : 'Route to Client';
  const isOnTheWay = status === 'on_the_way';

  useEffect(() => {
    clientCoordsRef.current = clientCoords;
  }, [clientCoords]);

  useEffect(() => {
    mechanicCoordsRef.current = mechanicCoords;
  }, [mechanicCoords]);

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

  const geocodeClientAddress = useCallback(async (loc: ServiceLocation): Promise<Coordinates | null> => {
    const address = [
      loc.street_name,
      loc.subdivision_village,
      loc.barangay,
      loc.city_municipality,
    ]
      .filter(Boolean)
      .join(', ');

    if (!address.trim()) return null;

    const query = encodeURIComponent(`${address}, Philippines`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=ph`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'MechConnect/1.0',
      },
    });

    if (!response.ok) throw new Error('Unable to geocode client address');

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) return null;

    const latitude = toNumber(results[0]?.lat);
    const longitude = toNumber(results[0]?.lon);

    if (latitude === null || longitude === null || latitude === 0 || longitude === 0) return null;

    return { latitude, longitude };
  }, []);

  const resolveClientCoordinates = useCallback(async (bookingData: BookingDetail | null | undefined): Promise<Coordinates | null> => {
    if (!bookingData) return null;

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

    if (hasValidCoord(loc.latitude, loc.longitude)) {
      return toValidCoordinate(loc.latitude, loc.longitude);
    }

    const street = String(loc.street_name || '').trim();
    const isPlusCode = street.includes('+') || /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,3}$/i.test(street);

    if (!isPlusCode) {
      const strictAddress = [
        street,
        loc.barangay,
        loc.city_municipality,
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

    const city = String(loc.city_municipality || '').trim();
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
  }, [geocodeClientAddress]);

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

  const resolveMechanicCoordinates = useCallback(async (currentStatus: string): Promise<Coordinates | null> => {
    if (role === 'mechanic') {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (currentStatus === 'on_the_way') {
            openTrackingPermissionModal('Location services are turned off. Please enable GPS for live tracking.');
          }
          return MANILA_FALLBACK;
        }

        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          if (currentStatus === 'on_the_way') {
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

    if (currentStatus === 'on_the_way') {
      try {
        return await fetchMechanicCoordinatesForClient();
      } catch {
        return null;
      }
    }

    return null;
  }, [fetchMechanicCoordinatesForClient, openTrackingPermissionModal, role]);

  const calculateRoute = useCallback(async (from: Coordinates, to: Coordinates) => {
    if (!ORS_KEY) throw new Error('Missing ORS key');

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
      }),
    });

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
    const classified = classifyTraffic(ratio);

    return {
      ...classified,
      currentSpeed,
      freeFlowSpeed,
      estimated: false,
    };
  }, []);

  const refreshRouteAndTraffic = useCallback(async (from: Coordinates, to: Coordinates, currentStatus: string) => {
    let nextDistance = distanceKm;
    let nextEta = etaMinutes;

    try {
      const routeResult = await calculateRoute(from, to);
      setRouteCoords(routeResult.points);
      setDistanceKm(routeResult.distanceKm);
      setEtaMinutes(routeResult.etaMinutes);
      setRouteEstimated(false);
      nextDistance = routeResult.distanceKm;
      nextEta = routeResult.etaMinutes;
    } catch {
      const fallbackDistance = haversineDistanceKm(from, to);
      const fallbackEta = Math.max(1, Math.round((fallbackDistance / 25) * 60));

      setRouteCoords([]);
      setDistanceKm(fallbackDistance);
      setEtaMinutes(fallbackEta);
      setRouteEstimated(true);

      nextDistance = fallbackDistance;
      nextEta = fallbackEta;
    }

    if (currentStatus === 'on_the_way') {
      try {
        const trafficData = await calculateTraffic(from, to);
        setTraffic(trafficData);
        setTrafficEstimatedNote(false);
      } catch {
        const fallback = timeBasedTrafficFallback();
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
  }, [calculateRoute, calculateTraffic, distanceKm, etaMinutes]);

  const initializeScreen = useCallback(async () => {
    cleanupLiveResources();
    didInitialFitRef.current = false;

    setScreenLoading(true);
    setWaitingForMechanic(false);
    setBookingError(null);
    setLocationError(null);
    setShowSignalLost(false);
    setLastMechanicUpdateAt(null);

    try {
      const bookingData = await fetchBooking();
      const bookingStatus = String(bookingData?.status || '');

      console.log('BOOKING DATA:', JSON.stringify(bookingData, null, 2));
      console.log('SERVICE LOCATION:', bookingData?.service_location);
      console.log('REQUEST:', bookingData?.request);

      setBooking(bookingData);
      setStatus(bookingStatus);

      const resolvedClientCoords = await resolveClientCoordinates(bookingData);
      if (!resolvedClientCoords) {
        const city = bookingData?.service_location?.city_municipality || 'client location';
        setLocationError(`Could not load map for ${city}`);
        setScreenLoading(false);
        return;
      }

      setClientCoords(resolvedClientCoords);

      const resolvedMechanicCoords = await resolveMechanicCoordinates(bookingStatus);
      setMechanicCoords(resolvedMechanicCoords);

      if (resolvedMechanicCoords) {
        await refreshRouteAndTraffic(resolvedMechanicCoords, resolvedClientCoords, bookingStatus);
        setLastMechanicUpdateAt(Date.now());
      } else {
        if (role === 'client' && bookingStatus === 'on_the_way') {
          setWaitingForMechanic(true);
        }

        setRouteCoords([]);

        const bookingDistance = toNumber(bookingData.distance_km);
        const bookingEta = toNumber(bookingData.estimated_eta_minutes);

        setDistanceKm(bookingDistance);
        setEtaMinutes(bookingEta ? Math.round(bookingEta) : null);
        setRouteEstimated(false);

        if (bookingStatus === 'on_the_way') {
          const baselineTraffic = String(bookingData.traffic_level || '').toLowerCase();
          if (baselineTraffic === 'light' || baselineTraffic === 'moderate' || baselineTraffic === 'heavy' || baselineTraffic === 'severe') {
            const preset = classifyTraffic(
              baselineTraffic === 'light' ? 1.1 :
              baselineTraffic === 'moderate' ? 1.3 :
              baselineTraffic === 'heavy' ? 1.7 : 2.1
            );
            setTraffic({
              ...preset,
              currentSpeed: 0,
              freeFlowSpeed: 0,
              estimated: true,
            });
            setTrafficEstimatedNote(true);
          } else {
            setTraffic(DEFAULT_TRAFFIC);
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
  }, [cleanupLiveResources, fetchBooking, refreshRouteAndTraffic, resolveClientCoordinates, resolveMechanicCoordinates]);

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

      const pushLocationToBackend = (coords: Coordinates) => {
        if (!API_URL || !bookingId) return;
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

          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.status !== 'granted') {
            openTrackingPermissionModal('Location permission is required for live tracking. Please allow location access.');
            return;
          }

          const watcher = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 3000,
              distanceInterval: 5,
            },
            (location) => {
              if (!isMounted) return;
              const next = toValidCoordinate(location.coords.latitude, location.coords.longitude);
              if (!next) return;
              setMechanicCoords(next);
              setLastMechanicUpdateAt(Date.now());
              pushLocationToBackend(next);
            }
          );

          watcherRef.current = watcher;
        } catch {
          // Keep existing coordinates if watcher setup fails.
        }
      })();

      // Push location to backend every 5 seconds (supplements watcher which may fire less often)
      const locationPushInterval = setInterval(() => {
        const coords = mechanicCoordsRef.current;
        if (coords) pushLocationToBackend(coords);
      }, 5000);

      updateIntervalRef.current = setInterval(() => {
        const from = mechanicCoordsRef.current;
        const to = clientCoordsRef.current;
        if (!from || !to) return;
        refreshRouteAndTraffic(from, to, 'on_the_way').catch(() => {
          // Realtime refresh failures are reflected by existing fallback state.
        });
      }, 30000);

      return () => {
        isMounted = false;
        clearInterval(locationPushInterval);
        cleanupLiveResources();
      };
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const latest = await fetchMechanicCoordinatesForClient();
        if (!latest) return;

        setMechanicCoords(latest);
        setWaitingForMechanic(false);
        setLastMechanicUpdateAt(Date.now());
        setShowSignalLost(false);

        if (clientCoordsRef.current) {
          await refreshRouteAndTraffic(latest, clientCoordsRef.current, 'on_the_way');
        }
      } catch {
        // Polling can temporarily fail in low-signal conditions.
      }
    }, 5000);

    updateIntervalRef.current = setInterval(() => {
      const from = mechanicCoordsRef.current;
      const to = clientCoordsRef.current;
      if (!from || !to) return;
      refreshRouteAndTraffic(from, to, 'on_the_way').catch(() => {
        // Realtime refresh failures are reflected by existing fallback state.
      });
    }, 30000);

    staleCheckIntervalRef.current = setInterval(() => {
      if (!lastMechanicUpdateAt) {
        setShowSignalLost(true);
        return;
      }
      setShowSignalLost(Date.now() - lastMechanicUpdateAt > 30000);
    }, 5000);

    return () => cleanupLiveResources();
  }, [cleanupLiveResources, clientCoords, fetchMechanicCoordinatesForClient, isOnTheWay, lastMechanicUpdateAt, openTrackingPermissionModal, refreshRouteAndTraffic, role]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (clientCoords && mechanicCoords) {
      setTimeout(() => {
        try {
          mapRef.current?.fitToCoordinates([mechanicCoords, clientCoords], {
            edgePadding: { top: 80, right: 40, bottom: 250, left: 40 },
            animated: true,
          });
          didInitialFitRef.current = true;
        } catch {
          // Keep current map viewport if fitting fails.
        }
      }, 500);
      return;
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
          <ThemedText style={styles.errorText}>Unable to find client location</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={retryLocationResolution}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  if (screenLoading || waitingForMechanic) {
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
          <ThemedText style={styles.loadingText}>
            {waitingForMechanic ? 'Waiting for mechanic location...' : 'Loading route details...'}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const routeColor = isOnTheWay ? (traffic?.color || '#FF8C00') : '#FF8C00';
  const distanceLabel = distanceKm !== null ? `${distanceKm.toFixed(1)} km` : '--';
  const etaLabel = etaMinutes !== null ? `~${etaMinutes} mins` : '--';
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
            <Polyline
              coordinates={routeCoords}
              strokeWidth={5}
              strokeColor={routeColor}
              geodesic
              lineCap="round"
              lineJoin="round"
              zIndex={1}
            />
          )}

          {safeMechanicCoords && (
            <Marker
              coordinate={safeMechanicCoords}
              pinColor="#FF8C00"
              title="Mechanic"
            />
          )}

          {safeClientCoords && (
            <Marker
              coordinate={safeClientCoords}
              pinColor="#FF3B30"
              title="Client Location"
            />
          )}
        </MapView>
      </View>

      <View style={styles.infoCard}>
        <ThemedText style={styles.infoTitle}>
          {isOnTheWay ? 'Mechanic Route' : '📍 Route to Client'}
        </ThemedText>

        <ThemedText style={styles.infoRow}>
          Distance: {isOnTheWay ? `${distanceLabel} remaining` : `${distanceLabel}${routeEstimated ? ' (estimated)' : ' (via road)'}`}
        </ThemedText>
        <ThemedText style={styles.infoRow}>ETA: {etaLabel}</ThemedText>

        {isOnTheWay ? (
          <>
            <ThemedText style={styles.infoRow}>
              Traffic: {traffic ? `${traffic.label} ${traffic.emoji}` : '--'}
            </ThemedText>
            <ThemedText style={styles.infoRow}>
              Current speed: {traffic && traffic.currentSpeed > 0 ? `${traffic.currentSpeed} km/h` : '--'}
            </ThemedText>
            <ThemedText style={styles.infoRow}>Last updated: {formattedLastUpdated}</ThemedText>
            {trafficEstimatedNote && (
              <ThemedText style={styles.noteText}>Traffic data is estimated.</ThemedText>
            )}
            {showSignalLost && role === 'client' && (
              <ThemedText style={styles.warnText}>⚠️ Location signal lost. Mechanic may be in low signal area.</ThemedText>
            )}
          </>
        ) : (
          <ThemedText style={styles.infoRow}>Traffic: -- (checked on travel)</ThemedText>
        )}

        {routeEstimated && (
          <ThemedText style={styles.warnText}>⚠️ Showing estimated route.</ThemedText>
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
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
  },
  modalMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  modalPrimaryButton: {
    width: '100%',
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSecondaryButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  modalSecondaryText: {
    color: '#6B7280',
    fontWeight: '600',
  },
});
