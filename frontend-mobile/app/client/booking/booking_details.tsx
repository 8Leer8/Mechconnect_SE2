import React, { useEffect, useState, useCallback, useMemo } from 'react';
// Ensure the router header is hidden for this route so only the in-page header shows
export const screenOptions = { headerShown: false } as const;
import {View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking, Platform, Modal, TextInput, KeyboardAvoidingView, Alert, useWindowDimensions } from 'react-native';
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
import CreditsPaymentModal from '@/components/payment/CreditsPaymentModal';
import ReportNoShowModal from '@/components/booking/ReportNoShowModal';
import MechanicRatingModal from '@/components/booking/MechanicRatingModal';
import {
  bookingHasAcceptedBackjob,
  bookingHasBackjob,
  bookingInBackjobPaymentPhase,
  canOpenBookingChat,
} from '@/lib/bookingAccess';
import { coerceBarangayForDisplay } from '@/lib/locationAddress';
import { sortQuotationItemsForDisplay } from '@/lib/quotationOrdering';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingDetail {
  id: number;
  status: string;
  dispute_status?: 'none' | 'active' | 'resolved' | string;
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
  dispute_details?: {
    issue_description?: string;
    issue_picture?: string | null;
    refund_receipt_image?: string | null;
    dispute_status?: string;
    is_client_verified?: boolean;
    resolution_notes?: string | null;
    amount_refunded?: number | null;
    created_at?: string;
    resolved_at?: string | null;
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

const PHOTO_GRID_BREAKPOINT = 440;

function mergeGalleryWithLegacy(gallery: string[] | undefined, legacy: string | null | undefined) {
  const norm = (u: string) => String(u || '').replace(/\s+/g, '').trim();
  const list = (gallery || []).map(norm).filter(Boolean);
  const leg = norm(String(legacy || ''));
  if (!leg) return list;
  if (list.some((u) => u === leg)) return list;
  return [leg, ...list];
}

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

const QUOTE_ITEM_SOURCE_LABELS: Record<string, string> = {
  on_hand: 'On-hand (stock)',
  to_be_purchased: 'To be purchased',
  mechanic_selling: 'Mechanic selling / owned',
};

const quoteItemSourceLabel = (v: any) => QUOTE_ITEM_SOURCE_LABELS[String(v || '')] || (v ? String(v) : '—');

export default function ClientBookingDetailScreen() {
  const { bookingId, id } = useLocalSearchParams<{ bookingId?: string; id?: string }>();
  const resolvedBookingId = bookingId || id;
  const { width: windowWidth } = useWindowDimensions();
  const photoGridCols = windowWidth >= PHOTO_GRID_BREAKPOINT ? 3 : 2;
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
  const [backjobSubmitting, setBackjobSubmitting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentReceiptConfirm, setShowPaymentReceiptConfirm] = useState(false);
  const [showEWalletModal, setShowEWalletModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
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
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);
  const [showReportNoShowModal, setShowReportNoShowModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeImage, setDisputeImage] = useState<string | null>(null);
  const [refundMethod, setRefundMethod] = useState<'gcash' | 'maya' | 'voucher'>('gcash');
  const [refundAccountNumber, setRefundAccountNumber] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [showRefundVerifyModal, setShowRefundVerifyModal] = useState(false);
  const [verifyRefundSubmitting, setVerifyRefundSubmitting] = useState(false);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<Record<string, boolean>>({});
  const [quotationListExpanded, setQuotationListExpanded] = useState(false);
  const [chatChangeLabelByKey, setChatChangeLabelByKey] = useState<Record<string, 'Added' | 'Edited' | 'Removed'>>({});
  const [pendingQuoteSnapshot, setPendingQuoteSnapshot] = useState<any | null>(null);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>({});
  const [visibleBeforePhotoCount, setVisibleBeforePhotoCount] = useState(6);
  const [visibleAfterPhotoCount, setVisibleAfterPhotoCount] = useState(6);
  const [beforePhotosExpanded, setBeforePhotosExpanded] = useState(false);
  const [afterPhotosExpanded, setAfterPhotosExpanded] = useState(false);
  const [photoLoadingMap, setPhotoLoadingMap] = useState<Record<string, boolean>>({});
  const [photoErrorMap, setPhotoErrorMap] = useState<Record<string, boolean>>({});

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

  const isBackjobBookingData = (candidate: any) => {
    if (!candidate) return false;
    const statusRaw = String(candidate?.status || '').toLowerCase();
    return Boolean(
      bookingHasBackjob(candidate) ||
      candidate?.has_backjob ||
      candidate?.is_backjob ||
      candidate?.backjob ||
      String(candidate?.backjob_status || '').trim() ||
      statusRaw === 'backjob_pending' ||
      statusRaw === 'reworked'
    );
  };

  const toggleAfterPhotosAccordion = useCallback(() => {
    setAfterPhotosExpanded((prev) => !prev);
    setPhotoLoadingMap({});
    setPhotoErrorMap({});
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
    const isBackjobBooking = isBackjobBookingData(booking);
    const saved = (booking as any).quotation;
    const details = (booking as any).request?.request_details || null;
    if (!details && !(saved && (saved.items || []).length > 0)) return null;

    // Backjob should not include old/booked base service rows in quotation display.
    const expectedServiceItems: any[] = [];
    if (!isBackjobBooking && details) {
      if (details.service) {
        const svc: any = details.service;
        expectedServiceItems.push({
          description: svc.name || 'Service',
          quantity: 1,
          unit_price: toPrice(svc.minimum_price ?? svc.price),
          service: svc.id,
          line_kind: 'service',
          status: 'accepted',
        });
      }
      if (Array.isArray(details.services) && details.services.length > 0) {
        details.services.forEach((svc: any) => {
          expectedServiceItems.push({
            description: svc?.name || 'Service',
            quantity: 1,
            unit_price: toPrice(svc?.minimum_price ?? svc?.price),
            service: svc?.id,
            line_kind: 'service',
            status: 'accepted',
          });
        });
      }
    }

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

    if (saved && (saved.items || []).length > 0) {
      const mergedItems = [...(saved.items || [])];
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
        ...saved,
        status: pendingQuoteSnapshot?.status || saved?.status,
        items: overlayedItems,
        total_amount: Math.max(Number(pendingQuoteSnapshot?.total_amount || 0), Number(saved?.total_amount || 0), mergedTotal),
      };
    }

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
  const hasLivePendingQuoteRequest = Boolean(
    pendingQuoteSnapshot && String(pendingQuoteSnapshot?.status || '').toLowerCase() === 'pending'
  );
  const isQuotationPending = hasLivePendingQuoteRequest || Boolean(
    ((displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : []).some(
      (it: any) => String(it?.status || it?.quotation_status || it?.state || '').toLowerCase() === 'pending'
    ) || ((booking as any)?.quotation && (booking as any).quotation.status === 'pending')
  );

  const getItemStatus = (it: any, parentQuotation: any) => {
    if (!it) return 'accepted';
    return it.status || it.quotation_status || it.state || (parentQuotation && parentQuotation.status) || 'accepted';
  };

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
    return sortQuotationItemsForDisplay(items, serviceItemIds, chatChangeLabelByKey);
  }, [displayQuotation, serviceItemIds, chatChangeLabelByKey]);

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
      // Same exact name without stable assoc is likely remove+add, not edit.
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
  const pendingRequestedQuotationTotal = useMemo(() => {
    if (!hasLivePendingQuoteRequest) return null;
    const pendingTotal = Number((pendingQuoteSnapshot as any)?.total_amount);
    if (!Number.isFinite(pendingTotal) || pendingTotal < 0) return null;
    return pendingTotal;
  }, [hasLivePendingQuoteRequest, pendingQuoteSnapshot]);

  const quotationPendingDeltaTotal = useMemo(() => {
    if (!sortedQuotationItems.length) return 0;

    const acceptedByAssoc: Record<string, any> = {};
    const acceptedRows: any[] = [];
    const removedRows: any[] = [];
    sortedQuotationItems.forEach((row: any) => {
      const rowStatus = String(row?.status || row?.quotation_status || row?.state || ((booking as any)?.quotation?.status) || '').toLowerCase();
      const key = getAssocKey(row);
      if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) acceptedByAssoc[key] = row;
      if (rowStatus === 'accepted') acceptedRows.push(row);
      if (rowStatus === 'rejected') removedRows.push(row);
    });

    const backjobCreatedAtMs = Number(new Date(String((booking as any)?.backjob?.created_at || '')).getTime());
    const hasBackjobCreatedAt = Number.isFinite(backjobCreatedAtMs) && backjobCreatedAtMs > 0;
    const isLineCreatedAfterBackjob = (line: any) => {
      const lineMs = Number(new Date(String(line?.created_at || '')).getTime());
      if (!Number.isFinite(lineMs) || lineMs <= 0 || !hasBackjobCreatedAt) return false;
      return lineMs >= backjobCreatedAtMs;
    };
    const shouldIncludeItemInBackjobQuoteAmountTotals = (line: any) => {
      if (Boolean(line?.is_backjob_new_line)) return true;
      if (isLineCreatedAfterBackjob(line)) return true;
      const explicitLbl = getExplicitChangeLabel(line);
      const inferredLbl = inferChangeLabel(line, acceptedByAssoc, acceptedRows, removedRows);
      const chatLbl = getQuoteSnapshotKeys(line).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
      const rawLbl = explicitLbl || chatLbl || inferredLbl || null;
      return rawLbl === 'Added';
    };

    return sortedQuotationItems.reduce((sum: number, it: any) => {
      if (bookingInBackjobPaymentPhase(booking) && !shouldIncludeItemInBackjobQuoteAmountTotals(it)) {
        return sum;
      }
      const rowStatus = String(it?.status || it?.quotation_status || it?.state || ((booking as any)?.quotation?.status) || '').toLowerCase();
      if (rowStatus !== 'pending') return sum;

      const explicit = getExplicitChangeLabel(it);
      const inferred = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
      const chatDerived = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
      let changeLabel = explicit || chatDerived || inferred || null;
      if (
        bookingInBackjobPaymentPhase(booking) &&
        rowStatus === 'pending' &&
        !changeLabel &&
        (Boolean(it?.is_backjob_new_line) || isLineCreatedAfterBackjob(it))
      ) {
        changeLabel = 'Added';
      }
      if (!changeLabel && rowStatus === 'pending') {
        changeLabel = 'Edited';
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
  }, [sortedQuotationItems, booking, chatChangeLabelByKey]);

  const quotationAcceptedDeltaTotal = useMemo(() => {
    if (!sortedQuotationItems.length) return 0;

    const acceptedByAssoc: Record<string, any> = {};
    const acceptedRows: any[] = [];
    const removedRows: any[] = [];
    sortedQuotationItems.forEach((row: any) => {
      const rowStatus = String(row?.status || row?.quotation_status || row?.state || ((booking as any)?.quotation?.status) || '').toLowerCase();
      const key = getAssocKey(row);
      if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) acceptedByAssoc[key] = row;
      if (rowStatus === 'accepted') acceptedRows.push(row);
      if (rowStatus === 'rejected') removedRows.push(row);
    });

    const backjobCreatedAtMs = Number(new Date(String((booking as any)?.backjob?.created_at || '')).getTime());
    const hasBackjobCreatedAt = Number.isFinite(backjobCreatedAtMs) && backjobCreatedAtMs > 0;
    const isLineCreatedAfterBackjob = (line: any) => {
      const lineMs = Number(new Date(String(line?.created_at || '')).getTime());
      if (!Number.isFinite(lineMs) || lineMs <= 0 || !hasBackjobCreatedAt) return false;
      return lineMs >= backjobCreatedAtMs;
    };
    const shouldIncludeItemInBackjobQuoteAmountTotals = (line: any) => {
      if (Boolean(line?.is_backjob_new_line)) return true;
      if (isLineCreatedAfterBackjob(line)) return true;
      const explicitLbl = getExplicitChangeLabel(line);
      const inferredLbl = inferChangeLabel(line, acceptedByAssoc, acceptedRows, removedRows);
      const chatLbl = getQuoteSnapshotKeys(line).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
      const rawLbl = explicitLbl || chatLbl || inferredLbl || null;
      return rawLbl === 'Added';
    };

    return sortedQuotationItems.reduce((sum: number, it: any) => {
      if (bookingInBackjobPaymentPhase(booking) && !shouldIncludeItemInBackjobQuoteAmountTotals(it)) {
        return sum;
      }
      const rowStatus = String(it?.status || it?.quotation_status || it?.state || ((booking as any)?.quotation?.status) || '').toLowerCase();
      if (rowStatus !== 'accepted') return sum;

      const explicit = getExplicitChangeLabel(it);
      const inferred = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
      const chatDerived = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
      let changeLabel = explicit || chatDerived || inferred || null;
      if (
        bookingInBackjobPaymentPhase(booking) &&
        rowStatus === 'accepted' &&
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
  }, [sortedQuotationItems, booking, chatChangeLabelByKey]);

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
    if (!resolvedBookingId) return;
    try {
      if (!silent) setLoading(true);
      setError(null);
      let response = await fetch(`${API_URL}/bookings/bookings/${resolvedBookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        response = await fetch(`${API_URL}/bookings/mechanic/bookings/${resolvedBookingId}/`, {
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
  }, [resolvedBookingId]);

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
    refreshChatQuotationLabels();
    // Poll every 10 seconds so client sees mechanic status changes in real time
    const interval = setInterval(() => {
      fetchBookingDetail(true);
      refreshChatQuotationLabels();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchBookingDetail, refreshChatQuotationLabels]);

  // Faster temporary sync while a quotation request is pending,
  // so UI reflects accept/reject almost immediately.
  useEffect(() => {
    if (!hasLivePendingQuoteRequest) return;
    const quickInterval = setInterval(() => {
      fetchBookingDetail(true);
      refreshChatQuotationLabels();
    }, 2000);
    return () => clearInterval(quickInterval);
  }, [hasLivePendingQuoteRequest, fetchBookingDetail, refreshChatQuotationLabels]);

  // Refresh when websocket reports an update for this booking (quotation accepted/rejected or booking update)
  const { lastMessage } = useWebSocketContext();
  useEffect(() => {
    try {
      if (!lastMessage) return;
      const bid = Number(lastMessage.booking_id);
      if (!bid || !resolvedBookingId) return;
      if (bid === Number(resolvedBookingId)) {
        const action = String(lastMessage.action || '').toLowerCase();
        if (action === 'payment.completed') {
          setShowSuccess(true);
        }
        // lightweight refresh
        fetchBookingDetail(true);
        refreshChatQuotationLabels();
      }
    } catch (e) {
      // ignore
    }
  }, [lastMessage, resolvedBookingId, fetchBookingDetail, booking?.has_backjob, booking?.backjob?.status, refreshChatQuotationLabels]);

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

  const pickBackjobImageFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets && result.assets[0]) {
      setBackjobImage(result.assets[0].uri);
    }
  };

  const pickBackjobImageFromCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets && result.assets[0]) {
      setBackjobImage(result.assets[0].uri);
    }
  };

  const pickBackjobImage = () => {
    Alert.alert('Add Photo', 'Choose where to get the photo.', [
      {
        text: 'Camera',
        onPress: async () => {
          try {
            await pickBackjobImageFromCamera();
          } catch {
            // Ignore picker errors to avoid breaking booking details screen.
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          try {
            await pickBackjobImageFromGallery();
          } catch {
            // Ignore picker errors to avoid breaking booking details screen.
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickDisputeImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return;
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets[0]) {
        setDisputeImage(result.assets[0].uri);
      }
    } catch {
      // Ignore picker errors to avoid breaking booking details screen.
    }
  };

  const openChatWithMechanic = () => {
    if (!booking || !canOpenBookingChat(booking)) return;
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
      !hasPaidInstallment &&
      !bookingHasBackjob(booking);

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

  const disputeWorkflowStatus = String(
    booking?.dispute_details?.dispute_status || booking?.dispute_status || 'none'
  ).toLowerCase();
  const waitingForClientVerification = disputeWorkflowStatus === 'waiting_for_client_verification';

  useEffect(() => {
    if (waitingForClientVerification) {
      setShowRefundVerifyModal(true);
    }
  }, [waitingForClientVerification]);

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
  const isAcceptedBackjob = bookingHasAcceptedBackjob(booking);
  const backjobPaymentPhase = bookingInBackjobPaymentPhase(booking);
  const backjobCreatedAtMs = Number(new Date(String((booking as any)?.backjob?.created_at || '')).getTime());
  const hasBackjobCreatedAt = Number.isFinite(backjobCreatedAtMs) && backjobCreatedAtMs > 0;
  const isLineCreatedAfterBackjob = (it: any) => {
    const lineMs = Number(new Date(String(it?.created_at || '')).getTime());
    if (!Number.isFinite(lineMs) || lineMs <= 0 || !hasBackjobCreatedAt) return false;
    return lineMs >= backjobCreatedAtMs;
  };
  const isBackjobChargeableQuotationLine = (it: any) => {
    if (Boolean(it?.is_backjob_new_line)) return true;
    const acceptedByAssoc: Record<string, any> = {};
    const acceptedRows: any[] = [];
    const removedRows: any[] = [];
    sortedQuotationItems.forEach((row: any) => {
      const rowStatus = String(row?.status || row?.quotation_status || row?.state || ((booking as any)?.quotation?.status) || '').toLowerCase();
      const key = getAssocKey(row);
      if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) acceptedByAssoc[key] = row;
      if (rowStatus === 'accepted') acceptedRows.push(row);
      if (rowStatus === 'rejected') removedRows.push(row);
    });

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
  const hasPaidInstallment = installments.some(
    (item) => String(item.status || '').toLowerCase() === 'paid'
  );
  const isBookedState = booking.status === 'booked' || booking.status === 'accepted';
  const canChooseInitialPayment =
    isBookedState &&
    summaryPaymentStatus === 'unpaid' &&
    !hasPaidInstallment &&
    !bookingHasBackjob(booking);
  const isPayableTotalLive = booking.status !== 'pending_payment';

  const resolvedBackjobCharges = Math.max(0, quotationAcceptedDeltaTotal + quotationPendingDeltaTotal);
  const effectiveConvenienceFeeTotal = backjobPaymentPhase ? 0 : convenienceFeeTotal;
  const effectiveQuotationEstimatedTotal = backjobPaymentPhase ? resolvedBackjobCharges : quotationEstimatedTotal;
  const effectiveTotalFee = backjobPaymentPhase ? resolvedBackjobCharges : totalFee;
  const payableTotal = backjobPaymentPhase
    ? resolvedBackjobCharges
    : Math.max(0, Math.max(totalFee, summaryTotalAmount));
  const fallbackInitialAmount = payableTotal * selectedInitialPaymentPercentage;
  const fallbackInitialRemaining = Math.max(0, payableTotal - fallbackInitialAmount);
  const pendingInitial = installments.find((item) => String(item.installment_type || '').toLowerCase() === 'initial');
  const pendingFinal = installments.find((item) => String(item.installment_type || '').toLowerCase() === 'final');
  const initialPreviewAmount = pendingInitial ? Number(pendingInitial.amount || 0) : fallbackInitialAmount;
  const _remainingAfterInitialPreview = pendingFinal ? Number(pendingFinal.amount || 0) : fallbackInitialRemaining;
  const remainingBalance = Math.max(0, payableTotal - totalPaid);
  const paymentStatus =
    payableTotal <= 0
      ? 'fully_paid'
      : totalPaid >= payableTotal && payableTotal > 0
        ? 'fully_paid'
        : totalPaid > 0
          ? 'partially_paid'
          : 'unpaid';

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
  const noPendingPaymentLeft = booking.status === 'pending_payment' && remainingBalance <= 0;
  const canProceedToCompletion = noPendingPaymentLeft && !isQuotationPending;
  const showPaymentCTA =
    (!backjobPaymentPhase || payableTotal > 0) &&
    (isBookedState || (booking.status === 'pending_payment' && remainingBalance > 0));
  const mechanicReviewMeta = booking.mechanic_review || {};
  const existingMechanicReview = mechanicReviewMeta.review || null;
  const canRateMechanic =
    booking.status === 'completed' &&
    paymentStatus === 'fully_paid' &&
    !!booking.provider &&
    !!mechanicReviewMeta.can_rate &&
    String(booking.dispute_status || 'none').toLowerCase() !== 'active';
  const hasMechanicReview = !!mechanicReviewMeta.has_review;
  const paymentProgressPct = totalAmount > 0
    ? Math.min(100, Math.max(0, (totalPaid / totalAmount) * 100))
    : 0;

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

  const isDisputeEligible =
    (booking.status === 'completed' || booking.status === 'pending_payment') &&
    String(booking.dispute_status || 'none').toLowerCase() === 'none';

  const isNoShowEligible =
    (booking.status === 'accepted' || booking.status === 'on_the_way') &&
    !reportingNoShow;

  const handleOpenDisputeForm = () => {
    setShowActionMenu(false);
    if (!isDisputeEligible) {
      Alert.alert('Dispute unavailable', 'This booking cannot be disputed at the moment.');
      return;
    }
    setShowDisputeModal(true);
  };

  const handleReportNoShow = () => {
    setShowActionMenu(false);
    if (!isNoShowEligible) {
      Alert.alert('No-Show unavailable', 'This booking is not eligible for no-show reporting right now.');
      return;
    }
    setShowReportNoShowModal(true);
  };

  const handleConfirmReportNoShow = async () => {
    try {
      setReportingNoShow(true);
      const response = await fetch(`${API_URL}/bookings/bookings/${booking.id}/report-no-show/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        throw new Error((data as any)?.error || 'Unable to report no-show');
      }

      setShowReportNoShowModal(false);
      fetchBookingDetail(true);

      const rescueId = Number((data as any)?.broadcast_request_id || 0);
      Alert.alert(
        'No-Show Reported',
        rescueId > 0
          ? `Auto-rescue broadcast #${rescueId} was created.`
          : 'Auto-rescue broadcast was created.',
        [
          {
            text: 'View Requests',
            onPress: () => router.push('/(clientTabs)/main/request' as any),
          },
          { text: 'Stay here', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      Alert.alert('No-Show Error', err?.message || 'Unable to report no-show');
    } finally {
      setReportingNoShow(false);
    }
  };

  const handleSubmitDispute = async () => {
    const issueDescription = disputeReason.trim();
    const accountNumber = refundAccountNumber.trim();
    if (!issueDescription) {
      Alert.alert('Missing details', 'Please describe the issue before submitting.');
      return;
    }
    if (refundMethod !== 'voucher' && !accountNumber) {
      Alert.alert('Missing account number', 'Please enter your refund account number.');
      return;
    }

    try {
      setDisputeSubmitting(true);
      const formData = new FormData();
      formData.append('issue_description', issueDescription);

      if (disputeImage) {
        const fileName = disputeImage.split('/').pop() || `dispute-${booking.id}.jpg`;
        formData.append('issue_picture', {
          uri: disputeImage,
          name: fileName,
          type: 'image/jpeg',
        } as any);
      }

      const response = await fetch(`${API_URL}/bookings/bookings/${booking.id}/disputes/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as any)?.error || 'Unable to file dispute');
      }

      const refundResponse = await fetch(`${API_URL}/bookings/bookings/${booking.id}/disputes/refund-details/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refund_method: refundMethod,
          account_number: refundMethod === 'voucher' ? '' : accountNumber,
        }),
      });

      const refundData = await refundResponse.json().catch(() => ({}));
      if (!refundResponse.ok) {
        throw new Error((refundData as any)?.error || 'Dispute filed, but failed to save refund destination details');
      }

      setShowDisputeModal(false);
      setDisputeReason('');
      setDisputeImage(null);
      setRefundMethod('gcash');
      setRefundAccountNumber('');
      Alert.alert('Dispute filed', 'Your report has been submitted for review.');
      fetchBookingDetail(true);
    } catch (err: any) {
      Alert.alert('Dispute error', err?.message || 'Unable to file dispute');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handleConfirmFundsReceived = async () => {
    try {
      setVerifyRefundSubmitting(true);
      const response = await fetch(`${API_URL}/bookings/bookings/${booking.id}/disputes/verify-refund/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as any)?.error || 'Unable to verify refund');
      }

      setShowRefundVerifyModal(false);
      Alert.alert('Refund confirmed', 'Dispute has been resolved and marked refunded.');
      fetchBookingDetail(true);
    } catch (err: any) {
      Alert.alert('Verification error', err?.message || 'Unable to verify refund');
    } finally {
      setVerifyRefundSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Booking #{booking.id}</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <FontAwesome name="refresh" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => setShowActionMenu(true)}>
            <FontAwesome name="ellipsis-v" size={16} color="#FF8C00" />
          </TouchableOpacity>
        </View>
      </View>

      {(booking.dispute_status || 'none') !== 'none' ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: String(booking.dispute_status).toLowerCase() === 'active' ? '#FF3B3066' : '#34C75966',
            backgroundColor: String(booking.dispute_status).toLowerCase() === 'active' ? '#FF3B3018' : '#34C75918',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FontAwesome
            name={String(booking.dispute_status).toLowerCase() === 'active' ? 'warning' : 'check-circle'}
            size={13}
            color={String(booking.dispute_status).toLowerCase() === 'active' ? '#FF3B30' : '#34C759'}
          />
          <ThemedText style={{ color: '#ECEDEE', fontSize: 12, fontWeight: '600' }}>
            Dispute Status: {String(booking.dispute_status || '').toUpperCase()}
          </ThemedText>
        </View>
      ) : null}

      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={() => setShowActionMenu(false)}
        >
          <View
            style={{
              position: 'absolute',
              top: 106,
              right: 16,
              backgroundColor: '#1A1C1E',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#2A2C2E',
              minWidth: 190,
              overflow: 'hidden',
            }}
          >
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                opacity: isDisputeEligible ? 1 : 0.45,
              }}
              activeOpacity={0.8}
              onPress={handleOpenDisputeForm}
              disabled={!isDisputeEligible}
            >
              <FontAwesome name="flag" size={14} color="#FF8C00" />
              <ThemedText style={{ color: '#ECEDEE', marginLeft: 10, fontWeight: '600' }}>Report / File Dispute</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: '#2A2C2E',
                opacity: isNoShowEligible ? 1 : 0.45,
              }}
              activeOpacity={0.8}
              onPress={handleReportNoShow}
              disabled={!isNoShowEligible}
            >
              {reportingNoShow ? (
                <ActivityIndicator size="small" color="#FF6B5C" />
              ) : (
                <FontAwesome name="exclamation-triangle" size={14} color="#FF6B5C" />
              )}
              <ThemedText style={{ color: '#ECEDEE', marginLeft: 10, fontWeight: '600' }}>
                Report Mechanic No-Show
              </ThemedText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ReportNoShowModal
        visible={showReportNoShowModal}
        loading={reportingNoShow}
        onCancel={() => setShowReportNoShowModal(false)}
        onConfirm={handleConfirmReportNoShow}
      />

      <Modal visible={showDisputeModal} transparent animationType="slide" onRequestClose={() => setShowDisputeModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome name="flag" size={18} color="#FF8C00" />
                  <ThemedText style={styles.modalTitle}>File a Dispute</ThemedText>
                </View>
                <TouchableOpacity onPress={() => setShowDisputeModal(false)}>
                  <FontAwesome name="times" size={20} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalContent}>
                <ThemedText style={{ color: '#8E8E93', marginBottom: 8 }}>
                  Describe the issue clearly. This creates a formal dispute for admin review.
                </ThemedText>
                <TextInput
                  style={styles.textArea}
                  placeholder="What happened?"
                  placeholderTextColor="#6C6C70"
                  multiline
                  numberOfLines={4}
                  value={disputeReason}
                  onChangeText={setDisputeReason}
                />

                <View style={{ height: 12 }} />
                <ThemedText style={{ color: '#ECEDEE', fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
                  Refund destination
                </ThemedText>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  {(['gcash', 'maya', 'voucher'] as const).map((method) => {
                    const active = refundMethod === method;
                    return (
                      <TouchableOpacity
                        key={method}
                        onPress={() => setRefundMethod(method)}
                        style={{
                          flex: 1,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: active ? '#FF8C00' : '#3A3A3C',
                          backgroundColor: active ? '#FF8C001E' : '#2C2C2E',
                          paddingVertical: 10,
                          alignItems: 'center',
                        }}
                      >
                        <ThemedText style={{ color: active ? '#FFB563' : '#ECEDEE', fontSize: 12, fontWeight: '700' }}>
                          {method.toUpperCase()}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {refundMethod !== 'voucher' ? (
                  <TextInput
                    style={{
                      backgroundColor: '#2C2C2E',
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: '#ECEDEE',
                      borderWidth: 1,
                      borderColor: '#3A3A3C',
                    }}
                    placeholder={`${refundMethod.toUpperCase()} account number`}
                    placeholderTextColor="#6C6C70"
                    keyboardType="number-pad"
                    value={refundAccountNumber}
                    onChangeText={setRefundAccountNumber}
                  />
                ) : (
                  <View style={{ backgroundColor: '#2C2C2E', borderRadius: 12, padding: 12 }}>
                    <ThemedText style={{ color: '#8E8E93', fontSize: 12 }}>
                      Voucher selected. No account details required.
                    </ThemedText>
                  </View>
                )}

                <View style={{ height: 12 }} />
                {disputeImage ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: disputeImage }} style={styles.previewImage} />
                    <TouchableOpacity style={styles.removeImageBtn} onPress={() => setDisputeImage(null)}>
                      <FontAwesome name="times-circle" size={28} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={pickDisputeImage}>
                    <FontAwesome name="camera" size={28} color="#8E8E93" />
                    <ThemedText style={styles.addPhotoText}>Add Evidence Photo (Optional)</ThemedText>
                  </TouchableOpacity>
                )}

                <View style={{ height: 12 }} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { flex: 1 }]}
                    onPress={() => setShowDisputeModal(false)}
                    disabled={disputeSubmitting}
                  >
                    <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendBtn, { flex: 1, opacity: disputeSubmitting ? 0.8 : 1 }]}
                    onPress={handleSubmitDispute}
                    disabled={disputeSubmitting}
                  >
                    {disputeSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <FontAwesome name="paper-plane" size={14} color="#FFFFFF" />
                        <ThemedText style={styles.sendBtnText}>Submit Report</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={showRefundVerifyModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!verifyRefundSubmitting) setShowRefundVerifyModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={styles.modalBox}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <FontAwesome name="money" size={18} color="#34C759" />
                  <ThemedText style={styles.modalTitle}>Verify Refund</ThemedText>
                </View>
                <TouchableOpacity onPress={() => setShowRefundVerifyModal(false)} disabled={verifyRefundSubmitting}>
                  <FontAwesome name="times" size={20} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalContent}>
                <ThemedText style={{ color: '#8E8E93', marginBottom: 8 }}>
                  Mechanic uploaded a refund receipt. Confirm if funds were received.
                </ThemedText>

                {booking.dispute_details?.refund_receipt_image ? (
                  <Image source={{ uri: booking.dispute_details.refund_receipt_image }} style={styles.previewImage} />
                ) : (
                  <View style={styles.addPhotoBtn}>
                    <FontAwesome name="image" size={28} color="#8E8E93" />
                    <ThemedText style={styles.addPhotoText}>No receipt image uploaded</ThemedText>
                  </View>
                )}

                <View style={{ height: 12 }} />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { flex: 1 }]}
                    onPress={() => setShowRefundVerifyModal(false)}
                    disabled={verifyRefundSubmitting}
                  >
                    <ThemedText style={styles.cancelBtnText}>Later</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendBtn, { flex: 1, opacity: verifyRefundSubmitting ? 0.8 : 1 }]}
                    onPress={handleConfirmFundsReceived}
                    disabled={verifyRefundSubmitting}
                  >
                    {verifyRefundSubmitting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <FontAwesome name="check" size={14} color="#FFFFFF" />
                        <ThemedText style={styles.sendBtnText}>Confirm Funds Received</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          showPaymentCTA ? styles.scrollContentWithFloatingAction : null,
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
        {booking.provider && canOpenBookingChat(booking) ? (
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={openChatWithMechanic}
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
        ) : null}

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
          {(() => {
            const inferred = inferFromStreetAddress(booking.service_location?.street_name);
            const fallbackStreet =
              (booking.service_location as any)?.latitude != null && (booking.service_location as any)?.longitude != null
                ? `${Number((booking.service_location as any).latitude).toFixed(6)}, ${Number((booking.service_location as any).longitude).toFixed(6)}`
                : 'Unavailable';
            const streetValue = locationText(inferred.street || booking.service_location?.street_name, fallbackStreet);
            const barangayValue = locationText(
              coerceBarangayForDisplay(
                booking.service_location?.barangay,
                booking.service_location?.city_municipality,
                (booking.service_location as { region?: string } | undefined)?.region,
                booking.service_location?.subdivision_village
              ),
              locationText(inferred.barangay, 'Unavailable')
            );
            const cityValue = locationText(booking.service_location?.city_municipality, locationText(inferred.city, 'Unavailable'));
            return (
              <>
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
                  <ThemedText style={styles.locationValue}>
                    {streetValue}
                  </ThemedText>
                </View>
                {locationText(booking.service_location.subdivision_village, '') ? (
                  <View style={styles.locationRow}>
                    <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                    <ThemedText style={styles.locationValue}>{locationText(booking.service_location.subdivision_village)}</ThemedText>
                  </View>
                ) : null}
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                  <ThemedText style={styles.locationValue}>{barangayValue}</ThemedText>
                </View>
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>City</ThemedText>
                  <ThemedText style={styles.locationValue}>{cityValue}</ThemedText>
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
              </>
            );
          })()}
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

              <ThemedText style={[styles.noteText, { marginTop: 6, marginBottom: 8 }]}>
                {backjobPaymentPhase && payableTotal <= 0
                  ? 'Backjob is free of charge. No payment is due.'
                  : backjobPaymentPhase && payableTotal > 0
                    ? 'You only pay for new items added on this backjob. Earlier job payments do not apply to these charges.'
                    : 'Payment will be released to mechanic after job completion.'}
              </ThemedText>
              <View style={styles.receiptDivider} />
            </View>

            {hasLivePendingQuoteRequest ? (
              <View style={styles.pendingHintBanner}>
                <View style={styles.pendingHintContent}>
                  <FontAwesome name="clock-o" size={12} color="#C89B55" />
                  <ThemedText style={styles.pendingHintText}>Pending quotation changes are waiting for your response.</ThemedText>
                </View>
                {canOpenBookingChat(booking) ? (
                  <TouchableOpacity style={styles.pendingHintActionButton} onPress={openChatWithMechanic}>
                    <FontAwesome name="comments" size={12} color="#111214" />
                    <ThemedText style={styles.pendingHintActionText}>Review in Chat</ThemedText>
                  </TouchableOpacity>
                ) : null}
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
                Convenience Fee
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
                      {convenienceBreakdown.estimated ? 'Estimated Traffic Fee' : 'Traffic Fee'} ({convenienceBreakdown.trafficLabel})
                    </ThemedText>
                    <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{convenienceBreakdown.trafficFee.toFixed(2)}</ThemedText>
                  </View>
                  {typeof convenienceBreakdown.etaMinutes === 'number' && convenienceBreakdown.etaMinutes > 0 && (
                    <View style={styles.receiptRow}>
                      <ThemedText style={[styles.receiptItem, isAcceptedBackjob ? { color: '#8E8E93' } : null]}>Estimated Time Arrive</ThemedText>
                      <ThemedText style={[styles.receiptAmount, isAcceptedBackjob ? { color: '#8E8E93' } : null]}>{convenienceBreakdown.etaMinutes} min</ThemedText>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.noteBox}>
                  <ThemedText style={[styles.noteText, isAcceptedBackjob ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>
                    Convenience fee will appear after mechanic starts travel.
                  </ThemedText>
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
                      <View key={`old-quote-${idx}`} style={styles.receiptRow}>
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

                    return visibleQuotationItems.map((it: any, idx: number) => {
                      const itemStatus = it && (it.status || it.quotation_status || it.state) ? (it.status || it.quotation_status || it.state) : ((booking as any)?.quotation && (booking as any).quotation.status) || 'pending';
                      const statusRaw = String(itemStatus || '').toLowerCase();
                      const isPending = statusRaw === 'pending';
                      const quotationStatusRaw = String(((booking as any)?.quotation && (booking as any).quotation.status) || '').toLowerCase();
                      const isPendingQuotationRequest = quotationStatusRaw === 'pending';
                      const explicitChangeLabel = getExplicitChangeLabel(it);
                      const inferredChangeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
                      const chatDerivedChangeLabel = getQuoteSnapshotKeys(it).map((k) => chatChangeLabelByKey[k]).find(Boolean) || null;
                      const rawChangeLabel = explicitChangeLabel || chatDerivedChangeLabel || inferredChangeLabel || null;
                      const changeLabel = (isPending || isPendingQuotationRequest) ? rawChangeLabel : null;
                      const desc = it?.description || it?.name || (it.service && `Service #${it.service}`) || 'Item';
                      const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
                      const qty = Number(it?.quantity ?? 1) || 1;
                      const isChargeableBackjobLine = Boolean(it?.is_backjob_new_line) || isLineCreatedAfterBackjob(it) || rawChangeLabel === 'Added';
                      const shouldGhostQuotationLine = isAcceptedBackjob && !isChargeableBackjobLine;
                      const isRemoved = changeLabel === 'Removed';
                      const lineKind = String(it?.line_kind || '').toLowerCase();
                      const isServiceQuoteLine = lineKind === 'service';
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
                        return {
                          pill: {},
                          text: {},
                        };
                      };
                      const pillStyle = getChangePillStyle(changeLabel);

                      return (
                        <View key={key} style={[styles.quotationAccordionRow, isRemoved ? styles.removedItem : (changeLabel ? styles.pendingItem : styles.acceptedItem), isExpanded ? styles.quotationAccordionRowExpanded : null]}>
                          <TouchableOpacity style={styles.quotationAccordionHeader} onPress={() => toggleQuoteItem(key)} activeOpacity={0.8}>
                            <View style={styles.quoteHeaderLeft}>
                              <ThemedText style={[styles.quoteItemTitle, styles.receiptItem, isRemoved ? styles.removedItemText : null, shouldGhostQuotationLine ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]} numberOfLines={2}>{desc}</ThemedText>
                              {changeLabel ? (
                                <View style={[styles.pendingPill, pillStyle.pill]}>
                                  <ThemedText style={[styles.pendingPillText, pillStyle.text]}>{changeLabel}</ThemedText>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.quotationAccordionRight}>
                              <ThemedText style={[styles.receiptAmount, isRemoved ? styles.removedItemAmount : null, shouldGhostQuotationLine ? { textDecorationLine: 'line-through', color: '#8E8E93' } : null]}>₱{(price * qty).toFixed(2)}</ThemedText>
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
                              <View style={styles.receiptRow}>
                                <ThemedText style={styles.quotationDetailLabel}>Line type</ThemedText>
                                <ThemedText style={styles.quotationDetailValue}>{isServiceQuoteLine ? 'Service' : 'Item / part'}</ThemedText>
                              </View>
                              {!isServiceQuoteLine ? (
                                <View style={styles.receiptRow}>
                                  <ThemedText style={styles.quotationDetailLabel}>Source</ThemedText>
                                  <ThemedText style={styles.quotationDetailValue}>{quoteItemSourceLabel(it?.source)}</ThemedText>
                                </View>
                              ) : null}
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

              {isAcceptedBackjob ? (
                <View style={[styles.receiptRow, { marginTop: 10 }]}>
                  <ThemedText style={styles.receiptItem}>Newly added charges</ThemedText>
                  <ThemedText style={styles.receiptAmount}>₱{resolvedBackjobCharges.toFixed(2)}</ThemedText>
                </View>
              ) : null}

              <View style={styles.receiptDivider} />
              <View style={styles.receiptRow}>
                <ThemedText style={styles.receiptTotalLabel}>Convenience Fee Total</ThemedText>
                <ThemedText style={styles.receiptTotalValue}>₱{effectiveConvenienceFeeTotal.toFixed(2)}</ThemedText>
              </View>
              {!isAcceptedBackjob ? (
                <View style={styles.receiptRow}>
                  <ThemedText style={styles.receiptTotalLabel}>Quotation Estimated Total</ThemedText>
                  <ThemedText style={styles.receiptTotalValue}>₱{effectiveQuotationEstimatedTotal.toFixed(2)}</ThemedText>
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
                          <ThemedText style={styles.navigateButtonText}>Load More Before Photos</ThemedText>
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
                              <ThemedText style={styles.navigateButtonText}>Load More After Photos</ThemedText>
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

        {/* Request Backjob button (placed under Timeline) */}
        {booking.status === 'completed' && String(booking?.backjob?.status || '').toLowerCase() !== 'accepted' && (
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

              {isDisputeEligible ? (
                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.finishLargeButton, { backgroundColor: '#FF3B3018', borderWidth: 1, borderColor: '#FF3B3060' }]}
                    onPress={() => setShowDisputeModal(true)}
                    activeOpacity={0.85}
                  >
                    <FontAwesome name="flag" size={15} color="#FF5A52" style={{ marginRight: 8 }} />
                    <ThemedText style={[styles.actionButtonText, { color: '#FF5A52' }]}>File a Dispute</ThemedText>
                  </TouchableOpacity>
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
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() => setBackjobImage(null)}
                        disabled={backjobSubmitting}
                      >
                        <FontAwesome name="times-circle" size={28} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addPhotoBtn} onPress={pickBackjobImage} disabled={backjobSubmitting}>
                      <FontAwesome name="camera" size={28} color="#8E8E93" />
                      <ThemedText style={styles.addPhotoText}>Add Photo</ThemedText>
                    </TouchableOpacity>
                  )}

                  <View style={{ height: 12 }} />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      style={[styles.cancelBtn, { flex: 1 }, backjobSubmitting ? { opacity: 0.7 } : null]}
                      onPress={() => setBackjobModalVisible(false)}
                      disabled={backjobSubmitting}
                    >
                      <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sendBtn, { flex: 1 }, backjobSubmitting ? { opacity: 0.7 } : null]}
                      disabled={backjobSubmitting}
                      onPress={async () => {
                        if (backjobSubmitting) return;
                        setBackjobSubmitting(true);
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
                          setBackjobSubmitting(false);
                          setBackjobModalVisible(false);
                          openChatWithMechanic();
                        }
                      }}
                    >
                      {backjobSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <FontAwesome name="comments" size={14} color="#FFFFFF" />
                      )}
                      <ThemedText style={styles.sendBtnText}>
                        {backjobSubmitting ? 'Sending...' : 'Chat with Mechanic'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

      </ScrollView>

      {showPaymentCTA && (
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity style={styles.finishLargeButton} onPress={() => setShowPaymentReceiptConfirm(true)}>
            <FontAwesome name="credit-card" size={16} color="#fff" style={{ marginRight: 8 }} />
            <ThemedText style={styles.actionButtonText}>
              {isBookedState ? 'Secure Booking (Optional Initial Payment)' : 'Proceed to Payment'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {canProceedToCompletion && (
        <View style={styles.actionButtonsContainer}>
          <View style={styles.noteBox}>
            <ThemedText style={styles.noteText}>
              Payment is already settled and no quotation request is pending. Waiting for mechanic to complete the job.
            </ThemedText>
          </View>
        </View>
      )}

      <Modal
        visible={showPaymentReceiptConfirm && showPaymentCTA}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentReceiptConfirm(false)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }}>
          <View
            style={{
              backgroundColor: '#1A1C1E',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderWidth: 1,
              borderColor: '#2A2C2E',
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 24,
              maxHeight: '84%',
            }}
          >
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: '#3A3D40', alignSelf: 'center', marginBottom: 14 }} />
            <ThemedText style={{ color: '#ECEDEE', fontSize: 20, fontWeight: '800' }}>Confirm Payment Summary</ThemedText>
            <ThemedText style={{ color: '#8E8E93', marginTop: 4, marginBottom: 10 }}>
              Please review this receipt before proceeding.
            </ThemedText>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              <View style={{ backgroundColor: '#151718', borderRadius: 12, borderWidth: 1, borderColor: '#2A2C2E', padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <ThemedText style={{ color: '#8E8E93' }}>Booking</ThemedText>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>#{booking.id}</ThemedText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <ThemedText style={{ color: '#8E8E93' }}>Quoted Services</ThemedText>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>₱{quotationEstimatedTotal.toFixed(2)}</ThemedText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <ThemedText style={{ color: '#8E8E93' }}>Travel Fee</ThemedText>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>₱{travelFeeTotal.toFixed(2)}</ThemedText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <ThemedText style={{ color: '#8E8E93' }}>Traffic Fee</ThemedText>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>₱{trafficFeeTotal.toFixed(2)}</ThemedText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <ThemedText style={{ color: '#8E8E93' }}>Convenience Fee</ThemedText>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>₱{convenienceFeeTotal.toFixed(2)}</ThemedText>
                </View>
                <View style={{ height: 1, backgroundColor: '#2A2C2E', marginVertical: 10 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ color: '#8E8E93', fontSize: 13 }}>Total Amount</ThemedText>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>₱{totalAmount.toFixed(2)}</ThemedText>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <ThemedText style={{ color: '#8E8E93', fontSize: 13 }}>Less Partial Paid</ThemedText>
                  <ThemedText style={{ color: '#34C759', fontWeight: '700' }}>₱{totalPaid.toFixed(2)}</ThemedText>
                </View>
                <View style={{ height: 1, backgroundColor: '#2A2C2E', marginVertical: 10 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ color: '#ECEDEE', fontSize: 16, fontWeight: '800' }}>Total Amount To Pay</ThemedText>
                  <ThemedText style={{ color: '#FF8C00', fontSize: 16, fontWeight: '800' }}>₱{remainingBalance.toFixed(2)}</ThemedText>
                </View>
              </View>

              {visibleQuotationItems.length > 0 ? (
                <View style={{ marginTop: 10, backgroundColor: '#151718', borderRadius: 12, borderWidth: 1, borderColor: '#2A2C2E', padding: 12 }}>
                  <ThemedText style={{ color: '#ECEDEE', fontWeight: '700', marginBottom: 8 }}>
                    Included Quotation Items ({visibleQuotationItems.length})
                  </ThemedText>
                  {visibleQuotationItems.slice(0, 8).map((it: any, idx: number) => {
                    const statusRaw = String(getItemStatus(it, (booking as any)?.quotation || displayQuotation) || '').toLowerCase();
                    if (statusRaw !== 'accepted') return null;
                    const desc = it?.description || it?.name || 'Item';
                    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
                    const qty = Number(it?.quantity ?? 1) || 1;
                    return (
                      <View key={`receipt-item-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <ThemedText style={{ color: '#C9CDD2', flex: 1 }} numberOfLines={1}>{desc} x{qty}</ThemedText>
                        <ThemedText style={{ color: '#ECEDEE' }}>₱{(price * qty).toFixed(2)}</ThemedText>
                      </View>
                    );
                  })}
                  {visibleQuotationItems.length > 8 ? (
                    <ThemedText style={{ color: '#8E8E93', marginTop: 4 }}>...and more items in full quotation</ThemedText>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={[styles.finishLargeButton, { marginTop: 14 }]}
              onPress={() => {
                setShowPaymentReceiptConfirm(false);
                setShowPaymentModal(true);
              }}
            >
              <FontAwesome name="check" size={16} color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={styles.actionButtonText}>Accept & Continue to Payment</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelBtn, { marginTop: 10 }]}
              onPress={() => setShowPaymentReceiptConfirm(false)}
            >
              <ThemedText style={styles.cancelBtnText}>Cancel</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PaymentMethodModal
        visible={showPaymentModal && showPaymentCTA}
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

          if (method === 'credits') {
            setShowPaymentModal(false);
            setShowCreditsModal(true);
          }
        }}
      />

      <CreditsPaymentModal
        visible={showCreditsModal && (!backjobPaymentPhase || payableTotal > 0)}
        bookingId={booking.id}
        totalAmount={modalAmountToPay}
        onClose={() => setShowCreditsModal(false)}
        onPaymentSuccess={() => {
          setShowCreditsModal(false);
          setShowSuccess(true);
          setPaymentMethod('credits');
          fetchBookingDetail(true);
        }}
      />

      <EWalletOptionsModal
        visible={showEWalletModal && (!backjobPaymentPhase || payableTotal > 0)}
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
        visible={showQRScanner && (!backjobPaymentPhase || payableTotal > 0)}
        bookingId={booking.id}
        onClose={() => {
          setShowQRScanner(false);
          setShowPaymentModal(true);
        }}
        onScanSuccess={(data) => {
          setQrScanData(data);
          setScannedToken(data.token);
          setShowQRScanner(false);
          setShowQRConfirm(true);
        }}
      />

      <QRConfirmationModal
        visible={showQRConfirm && (!backjobPaymentPhase || payableTotal > 0)}
        scanData={qrScanData}
        token={scannedToken}
        onConfirm={() => {
          setShowQRConfirm(false);
          setShowSuccess(true);
          fetchBookingDetail(true);
        }}
        onCancel={() => {
          setShowQRConfirm(false);
          setScannedToken('');
          setQrScanData(null);
          setShowQRScanner(true);
        }}
      />

      <PaymentSuccessModal
        visible={showSuccess && (!backjobPaymentPhase || payableTotal > 0)}
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
