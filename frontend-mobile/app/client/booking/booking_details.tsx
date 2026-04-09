import React, { useEffect, useState, useCallback, useMemo } from 'react';
// Ensure the router header is hidden for this route so only the in-page header shows
export const screenOptions = { headerShown: false } as const;
import {View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, Platform, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/bookingDetailsStyles';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingDetail {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at: string;
  completed_at: string | null;
  convenience_fee?: number | null;
  traffic_surcharge?: number | null;
  distance_km?: number | null;
  traffic_level?: string | null;
  estimated_eta_minutes?: number | null;
  request: {
    id: number;
    type: string;
    created_at: string;
  };
  provider?: {
    id: number;
    name: string;
    email: string;
  } | null;
  shop?: {
    id: number;
    shop_name: string;
    contact_number: string;
    email: string;
  } | null;
  service_location?: {
    street_name: string;
    subdivision_village?: string;
    barangay: string;
    city_municipality: string;
    landmark?: string | null;
  } | null;
  active_details?: {
    before_picture: string | null;
    after_picture: string | null;
    is_job_done: boolean;
    is_rescheduled: boolean;
    reason: string | null;
    new_time: string | null;
    new_date: string | null;
    started_at: string | null;
  };
  completion_details?: {
    completed_at: string;
    total_amount: number;
    notes: string;
  };
  cancellation_details?: {
    cancelled_by: { id: number; name: string };
    reason: string;
    cancelled_at: string;
  };
  rework_details?: {
    requested_by: { id: number; name: string };
    reason: string;
    created_at: string;
    completed_at: string | null;
  };
  has_backjob?: boolean;
  backjob?: {
    id: number;
    status: string;
    reason?: string | null;
    images?: string[];
    requested_by?: { id: number; name: string } | null;
  } | null;
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
};

const LIVE_PRICING_STATUSES = new Set(['accepted', 'on_the_way', 'active', 'paused', 'finished']);

const shouldUseLiveAdditivePricing = (statusValue?: string | null): boolean => {
  const normalized = String(statusValue || '').toLowerCase();
  return LIVE_PRICING_STATUSES.has(normalized);
};

const solveServiceSubtotalFromAmount = (
  amountFee: number,
  travelFee: number,
  trafficFee: number,
  conveniencePct: number,
  convenienceFixed: number
): number => {
  const pct = Number.isFinite(conveniencePct) ? Math.max(0, conveniencePct) : 0;
  const fixed = Number.isFinite(convenienceFixed) ? convenienceFixed : 0;
  const denominator = 1 + pct;
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;

  const subtotal = (amountFee - travelFee - trafficFee - fixed) / denominator;
  return Number.isFinite(subtotal) ? Math.max(0, subtotal) : 0;
};

export default function ClientBookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const navigation = useNavigation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [backjobModalVisible, setBackjobModalVisible] = useState(false);
  const [backjobReason, setBackjobReason] = useState('');
  const [backjobImage, setBackjobImage] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);

  useEffect(() => {
    let isMounted = true;
    const fetchPricingConfig = async () => {
      try {
        const response = await fetch(`${API_URL}/pricing/config/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json() as Partial<PricingConfig>;
        if (!isMounted) return;
        setPricingConfig({
          base_distance_fee: Number(data.base_distance_fee ?? DEFAULT_PRICING_CONFIG.base_distance_fee),
          price_per_km: Number(data.price_per_km ?? DEFAULT_PRICING_CONFIG.price_per_km),
          free_distance_km: Number(data.free_distance_km ?? DEFAULT_PRICING_CONFIG.free_distance_km),
          traffic_low_multiplier: Number(data.traffic_low_multiplier ?? DEFAULT_PRICING_CONFIG.traffic_low_multiplier),
          traffic_medium_multiplier: Number(data.traffic_medium_multiplier ?? DEFAULT_PRICING_CONFIG.traffic_medium_multiplier),
          traffic_high_multiplier: Number(data.traffic_high_multiplier ?? DEFAULT_PRICING_CONFIG.traffic_high_multiplier),
          convenience_fee_percentage: Number(data.convenience_fee_percentage ?? DEFAULT_PRICING_CONFIG.convenience_fee_percentage),
          convenience_fee_fixed: Number(data.convenience_fee_fixed ?? DEFAULT_PRICING_CONFIG.convenience_fee_fixed),
        });
      } catch {
        // Keep defaults when pricing config is unavailable.
      }
    };

    fetchPricingConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  // Derive display quotation: prefer booking.quotation (from API) otherwise build from request.request_details
  const getDisplayQuotation = () => {
    if (!booking) return null;
    const saved = (booking as any).quotation;
    if (saved && (saved.items || []).length > 0) return saved;

    const toPrice = (value: any) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const details = (booking as any).request?.request_details || null;
    const items: any[] = [];

    if (details) {
      if (details.service) {
        const svc: any = details.service;
        const unit = toPrice(svc.minimum_price ?? svc.price);
        items.push({ description: svc.name || 'Service', quantity: 1, unit_price: unit, service: svc.id });
      }

      if (Array.isArray(details.services) && details.services.length > 0) {
        details.services.forEach((svc: any) => {
          const unit = toPrice(svc?.minimum_price ?? svc?.price);
          items.push({ description: svc?.name || 'Service', quantity: 1, unit_price: unit, service: svc?.id });
        });
      }

      if (Array.isArray(details.add_ons) && details.add_ons.length > 0) {
        details.add_ons.forEach((addOn: any) => {
          const unit = toPrice(addOn?.price);
          items.push({ description: addOn?.name || 'Add-on', quantity: 1, unit_price: unit, service_add_on: addOn?.id });
        });
      }
    }

    let total_amount = items.reduce((s, it) => s + ((Number(it.unit_price) || 0) * (Number(it.quantity) || 1)), 0);

    // Fallback when request details don't include service prices.
    if (total_amount <= 0) {
      const amountFee = toPrice((booking as any).amount_fee);
      const convenienceFee = toPrice((booking as any).convenience_fee);
      const useLiveAdditivePricing = shouldUseLiveAdditivePricing((booking as any).status);
      const persistedDistanceKm = Number((booking as any).distance_km || 0);
      const safeDistanceKm = Number.isFinite(persistedDistanceKm) ? Math.max(0, persistedDistanceKm) : 0;
      const freeDistanceKm = Math.max(0, Number(pricingConfig.free_distance_km || 0));
      const baseDistanceFee = Number(pricingConfig.base_distance_fee || 0);
      const ratePerKm = Number(pricingConfig.price_per_km || 0);
      const conveniencePct = Number(pricingConfig.convenience_fee_percentage || 0) / 100;
      const convenienceFixed = Number(pricingConfig.convenience_fee_fixed || 0);
      const billableDistanceKm = Math.max(0, safeDistanceKm - freeDistanceKm);
      const baseTravelFee = safeDistanceKm > freeDistanceKm ? baseDistanceFee : 0;
      const distanceFee = billableDistanceKm * ratePerKm;
      const travelFee = baseTravelFee + distanceFee;

      const persistedTrafficSurcharge = Number((booking as any).traffic_surcharge);
      const hasPersistedTrafficSurcharge = Number.isFinite(persistedTrafficSurcharge) && persistedTrafficSurcharge >= 0;

      const levelRaw = String((booking as any).traffic_level || 'moderate').toLowerCase();
      const normalizedLevel = levelRaw === 'light' || levelRaw === 'low'
        ? 'low'
        : (levelRaw === 'moderate' || levelRaw === 'medium' ? 'medium' : 'high');
      const trafficMultiplier = normalizedLevel === 'low'
        ? Number(pricingConfig.traffic_low_multiplier || 1)
        : normalizedLevel === 'medium'
          ? Number(pricingConfig.traffic_medium_multiplier || 1)
          : Number(pricingConfig.traffic_high_multiplier || 1);
      const estimatedTrafficFee = travelFee * Math.max(0, trafficMultiplier - 1);
      const trafficFee = hasPersistedTrafficSurcharge ? persistedTrafficSurcharge : estimatedTrafficFee;
      const estimatedBase = useLiveAdditivePricing
        ? solveServiceSubtotalFromAmount(amountFee, travelFee, trafficFee, conveniencePct, convenienceFixed)
        : Math.max(0, amountFee - convenienceFee - travelFee - trafficFee);

      if (estimatedBase > 0) {
        items.length = 0;
        items.push({ description: 'Service', quantity: 1, unit_price: estimatedBase });
        total_amount = estimatedBase;
      }
    }

    if (items.length === 0) return null;
    return { items, total_amount };
  };

  const displayQuotation = getDisplayQuotation();

  const convenienceBreakdown = useMemo(() => {
    if (!booking) return null;

    const freeDistanceKm = Math.max(0, Number(pricingConfig.free_distance_km || 0));
    const baseDistanceFee = Number(pricingConfig.base_distance_fee || 0);
    const ratePerKm = Number(pricingConfig.price_per_km || 0);
    const conveniencePct = Number(pricingConfig.convenience_fee_percentage || 0) / 100;
    const convenienceFixed = Number(pricingConfig.convenience_fee_fixed || 0);

    const persistedConvenienceFee = Number((booking as any).convenience_fee || 0);
    const persistedDistanceKm = Number((booking as any).distance_km || 0);
    const safeDistanceKm = Number.isFinite(persistedDistanceKm) ? Math.max(0, persistedDistanceKm) : 0;
    const billableDistanceKm = Math.max(0, safeDistanceKm - freeDistanceKm);
    const baseFee = safeDistanceKm > freeDistanceKm ? baseDistanceFee : 0;
    const distanceFee = billableDistanceKm * ratePerKm;
    const travelFee = baseFee + distanceFee;

    const levelRaw = String((booking as any).traffic_level || 'moderate').toLowerCase();
    const normalizedLevel = levelRaw === 'light' || levelRaw === 'low'
      ? 'low'
      : (levelRaw === 'moderate' || levelRaw === 'medium' ? 'medium' : 'high');
    const trafficConfig: Record<'low' | 'medium' | 'high', { multiplier: number; speedKmh: number; label: string }> = {
      low: { multiplier: Number(pricingConfig.traffic_low_multiplier || 1), speedKmh: 40, label: 'Low' },
      medium: { multiplier: Number(pricingConfig.traffic_medium_multiplier || 1), speedKmh: 28, label: 'Medium' },
      high: { multiplier: Number(pricingConfig.traffic_high_multiplier || 1), speedKmh: 20, label: 'High' },
    };

    const trafficMeta = trafficConfig[normalizedLevel];
    const estimatedTrafficFee = travelFee * Math.max(0, trafficMeta.multiplier - 1);
    const persistedTrafficSurcharge = Number((booking as any).traffic_surcharge);
    const hasPersistedTrafficSurcharge = Number.isFinite(persistedTrafficSurcharge) && persistedTrafficSurcharge >= 0;
    const trafficFee = hasPersistedTrafficSurcharge ? persistedTrafficSurcharge : estimatedTrafficFee;

    const quotationSubtotal = parseFloat(String(displayQuotation?.total_amount || 0)) || 0;
    const amountFee = Number((booking as any).amount_fee || 0);
    const bookingStatus = String((booking as any).status || '').toLowerCase();
    const useLiveAdditivePricing = shouldUseLiveAdditivePricing(bookingStatus);
    const hasPersistedConvenience = (booking as any).convenience_fee !== null && (booking as any).convenience_fee !== undefined;
    const serviceSubtotal = quotationSubtotal > 0
      ? quotationSubtotal
      : useLiveAdditivePricing
        ? solveServiceSubtotalFromAmount(amountFee, travelFee, trafficFee, conveniencePct, convenienceFixed)
        : Math.max(0, amountFee - travelFee - trafficFee - (hasPersistedConvenience ? persistedConvenienceFee : 0));

    const estimatedConvenienceFee = (serviceSubtotal * conveniencePct) + convenienceFixed;
    const totalConvenienceFee = useLiveAdditivePricing
      ? estimatedConvenienceFee
      : (hasPersistedConvenience ? persistedConvenienceFee : estimatedConvenienceFee);
    const isOnTheWay = booking.status === 'on_the_way';

    const persistedEta = Number((booking as any).estimated_eta_minutes || 0);
    const derivedEta = Math.max(1, Math.ceil((safeDistanceKm / Math.max(1, trafficMeta.speedKmh)) * 60));
    const etaMinutes = isOnTheWay && Number.isFinite(persistedEta) && persistedEta > 0
      ? Math.round(persistedEta)
      : derivedEta;

    return {
      baseFee,
      distanceKm: safeDistanceKm,
      distanceFee,
      travelFee,
      trafficFee,
      serviceSubtotal,
      totalConvenienceFee,
      trafficLabel: trafficMeta.label,
      etaMinutes,
      estimated: !isOnTheWay,
    };
  }, [booking, pricingConfig]);

  const fetchBookingDetail = useCallback(async (silent = false) => {
    if (!bookingId) return;
    try {
      if (!silent) setLoading(true);
      setError(null);
      let response = await fetch(`${API_URL}/bookings/bookings/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        response = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!response.ok) throw new Error('Failed to fetch booking details');
      const data = await response.json();
      setBooking((data as any).booking || data);
      const bookingData = (data as any).booking || data;
      const currentStatus = bookingData.status;

      // parse helper for total_pause_duration
      const parseTotalPause = (raw: any) => {
        let totalPauseSeconds = 0;
        if (raw) {
          if (typeof raw === 'number') totalPauseSeconds = Math.floor(raw);
          else if (typeof raw === 'string') {
            const parts = raw.split(':').map((p: string) => Number(p));
            if (parts.length === 3) totalPauseSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) totalPauseSeconds = parts[0] * 60 + parts[1];
            else totalPauseSeconds = Math.floor(Number(raw)) || 0;
          }
        }
        return totalPauseSeconds;
      };

      // compute timer based on status
      if (bookingData.active_details && bookingData.active_details.started_at) {
        const startedAt = bookingData.active_details.started_at;
        const pausedAt = bookingData.active_details.paused_at;
        const totalPauseRaw = bookingData.active_details.total_pause_duration;
        const totalPauseSeconds = parseTotalPause(totalPauseRaw);

        let elapsedSeconds = 0;
        if (currentStatus === 'paused' && startedAt && pausedAt) {
          const startedMs = new Date(startedAt).getTime();
          const pausedMs = new Date(pausedAt).getTime();
          if (!isNaN(startedMs) && !isNaN(pausedMs)) {
            elapsedSeconds = Math.floor((pausedMs - startedMs) / 1000) - Math.floor(totalPauseSeconds);
          }
          if (elapsedSeconds < 0) elapsedSeconds = 0;
          setTimer(Math.floor(elapsedSeconds));
          setIsPaused(true);
        } else if (currentStatus === 'active' && startedAt) {
          const startedMs = new Date(startedAt).getTime();
          const nowMs = Date.now();
          if (!isNaN(startedMs)) elapsedSeconds = Math.floor((nowMs - startedMs) / 1000) - Math.floor(totalPauseSeconds);
          if (elapsedSeconds < 0) elapsedSeconds = 0;
          setTimer(Math.floor(elapsedSeconds));
          setIsPaused(false);
        } else {
          setTimer(0);
          setIsPaused(false);
        }
      } else {
        setTimer(0);
        setIsPaused(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  // ticking effect for live timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const hasStarted = !!(booking && booking.active_details && booking.active_details.started_at);
    if (hasStarted && booking?.status === 'active' && !isPaused) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [booking?.active_details?.started_at, booking?.status, isPaused]);

  useEffect(() => {
    try { navigation.setOptions && navigation.setOptions({ headerShown: false }); } catch (e) {}
    try { navigation.getParent && navigation.getParent()?.setOptions && navigation.getParent()?.setOptions({ headerShown: false }); } catch (e) {}
    try { navigation.getParent && navigation.getParent()?.getParent && navigation.getParent()?.getParent()?.setOptions && navigation.getParent()?.getParent()?.setOptions({ headerShown: false }); } catch (e) {}
    fetchBookingDetail();
    // Poll every 10 seconds so client sees mechanic status changes in real time
    const interval = setInterval(() => fetchBookingDetail(true), 10000);
    return () => clearInterval(interval);
  }, [fetchBookingDetail]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingDetail();
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Booked';
      case 'active': return 'In Progress';
      case 'on_the_way': return 'Mechanic on the Way';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Pending';
      case 'reworked': return 'Reworked';
      case 'disputed': return 'Disputed';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return '#00B8D9';
      case 'active': return '#FF8C00';
      case 'on_the_way': return '#007AFF';
      case 'reworked': return '#FFD60A';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'pending': return '#8E8E93';
      case 'disputed': return '#AF52DE';
      default: return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'accepted': return 'calendar-check-o';
      case 'active': return 'play-circle';
      case 'on_the_way': return 'car';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'pending': return 'clock-o';
      case 'reworked': return 'refresh';
      case 'disputed': return 'exclamation-circle';
      default: return 'circle';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleNavigateToLocation = () => {
    if (!booking) return;
    router.push({
      pathname: '/client/booking/booking_location_map',
      params: {
        bookingId: String(booking.id),
        role: 'client',
      },
    });
  };

  const pickBackjobImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setBackjobImage(result.assets[0].uri);
      }
    } catch (e) {
      // ignore for UI-only change
    }
  };

  const openChatWithMechanic = () => {
    if (!booking) return;
    router.push({ pathname: '/chat/booking_chat', params: { bookingId: String(booking.id) } });
    setBackjobModalVisible(false);
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SkeletonDetailPage />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !booking) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'Booking not found'}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchBookingDetail()}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const quotationEstimatedTotal = parseFloat(String(displayQuotation?.total_amount || 0)) || 0;
  const serviceSubtotalTotal = convenienceBreakdown ? convenienceBreakdown.serviceSubtotal : quotationEstimatedTotal;
  const travelFeeTotal = convenienceBreakdown ? convenienceBreakdown.travelFee : 0;
  const trafficFeeTotal = convenienceBreakdown ? convenienceBreakdown.trafficFee : 0;
  const convenienceFeeTotal = convenienceBreakdown ? convenienceBreakdown.totalConvenienceFee : 0;
  const totalFee = serviceSubtotalTotal + travelFeeTotal + trafficFeeTotal + convenienceFeeTotal;
  const showPricingQuotationCard = !!(convenienceBreakdown || displayQuotation);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Booking #{booking.id}</ThemedText>
        <View style={{ width: 40 }} />
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Backjob Banner */}
        {booking.has_backjob && booking.backjob && (
          <View style={styles.backjobBanner}>
            <FontAwesome name="wrench" size={14} color="#fff" />
            <ThemedText style={styles.backjobText}>
              {booking.backjob.status === 'accepted' ? 'Backjob — Accepted' : 'Backjob Request'}
            </ThemedText>
            {booking.backjob.reason ? (
              <ThemedText style={styles.backjobReason} numberOfLines={2} ellipsizeMode="tail">
                {booking.backjob.reason}
              </ThemedText>
            ) : null}
          </View>
        )}
        {/* Status Card */}
        <View style={[styles.statusCard, { borderColor: getStatusColor(booking.status) + '40' }]}>
          <View style={[styles.statusIconLarge, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
            <FontAwesome name={getStatusIcon(booking.status) as any} size={28} color={getStatusColor(booking.status)} />
          </View>
          <View style={styles.statusInfo}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
              <ThemedText style={styles.statusBadgeText}>{getStatusLabel(booking.status)}</ThemedText>
            </View>
            <ThemedText style={styles.serviceType}>
              {booking.request?.type
                ? booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1) + ' Service'
                : 'Service Request'}
            </ThemedText>
            {(booking.status === 'active' || booking.status === 'paused') && booking.active_details?.started_at && (
              <ThemedText style={styles.timerText}>{formatDuration(timer)}</ThemedText>
            )}
          </View>
          <ThemedText style={styles.amountLarge}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>
        </View>



        {/* Provider Information */}
        {booking.provider && (
          <TouchableOpacity 
            style={styles.sectionCard}
            onPress={() => router.push(`/client/mechanic/mechanicprofile?mechanicId=${booking.provider?.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="wrench" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Mechanic Information</ThemedText>
              <FontAwesome name="chevron-right" size={16} color="#8E8E93" style={{ marginLeft: 'auto' }} />
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Name</ThemedText>
                <ThemedText style={styles.infoValue}>{booking.provider.name}</ThemedText>
              </View>
              {booking.provider.email && (
                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Email</ThemedText>
                  <ThemedText style={styles.infoValue}>{booking.provider.email}</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.tapHintContainer}>
              <ThemedText style={styles.tapHintText}>Tap to view mechanic profile</ThemedText>
            </View>
          </TouchableOpacity>
        )}

        {/* Chat Section */}
        {booking.provider && (
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => router.push({ pathname: '/chat/booking_chat', params: { bookingId: String(booking.id) } })}
            activeOpacity={0.8}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}> 
                <FontAwesome name="comments" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Chat with Mechanic</ThemedText>
              <FontAwesome name="chevron-right" size={16} color="#8E8E93" style={{ marginLeft: 'auto' }} />
            </View>
            <View style={{ paddingVertical: 8 }}>
              <ThemedText style={{ color: '#666' }}>Open the booking chat to message the mechanic.</ThemedText>
            </View>
          </TouchableOpacity>
        )}

        {/* Shop Information */}
        {booking.shop && (
          <TouchableOpacity 
            style={styles.sectionCard}
            onPress={() => router.push(`/client/shop/shopprofile?shopId=${booking.shop?.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="building" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Shop Information</ThemedText>
              <FontAwesome name="chevron-right" size={16} color="#8E8E93" style={{ marginLeft: 'auto' }} />
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Shop Name</ThemedText>
                <ThemedText style={styles.infoValue}>{booking.shop.shop_name}</ThemedText>
              </View>
              {booking.shop.contact_number && (
                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Contact</ThemedText>
                  <ThemedText style={styles.infoValue}>{booking.shop.contact_number}</ThemedText>
                </View>
              )}
              {booking.shop.email && (
                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Email</ThemedText>
                  <ThemedText style={styles.infoValue}>{booking.shop.email}</ThemedText>
                </View>
              )}
            </View>
            <View style={styles.tapHintContainer}>
              <ThemedText style={styles.tapHintText}>Tap to view shop profile</ThemedText>
            </View>
          </TouchableOpacity>
        )}



        {/* Payment: show options only when booking is pending_payment and no payment recorded.
            If the booking already includes a payment (from the server), show a confirmation message.
            This derives visibility from server data (`booking.payment`) so it persists after refresh. */}
        {booking.status === 'pending_payment' && !(booking as any).payment?.payment_method && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FFD60A15' }]}> 
                <FontAwesome name="money" size={16} color="#FFD60A" />
              </View>
              <ThemedText style={styles.sectionTitle}>Payment</ThemedText>
            </View>
            <View style={{ paddingVertical: 8 }}>
              <ThemedText style={{ color: '#666', marginBottom: 8 }}>Choose how you'd like to pay for this booking.</ThemedText>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setSelectedPaymentMethod('cash')}
                  style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#111214', borderWidth: 1, borderColor: selectedPaymentMethod === 'cash' ? '#FF8C00' : '#2A2C2E', alignItems: 'flex-start' }}
                >
                  <ThemedText style={{ fontWeight: '700' }}>Cash</ThemedText>
                  <ThemedText style={{ color: '#666' }}>Pay the mechanic in person</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setSelectedPaymentMethod('online')}
                  style={{ flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#111214', borderWidth: 1, borderColor: selectedPaymentMethod === 'online' ? '#FF8C00' : '#2A2C2E', alignItems: 'flex-start' }}
                >
                  <ThemedText style={{ fontWeight: '700' }}>Online Payment</ThemedText>
                  <ThemedText style={{ color: '#666' }}>Pay now with card or e-wallet</ThemedText>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.sendBtn, { opacity: selectedPaymentMethod ? 1 : 0.5 }]}
                disabled={!selectedPaymentMethod || isPaying}
                onPress={async () => {
                  if (!selectedPaymentMethod) return;
                  try {
                    setIsPaying(true);
                    await fetch(`${API_URL}/bookings/bookings/${booking.id}/pay/`, {
                      method: 'PATCH',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ payment_method: selectedPaymentMethod }),
                    });
                    // Refresh booking detail to reflect status change (server returns payment state)
                    await fetchBookingDetail();
                  } catch (e) {
                    // ignore UI-only errors for now
                  } finally {
                    setIsPaying(false);
                  }
                }}
              >
                {isPaying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.sendBtnText}>Confirm Payment Method</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* If a payment method has already been recorded on the booking, show a read-only confirmation message. */}
        {((booking as any).payment && (booking as any).payment.payment_method) && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FFD60A15' }]}> 
                <FontAwesome name="money" size={16} color="#FFD60A" />
              </View>
              <ThemedText style={styles.sectionTitle}>Payment</ThemedText>
            </View>
            <View style={{ paddingVertical: 8 }}>
              <ThemedText style={{ color: '#666', marginBottom: 8 }}>Payment method confirmed:</ThemedText>
              <ThemedText style={{ fontWeight: '700' }}>{((booking as any).payment.payment_method || '').toString().toUpperCase()}</ThemedText>
            </View>
          </View>
        )}

        {/* Location Section */}
        {/* removed raw JSON debug block */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
              <FontAwesome name="map-marker" size={16} color="#FF3B30" />
            </View>
            <ThemedText style={styles.sectionTitle}>Service Location</ThemedText>
          </View>

          {booking.service_location ? (
            <>
              <View style={styles.locationDetails}>
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Street</ThemedText>
                  <ThemedText style={styles.locationValue}>{booking.service_location.street_name}</ThemedText>
                </View>
                {booking.service_location.subdivision_village && (
                  <View style={styles.locationRow}>
                    <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                    <ThemedText style={styles.locationValue}>{booking.service_location.subdivision_village}</ThemedText>
                  </View>
                )}
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                  <ThemedText style={styles.locationValue}>{booking.service_location.barangay}</ThemedText>
                </View>
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>City</ThemedText>
                  <ThemedText style={styles.locationValue}>{booking.service_location.city_municipality}</ThemedText>
                </View>
                {booking.service_location.landmark && (
                  <View style={styles.locationRow}>
                    <ThemedText style={styles.locationLabel}>Landmark</ThemedText>
                    <ThemedText style={styles.locationValue}>{booking.service_location.landmark}</ThemedText>
                  </View>
                )}
              </View>

              {booking.status === 'on_the_way' && (
                <TouchableOpacity style={styles.navigateButton} onPress={handleNavigateToLocation} activeOpacity={0.7}>
                  <View style={styles.navigateIconCircle}>
                    <FontAwesome name="location-arrow" size={18} color="#fff" />
                  </View>
                  <View style={styles.navigateTextContainer}>
                    <ThemedText style={styles.navigateTitle}>Open Live Location Map</ThemedText>
                    <ThemedText style={styles.navigateSubtitle}>Track mechanic and booking location</ThemedText>
                  </View>
                  <FontAwesome name="map" size={14} color="#FF8C00" />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <View style={styles.noLocationCard}>
              <FontAwesome name="map-o" size={24} color="#555" />
              <ThemedText style={styles.noLocationText}>No location specified</ThemedText>
            </View>
          )}
        </View>

        {showPricingQuotationCard && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="calculator" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Pricing & Quotation</ThemedText>
            </View>

            <View style={styles.receiptList}>
              <ThemedText style={[styles.noteLabel, { marginBottom: 8 }]}>Travel, Traffic & Convenience</ThemedText>

              {convenienceBreakdown ? (
                <>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>Base Fee</ThemedText>
                    <ThemedText style={styles.receiptAmount}>₱{convenienceBreakdown.baseFee.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>Distance Fee ({convenienceBreakdown.distanceKm.toFixed(2)} km)</ThemedText>
                    <ThemedText style={styles.receiptAmount}>₱{convenienceBreakdown.distanceFee.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>
                      {convenienceBreakdown.estimated ? 'Estimated Traffic Surcharge' : 'Traffic Surcharge'} ({convenienceBreakdown.trafficLabel})
                    </ThemedText>
                    <ThemedText style={styles.receiptAmount}>₱{convenienceBreakdown.trafficFee.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>Convenience Fee</ThemedText>
                    <ThemedText style={styles.receiptAmount}>₱{convenienceBreakdown.totalConvenienceFee.toFixed(2)}</ThemedText>
                  </View>
                  {typeof convenienceBreakdown.etaMinutes === 'number' && convenienceBreakdown.etaMinutes > 0 && (
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptItem}>Estimated ETA</ThemedText>
                      <ThemedText style={styles.receiptAmount}>{convenienceBreakdown.etaMinutes} min</ThemedText>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteText}>
                    Convenience fee will appear after mechanic starts travel.
                  </ThemedText>
                </View>
              )}

              <View style={styles.receiptDivider} />
              <ThemedText style={[styles.noteLabel, { marginBottom: 8 }]}>Quotation</ThemedText>

              {displayQuotation && (displayQuotation.items || []).length > 0 ? (
                (displayQuotation.items || []).map((it: any, idx: number) => (
                  <View key={idx} style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                    <ThemedText style={styles.receiptAmount}>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                  </View>
                ))
              ) : (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteText}>No quotation available yet.</ThemedText>
                </View>
              )}

              <View style={styles.receiptDivider} />
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Service & Add-ons Subtotal</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{serviceSubtotalTotal.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Travel Fee Total</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{travelFeeTotal.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Traffic Surcharge</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{trafficFeeTotal.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Convenience Fee</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{convenienceFeeTotal.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Total Estimated Amount</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{totalFee.toFixed(2)}</ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Booking Timeline */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="clock-o" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.sectionTitle}>Timeline</ThemedText>
          </View>
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: '#007AFF' }]} />
              <View style={styles.timelineContent}>
                <ThemedText style={styles.timelineLabel}>Booked</ThemedText>
                <ThemedText style={styles.timelineDate}>{formatDate(booking.booked_at)}</ThemedText>
              </View>
            </View>
            <View style={styles.timelineLine} />

            {booking.active_details?.started_at && (
              <>
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: '#FF8C00' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>Started</ThemedText>
                    <ThemedText style={styles.timelineDate}>{formatDate(booking.active_details.started_at)}</ThemedText>
                  </View>
                </View>
                <View style={styles.timelineLine} />
              </>
            )}

            {booking.updated_at && booking.updated_at !== booking.booked_at && (
              <>
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: '#8E8E93' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>Last Updated</ThemedText>
                    <ThemedText style={styles.timelineDate}>{formatDate(booking.updated_at)}</ThemedText>
                  </View>
                </View>
                <View style={styles.timelineLine} />
              </>
            )}

            {booking.completed_at && (
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: '#34C759' }]} />
                <View style={styles.timelineContent}>
                  <ThemedText style={styles.timelineLabel}>Completed</ThemedText>
                  <ThemedText style={styles.timelineDate}>{formatDate(booking.completed_at)}</ThemedText>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Active Details */}
        {(booking.status === 'active' || booking.status === 'on_the_way') && booking.active_details && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="info-circle" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Job Status</ThemedText>
            </View>
            <View style={styles.detailChips}>
              <View style={[styles.chip, booking.active_details.is_job_done ? styles.chipSuccess : styles.chipDefault]}>
                <FontAwesome
                  name={booking.active_details.is_job_done ? 'check' : 'clock-o'}
                  size={12}
                  color={booking.active_details.is_job_done ? '#34C759' : '#8E8E93'}
                />
                <ThemedText style={[styles.chipText, booking.active_details.is_job_done && { color: '#34C759' }]}>
                  {booking.active_details.is_job_done ? 'Job Done' : 'In Progress'}
                </ThemedText>
              </View>
              {booking.active_details.is_rescheduled && (
                <View style={[styles.chip, styles.chipWarning]}>
                  <FontAwesome name="calendar" size={12} color="#FFD60A" />
                  <ThemedText style={[styles.chipText, { color: '#FFD60A' }]}>Rescheduled</ThemedText>
                </View>
              )}
            </View>
            {booking.active_details.reason && (
              <View style={styles.noteBox}>
                <ThemedText style={styles.noteLabel}>Note:</ThemedText>
                <ThemedText style={styles.noteText}>{booking.active_details.reason}</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Request Backjob button (placed under Timeline) */}
        {booking.status === 'completed' && (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.navigateButton, { flexDirection: 'row', justifyContent: 'center' }]}
              onPress={() => setBackjobModalVisible(true)}
              activeOpacity={0.85}
            >
              <FontAwesome name="wrench" size={16} color="#FF8C00" />
              <ThemedText style={{ color: '#FF8C00', fontWeight: '700', marginLeft: 10 }}>Request Backjob</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Completion Details */}
        {booking.status === 'completed' && booking.completion_details && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="check-circle" size={16} color="#34C759" />
              </View>
              <ThemedText style={styles.sectionTitle}>Completion Details</ThemedText>
            </View>
            <View style={styles.completionInfo}>
              <View style={styles.completionRow}>
                <ThemedText style={styles.completionLabel}>Total Amount</ThemedText>
                <ThemedText style={styles.completionAmount}>
                  ₱{parseFloat(String(booking.completion_details.total_amount || '0')).toFixed(2)}
                </ThemedText>
              </View>
              {booking.completion_details.notes && (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteLabel}>Notes:</ThemedText>
                  <ThemedText style={styles.noteText}>{booking.completion_details.notes}</ThemedText>
                </View>
              )}
              
            </View>
          </View>
        )}

        {/* Cancellation Details */}
        {booking.status === 'cancelled' && booking.cancellation_details && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
                <FontAwesome name="times-circle" size={16} color="#FF3B30" />
              </View>
              <ThemedText style={styles.sectionTitle}>Cancellation Details</ThemedText>
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Cancelled By</ThemedText>
                <ThemedText style={styles.infoValue}>{booking.cancellation_details.cancelled_by.name}</ThemedText>
              </View>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Date</ThemedText>
                <ThemedText style={styles.infoValue}>{formatDate(booking.cancellation_details.cancelled_at)}</ThemedText>
              </View>
              {booking.cancellation_details.reason && (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteLabel}>Reason:</ThemedText>
                  <ThemedText style={styles.noteText}>{booking.cancellation_details.reason}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Rework Details */}
        {booking.status === 'reworked' && booking.rework_details && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FFD60A15' }]}>
                <FontAwesome name="refresh" size={16} color="#FFD60A" />
              </View>
              <ThemedText style={styles.sectionTitle}>Rework Details</ThemedText>
            </View>
            <View style={styles.infoGrid}>
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Requested By</ThemedText>
                <ThemedText style={styles.infoValue}>{booking.rework_details.requested_by.name}</ThemedText>
              </View>
              {booking.rework_details.reason && (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteLabel}>Reason:</ThemedText>
                  <ThemedText style={styles.noteText}>{booking.rework_details.reason}</ThemedText>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Backjob Request Modal (UI) */}
        <Modal visible={backjobModalVisible} animationType="slide" transparent={true} onRequestClose={() => setBackjobModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
              <View style={styles.modalBox}>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <FontAwesome name="wrench" size={18} color="#FF8C00" />
                    <ThemedText style={styles.modalTitle}>Request Backjob</ThemedText>
                  </View>
                  <TouchableOpacity onPress={() => setBackjobModalVisible(false)}>
                    <FontAwesome name="times" size={20} color="#8E8E93" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalContent}>
                  <ThemedText style={{ color: '#8E8E93', marginBottom: 8 }}>Please provide a reason and an optional image to help the mechanic understand the issue.</ThemedText>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Reason for backjob..."
                    placeholderTextColor="#6C6C70"
                    multiline
                    numberOfLines={3}
                    value={backjobReason}
                    onChangeText={setBackjobReason}
                  />

                  <View style={{ height: 12 }} />
                  {backjobImage ? (
                    <View style={styles.imagePreviewContainer}>
                      <Image source={{ uri: backjobImage }} style={styles.previewImage} />
                      <TouchableOpacity style={styles.removeImageBtn} onPress={() => setBackjobImage(null)}>
                        <FontAwesome name="times-circle" size={28} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addPhotoBtn} onPress={pickBackjobImage}>
                      <FontAwesome name="camera" size={28} color="#8E8E93" />
                      <ThemedText style={styles.addPhotoText}>Add Photo</ThemedText>
                    </TouchableOpacity>
                  )}

                  <View style={{ height: 12 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setBackjobModalVisible(false)}>
                      <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sendBtn, { flex: 1 }]}
                      onPress={async () => {
                        // submit backjob then open chat
                        try {
                          const form = new FormData();
                          if (backjobReason && backjobReason.trim()) form.append('reason', backjobReason.trim());
                          if (backjobImage) {
                            const response = await fetch(backjobImage);
                            const blob = await response.blob();
                            const filename = backjobImage.split('/').pop() || 'photo.jpg';
                            // @ts-ignore
                            form.append('images', { uri: backjobImage, name: filename, type: blob.type });
                          }
                          const headers: any = {};
                          try {
                            const token = await AsyncStorage.getItem('auth_token');
                            if (token) headers['Authorization'] = `Bearer ${token}`;
                          } catch (e) {}
                          await fetch(`${API_URL}/chat/booking/${booking?.id}/backjob/`, {
                            method: 'POST',
                            headers,
                            credentials: 'include',
                            body: form as any,
                          });
                        } catch (e) {
                          // ignore UI-only errors for now
                        } finally {
                          setBackjobModalVisible(false);
                          openChatWithMechanic();
                        }
                      }}
                    >
                      <FontAwesome name="comments" size={14} color="#FFFFFF" />
                      <ThemedText style={styles.sendBtnText}>Chat with Mechanic</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

      </ScrollView>
    </ThemedView>
  );
}
