import React, { useState, useEffect, useCallback, useMemo } from 'react';
// Ensure the router header is hidden for this route so only the in-page header shows
export const screenOptions = { headerShown: false } as const;
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { router, useLocalSearchParams, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/bookingDetailsStyles';
import WalletBadge from '@/components/wallet-badge';
import AfterServicePhotoModal from '@/components/booking/AfterServicePhotoModal';
import { useNotification } from '@/hooks/useNotification';
import { useConfirmation } from '@/hooks/useConfirmation';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { CashQRDisplayModal, PendingPaymentModal } from '@/components/payment';
import {
  bookingHasAcceptedBackjob,
  bookingHasBackjob,
  bookingInBackjobPaymentPhase,
  canOpenBookingChat,
} from '@/lib/bookingAccess';
import { fetchBookingChatPreview } from '@/lib/bookingChatPreview';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { fetchProfileDetailsCached } from '@/lib/profileCache';
import { reverseGeocodeAddress, coerceBarangayForDisplay } from '@/lib/locationAddress';
import { sortQuotationItemsForDisplay } from '@/lib/quotationOrdering';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const parseApiErrorMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== 'object') return fallback;
  const value = (payload as Record<string, unknown>).error;
  return typeof value === 'string' && value.trim() ? value : fallback;
};

const PHOTO_GRID_BREAKPOINT = 440;

function mergeGalleryWithLegacy(gallery: string[] | undefined, legacy: string | null | undefined) {
  const norm = (u: string) => String(u || '').replace(/\s+/g, '').trim();
  const list = (gallery || []).map(norm).filter(Boolean);
  const leg = norm(String(legacy || ''));
  if (!leg) return list;
  if (list.some((u) => u === leg)) return list;
  return [leg, ...list];
}

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
    vehicle_type?: string | null;
    vehicle_brand?: string | null;
    vehicle_model?: string | null;
    created_at: string;
    assigned_mechanics?: Array<{
      mechanic?: { id: number };
      role?: 'lead' | 'assistant' | string;
    }>;
  };
  provider?: {
    id: number;
    name: string;
    email: string;
  } | null;
  service_location?: {
    street_name: string;
    subdivision_village?: string;
    barangay: string;
    city_municipality: string;
    landmark?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  active_details?: {
    before_picture?: string | null;
    after_picture?: string | null;
    before_pictures?: string[];
    after_pictures?: string[];
    is_job_done: boolean;
    is_rescheduled: boolean;
    reason: string | null;
    new_time: string | null;
    new_date: string | null;
    started_at: string | null;
    paused_at: string | null;
    total_pause_duration: string | null;
  };
  completion_details?: {
    completed_at: string;
    total_amount: number;
    notes: string;
  };
  location?: {
    barangay?: string | null;
    lat?: number | null;
    lng?: number | null;
    navigation_allowed?: boolean;
  } | null;
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
  // Client info from home API or serializer
  client?: {
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
  };
  has_backjob?: boolean;
  backjob?: {
    id: number;
    status: string;
    reason?: string | null;
    images?: string[];
    requested_by?: { id: number; name: string } | null;
    created_at?: string | null;
  } | null;
  payment_summary?: {
    payment_status?: string;
    total_paid?: number;
    remaining_balance?: number;
    installments?: Array<{
      id?: number;
      installment_type?: string;
      amount?: number;
      status?: string;
      paid_at?: string | null;
      released_at?: string | null;
    }>;
  };
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

const FLOW_STATUSES = {
  quotationVisible: ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'pending_payment', 'completed'],
  quotationEditable: ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active'],
  livePricing: ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'paused', 'finished'],
} as const;

const hasStatus = (statusValue: string | null | undefined, allowed: readonly string[]): boolean => {
  const normalized = String(statusValue || '').toLowerCase();
  return allowed.includes(normalized);
};

const shouldUseLiveAdditivePricing = (statusValue?: string | null): boolean => {
  return hasStatus(statusValue, FLOW_STATUSES.livePricing);
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

export default function BookingDetailScreen() {
  const { bookingId, source } = useLocalSearchParams<{ bookingId: string; source?: string }>();
  const navigation = useNavigation();
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const photoGridCols = windowWidth >= PHOTO_GRID_BREAKPOINT ? 3 : 2;
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [transitioning, setTransitioning] = useState(false);
  const [startTravelSubmitting, setStartTravelSubmitting] = useState(false);
  const [cancelTravelLoading, setCancelTravelLoading] = useState(false);
  const [arrivedLoading, setArrivedLoading] = useState(false);
  const [startDiagnosingLoading, setStartDiagnosingLoading] = useState(false);
  const [revertStageLoading, setRevertStageLoading] = useState(false);
  const [startJobLoading, setStartJobLoading] = useState(false);
  const [cancelJobLoading, setCancelJobLoading] = useState(false);
  const [pauseJobLoading, setPauseJobLoading] = useState(false);
  const [resumeJobLoading, setResumeJobLoading] = useState(false);
  const [finishJobLoading, setFinishJobLoading] = useState(false);
  const [showBeforeServicePhotoModal, setShowBeforeServicePhotoModal] = useState(false);
  const [showAppendBeforePhotosModal, setShowAppendBeforePhotosModal] = useState(false);
  const [appendBeforePhotosLoading, setAppendBeforePhotosLoading] = useState(false);
  const [showAfterServicePhotoModal, setShowAfterServicePhotoModal] = useState(false);
  const [paymentReceivedLoading, setPaymentReceivedLoading] = useState(false);
  const [cancelBookingLoading, setCancelBookingLoading] = useState(false);
  const [pausedRevertLoading, setPausedRevertLoading] = useState(false);
  const [pendingRevertLoading, setPendingRevertLoading] = useState(false);
  const [acceptRequestLoading, setAcceptRequestLoading] = useState(false);
  const [declineRequestLoading, setDeclineRequestLoading] = useState(false);
  const [showPaymentReceiptConfirm, setShowPaymentReceiptConfirm] = useState(false);
  const [showPendingPayment, setShowPendingPayment] = useState(false);
  const [showCashQR, setShowCashQR] = useState(false);
  const [paymentReceived, setPaymentReceived] = useState(false);
  const [quotationListExpanded, setQuotationListExpanded] = useState(false);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<Record<string, boolean>>({});
  const [chatChangeLabelByKey, setChatChangeLabelByKey] = useState<Record<string, 'Added' | 'Edited' | 'Removed'>>({});
  const [pendingQuoteSnapshot, setPendingQuoteSnapshot] = useState<any | null>(null);
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [visibleBeforePhotoCount, setVisibleBeforePhotoCount] = useState(6);
  const [visibleAfterPhotoCount, setVisibleAfterPhotoCount] = useState(6);
  const [beforePhotosExpanded, setBeforePhotosExpanded] = useState(false);
  const [afterPhotosExpanded, setAfterPhotosExpanded] = useState(false);
  const [photoLoadingMap, setPhotoLoadingMap] = useState<Record<string, boolean>>({});
  const [photoErrorMap, setPhotoErrorMap] = useState<Record<string, boolean>>({});
  const [resolvedEmergencyLocation, setResolvedEmergencyLocation] = useState<{
    street_name?: string;
    barangay?: string;
    city_municipality?: string;
  } | null>(null);
  const routerHook = useRouter();
  const isMechanicShopSource = source === 'mechanic_shop';
  const [quotation, setQuotation] = useState<any | null>(null);
  const [currentAccountId, setCurrentAccountId] = useState<number | null>(null);
  const { lastMessage } = useWebSocketContext();

  useEffect(() => {
    setVisibleBeforePhotoCount(6);
    setVisibleAfterPhotoCount(6);
    setBeforePhotosExpanded(false);
    setAfterPhotosExpanded(false);
    setPhotoLoadingMap({});
    setPhotoErrorMap({});
  }, [booking?.id]);

  const toggleBeforePhotosAccordion = useCallback(() => {
    setBeforePhotosExpanded((prev) => !prev);
    setPhotoLoadingMap({});
    setPhotoErrorMap({});
  }, []);

  const toggleAfterPhotosAccordion = useCallback(() => {
    setAfterPhotosExpanded((prev) => !prev);
    setPhotoLoadingMap({});
    setPhotoErrorMap({});
  }, []);

  useEffect(() => {
    let isMounted = true;

    const isEmergencyPlaceholder = (value: string | null | undefined) => {
      const text = String(value || '').trim().toLowerCase();
      return text === 'emergency' || text === 'emergency location';
    };

    const resolveEmergencyLocationText = async () => {
      const isEmergency = String(booking?.request?.type || '').toLowerCase() === 'emergency';
      if (!isEmergency || !booking?.service_location) {
        setResolvedEmergencyLocation(null);
        return;
      }

      const street = booking.service_location.street_name;
      const barangay = booking.service_location.barangay;
      const city = booking.service_location.city_municipality;
      const needsOverride =
        isEmergencyPlaceholder(street) ||
        isEmergencyPlaceholder(barangay) ||
        isEmergencyPlaceholder(city);

      if (!needsOverride) {
        setResolvedEmergencyLocation(null);
        return;
      }

      const lat =
        (booking.service_location as any)?.latitude ??
        (booking.location as any)?.lat;
      const lng =
        (booking.service_location as any)?.longitude ??
        (booking.location as any)?.lng;

      if (lat == null || lng == null) {
        setResolvedEmergencyLocation(null);
        return;
      }

      try {
        const parsed = await reverseGeocodeAddress(Number(lat), Number(lng));

        if (!isMounted) return;

        setResolvedEmergencyLocation({
          street_name: parsed.streetName || street || undefined,
          barangay: parsed.barangay || barangay || undefined,
          city_municipality: parsed.city || city || undefined,
        });
      } catch {
        if (isMounted) setResolvedEmergencyLocation(null);
      }
    };

    resolveEmergencyLocationText();
    return () => {
      isMounted = false;
    };
  }, [booking]);

  useEffect(() => {
    let mounted = true;
    const fetchCurrentAccount = async () => {
      try {
        const profile = await fetchProfileDetailsCached(false);
        if (!profile || !mounted) return;
        const aid = profile?.id || profile?.account_id || null;
        if (aid) setCurrentAccountId(Number(aid));
      } catch (e) {
        // ignore
      }
    };
    fetchCurrentAccount();
    return () => {
      mounted = false;
    };
  }, []);

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

  // Derive a default/display quotation: prefer saved `quotation`, otherwise build from booking.request.request_details
  const getDisplayQuotation = () => {
    const isBackjobBooking = bookingHasBackjob(booking as any);
    const details = (booking && booking.request && (booking.request as any).request_details) || null;
    if (!details && !(quotation && (quotation.items || []).length > 0)) return null;
    const toPrice = (value: any) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };
    // Backjob: do not re-inject originally booked base service into quotation display.
    const expectedServiceItems: any[] = isBackjobBooking ? [] : (() => {
      const rows: any[] = [];
      if (details?.service) {
        const svc: any = details.service;
        rows.push({
          description: svc.name || 'Service',
          quantity: 1,
          unit_price: toPrice(svc.minimum_price ?? svc.price),
          service: svc.id,
          line_kind: 'service',
          status: 'accepted',
        });
      }
      if (Array.isArray(details?.services) && details.services.length > 0) {
        details.services.forEach((svc: any) => {
          rows.push({
            description: svc?.name || 'Service',
            quantity: 1,
            unit_price: toPrice(svc?.minimum_price ?? svc?.price),
            service: svc?.id,
            line_kind: 'service',
            status: 'accepted',
          });
        });
      }
      return rows;
    })();
    const applyPendingSnapshotOverlay = (baseRows: any[]) => {
      const snapshotItems = Array.isArray(pendingQuoteSnapshot?.items) ? pendingQuoteSnapshot.items : [];
      if (!snapshotItems.length) return baseRows;

      const mergedRows = [...baseRows];
      const rowById = new Map<string, number>();
      mergedRows.forEach((row: any, idx: number) => {
        if (row?.id != null) rowById.set(String(row.id), idx);
      });

      snapshotItems.forEach((row: any) => {
        const changeType = String(row?.change_type || '').toLowerCase();
        const rowId = row?.id != null ? String(row.id) : null;
        const targetIdx = rowId != null && rowById.has(rowId) ? Number(rowById.get(rowId)) : -1;

        if (changeType === 'added') {
          mergedRows.push({
            ...row,
            status: 'pending',
            change_type: 'added',
          });
          return;
        }

        if (targetIdx >= 0) {
          mergedRows[targetIdx] = {
            ...mergedRows[targetIdx],
            ...row,
            status: 'pending',
            change_type: changeType || mergedRows[targetIdx]?.change_type || null,
          };
        }
      });

      return mergedRows;
    };

    if (quotation && (quotation.items || []).length > 0) {
      const mergedItems = [...(quotation.items || [])];
      expectedServiceItems.forEach((svcRow: any) => {
        const sid = Number(svcRow?.service);
        if (!Number.isFinite(sid) || sid <= 0) return;
        const exists = mergedItems.some((it: any) => Number(it?.service) === sid && String(it?.status || '').toLowerCase() !== 'rejected');
        if (!exists) mergedItems.push(svcRow);
      });
      const overlayedItems = applyPendingSnapshotOverlay(mergedItems);
      const mergedTotal = overlayedItems.reduce((sum: number, it: any) => {
        const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
        const qty = Number(it?.quantity ?? 1) || 1;
        return sum + (price * qty);
      }, 0);
      return {
        ...quotation,
        status: pendingQuoteSnapshot?.status || quotation?.status,
        items: overlayedItems,
        total_amount: Math.max(Number(pendingQuoteSnapshot?.total_amount || 0), Number(quotation?.total_amount || 0), mergedTotal),
      };
    }

    if (!details) return null;
    const items: any[] = [];

    if (details?.service) {
      const svc: any = details.service;
      const unit = toPrice(svc.minimum_price ?? svc.price);
      items.push({ description: svc.name || 'Service', quantity: 1, unit_price: unit, service: svc.id });
    }

    if (Array.isArray(details?.services) && details.services.length > 0) {
      details.services.forEach((svc: any) => {
        const unit = toPrice(svc?.minimum_price ?? svc?.price);
        items.push({ description: svc?.name || 'Service', quantity: 1, unit_price: unit, service: svc?.id });
      });
    }

    if (Array.isArray(details?.add_ons) && details.add_ons.length > 0) {
      details.add_ons.forEach((addOn: any) => {
        const unit = toPrice(addOn?.price);
        items.push({ description: addOn?.name || 'Add-on', quantity: 1, unit_price: unit, service_add_on: addOn?.id });
      });
    }

    let total_amount = items.reduce((s, it) => s + ((Number(it.unit_price) || 0) * (Number(it.quantity) || 1)), 0);

    if (total_amount <= 0) {
      const amountFee = toPrice((booking as any)?.amount_fee);
      const convenienceFee = toPrice((booking as any)?.convenience_fee);
      const useLiveAdditivePricing = shouldUseLiveAdditivePricing((booking as any)?.status);

      const persistedDistanceKm = Number((booking as any)?.distance_km || 0);
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

      const persistedTrafficSurcharge = Number((booking as any)?.traffic_surcharge);
      const hasPersistedTrafficSurcharge = Number.isFinite(persistedTrafficSurcharge) && persistedTrafficSurcharge >= 0;

      const levelRaw = String((booking as any)?.traffic_level || 'moderate').toLowerCase();
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
  const hasLivePendingQuoteRequest = Boolean(
    pendingQuoteSnapshot && String(pendingQuoteSnapshot?.status || '').toLowerCase() === 'pending'
  );
  const isQuotationPending = hasLivePendingQuoteRequest || Boolean(
    (quotation && quotation.status === 'pending') || (displayQuotation && displayQuotation.status === 'pending')
  );

  const convenienceBreakdown = useMemo(() => {
    if (!booking) return null;

    const baseDistanceFee = Number(pricingConfig.base_distance_fee || 0);
    const ratePerKm = Number(pricingConfig.price_per_km || 0);
    const conveniencePct = Number(pricingConfig.convenience_fee_percentage || 0) / 100;
    const convenienceFixed = Number(pricingConfig.convenience_fee_fixed || 0);

    const safeDistanceKm = Math.max(0, Number((booking as any).distance_km || 0));
    const persistedConvenienceFee = Number((booking as any).convenience_fee || 0);
    const hasPersistedConvenience = Number.isFinite(persistedConvenienceFee) && persistedConvenienceFee > 0;

    let baseFee = 0;
    let distanceFee = 0;
    let trafficFee = 0;
    let travelFee = 0;

    if (hasPersistedConvenience) {
      baseFee = safeDistanceKm > 0 ? baseDistanceFee : 0;
      const persistedTrafficSurcharge = Number((booking as any).traffic_surcharge);
      const hasPersistedTrafficSurcharge = Number.isFinite(persistedTrafficSurcharge) && persistedTrafficSurcharge >= 0;
      trafficFee = hasPersistedTrafficSurcharge ? persistedTrafficSurcharge : 0;
      distanceFee = Math.max(0, persistedConvenienceFee - baseFee - trafficFee);
      travelFee = baseFee + distanceFee;
    } else {
      baseFee = safeDistanceKm > 0 ? baseDistanceFee : 0;
      distanceFee = safeDistanceKm * ratePerKm;
      travelFee = baseFee + distanceFee;
    }

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
    if (!hasPersistedConvenience) {
      trafficFee = hasPersistedTrafficSurcharge ? persistedTrafficSurcharge : estimatedTrafficFee;
    }

    const quotationSubtotal = parseFloat(String(displayQuotation?.total_amount || 0)) || 0;
    const amountFee = Number((booking as any).amount_fee || 0);
    const bookingStatus = String((booking as any).status || '').toLowerCase();
    const useLiveAdditivePricing = shouldUseLiveAdditivePricing(bookingStatus);
    const serviceSubtotal = quotationSubtotal > 0
      ? quotationSubtotal
      : useLiveAdditivePricing
        ? solveServiceSubtotalFromAmount(amountFee, travelFee, trafficFee, conveniencePct, convenienceFixed)
        : Math.max(0, amountFee - travelFee - trafficFee - (hasPersistedConvenience ? persistedConvenienceFee : 0));

    const estimatedConvenienceFee = (serviceSubtotal * conveniencePct) + convenienceFixed;
    const totalConvenienceFee = hasPersistedConvenience ? persistedConvenienceFee : estimatedConvenienceFee;
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

  // Quotation estimated total (sum only accepted items) - placed at top-level to respect Hooks rules
  const getItemStatus = (it: any, parentQuotation: any) => {
    if (!it) return 'accepted';
    return it.status || it.quotation_status || it.state || (parentQuotation && parentQuotation.status) || 'accepted';
  };

  const serviceItemIds = React.useMemo(() => {
    const details = (booking && booking.request && (booking.request as any).request_details) || null;
    const ids = new Set<number>();
    const single = Number(details?.service?.id);
    if (Number.isFinite(single) && single > 0) ids.add(single);
    const list = Array.isArray(details?.services) ? details.services : [];
    list.forEach((svc: any) => {
      const parsed = Number(svc?.id);
      if (Number.isFinite(parsed) && parsed > 0) ids.add(parsed);
    });
    return ids;
  }, [booking]);

  const sortedQuotationItems = React.useMemo(() => {
    const items = (displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : [];
    return sortQuotationItemsForDisplay(items, serviceItemIds);
  }, [displayQuotation, serviceItemIds]);

  const getQuoteItemKey = (it: any, idx: number) => String(it?.id ?? `quote-${idx}`);
  const getQuoteSnapshotKeys = (it: any): string[] => {
    const keys: string[] = [];
    const id = it?.id;
    if (id != null) keys.push(`id:${String(id)}`);
    const serviceId = Number(it?.service);
    const addOnId = Number(it?.service_add_on);
    if (Number.isFinite(serviceId) && serviceId > 0) keys.push(`service:${serviceId}`);
    if (Number.isFinite(addOnId) && addOnId > 0) keys.push(`addon:${addOnId}`);
    const desc = String(it?.description || '').trim().toLowerCase();
    const qty = Number(it?.quantity ?? 1) || 1;
    const unit = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    keys.push(`row:${desc}|${qty}|${unit.toFixed(2)}`);
    return keys;
  };

  const toggleQuoteItem = (key: string) => {
    setExpandedQuoteItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getAssocKey = (it: any) => {
    const serviceId = Number(it?.service);
    const addOnId = Number(it?.service_add_on);
    if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
    if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
    return null;
  };

  const getExplicitChangeLabel = (it: any): 'Added' | 'Edited' | 'Removed' | null => {
    const raw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
    if (raw === 'added' || raw.includes('add')) return 'Added';
    if (raw === 'edited' || raw.includes('edit') || raw.includes('update') || raw.includes('modify')) return 'Edited';
    if (raw === 'removed' || raw.includes('remove') || raw.includes('delete')) return 'Removed';
    return null;
  };

  const inferChangeLabel = (it: any, acceptedByAssoc: Record<string, any>, acceptedRows: any[], removedRows: any[]) => {
    const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
    const normalizeNum = (v: any) => Number(v ?? 0);
    const isLikelyRename = (aRaw: any, bRaw: any) => {
      const a = normalizeText(aRaw);
      const b = normalizeText(bRaw);
      if (!a || !b) return false;
      if (a === b || a.includes(b) || b.includes(a)) return true;
      const aTokens = new Set(a.split(/\s+/).filter(Boolean));
      const bTokens = new Set(b.split(/\s+/).filter(Boolean));
      if (!aTokens.size || !bTokens.size) return false;
      let overlap = 0;
      aTokens.forEach(t => { if (bTokens.has(t)) overlap += 1; });
      return (overlap / aTokens.size) >= 0.6 || (overlap / bTokens.size) >= 0.6;
    };

    const assocKey = getAssocKey(it);
    const editedFromRemoved = (removedRows || []).find((row: any) => {
      const rowAssoc = getAssocKey(row);
      if (assocKey && rowAssoc && assocKey === rowAssoc) return true;
      // Only allow name-based "edited" fallback for rows without stable assoc ids,
      // and only when quantity + unit price are the same.
      if (assocKey || rowAssoc) return false;
      const rowDesc = normalizeText(row?.description);
      const curDesc = normalizeText(it?.description);
      if (!rowDesc || !curDesc) return false;
      if (rowDesc === curDesc) return false;
      const rowQty = normalizeNum(row?.quantity ?? 1);
      const curQty = normalizeNum(it?.quantity ?? 1);
      const rowUnit = normalizeNum(row?.unit_price ?? row?.price ?? 0);
      const curUnit = normalizeNum(it?.unit_price ?? it?.price ?? 0);
      if (rowQty !== curQty || rowUnit !== curUnit) return false;
      return isLikelyRename(rowDesc, curDesc);
    });

    const explicit = getExplicitChangeLabel(it);
    if (explicit) return explicit;
    const raw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
    if (raw.includes('edit') || raw.includes('update') || raw.includes('modify')) return 'Edited';
    if (it?.previous_description || it?.previous_quantity != null || it?.previous_unit_price != null) {
      return 'Edited';
    }
    if (it?.is_edited === true || it?.is_modified === true) return 'Edited';

    const statusRaw = String(it?.status || it?.quotation_status || it?.state || '').toLowerCase();
    if (raw.includes('remove') || raw.includes('delete')) return 'Removed';
    if (statusRaw === 'rejected') return 'Removed';

    if (raw.includes('add')) {
      return editedFromRemoved ? 'Edited' : 'Added';
    }

    if (it?.is_removed === true || it?.is_deleted === true) return 'Removed';
    if (it?.is_added === true) return 'Added';

    if (editedFromRemoved) return 'Edited';

    return null;
  };

  const quotationEstimatedTotal = React.useMemo(() => {
    const items = (displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : [];
    if (!items || items.length === 0) return 0;
    return items.reduce((sum: number, it: any) => {
      const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
      const qty = Number(it?.quantity ?? 1) || 1;
      const status = String(getItemStatus(it, quotation) || '').toLowerCase();
      if (status === 'accepted') {
        return sum + price * qty;
      }
      return sum;
    }, 0);
  }, [displayQuotation, quotation]);
  const pendingRequestedQuotationTotal = React.useMemo(() => {
    if (!hasLivePendingQuoteRequest) return null;
    const pendingTotal = Number((pendingQuoteSnapshot as any)?.total_amount);
    if (!Number.isFinite(pendingTotal) || pendingTotal < 0) return null;
    return pendingTotal;
  }, [hasLivePendingQuoteRequest, pendingQuoteSnapshot]);

  useEffect(() => {
    try { navigation.setOptions && navigation.setOptions({ headerShown: false }); } catch (e) {}
    try { navigation.getParent && navigation.getParent()?.setOptions && navigation.getParent()?.setOptions({ headerShown: false }); } catch (e) {}
    try { navigation.getParent && navigation.getParent()?.getParent && navigation.getParent()?.getParent()?.setOptions && navigation.getParent()?.getParent()?.setOptions({ headerShown: false }); } catch (e) {}
    let interval: ReturnType<typeof setInterval> | null = null;
    const hasStarted = !!(booking && booking.active_details && booking.active_details.started_at);
    // Only run the ticking interval when the job has started, status is active, AND it is not paused
    if (hasStarted && booking?.status === 'active' && !isPaused) {
      interval = setInterval(() => {
        setTimer(prevTimer => prevTimer + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [booking?.active_details?.started_at, booking?.status, isPaused]);

  // Listen for websocket events and refresh when quotation accepted or booking update for this booking
  useEffect(() => {
    try {
      if (!lastMessage) return;
      const message = lastMessage as unknown as Record<string, unknown>;
      const bid = Number(message.booking_id ?? message.bookingId ?? message.booking);
      if (!bid || !bookingId) return;
      if (bid === Number(bookingId)) {
        const action = (lastMessage.action || lastMessage.type || '').toString().toLowerCase();

        switch (action) {
          case 'payment.completed':
          case 'completed':
            setShowCashQR(false);
            setShowPendingPayment(false);
            setPaymentReceived(true);
            fetchBookingDetail();
            break;
          default:
            break;
        }

        if (['quotation_accepted', 'quotationaccepted', 'booking_updated', 'booking_update', 'new_chat_message', 'new_chatmessage'].includes(action)) {
          // refresh mechanic view to reflect accepted quotation and updated totals
          fetchBookingDetail();
          fetchQuotation();
          (async () => {
            const id = Number(bookingId);
            if (!Number.isFinite(id) || id <= 0) return;
            const preview = await fetchBookingChatPreview(id);
            if (!preview) return;
            setChatPreview(preview.lastPreview || null);
          })();
        }
      }
    } catch (e) {
      // ignore
    }
  }, [lastMessage, bookingId, booking?.has_backjob, booking?.backjob?.status]);

  useEffect(() => {
    if (booking?.status === 'completed') {
      setShowCashQR(false);
      setShowPendingPayment(false);
    }
  }, [booking?.status, booking?.has_backjob, booking?.backjob?.status]);

  const fetchBookingDetail = useCallback(async () => {
    if (!bookingId) return;
    try {
      setError(null);
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch booking details');
      const data = await response.json() as any;
      const bookingData = data.booking || data;
      setBooking(bookingData);
      const currentStatus = bookingData.status;

      // Compute accurate paused timer when status is 'paused'
      if (currentStatus === 'paused' && bookingData.active_details && bookingData.active_details.paused_at) {
        const pausedAt = bookingData.active_details.paused_at;
        const startedAt = bookingData.active_details.started_at;
        const totalPauseRaw = bookingData.active_details.total_pause_duration;
        // total_pause_duration may be sent as a string like "HH:MM:SS" or number of seconds
        let totalPauseSeconds = 0;
        if (totalPauseRaw) {
          if (typeof totalPauseRaw === 'number') {
            totalPauseSeconds = Math.floor(totalPauseRaw);
          } else if (typeof totalPauseRaw === 'string') {
            const parts = totalPauseRaw.split(':').map((p: string) => Number(p));
            if (parts.length === 3) totalPauseSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) totalPauseSeconds = parts[0] * 60 + parts[1];
            else totalPauseSeconds = Math.floor(Number(totalPauseRaw)) || 0;
          }
        }

        let elapsedSeconds = 0;
        if (startedAt && pausedAt) {
          const startedMs = new Date(startedAt).getTime();
          const pausedMs = new Date(pausedAt).getTime();
          if (!isNaN(startedMs) && !isNaN(pausedMs)) {
            // elapsed while active is from started to paused, minus any accumulated pause duration
            elapsedSeconds = Math.floor((pausedMs - startedMs) / 1000) - Math.floor(totalPauseSeconds);
          }
        }
        if (elapsedSeconds < 0) elapsedSeconds = 0;

        setTimer(Math.floor(elapsedSeconds));
        setIsPaused(true);
      } else if (currentStatus === 'active' && bookingData.active_details && bookingData.active_details.started_at) {
        // Active and running: compute elapsed since started minus total_pause_duration
        const startedAt = bookingData.active_details.started_at;
        const totalPauseRaw = bookingData.active_details.total_pause_duration;
        let totalPauseSeconds = 0;
        if (totalPauseRaw) {
          if (typeof totalPauseRaw === 'number') {
            totalPauseSeconds = Math.floor(totalPauseRaw);
          } else if (typeof totalPauseRaw === 'string') {
            const parts = totalPauseRaw.split(':').map((p: string) => Number(p));
            if (parts.length === 3) totalPauseSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) totalPauseSeconds = parts[0] * 60 + parts[1];
            else totalPauseSeconds = Math.floor(Number(totalPauseRaw)) || 0;
          }
        }

        let elapsedSeconds = 0;
        if (startedAt) {
          const startedMs = new Date(startedAt).getTime();
          const nowMs = Date.now();
          if (!isNaN(startedMs)) elapsedSeconds = Math.floor((nowMs - startedMs) / 1000) - Math.floor(totalPauseSeconds);
        }
        if (elapsedSeconds < 0) elapsedSeconds = 0;
        setTimer(Math.floor(elapsedSeconds));
        setIsPaused(false);
      } else {
        setIsPaused(false);
        setTimer(0);
      }
    } catch (err: any) {
      // If fetching a booking failed, attempt to fetch a request with the same id.
      // This covers pending direct requests which may exist as requests but not as bookings yet.
      try {
        const reqRes = await fetch(`${API_URL}/bookings/requests/${bookingId}/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (reqRes.ok) {
          const reqData = await reqRes.json() as any;
          const requestObj = reqData.request || reqData;
          // Map request shape to BookingDetail-like object for the UI
          const mappedBooking = {
            id: Number(requestObj.id),
            status: 'pending',
            amount_fee: requestObj.quoted_price ?? requestObj.amount_fee ?? 0,
            booked_at: requestObj.created_at || new Date().toISOString(),
            updated_at: requestObj.updated_at || requestObj.created_at || new Date().toISOString(),
            request: {
              id: requestObj.id,
              type: requestObj.type,
              vehicle_type: requestObj.vehicle_type ?? requestObj.request_details?.vehicle_type ?? null,
              created_at: requestObj.created_at,
              request_details: requestObj.request_details || null,
            },
            provider: null,
            service_location: requestObj.service_location || null,
            active_details: null,
            client: requestObj.client || requestObj.user || null,
            has_backjob: false,
          } as unknown as BookingDetail;

          setBooking(mappedBooking);
          setError(null);
        } else {
          setError(err.message || 'Failed to load booking');
        }
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || err.message || 'Failed to load booking');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchBookingDetail();

    // Poll every 15 seconds so status updates appear without manual refresh
    const interval = setInterval(fetchBookingDetail, 15000);
    return () => clearInterval(interval);
  }, [fetchBookingDetail]);

  // Faster temporary sync while quotation request is pending
  // so accept/reject updates reflect quickly in pricing/details.
  useEffect(() => {
    if (!hasLivePendingQuoteRequest) return;
    const quickInterval = setInterval(() => {
      fetchBookingDetail();
      refreshChatQuotationLabels();
    }, 2000);
    return () => clearInterval(quickInterval);
  }, [hasLivePendingQuoteRequest, fetchBookingDetail, refreshChatQuotationLabels]);

  const fetchQuotation = async () => {
    if (!bookingId) return;
    try {
      const res = await fetch(
        `${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/?_=${Date.now()}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!res.ok) {
        setQuotation(null);
        return;
      }
      const data = await res.json() as any;
      setQuotation(data);
    } catch (e) {
      setQuotation(null);
    }
  };

  const loadChatPreview = useCallback(async () => {
    const id = Number(bookingId);
    if (!Number.isFinite(id) || id <= 0) {
      setChatPreview(null);
      return;
    }
    const preview = await fetchBookingChatPreview(id);
    if (!preview) return;
    setChatPreview(preview.lastPreview || null);
  }, [bookingId]);

  const refreshChatQuotationLabels = useCallback(async () => {
    if (!bookingId) return;
    try {
      const convRes = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!convRes.ok) return;
      const conv = await convRes.json();
      const convId = Number(conv?.id || 0);
      if (!Number.isFinite(convId) || convId <= 0) return;

      const msgRes = await fetch(`${API_URL}/chat/${convId}/messages/?mark_read=1`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!msgRes.ok) return;
      const rows = await msgRes.json();
      if (!Array.isArray(rows) || !rows.length) return;

      const parsePayload = (raw: any): any | null => {
        if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : null;
        try {
          const first = JSON.parse(raw);
          if (first && typeof first === 'object') return first;
          if (typeof first === 'string') {
            const nested = first.trim();
            if (nested.startsWith('{')) {
              const second = JSON.parse(nested);
              return second && typeof second === 'object' ? second : null;
            }
          }
        } catch {
          return null;
        }
        return null;
      };

      const quoteMessages = rows
        .map((m: any) => ({ ...m, __payload: parsePayload(m?.content) }))
        .filter((m: any) => m.__payload && m.__payload.type === 'quotation_request')
        .sort((a: any, b: any) => {
          const ta = Number(new Date(String(a?.created_at || '')).getTime()) || 0;
          const tb = Number(new Date(String(b?.created_at || '')).getTime()) || 0;
          if (tb !== ta) return tb - ta;
          return Number(b?.id || 0) - Number(a?.id || 0);
        });
      const latestQuoteMsg = quoteMessages[0];
      if (!latestQuoteMsg) {
        setPendingQuoteSnapshot(null);
        setChatChangeLabelByKey({});
        return;
      }
      const payload = latestQuoteMsg.__payload;
      if (payload && payload.type === 'quotation_request' && String(payload?.status || '').toLowerCase() === 'pending') {
        setPendingQuoteSnapshot(payload);
      } else {
        setPendingQuoteSnapshot(null);
        setChatChangeLabelByKey({});
        return;
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];

      const previousQuoteMsg = quoteMessages.find((m: any) => {
        if (m?.id === latestQuoteMsg?.id) return false;
        return String(m?.__payload?.quotation_id || '') === String(payload?.quotation_id || '');
      });
      const previousPayload = previousQuoteMsg ? previousQuoteMsg.__payload : null;
      let previousItems = Array.isArray(previousPayload?.items) ? previousPayload.items : [];
      if (String(previousPayload?.status || '').toLowerCase() === 'accepted') {
        previousItems = previousItems.filter((it: any) => {
          const ct = String(it?.change_type || '').toLowerCase();
          const st = String(it?.status || '').toLowerCase();
          if (ct === 'removed' || ct.includes('remove')) return false;
          if (st === 'rejected') return false;
          return true;
        });
      }

      const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
      const normalizeNum = (v: any) => Number(v ?? 0);
      const usedPrevIndexes = new Set<number>();
      const nextMap: Record<string, 'Added' | 'Edited' | 'Removed'> = {};

      items.forEach((it: any) => {
        const raw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
        const status = String(it?.status || '').toLowerCase();
        let label: 'Added' | 'Edited' | 'Removed' | null = null;
        if (raw.includes('remove') || raw.includes('delete') || status === 'rejected' || it?.is_removed === true || it?.is_deleted === true) {
          label = 'Removed';
        } else if (
          raw.includes('edit') ||
          raw.includes('update') ||
          raw.includes('modify') ||
          it?.previous_description != null ||
          it?.previous_quantity != null ||
          it?.previous_unit_price != null ||
          it?.is_edited === true ||
          it?.is_modified === true
        ) {
          label = 'Edited';
        } else if (raw.includes('add') || it?.is_added === true) {
          label = 'Added';
        } else {
          const assocKey = getAssocKey(it);
          const matchIndex = previousItems.findIndex((prevIt: any, prevIdx: number) => {
            if (usedPrevIndexes.has(prevIdx)) return false;

            if (it?.id != null && prevIt?.id != null && String(prevIt.id) === String(it.id)) {
              return true;
            }

            const prevAssocKey = getAssocKey(prevIt);
            if (assocKey && prevAssocKey && assocKey === prevAssocKey) {
              return true;
            }

            return (
              normalizeText(prevIt?.description) === normalizeText(it?.description) &&
              normalizeNum(prevIt?.quantity) === normalizeNum(it?.quantity) &&
              normalizeNum(prevIt?.unit_price) === normalizeNum(it?.unit_price)
            );
          });

          if (matchIndex >= 0) {
            usedPrevIndexes.add(matchIndex);
            const prevIt = previousItems[matchIndex];
            const hasDiff =
              normalizeText(prevIt?.description) !== normalizeText(it?.description) ||
              normalizeNum(prevIt?.quantity) !== normalizeNum(it?.quantity) ||
              normalizeNum(prevIt?.unit_price) !== normalizeNum(it?.unit_price);

            if (hasDiff) {
              label = 'Edited';
            }
          }
        }
        if (!label) return;
        getQuoteSnapshotKeys(it).forEach((k) => {
          nextMap[k] = label as 'Added' | 'Edited' | 'Removed';
        });
      });

      setChatChangeLabelByKey(nextMap);
    } catch {
      // ignore
    }
  }, [bookingId]);

  useEffect(() => {
    // fetch quotation when booking loads
    if (bookingId) {
      fetchQuotation();
      loadChatPreview();
      refreshChatQuotationLabels();
    }
  }, [bookingId, loadChatPreview, refreshChatQuotationLabels]);

  // Refetch when the screen regains focus (e.g., after editing a quotation)
  useFocusEffect(
    React.useCallback(() => {
      if (!bookingId) return;
      fetchQuotation();
      loadChatPreview();
      refreshChatQuotationLabels();
      // also refresh booking details to keep amounts in sync
      fetchBookingDetail();
    }, [bookingId, fetchBookingDetail, loadChatPreview, refreshChatQuotationLabels])
  );

  const refreshOnTheWayLock = async () => {
    if (!booking || booking.status !== 'on_the_way') return;

    const payload = await buildMechanicLocationPayload();
    const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/start-travel/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(parseApiErrorMessage(err, 'Failed to refresh on-the-way pricing'));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshOnTheWayLock();
    } catch (err: any) {
      showNotification({ type: 'warning', message: err.message || 'Unable to refresh on-the-way pricing' });
    } finally {
      fetchBookingDetail();
    }
  };

  const handleCompleteBooking = async () => {
    if (!booking) return;
    setCompleting(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/complete/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(parseApiErrorMessage(err, 'Failed to complete booking'));
      }
      // refresh booking
      setShowPendingPayment(false);
      setShowCashQR(false);
      await fetchBookingDetail();
      showNotification({
        type: 'success',
        message: bookingHasBackjob(booking) ? 'Backjob completed.' : 'Booking completed.',
      });
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to mark booking as complete' });
    } finally {
      setCompleting(false);
    }
  };

  // Map backend status to user-friendly label and color
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Booked';
      case 'active': return 'On Going';
      case 'on_the_way': return 'On the Way';
      case 'paused': return 'Paused';
      case 'finished': return 'Finished';
      case 'pending_payment': return 'Pending Payment';
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
      case 'paused': return '#8E8E93';
      case 'finished': return '#34C759';
      case 'pending_payment': return '#FFD60A';
      case 'reworked': return '#FFD60A';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'pending': return '#8E8E93';
      case 'disputed': return '#AF52DE';
      default: return '#8E8E93';
    }
  };
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return 'calendar-check-o';
      case 'active': return 'play-circle';
      case 'on_the_way': return 'car';
      case 'paused': return 'pause-circle';
      case 'finished': return 'check-circle';
      case 'pending_payment': return 'money';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'pending': return 'clock-o';
      case 'reworked': return 'refresh';
      case 'disputed': return 'exclamation-circle';
      default: return 'circle';
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleNavigateToClient = () => {
    if (booking?.status === 'completed' || booking?.location?.navigation_allowed === false) {
      showNotification({ type: 'warning', message: 'Navigation is unavailable after job completion.' });
      return;
    }

    if (!booking?.service_location) {
      showNotification({ type: 'warning', message: 'No service location available for this booking.' });
      return;
    }
    router.push({
      pathname: '/mechanic/booking/booking_location_map',
      params: {
        bookingId: String(booking.id),
        role: 'mechanic',
      },
    });
  };

  // --- New handlers for status transitions ---
  const handleStatusUpdate = async (
    endpoint: string,
    successMessage: string,
    errorMessage: string,
    payload?: Record<string, any>
  ): Promise<boolean> => {
    if (!booking) return false;
    setTransitioning(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/${endpoint}/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(parseApiErrorMessage(errData, errorMessage));
      }

      const result = await response.json().catch(() => ({}));
      if (endpoint === 'start-travel' || endpoint === 'cancel-job') {
        setBooking((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: (result as any).status || prev.status,
            distance_km: (result as any).distance_km ?? prev.distance_km,
            estimated_eta_minutes: (result as any).estimated_eta_minutes ?? prev.estimated_eta_minutes,
            convenience_fee: (result as any).convenience_fee ?? prev.convenience_fee,
            traffic_level: (result as any).traffic_level ?? prev.traffic_level,
          };
        });
      }

      showNotification({ type: 'success', message: successMessage });
      await fetchBookingDetail();
      return true;
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || errorMessage });
      return false;
    } finally {
      setTransitioning(false);
    }
  };

  const buildMechanicLocationPayload = async (): Promise<Record<string, any>> => {
    try {
      const permission = await ensureForegroundLocationAccess();
      if (!permission.granted) return {};

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return {
        mechanic_latitude: current.coords.latitude,
        mechanic_longitude: current.coords.longitude,
      };
    } catch {
      return {};
    }
  };

  const handleStartTravel = async () => {
    if (startTravelSubmitting || transitioning) return;

    setStartTravelSubmitting(true);
    try {
      const payload = await buildMechanicLocationPayload();
      if (payload.mechanic_latitude == null || payload.mechanic_longitude == null) {
        showNotification({ type: 'warning', message: 'Location is required to start travel and refresh traffic. Please enable GPS.' });
        return;
      }

      const ok = await handleStatusUpdate('start-travel', 'Status updated to On The Way!', 'Failed to start travel', payload);
      if (ok && bookingId) {
        router.push({
          pathname: '/mechanic/booking/booking_location_map',
          params: {
            bookingId: String(bookingId),
            role: 'mechanic',
          },
        });
      }
    } finally {
      setStartTravelSubmitting(false);
    }
  };
  const handleCancelTravel = async () => {
    if (cancelTravelLoading || transitioning) return;
    if (!booking) return;
    const ok = await confirm({
      type: 'warning',
      title: 'Cancel Travel',
      message: 'Are you sure you want to cancel travel and revert to previous status?',
      confirmText: 'Cancel Travel',
      cancelText: 'Keep Going',
    });
    if (!ok) return;

    setCancelTravelLoading(true);
    try {
      await handleStatusUpdate('cancel-travel', 'Travel cancelled.', 'Failed to cancel travel');
    } finally {
      setCancelTravelLoading(false);
    }
  };

  const handleArrived = async () => {
    if (arrivedLoading || transitioning) return;
    setArrivedLoading(true);
    try {
      await handleStatusUpdate('arrived', 'Marked as at location.', 'Failed to mark arrived');
    } finally {
      setArrivedLoading(false);
    }
  };

  const handleStartDiagnosing = async () => {
    if (startDiagnosingLoading || transitioning) return;
    setStartDiagnosingLoading(true);
    try {
      await handleStatusUpdate('start-diagnosing', 'Diagnosing with the client.', 'Failed to start diagnosing');
    } finally {
      setStartDiagnosingLoading(false);
    }
  };

  const handleRevertStage = async (successMessage: string) => {
    if (!booking || revertStageLoading || transitioning) return;
    setRevertStageLoading(true);
    try {
      const payload = await buildMechanicLocationPayload();
      await handleStatusUpdate('revert-stage', successMessage, 'Failed to go back', payload);
    } finally {
      setRevertStageLoading(false);
    }
  };

  const handleStartJob = async () => {
    if (startJobLoading || transitioning) return;
    if (!booking) return;

    const existingBeforePhotos = mergeGalleryWithLegacy(
      booking.active_details?.before_pictures,
      booking.active_details?.before_picture ?? null
    );

    // First start-job requires before-service photos; if already uploaded before, allow direct restart.
    if (!existingBeforePhotos.length) {
      setShowBeforeServicePhotoModal(true);
      return;
    }

    setStartJobLoading(true);
    try {
      await handleStatusUpdate('start-job', 'Status updated to Active!', 'Failed to start job');
    } finally {
      setStartJobLoading(false);
    }
  };
  const handleCancelJob = async () => {
    if (cancelJobLoading || transitioning) return;
    if (!booking) return;
    const ok = await confirm({
      type: 'warning',
      title: 'Go Back',
      message: 'Are you sure you want to go back? This will revert the job to On the Way.',
      confirmText: 'Go Back',
      cancelText: 'Stay',
    });
    if (!ok) return;
    setCancelJobLoading(true);
    try {
      const payload = await buildMechanicLocationPayload();
      await handleStatusUpdate('cancel-job', 'Job cancelled.', 'Failed to cancel job', payload);
    } finally {
      setCancelJobLoading(false);
    }
  };
  const handlePauseJob = async () => {
    if (pauseJobLoading || transitioning) return;
    setPauseJobLoading(true);
    try {
      await handleStatusUpdate('pause-job', 'Job paused.', 'Failed to pause job');
    } finally {
      setPauseJobLoading(false);
    }
  };
  const handleResumeJob = async () => {
    if (resumeJobLoading || transitioning) return;
    setResumeJobLoading(true);
    try {
      await handleStatusUpdate('resume-job', 'Job resumed.', 'Failed to resume job');
    } finally {
      setResumeJobLoading(false);
    }
  };
  const handleFinishJob = async () => {
    if (finishJobLoading || transitioning) return;
    if (!booking) return;
    setShowAfterServicePhotoModal(true);
  };

  const handleSubmitBeforeServicePhoto = async (photoUris: string[]) => {
    if (!booking || !photoUris?.length) return;

    setStartJobLoading(true);
    setTransitioning(true);
    try {
      const formData = new FormData();

      photoUris.forEach((photoUri, index) => {
        const fileName = photoUri.split('/').pop() || `before-service-${booking.id}-${index + 1}.jpg`;
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

        formData.append('before_pictures', {
          uri: photoUri,
          name: fileName,
          type: mime,
        } as any);
      });

      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/start-job/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorMessage(payload, 'Failed to start job'));
      }

      setShowBeforeServicePhotoModal(false);
      showNotification({ type: 'success', message: 'Status updated to Active!' });
      await fetchBookingDetail();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to start job' });
    } finally {
      setStartJobLoading(false);
      setTransitioning(false);
    }
  };

  const handleSubmitAppendBeforePhotos = async (photoUris: string[]) => {
    if (!booking || !photoUris?.length) return;

    setAppendBeforePhotosLoading(true);
    setTransitioning(true);
    try {
      const formData = new FormData();
      photoUris.forEach((photoUri, index) => {
        const fileName = photoUri.split('/').pop() || `before-extra-${booking.id}-${index + 1}.jpg`;
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        formData.append('before_pictures', {
          uri: photoUri,
          name: fileName,
          type: mime,
        } as any);
      });

      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/append-before-photos/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorMessage(payload, 'Failed to upload photos'));
      }

      setShowAppendBeforePhotosModal(false);
      showNotification({ type: 'success', message: 'Before photos added.' });
      await fetchBookingDetail();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to upload photos' });
    } finally {
      setAppendBeforePhotosLoading(false);
      setTransitioning(false);
    }
  };

  const handleSubmitAfterServicePhoto = async (photoUris: string[]) => {
    if (!booking || !photoUris?.length) return;

    setFinishJobLoading(true);
    setTransitioning(true);
    try {
      const formData = new FormData();
      photoUris.forEach((photoUri, index) => {
        const fileName = photoUri.split('/').pop() || `after-service-${booking.id}-${index + 1}.jpg`;
        const ext = fileName.split('.').pop()?.toLowerCase();
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

        formData.append('after_pictures', {
          uri: photoUri,
          name: fileName,
          type: mime,
        } as any);
      });

      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/finish-job/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(parseApiErrorMessage(payload, 'Failed to finish job'));
      }

      setShowAfterServicePhotoModal(false);
      const okMsg =
        typeof payload.message === 'string' && payload.message.trim()
          ? String(payload.message).trim()
          : bookingHasBackjob(booking)
            ? 'Backjob moved to payment / completion step.'
            : 'Job finished. Pending payment.';
      showNotification({ type: 'success', message: okMsg });
      await fetchBookingDetail();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to finish job' });
    } finally {
      setFinishJobLoading(false);
      setTransitioning(false);
    }
  };
  const handlePaymentReceived = async () => {
    if (paymentReceivedLoading || transitioning) return;
    setPaymentReceivedLoading(true);
    try {
      await handleStatusUpdate('payment-received', 'Payment received.', 'Failed to confirm payment');
    } finally {
      setPaymentReceivedLoading(false);
    }
  };
  const handleCancelBooking = async () => {
    if (cancelBookingLoading || transitioning) return;
    if (!booking) return;
    const ok = await confirm({
      type: 'danger',
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking? This action cannot be undone.',
      confirmText: 'Cancel Booking',
      cancelText: 'Keep Booking',
    });
    if (!ok) return;

    setCancelBookingLoading(true);
    try {
      await handleStatusUpdate('cancel-booking', 'Booking cancelled.', 'Failed to cancel booking');
    } finally {
      setCancelBookingLoading(false);
    }
  };

  // Accept / Decline for pending requests
  const handleAcceptRequest = async () => {
    if (!booking || !booking.request) return;
    if (acceptRequestLoading) return;
    const requestId = booking.request.id;
    setAcceptRequestLoading(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/requests/${requestId}/accept/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(parseApiErrorMessage(err, 'Failed to accept request'));
      }
      const payload = await response.json().catch(() => ({} as any));
      const acceptedBookingId = Number(
        payload?.booking_id ?? payload?.bookingId ?? payload?.booking?.id ?? payload?.booking
      );
      showNotification({ type: 'success', message: 'Request accepted' });
      if (Number.isFinite(acceptedBookingId) && acceptedBookingId > 0) {
        router.replace({
          pathname: '/mechanic/booking/booking_details',
          params: {
            bookingId: String(acceptedBookingId),
            ...(source ? { source } : {}),
          },
        });
      } else {
        router.back();
      }
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to accept request' });
    } finally {
      setAcceptRequestLoading(false);
    }
  };

  const handleDeclineRequest = async () => {
    if (!booking || !booking.request) return;
    if (declineRequestLoading) return;
    const ok = await confirm({ type: 'danger', title: 'Decline Request', message: 'Are you sure you want to decline this request?', confirmText: 'Decline', cancelText: 'Keep' });
    if (!ok) return;
    const requestId = booking.request.id;
    setDeclineRequestLoading(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/requests/${requestId}/decline/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(parseApiErrorMessage(err, 'Failed to decline request'));
      }
      showNotification({ type: 'success', message: 'Request declined' });
      // After decline, go back to list
      router.back();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to decline request' });
    } finally {
      setDeclineRequestLoading(false);
    }
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
          <TouchableOpacity style={styles.retryButton} onPress={fetchBookingDetail}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const clientName = booking.client
    ? `${booking.client.firstname || ''} ${booking.client.lastname || ''}`.trim() || booking.client.username || 'Client'
    : 'Client';
  const resolvedVehicleType =
    booking.request?.vehicle_type ||
    (booking.request as any)?.request_details?.vehicle_type ||
    (booking.request as any)?.request_details?.vehicle?.type ||
    null;
  const resolvedVehicleBrand =
    booking.request?.vehicle_brand ||
    (booking.request as any)?.request_details?.vehicle_brand ||
    (booking.request as any)?.request_details?.vehicle?.brand ||
    null;
  const resolvedVehicleModel =
    booking.request?.vehicle_model ||
    (booking.request as any)?.request_details?.vehicle_model ||
    (booking.request as any)?.request_details?.vehicle?.model ||
    null;
  const locationText = (value?: string | null, fallback = 'Unavailable') => {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const normalized = text.toLowerCase();
    if (normalized === 'emergency' || normalized === 'emergency location' || normalized === 'unknown barangay' || normalized === 'unknown city') {
      return fallback;
    }
    return text;
  };

  const inferFromStreetAddress = (streetRaw?: string | null) => {
    const streetText = String(streetRaw || '').trim();
    if (!streetText.includes(',')) {
      return { street: streetText, barangay: '', city: '' };
    }
    const parts = streetText
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      return { street: streetText, barangay: '', city: '' };
    }

    const primaryStreet = parts[0];
    let barangay = '';
    let city = '';
    if (parts.length >= 3) {
      if (/^brgy\.?\s|^barangay\s/i.test(parts[1])) {
        barangay = parts[1];
        city = parts[2];
      } else {
        city = parts[1];
      }
    } else {
      city = parts[1];
    }
    return { street: primaryStreet, barangay, city };
  };

  const displayServiceLocation = booking.service_location
    ? {
        ...booking.service_location,
        ...resolvedEmergencyLocation,
      }
    : null;

  const convenienceFeeTotal = convenienceBreakdown ? convenienceBreakdown.totalConvenienceFee : 0;
  const totalFee = convenienceFeeTotal + quotationEstimatedTotal;
  const inferredStreetParts = inferFromStreetAddress(displayServiceLocation?.street_name);

  const acceptedByAssoc: Record<string, any> = {};
  const acceptedRows: any[] = [];
  const removedRows: any[] = [];
  sortedQuotationItems.forEach((row: any) => {
    const rowStatus = String(row?.status || row?.quotation_status || row?.state || quotation?.status || '').toLowerCase();
    const key = getAssocKey(row);
    if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) {
      acceptedByAssoc[key] = row;
    }
    if (rowStatus === 'accepted') acceptedRows.push(row);
    if (rowStatus === 'rejected') removedRows.push(row);
  });

  const backjobCreatedAtMs = Number(new Date(String((booking as any)?.backjob?.created_at || '')).getTime());
  const hasBackjobCreatedAt = Number.isFinite(backjobCreatedAtMs) && backjobCreatedAtMs > 0;
  const isLineCreatedAfterBackjob = (it: any) => {
    const lineMs = Number(new Date(String(it?.created_at || '')).getTime());
    if (!Number.isFinite(lineMs) || lineMs <= 0 || !hasBackjobCreatedAt) return false;
    return lineMs >= backjobCreatedAtMs;
  };
  const shouldIncludeItemInBackjobQuoteAmountTotals = (it: any) => {
    if (Boolean(it?.is_backjob_new_line)) return true;
    if (isLineCreatedAfterBackjob(it)) return true;
    const explicit = getExplicitChangeLabel(it);
    const inferred = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
    const chat = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
    const raw = explicit || chat || inferred || null;
    return raw === 'Added';
  };

  const quotationPendingDeltaTotal = sortedQuotationItems.reduce((sum: number, it: any) => {
    if (bookingInBackjobPaymentPhase(booking) && !shouldIncludeItemInBackjobQuoteAmountTotals(it)) {
      return sum;
    }
    const statusRaw = String(it?.status || it?.quotation_status || it?.state || quotation?.status || '').toLowerCase();
    if (statusRaw !== 'pending') return sum;

    const explicitChangeLabel = getExplicitChangeLabel(it);
    const inferredChangeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
    const chatDerivedChangeLabel = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
    const rawChangeLabel = explicitChangeLabel || chatDerivedChangeLabel || inferredChangeLabel || null;
    let changeLabel = rawChangeLabel;
    if (
      bookingInBackjobPaymentPhase(booking) &&
      !changeLabel &&
      (Boolean(it?.is_backjob_new_line) || isLineCreatedAfterBackjob(it))
    ) {
      changeLabel = 'Added';
    }
    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    const qty = Number(it?.quantity ?? 1) || 1;
    const currentTotal = price * qty;

    if (changeLabel === 'Added') return sum + currentTotal;
    if (changeLabel === 'Edited') {
      const assocKey = getAssocKey(it);
      const before = assocKey ? acceptedByAssoc[assocKey] : null;
      const beforePrice = Number(before?.unit_price ?? before?.price ?? 0) || 0;
      const beforeQty = Number(before?.quantity ?? 1) || 1;
      return sum + Math.max(0, currentTotal - (beforePrice * beforeQty));
    }
    return sum;
  }, 0);

  const quotationAcceptedDeltaTotal = sortedQuotationItems.reduce((sum: number, it: any) => {
    if (bookingInBackjobPaymentPhase(booking) && !shouldIncludeItemInBackjobQuoteAmountTotals(it)) {
      return sum;
    }
    const statusRaw = String(it?.status || it?.quotation_status || it?.state || quotation?.status || '').toLowerCase();
    if (statusRaw !== 'accepted') return sum;

    const explicitChangeLabel = getExplicitChangeLabel(it);
    const inferredChangeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
    const chatDerivedChangeLabel = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
    let changeLabel = explicitChangeLabel || chatDerivedChangeLabel || inferredChangeLabel || null;
    if (
      bookingInBackjobPaymentPhase(booking) &&
      !changeLabel &&
      (Boolean(it?.is_backjob_new_line) || isLineCreatedAfterBackjob(it))
    ) {
      changeLabel = 'Added';
    }
    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    const qty = Number(it?.quantity ?? 1) || 1;
    const currentTotal = price * qty;

    if (changeLabel === 'Added') return sum + currentTotal;
    return sum;
  }, 0);

  const renderQuotationRow = (it: any, idx: number) => {
    const itemStatus = it && (it.status || it.quotation_status || it.state) ? (it.status || it.quotation_status || it.state) : (quotation && quotation.status) || 'pending';
    const statusRaw = String(itemStatus || '').toLowerCase();
    const isPending = statusRaw === 'pending';
    const quotationStatusRaw = String((quotation && quotation.status) || '').toLowerCase();
    const isPendingQuotationRequest = quotationStatusRaw === 'pending';
    const explicitChangeLabel = getExplicitChangeLabel(it);
    const inferredChangeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
    const chatDerivedChangeLabel = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
    const rawChangeLabel = explicitChangeLabel || chatDerivedChangeLabel || inferredChangeLabel || null;
    const changeLabel = (isPending || isPendingQuotationRequest) ? rawChangeLabel : null;
    const isRemoved = changeLabel === 'Removed';
    const desc = it?.description || it?.name || (it.service && `Service #${it.service}`) || 'Item';
    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    const qty = Number(it?.quantity ?? 1) || 1;
    const key = getQuoteItemKey(it, idx);
    const isExpanded = expandedQuoteItems[key] ?? false;
    const assocKey = getAssocKey(it);
    const isChargeableBackjobLine = Boolean(it?.is_backjob_new_line) || isLineCreatedAfterBackjob(it) || rawChangeLabel === 'Added';
    const shouldGhostQuotationLine = isAcceptedBackjob && !isChargeableBackjobLine;
    if (shouldGhostQuotationLine) return null;
    const beforeItem = it?.previous_description || it?.previous_quantity != null || it?.previous_unit_price != null
      ? {
          description: it?.previous_description,
          quantity: it?.previous_quantity,
          unit_price: it?.previous_unit_price,
        }
      : (changeLabel === 'Edited' && assocKey ? acceptedByAssoc[assocKey] : null);
    const beforeDesc = beforeItem?.description || (it?.service && `Service #${it.service}`) || 'Item';
    const beforePrice = Number(beforeItem?.unit_price ?? 0) || 0;
    const beforeQty = Number(beforeItem?.quantity ?? 1) || 1;
    const getChangePillStyle = (label: string | null) => {
      if (label === 'Added') {
        return {
          pill: { backgroundColor: '#8CE99A', borderColor: '#5FBF72' },
          text: { color: '#1D3A24' },
        };
      }
      if (label === 'Edited') {
        return {
          pill: { backgroundColor: '#FFD49A', borderColor: '#DCA85F' },
          text: { color: '#5A3D0A' },
        };
      }
      if (label === 'Removed') {
        return {
          pill: { backgroundColor: '#FFB4B0', borderColor: '#C97673' },
          text: { color: '#631B21' },
        };
      }
      return { pill: {}, text: {} };
    };
    const pillStyle = getChangePillStyle(changeLabel);

    return (
      <View key={key} style={[styles.quotationAccordionRow, changeLabel ? styles.pendingItem : styles.acceptedItem, isExpanded ? styles.quotationAccordionRowExpanded : null]}>
        <TouchableOpacity style={styles.quotationAccordionHeader} onPress={() => toggleQuoteItem(key)} activeOpacity={0.8}>
          <View style={styles.quoteHeaderLeft}>
            <ThemedText style={[styles.receiptItem, shouldGhostQuotationLine ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]} numberOfLines={2}>{desc}</ThemedText>
            {changeLabel ? (
              <View style={[styles.pendingPill, pillStyle.pill]}>
                <ThemedText style={[styles.pendingPillText, pillStyle.text]}>{changeLabel}</ThemedText>
              </View>
            ) : null}
          </View>
          <View style={styles.quotationAccordionRight}>
            <ThemedText style={[styles.receiptAmount, shouldGhostQuotationLine ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{(price * qty).toFixed(2)}</ThemedText>
            <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        {isExpanded ? (
          <View style={styles.quotationAccordionBody}>
            <View style={styles.quotationDetailTopRow}>
              <ThemedText style={styles.quotationDetailStatusText}>{changeLabel || 'Accepted'}</ThemedText>
            </View>
            {changeLabel ? (
              <View style={styles.receiptRow}>
                <ThemedText style={styles.quotationDetailLabel}>Change</ThemedText>
                <ThemedText style={styles.quotationDetailValue}>{changeLabel}</ThemedText>
              </View>
            ) : null}
            {changeLabel === 'Edited' && beforeItem ? (
              <>
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.quotationDetailLabel}>Before</ThemedText>
                  <ThemedText style={[styles.quotationDetailValue, { textDecorationLine: 'line-through', color: '#8E8E93' }]}>
                    {beforeDesc}
                  </ThemedText>
                </View>
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.quotationDetailLabel}>Before Price</ThemedText>
                  <ThemedText style={[styles.quotationDetailValue, { textDecorationLine: 'line-through', color: '#8E8E93' }]}>₱{(beforePrice * beforeQty).toFixed(2)}</ThemedText>
                </View>
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.quotationDetailLabel}>Now</ThemedText>
                  <ThemedText style={styles.quotationDetailValue}>{desc}</ThemedText>
                </View>
              </>
            ) : null}
            <View style={styles.receiptRow}>
              <ThemedText style={styles.quotationDetailLabel}>Unit Price</ThemedText>
              <ThemedText style={styles.quotationDetailValue}>₱{price.toFixed(2)}</ThemedText>
            </View>
            <View style={styles.receiptRow}>
              <ThemedText style={styles.quotationDetailLabel}>Quantity</ThemedText>
              <ThemedText style={styles.quotationDetailValue}>{qty}</ThemedText>
            </View>
          </View>
        ) : null}
      </View>
    );
  };
  const showPricingQuotationCard = hasStatus(booking.status, FLOW_STATUSES.quotationVisible)
    && !!(convenienceBreakdown || displayQuotation);
  const isCompletedBooking = String(booking.status || '').toLowerCase() === 'completed';
  const canEditQuotation = hasStatus(booking.status, FLOW_STATUSES.quotationEditable);
  const myAssignmentRole = (() => {
    const assigned = booking.request?.assigned_mechanics || [];
    if (!currentAccountId || !Array.isArray(assigned)) return null;
    const hit = assigned.find((a) => Number(a?.mechanic?.id) === Number(currentAccountId));
    return (hit?.role || null) as string | null;
  })();
  const canOpenQuotationEditor = myAssignmentRole !== 'assistant';

  const paymentSummary = booking.payment_summary || {};
  const summaryTotalAmount = Math.max(0, Number((paymentSummary as any).total_amount ?? booking.amount_fee ?? 0));
  const hasBackjob = bookingHasBackjob(booking);
  const isAcceptedBackjob = bookingHasAcceptedBackjob(booking);
  const backjobPaymentPhase = bookingInBackjobPaymentPhase(booking);
  const isBackjobChargeableQuotationLine = (it: any) => {
    if (Boolean(it?.is_backjob_new_line)) return true;
    const inferredChangeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
    const chatDerivedChangeLabel = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
    const rawChangeLabel = chatDerivedChangeLabel || inferredChangeLabel || null;
    if (isLineCreatedAfterBackjob(it)) return true;
    return rawChangeLabel === 'Added';
  };
  const visibleQuotationItems = isAcceptedBackjob
    ? sortedQuotationItems.filter((it: any) => isBackjobChargeableQuotationLine(it))
    : sortedQuotationItems;
  const oldQuotationItems = isAcceptedBackjob
    ? sortedQuotationItems.filter((it: any) => !isBackjobChargeableQuotationLine(it))
    : [];
  const oldReceiptSubtotal = oldQuotationItems.reduce((sum: number, it: any) => {
    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    const qty = Number(it?.quantity ?? 1) || 1;
    return sum + price * qty;
  }, 0);
  // Backjob extra work: sum accepted plus pending new lines (pending drops to 0 after the client accepts).
  const resolvedBackjobCharge = Math.max(0, quotationAcceptedDeltaTotal + quotationPendingDeltaTotal);
  const effectiveConvenienceFee = backjobPaymentPhase ? 0 : convenienceFeeTotal;
  const effectiveQuotationEstimate = backjobPaymentPhase ? resolvedBackjobCharge : quotationEstimatedTotal;
  const effectiveTotalFee = backjobPaymentPhase ? resolvedBackjobCharge : totalFee;
  const totalAmount = backjobPaymentPhase
    ? resolvedBackjobCharge
    : Math.max(0, Math.max(totalFee, summaryTotalAmount));
  const totalPaid = Number(paymentSummary.total_paid || 0);
  const remainingBalance = Math.max(0, totalAmount - totalPaid);
  const isBackjobFreeAwaitingMechanicClose =
    backjobPaymentPhase && booking.status === 'pending_payment' && totalAmount <= 0;
  const paymentStatus = isBackjobFreeAwaitingMechanicClose
    ? 'unpaid'
    : totalAmount <= 0
      ? 'fully_paid'
      : totalPaid >= totalAmount && totalAmount > 0
        ? 'fully_paid'
        : totalPaid > 0
          ? 'partially_paid'
          : 'unpaid';
  const paymentProgressPct =
    totalAmount > 0 ? Math.min(100, Math.max(0, (totalPaid / totalAmount) * 100)) : 0;
  const noPendingPaymentLeft = booking.status === 'pending_payment' && remainingBalance <= 0;
  const canProceedToCompletion = noPendingPaymentLeft && !isQuotationPending;
  const showBackjobCompletionFlow = canProceedToCompletion && backjobPaymentPhase;
  const showGeneralCompletionFlow = canProceedToCompletion && !backjobPaymentPhase;
  const showPendingPaymentFlow =
    booking.status === 'pending_payment' && remainingBalance > 0;
  const canShowPaymentModals =
    (!backjobPaymentPhase || totalAmount > 0) &&
    (booking.status === 'pending_payment' || booking.status === 'accepted');

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'fully_paid':
      case 'paid':
        return '#34C759';
      case 'partially_paid':
      case 'partial':
        return '#FFD60A';
      default:
        return '#8E8E93';
    }
  };

  const renderQuotationRawRow = (it: any, idx: number) => {
    const desc = it?.description || it?.name || (it.service && `Service #${it.service}`) || 'Item';
    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    const qty = Number(it?.quantity ?? 1) || 1;
    const lineTotal = price * qty;
    const key = getQuoteItemKey(it, idx);

    return (
      <View key={`raw-${key}`} style={[styles.noteBox, { marginBottom: 8 }]}>
        <View style={styles.receiptRow}>
          <ThemedText style={styles.receiptItem}>{desc}</ThemedText>
          <ThemedText style={styles.receiptAmount}>₱{lineTotal.toFixed(2)}</ThemedText>
        </View>
        <View style={styles.receiptRow}>
          <ThemedText style={styles.noteText}>Qty: {qty}</ThemedText>
          <ThemedText style={styles.noteText}>Unit: ₱{price.toFixed(2)}</ThemedText>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <FontAwesome name="refresh" size={16} color="#FF8C00" />
          </TouchableOpacity>
          {!isMechanicShopSource && <WalletBadge onPress={() => router.push('/mechanic/wallet')} />}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionButtonsContainer, { paddingBottom: 16 + Math.max(insets.bottom, 6) }]}>
        <View style={styles.actionBarInner}>
          {/* Pending: Decline + Accept */}
          {booking.status === 'pending' && (
            <View style={styles.actionRow}>
              <View style={styles.actionHalf}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.cancelButton,
                    { width: '100%' },
                    declineRequestLoading && styles.actionButtonDisabled,
                  ]}
                  onPress={handleDeclineRequest}
                  disabled={declineRequestLoading}
                  activeOpacity={0.85}
                >
                  {declineRequestLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="times" size={16} color="#fff" />
                      <ThemedText style={styles.actionButtonText}>Decline</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.actionHalf}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.completeButton,
                    { width: '100%' },
                    acceptRequestLoading && styles.actionButtonDisabled,
                  ]}
                  onPress={handleAcceptRequest}
                  disabled={acceptRequestLoading}
                  activeOpacity={0.85}
                >
                  {acceptRequestLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="check" size={16} color="#fff" />
                      <ThemedText style={styles.actionButtonText}>Accept</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {booking.status === 'accepted' && (
            <>
              <TouchableOpacity
                style={[
                  styles.largePrimaryButton,
                  (transitioning || startTravelSubmitting) && styles.actionButtonDisabled,
                ]}
                onPress={handleStartTravel}
                disabled={transitioning || startTravelSubmitting}
                activeOpacity={0.85}
              >
                {startTravelSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesome name="car" size={18} color="#fff" />
                )}
                <ThemedText style={styles.actionBarBtnText}>
                  {startTravelSubmitting ? 'Updating traffic & fee…' : 'Start travel'}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.largeSecondaryButton, cancelBookingLoading && styles.actionButtonDisabled]}
                onPress={handleCancelBooking}
                disabled={transitioning || cancelBookingLoading}
                activeOpacity={0.85}
              >
                {cancelBookingLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="times-circle" size={18} color="#FF6B6B" />
                    <ThemedText style={styles.actionBarBtnText}>Cancel booking</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {booking.status === 'on_the_way' && (
            <>
              <TouchableOpacity
                style={[
                  styles.largePrimaryButton,
                  (transitioning || arrivedLoading) && styles.actionButtonDisabled,
                ]}
                onPress={handleArrived}
                disabled={transitioning || arrivedLoading}
                activeOpacity={0.85}
              >
                {arrivedLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesome name="map-marker" size={18} color="#fff" />
                )}
                <ThemedText style={styles.actionBarBtnText}>Arrived at location</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.largeSecondaryButton, cancelTravelLoading && styles.actionButtonDisabled]}
                onPress={handleCancelTravel}
                disabled={transitioning || cancelTravelLoading}
                activeOpacity={0.85}
              >
                {cancelTravelLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="times-circle" size={18} color="#FF6B6B" />
                    <ThemedText style={styles.actionBarBtnText}>Cancel travel</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {booking.status === 'at_location' && (
            <>
              <TouchableOpacity
                style={[
                  styles.largePrimaryButton,
                  (transitioning || startDiagnosingLoading) && styles.actionButtonDisabled,
                ]}
                onPress={handleStartDiagnosing}
                disabled={transitioning || startDiagnosingLoading}
                activeOpacity={0.85}
              >
                {startDiagnosingLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesome name="users" size={18} color="#fff" />
                )}
                <ThemedText style={styles.actionBarBtnText}>Start diagnosing</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.neutralSecondaryButton, revertStageLoading && styles.actionButtonDisabled]}
                onPress={async () => {
                  const ok = await confirm({
                    type: 'warning',
                    title: 'Go Back',
                    message: 'Go back to traveling? Your status will return to On the Way.',
                    confirmText: 'Go Back',
                    cancelText: 'Stay',
                  });
                  if (!ok) return;
                  await handleRevertStage('Back to on the way.');
                }}
                disabled={transitioning || revertStageLoading}
                activeOpacity={0.85}
              >
                {revertStageLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="arrow-left" size={18} color="#AEAEB2" />
                    <ThemedText style={[styles.actionBarBtnText, { color: '#E5E5EA' }]}>Back to traveling</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {booking.status === 'diagnosing' && (
            <>
              <TouchableOpacity
                style={[styles.largePrimaryButton, startJobLoading && styles.actionButtonDisabled]}
                onPress={handleStartJob}
                disabled={transitioning || startJobLoading}
                activeOpacity={0.85}
              >
                {startJobLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesome name="play" size={18} color="#fff" />
                )}
                <ThemedText style={styles.actionBarBtnText}>Start job</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.neutralSecondaryButton, revertStageLoading && styles.actionButtonDisabled]}
                onPress={async () => {
                  const ok = await confirm({
                    type: 'warning',
                    title: 'Go Back',
                    message: 'Go back to At Location status?',
                    confirmText: 'Go Back',
                    cancelText: 'Stay',
                  });
                  if (!ok) return;
                  await handleRevertStage('Back to at location.');
                }}
                disabled={transitioning || revertStageLoading}
                activeOpacity={0.85}
              >
                {revertStageLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="arrow-left" size={18} color="#AEAEB2" />
                    <ThemedText style={[styles.actionBarBtnText, { color: '#E5E5EA' }]}>Back to at location</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {booking.status === 'active' && (
            <>
              {bookingHasBackjob(booking) &&
                bookingInBackjobPaymentPhase(booking) &&
                sortedQuotationItems.some((it: any) => {
                  const st = String(it?.status || '').toLowerCase();
                  return Boolean(it?.is_backjob_new_line) && st === 'pending';
                }) && (
                  <View style={[styles.noteBox, { marginBottom: 10 }]}>
                    <ThemedText style={styles.noteText}>
                      Some new quotation lines are still pending client approval. You cannot finish the job until the
                      client accepts or rejects them.
                    </ThemedText>
                  </View>
                )}
              <View style={styles.actionRow}>
                <View style={styles.actionHalf}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.pauseButton, pauseJobLoading && styles.actionButtonDisabled]}
                    onPress={handlePauseJob}
                    disabled={transitioning || pauseJobLoading}
                    activeOpacity={0.85}
                  >
                    {pauseJobLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <FontAwesome name="pause" size={16} color="#fff" />
                        <ThemedText style={styles.actionButtonText}>Pause</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.actionHalf}>
                  <TouchableOpacity
                    style={[
                      styles.neutralSecondaryButton,
                      { width: '100%' },
                      cancelJobLoading && styles.actionButtonDisabled,
                    ]}
                    onPress={handleCancelJob}
                    disabled={transitioning || cancelJobLoading}
                    activeOpacity={0.85}
                  >
                    {cancelJobLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <FontAwesome name="arrow-left" size={16} color="#AEAEB2" />
                        <ThemedText style={styles.actionBarBtnText}>Go back</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.finishLargeButton, finishJobLoading && styles.actionButtonDisabled]}
                onPress={handleFinishJob}
                disabled={transitioning || finishJobLoading}
                activeOpacity={0.85}
              >
                {finishJobLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="flag-checkered" size={18} color="#fff" />
                    <ThemedText style={styles.actionBarBtnText}>Finish job</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {booking.status === 'paused' && (
            <View style={styles.actionRow}>
              <View style={styles.actionHalf}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.resumeButton, resumeJobLoading && styles.actionButtonDisabled]}
                  onPress={handleResumeJob}
                  disabled={transitioning || resumeJobLoading}
                  activeOpacity={0.85}
                >
                  {resumeJobLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="play" size={16} color="#fff" />
                      <ThemedText style={styles.actionButtonText}>Resume</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.actionHalf}>
                <TouchableOpacity
                  style={[
                    styles.neutralSecondaryButton,
                    { width: '100%' },
                    pausedRevertLoading && styles.actionButtonDisabled,
                  ]}
                  onPress={async () => {
                    const ok = await confirm({
                      type: 'warning',
                      title: 'Go Back',
                      message: 'Are you sure you want to go back? This will revert the job to On the Way.',
                      confirmText: 'Go Back',
                      cancelText: 'Stay',
                    });
                    if (!ok) return;
                    setPausedRevertLoading(true);
                    setTransitioning(true);
                    try {
                      const payload = await buildMechanicLocationPayload();
                      const first = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/revert-stage/`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      if (!first.ok) {
                        const err = await first.json().catch(() => null);
                        throw new Error(parseApiErrorMessage(err, 'Failed to revert stage'));
                      }
                      const second = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/revert-stage/`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      if (!second.ok) {
                        const err = await second.json().catch(() => null);
                        throw new Error(parseApiErrorMessage(err, 'Failed to revert to on_the_way'));
                      }
                      showNotification({ type: 'success', message: 'Reverted to On the Way' });
                      await fetchBookingDetail();
                    } catch (err: any) {
                      showNotification({ type: 'error', message: err.message || 'Failed to revert stage' });
                    } finally {
                      setPausedRevertLoading(false);
                      setTransitioning(false);
                    }
                  }}
                  disabled={transitioning || pausedRevertLoading}
                  activeOpacity={0.85}
                >
                  {pausedRevertLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="arrow-left" size={16} color="#AEAEB2" />
                      <ThemedText style={styles.actionBarBtnText}>Go back</ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {booking.status === 'finished' && !hasBackjob && (
            <TouchableOpacity
              style={[
                styles.largePrimaryButton,
                styles.paymentReceivedFull,
                paymentReceivedLoading && styles.actionButtonDisabled,
              ]}
              onPress={handlePaymentReceived}
              disabled={transitioning || paymentReceivedLoading}
              activeOpacity={0.85}
            >
              {paymentReceivedLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <FontAwesome name="money" size={18} color="#111" />
              )}
              <ThemedText style={[styles.actionBarBtnText, { color: '#111' }]}>
                {paymentReceivedLoading ? 'Updating…' : 'Payment received'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {showPendingPaymentFlow && (
            <>
              <TouchableOpacity
                style={[styles.finishLargeButton, transitioning && styles.actionButtonDisabled]}
                onPress={() => setShowPaymentReceiptConfirm(true)}
                disabled={transitioning}
                activeOpacity={0.85}
              >
                <FontAwesome name="credit-card" size={18} color="#fff" />
                <ThemedText style={styles.actionBarBtnText}>Proceed to payment</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.neutralSecondaryButton, pendingRevertLoading && styles.actionButtonDisabled]}
                onPress={async () => {
                  const ok = await confirm({
                    type: 'warning',
                    title: 'Go Back',
                    message: 'Are you sure you want to revert to the previous stage?',
                    confirmText: 'Go Back',
                    cancelText: 'Stay',
                  });
                  if (!ok) return;
                  setPendingRevertLoading(true);
                  setTransitioning(true);
                  try {
                    const payload = await buildMechanicLocationPayload();
                    const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/revert-stage/`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => null);
                      throw new Error(parseApiErrorMessage(err, 'Failed to revert stage'));
                    }
                    showNotification({ type: 'success', message: 'Reverted to previous stage' });
                    fetchBookingDetail();
                  } catch (err: any) {
                    showNotification({ type: 'error', message: err.message || 'Failed to revert stage' });
                  } finally {
                    setPendingRevertLoading(false);
                    setTransitioning(false);
                  }
                }}
                disabled={transitioning || pendingRevertLoading}
                activeOpacity={0.85}
              >
                {pendingRevertLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="arrow-left" size={18} color="#AEAEB2" />
                    <ThemedText style={[styles.actionBarBtnText, { color: '#E5E5EA' }]}>Go back</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {showBackjobCompletionFlow && (
            <>
              <View style={styles.noteBox}>
                <ThemedText style={styles.noteText}>
                  No payment is due for this backjob. Tap below to close the booking as a free job.
                </ThemedText>
              </View>
              <TouchableOpacity
                style={[styles.finishLargeButton, completing && styles.actionButtonDisabled]}
                onPress={handleCompleteBooking}
                disabled={transitioning || completing}
                activeOpacity={0.85}
              >
                {completing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesome name="check" size={18} color="#fff" />
                )}
                <ThemedText style={styles.actionBarBtnText}>Complete job as free</ThemedText>
              </TouchableOpacity>
            </>
          )}

          {showGeneralCompletionFlow && (
            <>
              <View style={styles.noteBox}>
                <ThemedText style={styles.noteText}>
                  Payment is already settled and there are no pending quotation requests. You can now complete this job.
                </ThemedText>
              </View>
              <TouchableOpacity
                style={[styles.finishLargeButton, completing && styles.actionButtonDisabled]}
                onPress={handleCompleteBooking}
                disabled={transitioning || completing}
                activeOpacity={0.85}
              >
                {completing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <FontAwesome name="check" size={18} color="#fff" />
                )}
                <ThemedText style={styles.actionBarBtnText}>Complete job</ThemedText>
              </TouchableOpacity>
            </>
          )}
        </View>
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
        {booking?.has_backjob && booking.backjob && (
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
            <FontAwesome name={getStatusIcon(booking.status)} size={28} color={getStatusColor(booking.status)} />
          </View>
          <View style={styles.statusInfo}>
            <View style={styles.statusBadgeRow}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}> 
                <ThemedText style={styles.statusBadgeText}>
                  {showBackjobCompletionFlow ? 'Backjob Pending Completion' : getStatusLabel(booking.status)}
                </ThemedText>
              </View>
              {(booking.status === 'active' || booking.status === 'paused') && booking.active_details?.started_at && (
                <ThemedText style={styles.timerText}>{formatDuration(timer)}</ThemedText>
              )}
              <ThemedText style={styles.bookingIdText}>#{booking.id}</ThemedText>
            </View>
            <ThemedText style={styles.serviceType}>
              {booking.request.type
                ? booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1) + ' Service'
                : 'Service Request'}
            </ThemedText>
          </View>
          <ThemedText style={styles.amountLarge}>₱{totalAmount.toFixed(2)}</ThemedText>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="car" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.sectionTitle}>Request Information</ThemedText>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Vehicle Type</ThemedText>
              <ThemedText style={[styles.infoValue, !resolvedVehicleType ? styles.infoLabel : null]}>
                {resolvedVehicleType || 'Not specified'}
              </ThemedText>
            </View>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Vehicle Brand</ThemedText>
              <ThemedText style={[styles.infoValue, !resolvedVehicleBrand ? styles.infoLabel : null]}>
                {resolvedVehicleBrand || 'Not specified'}
              </ThemedText>
            </View>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Vehicle Model</ThemedText>
              <ThemedText style={[styles.infoValue, !resolvedVehicleModel ? styles.infoLabel : null]}>
                {resolvedVehicleModel || 'Not specified'}
              </ThemedText>
            </View>
          </View>
        </View>



        {/* Client Info Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
              <FontAwesome name="user" size={16} color="#007AFF" />
            </View>
            <ThemedText style={styles.sectionTitle}>Client Information</ThemedText>
          </View>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Name</ThemedText>
              <ThemedText style={styles.infoValue}>{clientName}</ThemedText>
            </View>
            {booking.client?.email && (
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Email</ThemedText>
                <ThemedText style={styles.infoValue}>{booking.client.email}</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Chat Section */}
        {canOpenBookingChat(booking) ? (
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => router.push({ pathname: '/chat/booking_chat', params: { bookingId: String(booking.id) } })}
            activeOpacity={0.8}
          >
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}> 
                <FontAwesome name="comments" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Chat with Client</ThemedText>
              <FontAwesome name="chevron-right" size={16} color="#8E8E93" style={{ marginLeft: 'auto' }} />
            </View>
            <View style={{ paddingVertical: 8 }}>
              <ThemedText style={{ color: '#666' }}>
                {chatPreview || 'No messages yet. Tap to chat with client.'}
              </ThemedText>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Payment method is shown below the Receipt card (moved there) */}

        {/* Location Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
              <FontAwesome name="map-marker" size={16} color="#FF3B30" />
            </View>
            <ThemedText style={styles.sectionTitle}>Service Location</ThemedText>
          </View>

          {displayServiceLocation ? (
            <>
              <View style={styles.locationDetails}>
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Street</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {locationText(
                      inferredStreetParts.street || displayServiceLocation.street_name,
                      displayServiceLocation.latitude != null && displayServiceLocation.longitude != null
                        ? `${Number(displayServiceLocation.latitude).toFixed(6)}, ${Number(displayServiceLocation.longitude).toFixed(6)}`
                        : 'Unavailable'
                    )}
                  </ThemedText>
                </View>
                {locationText(displayServiceLocation.subdivision_village, '') ? (
                  <View style={styles.locationRow}>
                    <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                    <ThemedText style={styles.locationValue}>
                      {locationText(displayServiceLocation.subdivision_village)}
                    </ThemedText>
                  </View>
                ) : null}
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {locationText(
                      coerceBarangayForDisplay(
                        displayServiceLocation.barangay,
                        displayServiceLocation.city_municipality,
                        (displayServiceLocation as { region?: string }).region,
                        displayServiceLocation.subdivision_village
                      ),
                      locationText(inferredStreetParts.barangay, 'Unavailable')
                    )}
                  </ThemedText>
                </View>
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>City</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {locationText(displayServiceLocation.city_municipality, locationText(inferredStreetParts.city, 'Unavailable'))}
                  </ThemedText>
                </View>
                {displayServiceLocation.landmark && (
                  <View style={styles.locationRow}>
                    <ThemedText style={styles.locationLabel}>Landmark</ThemedText>
                    <ThemedText style={styles.locationValue}>
                      {displayServiceLocation.landmark}
                    </ThemedText>
                  </View>
                )}
              </View>

              {booking.status === 'on_the_way' ? (
                <TouchableOpacity
                  style={styles.navigateButton}
                  onPress={() =>
                    router.push({
                      pathname: '/mechanic/booking/booking_location_map',
                      params: { bookingId: String(booking.id), role: 'mechanic' },
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.navigateIconCircle}>
                    <FontAwesome name="map" size={18} color="#fff" />
                  </View>
                  <View style={styles.navigateTextContainer}>
                    <ThemedText style={styles.navigateTitle}>Open Live Route Map</ThemedText>
                    <ThemedText style={styles.navigateSubtitle}>Track route and actions</ThemedText>
                  </View>
                  <FontAwesome name="external-link" size={14} color="#FF8C00" />
                </TouchableOpacity>
              ) : booking.status === 'completed' || booking.location?.navigation_allowed === false ? (
                <View style={[styles.navigateButton, { opacity: 0.7 }]}>
                  <View style={styles.navigateIconCircle}>
                    <FontAwesome name="lock" size={18} color="#fff" />
                  </View>
                  <View style={styles.navigateTextContainer}>
                    <ThemedText style={styles.navigateTitle}>Navigation unavailable after job completion</ThemedText>
                    <ThemedText style={styles.navigateSubtitle}>
                      📍 Barangay {booking.location?.barangay || displayServiceLocation?.barangay || 'hidden'}
                    </ThemedText>
                  </View>
                  <FontAwesome name="ban" size={14} color="#8E8E93" />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.navigateButton}
                  onPress={handleNavigateToClient}
                  activeOpacity={0.7}
                >
                  <View style={styles.navigateIconCircle}>
                    <FontAwesome name="location-arrow" size={18} color="#fff" />
                  </View>
                  <View style={styles.navigateTextContainer}>
                    <ThemedText style={styles.navigateTitle}>Navigate to Client</ThemedText>
                    <ThemedText style={styles.navigateSubtitle}>View on map</ThemedText>
                  </View>
                  <FontAwesome name="external-link" size={14} color="#FF8C00" />
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
          <View style={[styles.sectionCard, isQuotationPending ? styles.pendingSectionCard : null]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="calculator" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Pricing & Quotation</ThemedText>
            </View>

            <View style={styles.receiptList}>
              <View style={[styles.sectionHeader, { marginBottom: 10 }]}> 
                <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                  <FontAwesome name="shield" size={16} color="#34C759" />
                </View>
                <ThemedText style={styles.sectionTitle}>Payment Secured</ThemedText>
                <View style={[styles.paymentStatusBadge, { backgroundColor: getPaymentStatusColor(paymentStatus) + '22', borderColor: getPaymentStatusColor(paymentStatus) + '66' }]}>
                  <ThemedText style={[styles.paymentStatusBadgeText, { color: getPaymentStatusColor(paymentStatus) }]}>
                    {paymentStatus === 'fully_paid' ? 'Fully Paid' : paymentStatus === 'partially_paid' ? 'Partially Paid' : 'Unpaid'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.paymentSummaryGrid}>
                <View style={styles.paymentSummaryTile}>
                  <ThemedText style={styles.paymentSummaryLabel}>Total</ThemedText>
                  <ThemedText style={styles.paymentSummaryValue}>₱{totalAmount.toFixed(2)}</ThemedText>
                </View>
                <View style={styles.paymentSummaryTile}>
                  <ThemedText style={styles.paymentSummaryLabel}>Paid</ThemedText>
                  <ThemedText style={[styles.paymentSummaryValue, { color: '#34C759' }]}>₱{totalPaid.toFixed(2)}</ThemedText>
                </View>
                <View style={styles.paymentSummaryTile}>
                  <ThemedText style={styles.paymentSummaryLabel}>Remaining</ThemedText>
                  <ThemedText style={[styles.paymentSummaryValue, { color: remainingBalance > 0 ? '#FFD60A' : '#34C759' }]}>₱{remainingBalance.toFixed(2)}</ThemedText>
                </View>
              </View>

              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${paymentProgressPct}%` }]} />
              </View>
              <ThemedText style={styles.progressText}>{Math.round(paymentProgressPct)}% Paid</ThemedText>
              <ThemedText style={[styles.noteText, { marginTop: 6, marginBottom: 8 }]}>
                {backjobPaymentPhase && totalAmount <= 0
                  ? 'Backjob labor is free. No extra charges on this backjob yet.'
                  : backjobPaymentPhase && totalAmount > 0
                    ? 'Backjob labor is free. Payment shown is only for newly added quotation lines.'
                    : 'Payment will be released to mechanic after job completion.'}
              </ThemedText>
              <View style={styles.receiptDivider} />
            </View>

            {hasLivePendingQuoteRequest ? (
              <View style={styles.pendingHintBanner}>
                <FontAwesome name="clock-o" size={12} color="#C89B55" />
                <ThemedText style={styles.pendingHintText}>Pending changes are waiting for client approval.</ThemedText>
              </View>
            ) : null}

            <View style={styles.receiptList}>
              <ThemedText
                style={[
                  styles.noteLabel,
                  { marginBottom: 8 },
                  isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null,
                ]}
              >
                Travel, Traffic & Convenience
              </ThemedText>
              {convenienceBreakdown ? (
                <>
                  <View style={styles.receiptRow}>
                    <ThemedText style={[styles.receiptItem, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>Base Fee</ThemedText>
                    <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{convenienceBreakdown.baseFee.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={[styles.receiptItem, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>Distance Fee ({convenienceBreakdown.distanceKm.toFixed(2)} km)</ThemedText>
                    <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{convenienceBreakdown.distanceFee.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={[styles.receiptItem, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>
                      {convenienceBreakdown.estimated ? 'Estimated Traffic Surcharge' : 'Traffic Surcharge'} ({convenienceBreakdown.trafficLabel})
                    </ThemedText>
                    <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{convenienceBreakdown.trafficFee.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={[styles.receiptItem, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>Convenience Fee</ThemedText>
                    <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{convenienceBreakdown.totalConvenienceFee.toFixed(2)}</ThemedText>
                  </View>
                  {typeof convenienceBreakdown.etaMinutes === 'number' && convenienceBreakdown.etaMinutes > 0 && (
                    <View style={styles.receiptRow}>
                      <ThemedText style={[styles.receiptItem, isAcceptedBackjob ? { color: '#8E8E93' } : null]}>Estimated ETA</ThemedText>
                      <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { color: '#8E8E93' } : null]}>{convenienceBreakdown.etaMinutes} min</ThemedText>
                    </View>
                  )}
                  {convenienceBreakdown.estimated && (
                    <ThemedText style={{ color: '#8E8E93', marginTop: 6, fontStyle: 'italic', ...(isAcceptedBackjob ? { textDecorationLine: 'line-through' } : {}) }}>
                      Estimated price until mechanic starts travel.
                    </ThemedText>
                  )}
                </>
              ) : (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteText}>Convenience fee will appear after mechanic starts travel.</ThemedText>
                </View>
              )}

              <View style={styles.receiptDivider} />

              {isAcceptedBackjob && oldQuotationItems.length > 0 ? (
                <View style={[styles.noteBox, { marginBottom: 10 }]}>
                  <ThemedText style={[styles.noteLabel, { marginBottom: 8, color: '#8E8E93' }]}>Old Receipt (Already Paid)</ThemedText>
                  {oldQuotationItems.slice(0, 8).map((it: any, idx: number) => {
                    const desc = it?.description || it?.name || 'Item';
                    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
                    const qty = Number(it?.quantity ?? 1) || 1;
                    return (
                      <View key={`old-mech-quote-${idx}`} style={styles.receiptRow}>
                        <ThemedText style={[styles.receiptItem, { textDecorationLine: 'line-through', color: '#8E8E93' }]} numberOfLines={1}>{desc} x{qty}</ThemedText>
                        <ThemedText style={[styles.receiptAmount, { textDecorationLine: 'line-through', color: '#8E8E93' }]}>₱{(price * qty).toFixed(2)}</ThemedText>
                      </View>
                    );
                  })}
                  {oldQuotationItems.length > 8 ? (
                    <ThemedText style={[styles.noteText, { color: '#8E8E93', marginTop: 4 }]}>...and more old items</ThemedText>
                  ) : null}
                </View>
              ) : null}

              {isAcceptedBackjob && oldReceiptSubtotal > 0 ? (
                <View style={[styles.receiptRow, { marginBottom: 10 }]}>
                  <ThemedText style={[styles.receiptItem, { textDecorationLine: 'line-through', color: '#8E8E93' }]}>
                    Previous quotation total (reference)
                  </ThemedText>
                  <ThemedText style={[styles.receiptAmount, { textDecorationLine: 'line-through', color: '#8E8E93' }]}>
                    ₱{oldReceiptSubtotal.toFixed(2)}
                  </ThemedText>
                </View>
              ) : null}

              {isAcceptedBackjob && (oldQuotationItems.length > 0 || oldReceiptSubtotal > 0) ? (
                <View style={styles.receiptDivider} />
              ) : null}

              <ThemedText style={[styles.noteLabel, { marginBottom: 8 }]}>
                {isAcceptedBackjob ? 'New quotation (backjob)' : 'Quotation'}
              </ThemedText>
              {displayQuotation && visibleQuotationItems.length > 0 ? (
                <>
                  {isCompletedBooking ? (
                    <>
                      <View style={[styles.noteBox, { marginBottom: 8 }]}>
                        <ThemedText style={styles.noteText}>
                          Completed booking: quotation is frozen and shown as read-only reference.
                        </ThemedText>
                      </View>
                      {visibleQuotationItems.map(renderQuotationRawRow)}
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.quotationListAccordionHeader, quotationListExpanded ? styles.quotationListAccordionHeaderExpanded : null]}
                        onPress={() => setQuotationListExpanded(prev => !prev)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <FontAwesome name="list" size={12} color="#A6ABB2" />
                          <ThemedText style={styles.quotationListAccordionTitle}>Quotation Items ({visibleQuotationItems.length})</ThemedText>
                        </View>
                        <FontAwesome name={quotationListExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#A6ABB2" />
                      </TouchableOpacity>
                      {quotationListExpanded ? visibleQuotationItems.map(renderQuotationRow) : null}
                    </>
                  )}
                </>
              ) : (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteText}>No quotation yet.</ThemedText>
                </View>
              )}

              {canEditQuotation && canOpenQuotationEditor && !isCompletedBooking && (
                <TouchableOpacity
                  style={[styles.finishLargeButton, { marginTop: 10 }]}
                  onPress={() => routerHook.push({ pathname: '/mechanic/booking/quotation_edit', params: { bookingId: String(booking.id) } })}
                >
                  <FontAwesome name={quotation ? 'pencil' : 'plus'} size={14} color="#fff" />
                  <ThemedText style={[styles.actionButtonText, { color: '#fff' }]}>{quotation ? 'Edit Quotation' : 'Create Quotation'}</ThemedText>
                </TouchableOpacity>
              )}

              {isAcceptedBackjob ? (
                <View style={[styles.receiptRow, { marginTop: 10 }]}>
                  <ThemedText style={styles.receiptItem}>Newly added charges</ThemedText>
                  <ThemedText style={styles.receiptAmount}>₱{resolvedBackjobCharge.toFixed(2)}</ThemedText>
                </View>
              ) : null}

              <View style={styles.receiptDivider} />
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Convenience Fee Total</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{effectiveConvenienceFee.toFixed(2)}</ThemedText>
              </View>
              {!isAcceptedBackjob ? (
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptTotalLabel}>Quotation Estimated Total</ThemedText>
                  <ThemedText style={styles.receiptTotalValue}>₱{effectiveQuotationEstimate.toFixed(2)}</ThemedText>
                </View>
              ) : null}
              {pendingRequestedQuotationTotal != null ? (
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptTotalLabel}>Pending Requested Total</ThemedText>
                  <ThemedText style={[styles.receiptTotalValue, { color: '#F2B15C' }]}>₱{pendingRequestedQuotationTotal.toFixed(2)}</ThemedText>
                </View>
              ) : null}
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Total Fee</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{effectiveTotalFee.toFixed(2)}</ThemedText>
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
                    <ThemedText style={styles.timelineDate}>
                      {formatDate(booking.active_details.started_at)}
                    </ThemedText>
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
        {booking.status === 'active' && booking.active_details && (
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
            {/* Large elapsed timer for mechanic */}
            {booking.active_details.started_at && (
              <View style={styles.elapsedRow}>
                <ThemedText style={styles.elapsedLabel}>Elapsed</ThemedText>
                <ThemedText style={styles.elapsedValue}>{formatDuration(timer)}</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Before and After Service Photos */}
        {booking.active_details && (
          <View style={styles.sectionCard}>
            {(() => {
              const beforePhotos = mergeGalleryWithLegacy(
                booking.active_details?.before_pictures,
                booking.active_details?.before_picture ?? null
              );
              const afterPhotos = mergeGalleryWithLegacy(
                booking.active_details?.after_pictures,
                booking.active_details?.after_picture ?? null
              );

              const renderPhotos = (photos: string[]) => (
                <View style={styles.photoGrid}>
                  {photos.map((uri, idx) => {
                    const isFullWidth =
                      photos.length === 1 ||
                      (photos.length % photoGridCols !== 0 && idx === photos.length - 1);
                    const tileStyle = photoGridCols === 3 ? styles.photoTileThird : styles.photoTile;
                    const safeUri = String(uri || '').replace(/\s+/g, '').trim();
                    const photoKey = `${safeUri}-${idx}`;
                    const isLoading = !!photoLoadingMap[photoKey];
                    const hasError = !!photoErrorMap[photoKey];

                    return (
                      <View
                        key={photoKey}
                        style={[
                          tileStyle,
                          isFullWidth && styles.photoTileWide,
                        ]}
                      >
                        {safeUri ? (
                          <View style={styles.photoImageWrap}>
                            <Image
                              source={{ uri: safeUri }}
                              style={styles.photoImage}
                              contentFit="cover"
                              transition={180}
                              onLoadStart={() => {
                                setPhotoLoadingMap((prev) => ({ ...prev, [photoKey]: true }));
                                setPhotoErrorMap((prev) => ({ ...prev, [photoKey]: false }));
                              }}
                              onLoad={() => {
                                setPhotoLoadingMap((prev) => ({ ...prev, [photoKey]: false }));
                              }}
                              onError={() => {
                                setPhotoLoadingMap((prev) => ({ ...prev, [photoKey]: false }));
                                setPhotoErrorMap((prev) => ({ ...prev, [photoKey]: true }));
                              }}
                            />
                            {isLoading && (
                              <View style={styles.photoLoadingOverlay}>
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              </View>
                            )}
                            {hasError && (
                              <View style={styles.photoLoadingOverlay}>
                                <FontAwesome name="image" size={18} color="#8E8E93" />
                                <ThemedText style={styles.photoFailedText}>Failed to load</ThemedText>
                              </View>
                            )}
                          </View>
                        ) : (
                          <View style={styles.photoFallbackTile}>
                            <FontAwesome name="image" size={18} color="#8E8E93" />
                            <ThemedText style={styles.photoFailedText}>No image</ThemedText>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );

              return (
                <>
                  <TouchableOpacity
                    style={styles.photoAccordionHeader}
                    onPress={toggleBeforePhotosAccordion}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.sectionIcon, { backgroundColor: '#4F8CFF15' }]}>
                      <FontAwesome name="camera" size={16} color="#4F8CFF" />
                    </View>
                    <ThemedText style={styles.photoAccordionTitle}>Before-Service Photos</ThemedText>
                    <View style={styles.photoAccordionChevronWrap}>
                      <FontAwesome
                        name={beforePhotosExpanded ? 'angle-up' : 'angle-down'}
                        size={18}
                        color="#AEAEB2"
                      />
                    </View>
                  </TouchableOpacity>
                  {(booking.status === 'active' || booking.status === 'paused') && (
                    <TouchableOpacity
                      style={styles.addMoreBeforePhotosRow}
                      onPress={() => setShowAppendBeforePhotosModal(true)}
                      disabled={transitioning || appendBeforePhotosLoading}
                      activeOpacity={0.85}
                    >
                      <FontAwesome name="plus-circle" size={16} color="#FF8C00" />
                      <ThemedText style={styles.addMoreBeforePhotosText}>Add more before photos</ThemedText>
                    </TouchableOpacity>
                  )}
                  {beforePhotosExpanded && (
                    beforePhotos.length ? (
                      <>
                        {renderPhotos(beforePhotos.slice(0, visibleBeforePhotoCount))}
                        {beforePhotos.length > visibleBeforePhotoCount ? (
                          <TouchableOpacity
                            style={[styles.navigateButton, { marginTop: 4 }]}
                            onPress={() => setVisibleBeforePhotoCount((prev) => prev + 6)}
                            activeOpacity={0.85}
                          >
                            <ThemedText style={styles.navigateTitle}>Load More Before Photos</ThemedText>
                          </TouchableOpacity>
                        ) : null}
                      </>
                    ) : (
                      <View style={styles.photoEmptyState}>
                        <FontAwesome name="image" size={24} color="#6C6C70" />
                        <ThemedText style={styles.photoEmptyText}>No before-service photos uploaded yet</ThemedText>
                      </View>
                    )
                  )}

                  {(booking.status === 'completed' || afterPhotos.length > 0) ? (
                    <>
                      <TouchableOpacity
                        style={[styles.photoAccordionHeader, { marginTop: 8 }]}
                        onPress={toggleAfterPhotosAccordion}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                          <FontAwesome name="camera" size={16} color="#34C759" />
                        </View>
                        <ThemedText style={styles.photoAccordionTitle}>After-Service Photos</ThemedText>
                        <View style={styles.photoAccordionChevronWrap}>
                          <FontAwesome
                            name={afterPhotosExpanded ? 'angle-up' : 'angle-down'}
                            size={18}
                            color="#AEAEB2"
                          />
                        </View>
                      </TouchableOpacity>
                      {afterPhotosExpanded && (
                        afterPhotos.length ? (
                          <>
                            {renderPhotos(afterPhotos.slice(0, visibleAfterPhotoCount))}
                            {afterPhotos.length > visibleAfterPhotoCount ? (
                              <TouchableOpacity
                                style={[styles.navigateButton, { marginTop: 4 }]}
                                onPress={() => setVisibleAfterPhotoCount((prev) => prev + 6)}
                                activeOpacity={0.85}
                              >
                                <ThemedText style={styles.navigateTitle}>Load More After Photos</ThemedText>
                              </TouchableOpacity>
                            ) : null}
                          </>
                        ) : (
                          <View style={styles.photoEmptyState}>
                            <FontAwesome name="image" size={24} color="#6C6C70" />
                            <ThemedText style={styles.photoEmptyText}>No after-service photos uploaded yet</ThemedText>
                          </View>
                        )
                      )}
                    </>
                  ) : null}
                </>
              );
            })()}
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
              <View style={styles.receiptList}>
                {displayQuotation && visibleQuotationItems.length > 0 ? (
                  <>
                    {visibleQuotationItems.map(renderQuotationRawRow)}
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptTotalLabel}>Final Total</ThemedText>
                      <ThemedText style={styles.receiptTotalValue}>₱{parseFloat(String(quotationEstimatedTotal ?? booking.completion_details?.total_amount ?? booking.amount_fee ?? 0)).toFixed(2)}</ThemedText>
                    </View>
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptYouLabel}>You receive</ThemedText>
                      <ThemedText style={styles.receiptYouValue}>₱{parseFloat(String(quotationEstimatedTotal ?? booking.completion_details?.total_amount ?? booking.amount_fee ?? 0)).toFixed(2)}</ThemedText>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.completionRow}>
                      <ThemedText style={styles.completionLabel}>Total Amount</ThemedText>
                      <ThemedText style={styles.completionAmount}>₱{(booking.completion_details?.total_amount ?? 0).toFixed(2)}</ThemedText>
                    </View>
                  </>
                )}
              </View>

              {booking.completion_details?.notes && (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteLabel}>Notes:</ThemedText>
                  <ThemedText style={styles.noteText}>{booking.completion_details?.notes}</ThemedText>
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


        
      </ScrollView>

      <Modal
        visible={showPaymentReceiptConfirm && showPendingPaymentFlow}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentReceiptConfirm(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <View style={{ backgroundColor: '#1A1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#2A2C2E', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#3A3D40', alignSelf: 'center', marginBottom: 14 }} />
            <ThemedText style={{ color: '#ECEDEE', fontSize: 20, fontWeight: '800' }}>Confirm Payment Receipt</ThemedText>
            <ThemedText style={{ color: '#8E8E93', marginTop: 4, marginBottom: 10 }}>
              Review this before showing QR to client.
            </ThemedText>

            <View style={{ backgroundColor: '#151718', borderRadius: 12, borderWidth: 1, borderColor: '#2A2C2E', padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <ThemedText style={{ color: '#8E8E93' }}>Booking</ThemedText>
                <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>#{booking.id}</ThemedText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <ThemedText style={{ color: '#8E8E93' }}>Total Amount</ThemedText>
                <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>₱{totalAmount.toFixed(2)}</ThemedText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <ThemedText style={{ color: '#8E8E93' }}>Paid So Far</ThemedText>
                <ThemedText style={{ color: '#34C759', fontWeight: '700' }}>₱{totalPaid.toFixed(2)}</ThemedText>
              </View>
              <View style={{ height: 1, backgroundColor: '#2A2C2E', marginVertical: 10 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <ThemedText style={{ color: '#ECEDEE', fontWeight: '800' }}>Total Amount To Pay</ThemedText>
                <ThemedText style={{ color: '#FF8C00', fontWeight: '800' }}>₱{remainingBalance.toFixed(2)}</ThemedText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <ThemedText style={{ color: '#ECEDEE', fontWeight: '800' }}>Amount To Receive</ThemedText>
                <ThemedText style={{ color: '#34C759', fontWeight: '800' }}>₱{remainingBalance.toFixed(2)}</ThemedText>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.finishLargeButton, { marginTop: 14 }]}
              onPress={() => {
                setShowPaymentReceiptConfirm(false);
                setShowCashQR(false);
                setShowPendingPayment(true);
              }}
            >
              <FontAwesome name="check" size={16} color="#fff" />
              <ThemedText style={[styles.actionButtonText, { marginLeft: 10 }]}>Accept & Continue</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.largeSecondaryButton, { marginTop: 10 }]} onPress={() => setShowPaymentReceiptConfirm(false)}>
              <ThemedText style={styles.actionButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <PendingPaymentModal
        visible={showPendingPayment && canShowPaymentModals}
        bookingId={booking.id}
        amount={remainingBalance}
        onClose={() => setShowPendingPayment(false)}
        onCashSelected={() => {
          setShowPendingPayment(false);
          setShowCashQR(true);
        }}
        onPaymentReceived={() => {
          setShowPendingPayment(false);
          setPaymentReceived(true);
          fetchBookingDetail();
        }}
      />

      <CashQRDisplayModal
        visible={showCashQR && canShowPaymentModals}
        bookingId={booking.id}
        amount={remainingBalance}
        onClose={() => {
          setShowCashQR(false);
          setShowPendingPayment(false);
        }}
        onPaymentReceived={() => {
          setShowCashQR(false);
          setShowPendingPayment(false);
          setPaymentReceived(true);
          fetchBookingDetail();
        }}
      />

      <AfterServicePhotoModal
        visible={showBeforeServicePhotoModal}
        mode="before"
        beforeFlow="start_job"
        loading={startJobLoading}
        onClose={() => {
          if (!startJobLoading) setShowBeforeServicePhotoModal(false);
        }}
        onSubmit={handleSubmitBeforeServicePhoto}
      />

      <AfterServicePhotoModal
        visible={showAppendBeforePhotosModal}
        mode="before"
        beforeFlow="append"
        loading={appendBeforePhotosLoading}
        onClose={() => {
          if (!appendBeforePhotosLoading) setShowAppendBeforePhotosModal(false);
        }}
        onSubmit={handleSubmitAppendBeforePhotos}
      />

      <AfterServicePhotoModal
        visible={showAfterServicePhotoModal}
        mode="after"
        loading={finishJobLoading}
        onClose={() => {
          if (!finishJobLoading) setShowAfterServicePhotoModal(false);
        }}
        onSubmit={handleSubmitAfterServicePhoto}
      />
    </ThemedView>
  );
}
