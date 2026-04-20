import React, { useEffect, useState, useCallback, useMemo } from 'react';
// Ensure the router header is hidden for this route so only the in-page header shows
export const screenOptions = { headerShown: false } as const;
import {View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, Platform, Modal, TextInput, KeyboardAvoidingView, Alert } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/bookingDetailsStyles';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWebSocketContext } from '@/context/WebSocketContext';
import {
  EWalletOptionsModal,
  PaymentMethodModal,
  PaymentSuccessModal,
  QRConfirmationModal,
  QRScannerModal,
  type QRScanResult,
} from '@/components/payment';
import MechanicRatingModal from '@/components/booking/MechanicRatingModal';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingDetail {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at: string;
  completed_at: string | null;
  convenience_fee?: number | null;
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
  mechanic_review?: {
    can_rate?: boolean;
    has_review?: boolean;
    review?: {
      id?: number;
      rating?: number;
      comment?: string;
      created_at?: string;
    } | null;
  };
}

interface PricingConfig {
  base_distance_fee?: number;
  price_per_km?: number;
  free_distance_km?: number;
  traffic_low_multiplier?: number;
  traffic_medium_multiplier?: number;
  traffic_high_multiplier?: number;
  convenience_fee_percentage?: number;
  convenience_fee_fixed?: number;
}

const LIVE_PRICING_STATUSES = new Set(['accepted', 'on_the_way', 'active', 'paused', 'finished']);

const shouldUseLiveAdditivePricing = (statusValue?: string | null): boolean => {
  const normalized = String(statusValue || '').toLowerCase();
  return LIVE_PRICING_STATUSES.has(normalized);
};

const toPrice = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEWalletModal, setShowEWalletModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showQRConfirm, setShowQRConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [qrScanData, setQrScanData] = useState<QRScanResult | null>(null);
  const [scannedToken, setScannedToken] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'maya' | string>('cash');
  const [useInitialPayment, setUseInitialPayment] = useState(true);
  const [selectedInitialPaymentPercentage, setSelectedInitialPaymentPercentage] = useState<0.3 | 0.5>(0.3);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingPromptDismissed, setRatingPromptDismissed] = useState(false);
  const [isReportingNoShow, setIsReportingNoShow] = useState(false);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<Record<string, boolean>>({});
  const [quotationListExpanded, setQuotationListExpanded] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>({});

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
        const toConfigNumber = (value: unknown) => {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        setPricingConfig({
          base_distance_fee: toConfigNumber(data.base_distance_fee),
          price_per_km: toConfigNumber(data.price_per_km),
          free_distance_km: toConfigNumber(data.free_distance_km),
          traffic_low_multiplier: toConfigNumber(data.traffic_low_multiplier),
          traffic_medium_multiplier: toConfigNumber(data.traffic_medium_multiplier),
          traffic_high_multiplier: toConfigNumber(data.traffic_high_multiplier),
          convenience_fee_percentage: toConfigNumber(data.convenience_fee_percentage),
          convenience_fee_fixed: toConfigNumber(data.convenience_fee_fixed),
        });
      } catch {
        // Keep current pricing config when endpoint is unavailable.
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
    const details = (booking as any).request?.request_details || null;
    if (!details) return null;
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
  const isQuotationPending = Boolean(
    ((displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : []).some(
      (it: any) => String(it?.status || it?.quotation_status || it?.state || '').toLowerCase() === 'pending'
    ) || ((booking as any)?.quotation && (booking as any).quotation.status === 'pending')
  );

  const getItemStatus = (it: any, parentQuotation: any) => {
    if (!it) return 'accepted';
    return it.status || it.quotation_status || it.state || (parentQuotation && parentQuotation.status) || 'accepted';
  };

  const getQuoteItemKey = (it: any, idx: number) => String(it?.id ?? `quote-${idx}`);

  const toggleQuoteItem = (key: string) => {
    setExpandedQuoteItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const serviceItemIds = useMemo(() => {
    const details = (booking as any)?.request?.request_details;
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

  const sortedQuotationItems = useMemo(() => {
    const items = (displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : [];
    if (!items.length) return [];

    const withIndex = items.map((it: any, index: number) => ({ ...it, __index: index }));
    const serviceTop: any[] = [];
    const regular: any[] = [];

    withIndex.forEach((it: any) => {
      const sid = Number(it?.service);
      if (Number.isFinite(sid) && sid > 0 && serviceItemIds.has(sid)) {
        serviceTop.push(it);
      } else {
        regular.push(it);
      }
    });

    const getTime = (it: any) => {
      const raw = it?.updated_at || it?.modified_at || it?.created_at || null;
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isFinite(t) ? t : 0;
    };

    regular.sort((a: any, b: any) => {
      const ta = getTime(a);
      const tb = getTime(b);
      if (ta !== tb) return ta - tb;
      const ia = Number(a?.id);
      const ib = Number(b?.id);
      if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ia - ib;
      return (a.__index || 0) - (b.__index || 0);
    });

    return [...serviceTop, ...regular].map(({ __index, ...rest }: any) => rest);
  }, [displayQuotation, serviceItemIds]);

  const getAssocKey = (it: any) => {
    const serviceId = Number(it?.service);
    const addOnId = Number(it?.service_add_on);
    if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
    if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
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

    const statusRaw = String(it?.status || it?.quotation_status || it?.state || '').toLowerCase();
    if (statusRaw === 'rejected') return 'Removed';
    if (statusRaw !== 'pending') return null;

    const raw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
    if (raw.includes('remove') || raw.includes('delete')) return 'Removed';
    if (raw.includes('add')) {
      const editedFromRemoved = (removedRows || []).find((row: any) => {
        const sameQty = normalizeNum(row?.quantity) === normalizeNum(it?.quantity);
        const samePrice = normalizeNum(row?.unit_price ?? row?.price) === normalizeNum(it?.unit_price ?? it?.price);
        return sameQty && samePrice && isLikelyRename(row?.description, it?.description);
      });
      return editedFromRemoved ? 'Edited' : 'Added';
    }
    if (raw.includes('edit') || raw.includes('update') || raw.includes('modify')) return 'Edited';

    if (it?.previous_description || it?.previous_quantity != null || it?.previous_unit_price != null) {
      return 'Edited';
    }

    if (it?.is_removed === true || it?.is_deleted === true) return 'Removed';
    if (it?.is_edited === true || it?.is_modified === true) return 'Edited';
    if (it?.is_added === true) return 'Added';

    const editedFromRemoved = (removedRows || []).find((row: any) => {
      const sameQty = normalizeNum(row?.quantity) === normalizeNum(it?.quantity);
      const samePrice = normalizeNum(row?.unit_price ?? row?.price) === normalizeNum(it?.unit_price ?? it?.price);
      return sameQty && samePrice && isLikelyRename(row?.description, it?.description);
    });
    if (editedFromRemoved) return 'Edited';

    return 'Added';
  };

  // Quotation estimated total: sum only accepted items
  const quotationEstimatedTotal = useMemo(() => {
    const items = (displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : [];
    return items.reduce((sum: number, it: any) => {
      const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
      const qty = Number(it?.quantity ?? 1) || 1;
      const status = String(getItemStatus(it, (booking as any)?.quotation || displayQuotation) || '').toLowerCase();
      if (status === 'accepted') {
        return sum + price * qty;
      }
      return sum;
    }, 0);
  }, [displayQuotation, booking]);

  const convenienceBreakdown = useMemo(() => {
    if (!booking) return null;

    const amountFee = toPrice((booking as any).amount_fee);
    const persistedConvenienceFee = Number((booking as any).convenience_fee || 0);
    const hasPersistedConvenience = Number.isFinite(persistedConvenienceFee) && persistedConvenienceFee >= 0;
    const persistedTrafficSurcharge = Number((booking as any).traffic_surcharge);
    const hasPersistedTrafficSurcharge = Number.isFinite(persistedTrafficSurcharge) && persistedTrafficSurcharge >= 0;

    const persistedDistanceKm = Number((booking as any).distance_km || 0);
    const distanceKm = Number.isFinite(persistedDistanceKm) ? Math.max(0, persistedDistanceKm) : 0;

    const baseDistanceFee = Math.max(0, Number(pricingConfig.base_distance_fee ?? 0));
    const ratePerKm = Math.max(0, Number(pricingConfig.price_per_km ?? 0));

    const conveniencePct = Math.max(0, Number(pricingConfig.convenience_fee_percentage ?? 0)) / 100;
    const convenienceFixed = Number(pricingConfig.convenience_fee_fixed ?? 0);

    const levelRaw = String((booking as any).traffic_level || 'moderate').toLowerCase();
    const normalizedLevel = levelRaw === 'light' || levelRaw === 'low'
      ? 'low'
      : (levelRaw === 'moderate' || levelRaw === 'medium' ? 'medium' : 'high');
    const trafficConfig: Record<'low' | 'medium' | 'high', { multiplier: number; speedKmh: number; label: string }> = {
      low: { multiplier: Number(pricingConfig.traffic_low_multiplier ?? 1), speedKmh: 40, label: 'Low' },
      medium: { multiplier: Number(pricingConfig.traffic_medium_multiplier ?? 1), speedKmh: 28, label: 'Medium' },
      high: { multiplier: Number(pricingConfig.traffic_high_multiplier ?? 1), speedKmh: 20, label: 'High' },
    };

    const trafficMeta = trafficConfig[normalizedLevel];
    let baseFee = 0;
    let distanceFee = 0;
    let trafficFee = 0;
    let travelFee = 0;

    if (hasPersistedConvenience) {
      // When backend already locked convenience_fee, derive a readable split from persisted values.
      baseFee = distanceKm > 0 ? baseDistanceFee : 0;
      trafficFee = hasPersistedTrafficSurcharge ? persistedTrafficSurcharge : 0;
      distanceFee = Math.max(0, persistedConvenienceFee - baseFee - trafficFee);
      travelFee = baseFee + distanceFee;
    } else {
      const freeDistanceKm = Math.max(0, Number(pricingConfig.free_distance_km ?? 0));
      const billableDistanceKm = Math.max(0, distanceKm - freeDistanceKm);
      baseFee = distanceKm > freeDistanceKm ? baseDistanceFee : 0;
      distanceFee = billableDistanceKm * ratePerKm;
      travelFee = baseFee + distanceFee;
      const estimatedTrafficFee = travelFee * Math.max(0, trafficMeta.multiplier - 1);
      trafficFee = hasPersistedTrafficSurcharge ? persistedTrafficSurcharge : estimatedTrafficFee;
    }

    const isOnTheWay = booking.status === 'on_the_way';
    const serviceSubtotal = quotationEstimatedTotal > 0
      ? quotationEstimatedTotal
      : (shouldUseLiveAdditivePricing(booking.status)
        ? solveServiceSubtotalFromAmount(amountFee, travelFee, trafficFee, conveniencePct, convenienceFixed)
        : Math.max(0, amountFee - travelFee - trafficFee - (hasPersistedConvenience ? persistedConvenienceFee : 0)));

    const estimatedConvenienceFee = (serviceSubtotal * conveniencePct) + convenienceFixed;
    const totalConvenienceFee = hasPersistedConvenience
      ? persistedConvenienceFee
      : (shouldUseLiveAdditivePricing(booking.status) ? estimatedConvenienceFee : estimatedConvenienceFee);

    const persistedEta = Number((booking as any).estimated_eta_minutes || 0);
    const derivedEta = Math.max(1, Math.ceil((distanceKm / Math.max(1, trafficMeta.speedKmh)) * 60));
    const etaMinutes = isOnTheWay && Number.isFinite(persistedEta) && persistedEta > 0
      ? Math.round(persistedEta)
      : derivedEta;

    return {
      serviceSubtotal,
      travelFee,
      baseFee,
      distanceKm,
      distanceFee,
      trafficFee,
      totalConvenienceFee,
      trafficLabel: trafficMeta.label,
      etaMinutes,
      estimated: !isOnTheWay,
      isLocked: hasPersistedConvenience,
    };
  }, [booking, pricingConfig, quotationEstimatedTotal]);

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
      console.log('FULL BOOKING DATA:', JSON.stringify(data, null, 2));
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

  // Refresh when websocket reports an update for this booking (quotation accepted/rejected or booking update)
  const { lastMessage } = useWebSocketContext();
  useEffect(() => {
    try {
      if (!lastMessage) return;
      const bid = Number(lastMessage.booking_id);
      if (!bid || !bookingId) return;
      if (bid === Number(bookingId)) {
        const action = String(lastMessage.action || '').toLowerCase();
        if (action === 'booking.pending_payment') {
          setShowPaymentModal(true);
        }
        if (action === 'payment.completed') {
          setShowSuccess(true);
        }
        // lightweight refresh
        fetchBookingDetail(true);
      }
    } catch (e) {
      // ignore
    }
  }, [lastMessage, bookingId, fetchBookingDetail]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingDetail();
  };

  useEffect(() => {
    if (booking?.status === 'pending_payment') {
      setUseInitialPayment(false);
      setShowPaymentModal(true);
    }
  }, [booking?.status]);

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

  useEffect(() => {
    if (!booking) return;

    const paymentSummary = booking.payment_summary || {};
    const installments = Array.isArray(paymentSummary.installments) ? paymentSummary.installments : [];
    const paymentStatus = String(paymentSummary.payment_status || 'unpaid').toLowerCase();
    const hasPaidInstallment = installments.some(
      (item) => String(item.status || '').toLowerCase() === 'paid'
    );
    const isBookedState = booking.status === 'booked' || booking.status === 'accepted';
    const canChooseInitialPayment =
      isBookedState &&
      paymentStatus === 'unpaid' &&
      !hasPaidInstallment;

    if (!canChooseInitialPayment && useInitialPayment) {
      setUseInitialPayment(false);
    }
  }, [booking, useInitialPayment]);

  useEffect(() => {
    if (!booking) return;
    const paymentSummary = booking.payment_summary || {};
    const summaryPaymentStatus = String(paymentSummary.payment_status || '').toLowerCase();
    const canRateFromBooking =
      booking.status === 'completed' &&
      summaryPaymentStatus === 'fully_paid' &&
      !!booking.provider &&
      !!booking.mechanic_review?.can_rate;
    const hasReviewFromBooking = !!booking.mechanic_review?.has_review;

    if (canRateFromBooking && !hasReviewFromBooking && !ratingPromptDismissed) {
      setShowRatingModal(true);
    }
  }, [booking, ratingPromptDismissed]);

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

  const serviceSubtotalTotal = convenienceBreakdown ? convenienceBreakdown.serviceSubtotal : quotationEstimatedTotal;
  const travelFeeTotal = convenienceBreakdown ? convenienceBreakdown.travelFee : 0;
  const trafficFeeTotal = convenienceBreakdown ? convenienceBreakdown.trafficFee : 0;
  const convenienceFeeTotal = convenienceBreakdown ? convenienceBreakdown.totalConvenienceFee : 0;
  const totalFee = convenienceFeeTotal + quotationEstimatedTotal;
  const showPricingQuotationCard = !!(convenienceBreakdown || displayQuotation);

  const paymentSummary = booking.payment_summary || {};
  const installments = Array.isArray(paymentSummary.installments) ? paymentSummary.installments : [];
  const totalPaid = Number(paymentSummary.total_paid || 0);
  const summaryTotalAmount = Math.max(0, Number((paymentSummary as any).total_amount ?? booking.amount_fee ?? 0));
  const summaryPaymentStatus = String(paymentSummary.payment_status || 'unpaid').toLowerCase();
  const hasPaidInstallment = installments.some(
    (item) => String(item.status || '').toLowerCase() === 'paid'
  );
  const isBookedState = booking.status === 'booked' || booking.status === 'accepted';
  const canChooseInitialPayment =
    isBookedState &&
    summaryPaymentStatus === 'unpaid' &&
    !hasPaidInstallment;
  const isPayableTotalLive = booking.status !== 'pending_payment';

  const payableTotal = Math.max(0, Math.max(totalFee, summaryTotalAmount));
  const fallbackInitialAmount = payableTotal * selectedInitialPaymentPercentage;
  const fallbackInitialRemaining = Math.max(0, payableTotal - fallbackInitialAmount);
  const pendingInitial = installments.find((item) => String(item.installment_type || '').toLowerCase() === 'initial');
  const pendingFinal = installments.find((item) => String(item.installment_type || '').toLowerCase() === 'final');
  const initialPreviewAmount = pendingInitial ? Number(pendingInitial.amount || 0) : fallbackInitialAmount;
  const _remainingAfterInitialPreview = pendingFinal ? Number(pendingFinal.amount || 0) : fallbackInitialRemaining;
  const remainingBalance = Math.max(0, payableTotal - totalPaid);
  const paymentStatus = totalPaid >= payableTotal && payableTotal > 0
    ? 'fully_paid'
    : (totalPaid > 0 ? 'partially_paid' : 'unpaid');

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'fully_paid':
        return '#34C759';
      case 'partially_paid':
        return '#FFD60A';
      case 'unpaid':
      default:
        return '#8E8E93';
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'fully_paid':
        return 'Fully Paid';
      case 'partially_paid':
        return 'Partially Paid';
      case 'unpaid':
      default:
        return 'Unpaid';
    }
  };

  const currentPaymentAmount = useInitialPayment && canChooseInitialPayment
    ? initialPreviewAmount
    : (booking.status === 'pending_payment' ? remainingBalance : payableTotal);
  const totalAmount = payableTotal;
  const modalAmountToPay = booking.status === 'pending_payment'
    ? remainingBalance
    : totalAmount;
  const mechanicReviewMeta = booking.mechanic_review || {};
  const existingMechanicReview = mechanicReviewMeta.review || null;
  const canRateMechanic =
    booking.status === 'completed' &&
    paymentStatus === 'fully_paid' &&
    !!booking.provider &&
    !!mechanicReviewMeta.can_rate;
  const hasMechanicReview = !!mechanicReviewMeta.has_review;
  const paymentProgressPct = totalAmount > 0
    ? Math.min(100, Math.max(0, (totalPaid / totalAmount) * 100))
    : 0;
  const canReportNoShow =
    booking.request?.type === 'emergency' &&
    (booking.status === 'accepted' || booking.status === 'on_the_way');

  const handleSubmitMechanicRating = async (payload: { rating: number; comment: string }) => {
    if (!booking?.id) return;
    try {
      setRatingSubmitting(true);
      const response = await fetch(`${API_URL}/bookings/bookings/${booking.id}/mechanic-review/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: payload.rating,
          comment: payload.comment,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as any)?.error || 'Unable to submit rating');
      }

      setShowRatingModal(false);
      setRatingPromptDismissed(true);
      fetchBookingDetail(true);
    } catch (err: any) {
      Alert.alert('Rating Error', err?.message || 'Unable to submit rating');
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleReportNoShow = () => {
    if (!booking || isReportingNoShow) return;

    Alert.alert(
      'Report No-Show',
      'This will cancel the current mechanic and immediately restart emergency search for a new mechanic. Continue?',
      [
        { text: 'Keep Waiting', style: 'cancel' },
        {
          text: 'Report No-Show',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsReportingNoShow(true);
              const response = await fetch(`${API_URL}/bookings/bookings/${booking.id}/report-no-show/`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: 'Client reported mechanic no-show' }),
              });

              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error((data as any)?.error || 'Unable to report no-show right now');
              }

              await fetchBookingDetail(true);

              Alert.alert(
                'No-Show Reported',
                'We cancelled this assignment and restarted emergency search for a new mechanic.',
                [
                  { text: 'Stay Here', style: 'cancel' },
                  {
                    text: 'Go to Requests',
                    onPress: () => router.replace('/(clientTabs)/main/request'),
                  },
                ]
              );
            } catch (err: any) {
              Alert.alert('Report Failed', err?.message || 'Unable to report no-show right now');
            } finally {
              setIsReportingNoShow(false);
            }
          },
        },
      ]
    );
  };

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
        contentContainerStyle={[
          styles.scrollContent,
          (booking.status === 'pending_payment' || isBookedState) ? styles.scrollContentWithFloatingAction : null,
        ]}
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
          <ThemedText style={styles.amountLarge}>₱{totalAmount.toFixed(2)}</ThemedText>
        </View>

        {/* Provider Information */}
        {booking.provider && (
          <TouchableOpacity 
            style={styles.sectionCard}
            onPress={() => router.push({
              pathname: '/client/booking/mechanic-profile/[id]',
              params: { id: String(booking.provider?.id) },
            })}
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

        {canReportNoShow && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
                <FontAwesome name="exclamation-triangle" size={16} color="#FF3B30" />
              </View>
              <ThemedText style={styles.sectionTitle}>Mechanic No-Show</ThemedText>
            </View>

            <ThemedText style={styles.noShowWarningText}>
              If your mechanic stopped responding or never arrived, report a no-show to cancel this assignment and auto-search for another mechanic.
            </ThemedText>

            <TouchableOpacity
              style={[styles.noShowButton, isReportingNoShow ? styles.noShowButtonDisabled : null]}
              onPress={handleReportNoShow}
              activeOpacity={0.85}
              disabled={isReportingNoShow}
            >
              {isReportingNoShow ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <FontAwesome name="flag" size={14} color="#FFFFFF" />
              )}
              <ThemedText style={styles.noShowButtonText}>
                {isReportingNoShow ? 'Reporting No-Show...' : 'Report No-Show & Find New Mechanic'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Shop Information */}
        {booking.shop && (
          <TouchableOpacity 
            style={styles.sectionCard}
            onPress={() => router.push({
              pathname: '/client/booking/shop-profile/[id]',
              params: { id: String(booking.shop?.id) },
            })}
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
                <View style={[styles.statusBadge, { backgroundColor: getPaymentStatusColor(paymentStatus), marginLeft: 10 }]}> 
                  <ThemedText style={styles.statusBadgeText}>
                    {getPaymentStatusLabel(paymentStatus)}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.paymentSummaryGrid}>
                <View style={styles.paymentSummaryTile}>
                  <ThemedText style={styles.paymentSummaryLabel}>Total</ThemedText>
                  <ThemedText style={styles.paymentSummaryValue}>₱{totalAmount.toFixed(2)}</ThemedText>
                  {isPayableTotalLive ? (
                    <ThemedText style={[styles.progressText, { marginTop: 3, textAlign: 'left', fontSize: 11 }]}>Live</ThemedText>
                  ) : null}
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

              {paymentStatus === 'unpaid' && canChooseInitialPayment ? (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteText}>Secure your booking with an optional initial payment.</ThemedText>
                </View>
              ) : null}

              <ThemedText style={[styles.noteText, { marginTop: 6, marginBottom: 8 }]}>Payment will be released to mechanic after job completion.</ThemedText>
              <View style={styles.receiptDivider} />
            </View>

            {isQuotationPending ? (
              <View style={styles.pendingHintBanner}>
                <View style={styles.pendingHintContent}>
                  <FontAwesome name="clock-o" size={12} color="#C89B55" />
                  <ThemedText style={styles.pendingHintText}>Pending quotation changes are waiting for your response.</ThemedText>
                </View>
                <TouchableOpacity style={styles.pendingHintActionButton} onPress={openChatWithMechanic}>
                  <FontAwesome name="comments" size={12} color="#111214" />
                  <ThemedText style={styles.pendingHintActionText}>Review in Chat</ThemedText>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.receiptList}>
              <ThemedText style={[styles.noteLabel, { marginBottom: 8 }]}>Convenience Fee</ThemedText>

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
                      {convenienceBreakdown.estimated ? 'Estimated Traffic Fee' : 'Traffic Fee'} ({convenienceBreakdown.trafficLabel})
                    </ThemedText>
                    <ThemedText style={styles.receiptAmount}>₱{convenienceBreakdown.trafficFee.toFixed(2)}</ThemedText>
                  </View>
                  {typeof convenienceBreakdown.etaMinutes === 'number' && convenienceBreakdown.etaMinutes > 0 && (
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptItem}>Estimated Time Arrive</ThemedText>
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

              {displayQuotation && sortedQuotationItems.length > 0 ? (
                <>
                  <TouchableOpacity
                    style={[styles.quotationListAccordionHeader, quotationListExpanded ? styles.quotationListAccordionHeaderExpanded : null]}
                    onPress={() => setQuotationListExpanded(prev => !prev)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <FontAwesome name="list" size={12} color="#A6ABB2" />
                      <ThemedText style={styles.quotationListAccordionTitle}>Quotation Items ({sortedQuotationItems.length})</ThemedText>
                    </View>
                    <FontAwesome name={quotationListExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#A6ABB2" />
                  </TouchableOpacity>

                  {quotationListExpanded ? (() => {
                    const acceptedByAssoc: Record<string, any> = {};
                    const acceptedRows: any[] = [];
                    const removedRows: any[] = [];
                    sortedQuotationItems.forEach((row: any) => {
                      const rowStatus = String(row?.status || row?.quotation_status || row?.state || ((booking as any)?.quotation?.status) || '').toLowerCase();
                      const key = getAssocKey(row);
                      if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) {
                        acceptedByAssoc[key] = row;
                      }
                      if (rowStatus === 'accepted') acceptedRows.push(row);
                      if (rowStatus === 'rejected') removedRows.push(row);
                    });

                    return sortedQuotationItems.map((it: any, idx: number) => {
                      const itemStatus = it && (it.status || it.quotation_status || it.state) ? (it.status || it.quotation_status || it.state) : ((booking as any)?.quotation && (booking as any).quotation.status) || 'pending';
                      const statusRaw = String(itemStatus || '').toLowerCase();
                      const isPending = statusRaw === 'pending';
                      const changeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
                      const isRemoved = changeLabel === 'Removed';
                      const desc = it?.description || it?.name || (it.service && `Service #${it.service}`) || 'Item';
                      const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
                      const qty = Number(it?.quantity ?? 1) || 1;
                      const key = getQuoteItemKey(it, idx);
                      const isExpanded = expandedQuoteItems[key] ?? false;
                      const assocKey = getAssocKey(it);
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

                      return (
                        <View key={key} style={[styles.quotationAccordionRow, isRemoved ? styles.removedItem : (changeLabel ? styles.pendingItem : styles.acceptedItem), isExpanded ? styles.quotationAccordionRowExpanded : null]}>
                          <TouchableOpacity style={styles.quotationAccordionHeader} onPress={() => toggleQuoteItem(key)} activeOpacity={0.8}>
                            <View style={styles.quoteHeaderLeft}>
                              <ThemedText style={[styles.receiptItem, isRemoved ? styles.removedItemText : null]} numberOfLines={1}>{desc}</ThemedText>
                              {changeLabel ? (
                                <View style={styles.pendingPill}>
                                  <ThemedText style={styles.pendingPillText}>{changeLabel}</ThemedText>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.quotationAccordionRight}>
                              <ThemedText style={[styles.receiptAmount, isRemoved ? styles.removedItemAmount : null]}>₱{(price * qty).toFixed(2)}</ThemedText>
                              <FontAwesome name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#9CA3AF" />
                            </View>
                          </TouchableOpacity>
                          {isExpanded ? (
                            <View style={styles.quotationAccordionBody}>
                              <View style={styles.quotationDetailTopRow}>
                                <ThemedText style={styles.quotationDetailStatusText}>{changeLabel || (isPending ? 'Pending' : 'Accepted')}</ThemedText>
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
                    });
                  })() : null}
                </>
              ) : (
                <View style={styles.noteBox}>
                  <ThemedText style={styles.noteText}>No quotation available yet.</ThemedText>
                </View>
              )}

              <View style={styles.receiptDivider} />
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Convenience Fee Total</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{convenienceFeeTotal.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Quotation Estimated Total</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{quotationEstimatedTotal.toFixed(2)}</ThemedText>
              </View>
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Total Fee</ThemedText>
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

              {canRateMechanic ? (
                <View style={{ marginTop: 12 }}>
                  {hasMechanicReview && existingMechanicReview ? (
                    <View style={styles.noteBox}>
                      <ThemedText style={styles.noteLabel}>Your Rating</ThemedText>
                      <ThemedText style={styles.noteText}>
                        {Number(existingMechanicReview.rating || 0).toFixed(0)} / 5
                      </ThemedText>
                      {existingMechanicReview.comment ? (
                        <ThemedText style={[styles.noteText, { marginTop: 6 }]}>{existingMechanicReview.comment}</ThemedText>
                      ) : null}
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.finishLargeButton, { backgroundColor: '#FFD60A' }]}
                      onPress={() => setShowRatingModal(true)}
                      activeOpacity={0.85}
                    >
                      <FontAwesome name="star" size={16} color="#111214" style={{ marginRight: 8 }} />
                      <ThemedText style={[styles.actionButtonText, { color: '#111214' }]}>Rate Mechanic</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
              
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

      {(booking.status === 'pending_payment' || isBookedState) && (
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={styles.finishLargeButton} onPress={() => setShowPaymentModal(true)}>
            <FontAwesome name="credit-card" size={16} color="#fff" style={{ marginRight: 8 }} />
            <ThemedText style={styles.actionButtonText}>
              {isBookedState ? 'Secure Booking (Optional Initial Payment)' : 'Proceed to Payment'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      <PaymentMethodModal
        visible={showPaymentModal && (booking.status === 'pending_payment' || isBookedState)}
        bookingId={booking.id}
        totalAmount={modalAmountToPay}
        allowInitialPayment={canChooseInitialPayment}
        useInitialPayment={useInitialPayment}
        onToggleInitialPayment={setUseInitialPayment}
        selectedPercentage={selectedInitialPaymentPercentage}
        onSelectPercentage={setSelectedInitialPaymentPercentage}
        onClose={() => setShowPaymentModal(false)}
        onPaymentInitiated={(method) => {
          setPaymentMethod(method);
          if (method === 'cash') {
            setShowPaymentModal(false);
            setShowQRScanner(true);
            return;
          }

          if (method === 'ewallet') {
            setShowPaymentModal(false);
            setShowEWalletModal(true);
          }
        }}
      />

      <EWalletOptionsModal
        visible={showEWalletModal}
        bookingId={booking.id}
        totalAmount={modalAmountToPay}
        allowInitialPayment={canChooseInitialPayment}
        useInitialPayment={useInitialPayment}
        onToggleInitialPayment={setUseInitialPayment}
        selectedPercentage={selectedInitialPaymentPercentage}
        onSelectPercentage={setSelectedInitialPaymentPercentage}
        onClose={() => setShowEWalletModal(false)}
        onPaymentInitiated={() => {
          setShowEWalletModal(false);
        }}
      />

      <QRScannerModal
        visible={showQRScanner}
        bookingId={booking.id}
        onClose={() => setShowQRScanner(false)}
        onScanSuccess={(data) => {
          setQrScanData(data);
          setScannedToken(data.token);
          setShowQRScanner(false);
          setShowQRConfirm(true);
        }}
      />

      <QRConfirmationModal
        visible={showQRConfirm}
        scanData={qrScanData}
        token={scannedToken}
        onConfirm={() => {
          setShowQRConfirm(false);
          setShowSuccess(true);
          fetchBookingDetail(true);
        }}
        onCancel={() => {
          setShowQRConfirm(false);
          setShowQRScanner(true);
        }}
      />

      <PaymentSuccessModal
        visible={showSuccess}
        bookingId={booking.id}
        amount={currentPaymentAmount}
        paymentMethod={paymentMethod}
        totalPaid={totalPaid}
        remainingBalance={remainingBalance}
        paymentStatus={paymentStatus}
        installmentCount={installments.length}
        onClose={() => {
          setShowSuccess(false);
          fetchBookingDetail(true);
        }}
      />

      <MechanicRatingModal
        visible={showRatingModal && canRateMechanic && !hasMechanicReview}
        mechanicName={booking.provider?.name}
        loading={ratingSubmitting}
        initialRating={existingMechanicReview?.rating}
        initialComment={existingMechanicReview?.comment || ''}
        onClose={() => {
          setShowRatingModal(false);
          setRatingPromptDismissed(true);
        }}
        onSkip={() => {
          setShowRatingModal(false);
          setRatingPromptDismissed(true);
        }}
        onSubmit={handleSubmitMechanicRating}
      />
    </ThemedView>
  );
}
