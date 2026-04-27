import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { View, ScrollView, TouchableOpacity, RefreshControl, Modal, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { Image } from 'expo-image';
import { styles } from '@/style/mechanic/bookingDetailsStyles';
import { bookingHasBackjob, canOpenBookingChat } from '@/lib/bookingAccess';
import {
  normalizeBookedServiceRows,
  normalizeRequestedAddOnRows,
  directRequestServiceUnitPrice,
} from '@/lib/directRequestDisplay';
import { fetchBookingChatPreview } from '@/lib/bookingChatPreview';
import { useNotification } from '@/hooks/useNotification';
import { coerceBarangayForDisplay } from '@/lib/locationAddress';
import { sortQuotationItemsForDisplay } from '@/lib/quotationOrdering';
import { runDedupedRequest } from '@/lib/requestDedupe';

export const screenOptions = { headerShown: false } as const;

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingDetail {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at?: string;
  completed_at?: string | null;
  request: {
    id: number;
    type: string;
    vehicle_type?: string | null;
    vehicle_brand?: string | null;
    vehicle_model?: string | null;
    created_at: string;
    request_details?: any;
    assigned_mechanics?: {
      id: number;
      role: 'lead' | 'assistant';
      mechanic: { id: number; firstname: string; lastname: string; username: string };
      assigned_at?: string;
    }[];
  };
  client?: {
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
  };
  provider?: { id: number; name: string; email: string } | null;
  shop?: { id: number; shop_name: string; contact_number?: string; email?: string } | null;
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
    is_job_done?: boolean;
    is_rescheduled?: boolean;
    started_at?: string | null;
    reason?: string | null;
  };
  completion_details?: {
    completed_at: string;
    total_amount: number;
    notes?: string;
  };
  cancellation_details?: {
    cancelled_by: { id: number; name: string };
    reason: string;
    cancelled_at: string;
  };
  has_backjob?: boolean;
  backjob?: {
    id: number;
    status: string;
    reason?: string | null;
    images?: string[];
    created_at?: string | null;
    updated_at?: string | null;
  } | null;
  backjob_history?: any[];
  payment_split?: {
    total_amount: number;
    mechanic_percentage: number;
    shop_owner_percentage: number;
    mechanic_amount: number;
    shop_owner_amount: number;
    mechanic_count: number;
    per_mechanic_amount: number;
  };
  payment_summary?: {
    payment_status?: string;
    total_amount?: number;
    total_paid?: number;
    remaining_balance?: number;
  };
}

interface ShopMechanic {
  id: number;
  account_id: number;
  firstname: string;
  lastname: string;
}

interface Assignment {
  id: number;
  mechanic: { id: number; firstname: string; lastname: string; username: string };
  role: 'lead' | 'assistant';
  assigned_at: string;
}

export default function ShopOwnerBookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const navigation = useNavigation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);
  const [quotation, setQuotation] = useState<any | null>(null);
  const [pendingQuoteSnapshot, setPendingQuoteSnapshot] = useState<any | null>(null);
  const [chatChangeLabelByKey, setChatChangeLabelByKey] = useState<Record<string, 'Added' | 'Edited' | 'Removed'>>({});
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shopMechanics, setShopMechanics] = useState<ShopMechanic[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [viewerPhotoUri, setViewerPhotoUri] = useState<string | null>(null);
  const [visibleBeforePhotoCount, setVisibleBeforePhotoCount] = useState(6);
  const [visibleAfterPhotoCount, setVisibleAfterPhotoCount] = useState(6);
  const [quotationListExpanded, setQuotationListExpanded] = useState(false);
  const [expandedQuoteItems, setExpandedQuoteItems] = useState<Record<string, boolean>>({});
  const assignmentFetchCacheRef = useRef<{ requestId: number | null; fetchedAt: number }>({ requestId: null, fetchedAt: 0 });
  const { showNotification } = useNotification();
  const { lastMessage } = useWebSocketContext();

  useEffect(() => {
    setVisibleBeforePhotoCount(6);
    setVisibleAfterPhotoCount(6);
  }, [booking?.id]);

  useEffect(() => {
    try {
      navigation.setOptions && navigation.setOptions({ headerShown: false });
    } catch {}
    try {
      navigation.getParent && navigation.getParent()?.setOptions && navigation.getParent()?.setOptions({ headerShown: false });
    } catch {}
  }, []);

  const fetchBookingDetail = useCallback(async (silent = false) => {
    if (!bookingId) return;
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/bookings/shopowner/bookings/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { booking?: BookingDetail; error?: string };
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch booking details');
      const bookingData = data.booking || (data as unknown as BookingDetail);
      setBooking(bookingData);
      if (Array.isArray(bookingData?.request?.assigned_mechanics)) {
        setAssignments(
          bookingData.request.assigned_mechanics.map((a) => ({
            id: a.id,
            role: a.role,
            assigned_at: a.assigned_at || '',
            mechanic: a.mechanic,
          }))
        );
      }

      // Initialize elapsed timer immediately for active status (view-only)
      if (
        bookingData?.status === 'active' &&
        bookingData?.active_details?.started_at
      ) {
        const startedMs = new Date(bookingData.active_details.started_at).getTime();
        if (!isNaN(startedMs)) {
          setTimer(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
        }
      } else {
        setTimer(0);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  const refreshChatPreview = useCallback(async () => {
    if (!bookingId) return;
    const res = await fetchBookingChatPreview(Number(bookingId));
    if (!res) return;
    setChatPreview(res.lastPreview);
  }, [bookingId]);

  const loadAssignmentData = useCallback(async (requestId: number, force = false) => {
    const cached = assignmentFetchCacheRef.current;
    if (!force && cached.requestId === requestId && Date.now() - cached.fetchedAt < 15000) {
      return;
    }
    try {
      const [mechRes, assignRes] = await Promise.all([
        fetch(`${API_URL}/shops/mechanics/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${API_URL}/bookings/requests/${requestId}/assignments/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      if (mechRes.ok) {
        const md = (await mechRes.json()) as { mechanics?: ShopMechanic[] };
        setShopMechanics(md.mechanics || []);
      }
      if (assignRes.ok) {
        const ad = (await assignRes.json()) as Assignment[];
        setAssignments(Array.isArray(ad) ? ad : []);
      }
      assignmentFetchCacheRef.current = { requestId, fetchedAt: Date.now() };
    } catch {
      setAssignments([]);
    }
  }, []);

  const canManageAssignment = (status: string) =>
    ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'paused', 'reworked', 'backjob_pending'].includes(status);

  const canEditQuotationForStatus = (status: string) =>
    ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active'].includes(status);

  const canShowQuotationForStatus = (status: string) =>
    ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'pending_payment'].includes(status);

  const openAssignModal = () => {
    if (!booking?.request?.id || !canManageAssignment(booking.status)) return;
    loadAssignmentData(booking.request.id);
    setAssignModalVisible(true);
  };

  const openQuotationEditor = () => {
    if (!booking?.id || !canEditQuotationForStatus(booking.status)) return;
    router.push({
      pathname: '/mechanic/booking/quotation_edit',
      params: { bookingId: String(booking.id), source: 'shopowner' },
    });
  };

  const handleAssignMechanic = async (accountId: number, role: 'lead' | 'assistant') => {
    if (!booking?.request?.id) return;
    const leadCount = assignments.filter((a) => a.role === 'lead').length;
    if (role === 'assistant' && assignments.length === 0) {
      showNotification({ type: 'error', message: 'First assigned mechanic must be a lead.' });
      return;
    }
    if (role === 'assistant' && leadCount === 0) {
      showNotification({ type: 'error', message: 'At least one lead is required.' });
      return;
    }

    setAssigningId(accountId);
    try {
      const res = await fetch(`${API_URL}/bookings/requests/${booking.request.id}/assignments/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mechanic_id: accountId, role }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showNotification({ type: 'error', message: data?.error || 'Failed to assign mechanic.' });
        return;
      }
      await loadAssignmentData(booking.request.id, true);
      await fetchBookingDetail(true);
      showNotification({ type: 'success', message: 'Mechanic assigned.' });
    } finally {
      setAssigningId(null);
    }
  };

  const handleUnassign = async (assignmentId: number) => {
    if (!booking?.request?.id) return;
    const target = assignments.find((a) => a.id === assignmentId);
    if (target?.role === 'lead') {
      const leadCount = assignments.filter((a) => a.role === 'lead').length;
      if (leadCount <= 1) {
        showNotification({ type: 'error', message: 'At least one lead must remain assigned.' });
        return;
      }
    }
    setAssignLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/bookings/requests/${booking.request.id}/assignments/${assignmentId}/remove/`,
        { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' } }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showNotification({ type: 'error', message: data?.error || 'Failed to remove assignment.' });
        return;
      }
      await loadAssignmentData(booking.request.id, true);
      await fetchBookingDetail(true);
      showNotification({ type: 'success', message: 'Assignment removed.' });
    } finally {
      setAssignLoading(false);
    }
  };

  const handleUpdateAssignmentRole = async (assignmentId: number, role: 'lead' | 'assistant') => {
    if (!booking?.request?.id) return;
    const target = assignments.find((a) => a.id === assignmentId);
    if (!target || target.role === role) return;

    if (target.role === 'lead' && role === 'assistant') {
      const leadCount = assignments.filter((a) => a.role === 'lead').length;
      if (leadCount <= 1) {
        showNotification({ type: 'error', message: 'At least one lead must remain assigned.' });
        return;
      }
    }

    setAssignLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/bookings/requests/${booking.request.id}/assignments/${assignmentId}/role/`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        showNotification({ type: 'error', message: data?.error || 'Failed to update role.' });
        return;
      }
      await loadAssignmentData(booking.request.id, true);
      await fetchBookingDetail(true);
      showNotification({ type: 'success', message: 'Assignment role updated.' });
    } finally {
      setAssignLoading(false);
    }
  };

  useEffect(() => {
    fetchBookingDetail();
  }, [fetchBookingDetail]);

  useEffect(() => {
    if (!booking || !canOpenBookingChat(booking)) {
      setChatPreview(null);
      return;
    }
    refreshChatPreview();
  }, [booking, refreshChatPreview]);

  useEffect(() => {
    if (!bookingId) return;
    if (hasLivePendingQuoteRequest) return;
    const id = setInterval(() => {
      fetchBookingDetail(true);
    }, 20000);
    return () => clearInterval(id);
  }, [bookingId, fetchBookingDetail, hasLivePendingQuoteRequest]);

  useEffect(() => {
    if (bookingId) fetchQuotation();
  }, [bookingId]);

  // Listen for websocket events and refresh when quotation accepted or booking update for this booking
  useEffect(() => {
    try {
      if (!lastMessage) return;
      const message = lastMessage as unknown as Record<string, unknown>;
      const bid = Number(message.booking_id ?? message.bookingId ?? message.booking);
      if (!bid || !bookingId) return;
      if (bid === Number(bookingId)) {
        const action = (lastMessage.action || lastMessage.type || '').toString().toLowerCase();
        if (['quotation_accepted', 'quotationaccepted', 'booking_updated', 'booking_update', 'new_chat_message', 'new_chatmessage'].includes(action)) {
          fetchBookingDetail();
          fetchQuotation();
        }
      }
    } catch (e) {
      // ignore
    }
  }, [lastMessage, bookingId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingDetail(true);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'Booked';
      case 'active':
        return 'On Going';
      case 'on_the_way':
        return 'On the Way';
      case 'at_location':
        return 'At Location';
      case 'diagnosing':
        return 'Diagnosing';
      case 'paused':
        return 'Paused';
      case 'finished':
        return 'Finished';
      case 'pending_payment':
        return 'Pending Payment';
      case 'backjob_pending':
        return 'Backjob Pending';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'pending':
        return 'Pending';
      case 'reworked':
        return 'Reworked';
      case 'disputed':
        return 'Disputed';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#00B8D9';
      case 'active':
        return '#FF8C00';
      case 'on_the_way':
        return '#007AFF';
      case 'at_location':
        return '#5AC8FA';
      case 'diagnosing':
        return '#AF52DE';
      case 'paused':
        return '#8E8E93';
      case 'finished':
        return '#34C759';
      case 'pending_payment':
        return '#FFD60A';
      case 'backjob_pending':
        return '#FFD60A';
      case 'reworked':
        return '#FFD60A';
      case 'completed':
        return '#34C759';
      case 'cancelled':
        return '#FF3B30';
      case 'pending':
        return '#8E8E93';
      case 'disputed':
        return '#AF52DE';
      default:
        return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'calendar-check-o';
      case 'active':
        return 'play-circle';
      case 'on_the_way':
        return 'car';
      case 'at_location':
        return 'map-marker';
      case 'diagnosing':
        return 'search';
      case 'paused':
        return 'pause-circle';
      case 'finished':
        return 'check-circle';
      case 'pending_payment':
        return 'money';
      case 'backjob_pending':
        return 'refresh';
      case 'completed':
        return 'check-circle';
      case 'cancelled':
        return 'times-circle';
      case 'pending':
        return 'clock-o';
      case 'reworked':
        return 'refresh';
      case 'disputed':
        return 'exclamation-circle';
      default:
        return 'circle';
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
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
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

  const getDisplayQuotation = () => {
    const isBackjobBooking = bookingHasBackjob(booking as any);
    const details = (booking && booking.request && (booking.request as any).request_details) || null;
    if (!details && !(quotation && (quotation.items || []).length > 0)) return null;

    const toPrice = (value: any) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    };

    const expectedServiceItems: any[] = isBackjobBooking ? [] : (() => {
      const rows: any[] = [];
      normalizeBookedServiceRows(details as Record<string, unknown> | null).forEach((svc: any) => {
        rows.push({
          description: svc.name || 'Service',
          quantity: 1,
          unit_price: toPrice(directRequestServiceUnitPrice(svc as Record<string, unknown>)),
          service: svc.id,
          line_kind: 'service',
          status: 'accepted',
        });
      });
      return rows;
    })();

    const applyPendingSnapshotOverlay = (baseRows: any[]) => {
      const snapshotItems = Array.isArray(pendingQuoteSnapshot?.items) ? pendingQuoteSnapshot.items : [];
      if (!snapshotItems.length) return baseRows;

      const mergedRows = [...baseRows];
      const rowById = new Map<string, number>();
      const getOverlayAssocKey = (row: any) => {
        const serviceId = Number(row?.service);
        const addOnId = Number(row?.service_add_on);
        if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
        if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
        return null;
      };
      const normalizeOverlayText = (value: any) => String(value ?? '').trim().toLowerCase();
      mergedRows.forEach((row: any, idx: number) => {
        if (row?.id != null) rowById.set(String(row.id), idx);
      });

      snapshotItems.forEach((row: any) => {
        const changeType = String(row?.change_type || '').toLowerCase();
        const rowId = row?.id != null ? String(row.id) : null;
        const rowAssoc = getOverlayAssocKey(row);
        const rowDesc = normalizeOverlayText(row?.description || row?.name);
        const targetIdx =
          rowId != null && rowById.has(rowId)
            ? Number(rowById.get(rowId))
            : mergedRows.findIndex((existing: any) => {
                const existingAssoc = getOverlayAssocKey(existing);
                if (rowAssoc && existingAssoc && rowAssoc === existingAssoc) return true;
                const existingDesc = normalizeOverlayText(existing?.description || existing?.name);
                return Boolean(rowDesc && existingDesc && rowDesc === existingDesc);
              });

        if (changeType === 'added' && targetIdx < 0) {
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
          return;
        }

        if (changeType.includes('remove') || changeType.includes('delete')) {
          mergedRows.push({
            ...row,
            status: 'pending',
            change_type: changeType || 'removed',
          });
        }
      });

      return mergedRows;
    };

    if (quotation && (quotation.items || []).length > 0) {
      const mergedItems = [...(quotation.items || [])];
      expectedServiceItems.forEach((svcRow: any) => {
        const sid = Number(svcRow?.service);
        if (!Number.isFinite(sid) || sid <= 0) return;
        const exists = mergedItems.some(
          (it: any) => Number(it?.service) === sid && String(it?.status || '').toLowerCase() !== 'rejected',
        );
        if (!exists) mergedItems.push(svcRow);
      });
      const hasServerPendingAmendment = Boolean(
        quotation?.amendment_id ||
          mergedItems.some(
            (it: any) =>
              String(it?.status || '').toLowerCase() === 'pending' && String(it?.change_type || '').trim(),
          ),
      );
      const overlayedItems = hasServerPendingAmendment ? mergedItems : applyPendingSnapshotOverlay(mergedItems);
      const mergedTotal = overlayedItems.reduce((sum: number, it: any) => {
        const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
        const qty = Number(it?.quantity ?? 1) || 1;
        return sum + price * qty;
      }, 0);
      return {
        ...quotation,
        status: pendingQuoteSnapshot?.status || quotation?.status,
        items: overlayedItems,
        total_amount: Math.max(
          Number(pendingQuoteSnapshot?.total_amount || 0),
          Number(quotation?.total_amount || 0),
          mergedTotal,
        ),
      };
    }
    if (pendingQuoteSnapshot && Array.isArray(pendingQuoteSnapshot.items) && pendingQuoteSnapshot.items.length > 0) {
      return pendingQuoteSnapshot;
    }

    if (!details) return null;
    if (isBackjobBooking) return null;

    const items: any[] = [];

    normalizeBookedServiceRows(details as Record<string, unknown> | null).forEach((svc: any) => {
      const unit = toPrice(directRequestServiceUnitPrice(svc as Record<string, unknown>));
      items.push({
        description: svc.name || 'Service',
        quantity: 1,
        unit_price: unit,
        service: svc.id,
        line_kind: 'service',
      });
    });

    normalizeRequestedAddOnRows(details as Record<string, unknown> | null).forEach((addOn: any) => {
      const unit = toPrice(addOn?.price);
      items.push({
        description: addOn?.name || 'Item / product',
        quantity: 1,
        unit_price: unit,
        service_add_on: addOn?.id,
        line_kind: 'item',
      });
    });

    let total_amount = items.reduce(
      (s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
      0,
    );

    if (total_amount <= 0 && booking && toPrice(booking.amount_fee) > 0) {
      items.length = 0;
      items.push({
        description: 'Booked total',
        quantity: 1,
        unit_price: toPrice(booking.amount_fee),
      });
      total_amount = toPrice(booking.amount_fee);
    }

    if (items.length === 0) return null;
    return { items, total_amount };
  };

  const displayQuotation = getDisplayQuotation();
  const hasLivePendingQuoteRequest = Boolean(
    pendingQuoteSnapshot && String(pendingQuoteSnapshot?.status || '').toLowerCase() === 'pending'
  );
  const isQuotationPending = hasLivePendingQuoteRequest || Boolean((quotation && quotation.status === 'pending') || (displayQuotation && displayQuotation.status === 'pending'));
  const getItemStatus = (it: any, parentQuotation: any) => {
    if (!it) return 'accepted';
    return it.status || it.quotation_status || it.state || (parentQuotation && parentQuotation.status) || 'accepted';
  };
  const serviceItemIds = React.useMemo(() => {
    const details = (booking?.request as any)?.request_details || null;
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
  const bookedServiceNames = React.useMemo(() => {
    const details = (booking?.request as any)?.request_details || null;
    const names: string[] = [];
    if (details?.service?.name) names.push(String(details.service.name));
    const list = Array.isArray(details?.services) ? details.services : [];
    list.forEach((svc: any) => {
      if (svc?.name) names.push(String(svc.name));
    });
    return names;
  }, [booking]);
  const sortedQuotationItems = React.useMemo(() => {
    const items = (displayQuotation && Array.isArray(displayQuotation.items)) ? displayQuotation.items : [];
    return sortQuotationItemsForDisplay(items, serviceItemIds);
  }, [displayQuotation, serviceItemIds]);
  const visibleQuotationItems = React.useMemo(() => {
    return sortedQuotationItems.filter((it: any) => {
      const raw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
      if (!(raw.includes('remove') || raw.includes('delete'))) return true;
      const serviceId = Number(it?.service);
      if (Number.isFinite(serviceId) && serviceItemIds.has(serviceId)) return false;
      if (String(it?.line_kind || '').toLowerCase() === 'service') return false;

      const desc = String(it?.description || it?.name || '').trim().toLowerCase();
      if (!desc) return true;
      const matchesBookedService = bookedServiceNames.some((name) => {
        const bookedName = String(name || '').trim().toLowerCase();
        if (!bookedName) return false;
        if (bookedName === desc || bookedName.includes(desc) || desc.includes(bookedName)) return true;
        const bookedTokens = new Set(bookedName.split(/\s+/).filter(Boolean));
        const descTokens = desc.split(/\s+/).filter(Boolean);
        if (!bookedTokens.size || !descTokens.length) return false;
        const overlap = descTokens.filter((token) => bookedTokens.has(token)).length;
        return overlap / Math.max(bookedTokens.size, descTokens.length) >= 0.6;
      });
      return !matchesBookedService;
    });
  }, [sortedQuotationItems, serviceItemIds, bookedServiceNames]);
  const getQuoteItemKey = (it: any, idx: number) => String(it?.id ?? `quote-${idx}`);
  const toggleQuoteItem = (key: string) => {
    setExpandedQuoteItems(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const quotationEstimatedTotal = React.useMemo(() => {
    if (!visibleQuotationItems.length) return 0;
    const acceptedTotal = visibleQuotationItems.reduce((sum: number, it: any) => {
      const status = String(getItemStatus(it, quotation) || '').toLowerCase();
      if (status !== 'accepted') return sum;
      const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
      const qty = Number(it?.quantity ?? 1) || 1;
      return sum + (price * qty);
    }, 0);
    if (acceptedTotal > 0) return acceptedTotal;

    const savedTotal = Number(displayQuotation?.total_amount || quotation?.total_amount || 0);
    if (Number.isFinite(savedTotal) && savedTotal > 0) return savedTotal;

    return visibleQuotationItems.reduce((sum: number, it: any) => {
      const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
      const qty = Number(it?.quantity ?? 1) || 1;
      return sum + (price * qty);
    }, 0);
  }, [visibleQuotationItems, quotation]);
  const amountFeeTotal = Math.max(0, Number(booking?.amount_fee || 0));
  const convenienceFeeTotal = Math.max(0, amountFeeTotal - quotationEstimatedTotal);
  const visibleQuotationSubtotal = visibleQuotationItems.reduce((sum: number, it: any) => {
    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
    const qty = Number(it?.quantity ?? 1) || 1;
    return sum + (price * qty);
  }, 0);
  const pendingRequestedTotalValue = isQuotationPending
    ? Math.max(0, Number(pendingQuoteSnapshot?.total_amount ?? displayQuotation?.pending_total_amount ?? 0))
    : null;
  const pendingQuotationTotalValue = isQuotationPending
    ? Number(pendingQuoteSnapshot?.pending_quotation_total ?? displayQuotation?.pending_quotation_total)
    : NaN;
  const effectiveConvenienceFee = pendingRequestedTotalValue != null && Number.isFinite(pendingQuotationTotalValue)
    ? Math.max(0, pendingRequestedTotalValue - Math.max(0, pendingQuotationTotalValue))
    : convenienceFeeTotal;
  const computedQuotationEstimate = pendingRequestedTotalValue != null
    ? Number.isFinite(pendingQuotationTotalValue)
      ? Math.max(0, pendingQuotationTotalValue)
      : Math.max(0, pendingRequestedTotalValue - effectiveConvenienceFee)
    : quotationEstimatedTotal;
  const effectiveQuotationEstimate = computedQuotationEstimate > 0
    ? computedQuotationEstimate
    : (booking?.has_backjob || booking?.backjob)
      ? computedQuotationEstimate
      : visibleQuotationSubtotal;
  const effectiveTotalFee = pendingRequestedTotalValue ?? (effectiveConvenienceFee + effectiveQuotationEstimate);
  const paymentSplit = booking?.payment_split;
  const paymentSummary = booking?.payment_summary || {};
  const paymentTotalAmount = Math.max(0, Number(paymentSummary.total_amount ?? booking?.amount_fee ?? effectiveTotalFee ?? 0));
  const totalPaid = Math.max(0, Number(paymentSummary.total_paid || 0));
  const remainingBalance = Math.max(0, Number(paymentSummary.remaining_balance ?? (paymentTotalAmount - totalPaid)));
  const paymentStatus = String(paymentSummary.payment_status || '').toLowerCase() || (
    paymentTotalAmount > 0 && totalPaid >= paymentTotalAmount
      ? 'fully_paid'
      : totalPaid > 0
        ? 'partially_paid'
        : 'unpaid'
  );
  const paymentProgressPct = paymentTotalAmount > 0
    ? Math.min(100, Math.max(0, (totalPaid / paymentTotalAmount) * 100))
    : 0;

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

  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'fully_paid':
      case 'paid':
        return 'Fully Paid';
      case 'partially_paid':
      case 'partial':
        return 'Partially Paid';
      default:
        return 'Unpaid';
    }
  };

  const renderPaymentSplit = () => {
    if (!paymentSplit || Number(paymentSplit.shop_owner_percentage || 0) <= 0) return null;
    return (
      <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#151515', borderWidth: 1, borderColor: '#2A2C2E', gap: 8 }}>
        <ThemedText style={{ color: '#ECEDEE', fontWeight: '800', marginBottom: 2 }}>Payment Split</ThemedText>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <ThemedText style={{ color: '#A0A0A0' }}>Mechanics receive ({paymentSplit.mechanic_percentage.toFixed(0)}%)</ThemedText>
          <ThemedText style={{ color: '#34C759', fontWeight: '800' }}>₱{Number(paymentSplit.mechanic_amount || 0).toFixed(2)}</ThemedText>
        </View>
        {paymentSplit.mechanic_count > 1 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <ThemedText style={{ color: '#8E8E93' }}>Each mechanic estimate</ThemedText>
            <ThemedText style={{ color: '#C7C7CC', fontWeight: '700' }}>₱{Number(paymentSplit.per_mechanic_amount || 0).toFixed(2)}</ThemedText>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <ThemedText style={{ color: '#A0A0A0' }}>Shop owner receives ({paymentSplit.shop_owner_percentage.toFixed(0)}%)</ThemedText>
          <ThemedText style={{ color: '#FF8C00', fontWeight: '800' }}>₱{Number(paymentSplit.shop_owner_amount || 0).toFixed(2)}</ThemedText>
        </View>
      </View>
    );
  };

  const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
  const normalizeNum = (v: any) => Number(v ?? 0);
  const getAssocKey = (it: any) => {
    const serviceId = Number(it?.service);
    const addOnId = Number(it?.service_add_on);
    if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
    if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
    return null;
  };

  const getQuoteSnapshotKeys = (it: any): string[] => {
    const keys: string[] = [];
    const id = it?.id;
    if (id != null) keys.push(`id:${id}`);
    const assoc = getAssocKey(it);
    if (assoc) keys.push(assoc);
    const desc = normalizeText(it?.description);
    const qty = normalizeNum(it?.quantity);
    const price = normalizeNum(it?.unit_price ?? it?.price);
    if (desc) keys.push(`desc:${desc}|q:${qty}|p:${price}`);
    return keys;
  };

  const getExplicitChangeLabel = (it: any): 'Added' | 'Edited' | 'Removed' | null => {
    const raw = String(it?.change_type || it?.change || it?.modification_type || '').toLowerCase();
    if (raw === 'added' || raw.includes('add')) return 'Added';
    if (raw === 'edited' || raw.includes('edit') || raw.includes('update') || raw.includes('modify')) return 'Edited';
    if (raw === 'removed' || raw.includes('remove') || raw.includes('delete')) return 'Removed';
    return null;
  };

  const inferChangeLabel = (it: any, acceptedByAssoc: Record<string, any>, acceptedRows: any[], removedRows: any[]) => {
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
      const rowDesc = normalizeText(row?.description);
      const curDesc = normalizeText(it?.description);
      if (!rowDesc || !curDesc) return false;
      if (rowDesc === curDesc) return false;
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

    const status = String(it?.status || displayQuotation?.status || quotation?.status || '').toLowerCase();
    if (raw.includes('remove') || raw.includes('delete')) return 'Removed';
    if (status === 'rejected') return 'Removed';
    if (status !== 'pending') return null;

    if (raw.includes('add')) {
      return editedFromRemoved ? 'Edited' : 'Added';
    }

    if (editedFromRemoved) return 'Edited';

    if (it?.is_removed === true || it?.is_deleted === true) return 'Removed';
    if (it?.is_added === true) return 'Added';

    return 'Edited';
  };

  const refreshChatQuotationLabels = useCallback(async () => {
    if (!bookingId) return;
    return runDedupedRequest(`shopowner-chat-quote-labels:${bookingId}`, 1500, async () => {
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

      const msgRes = await fetch(`${API_URL}/chat/${convId}/messages/`, {
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
          if (typeof first === 'string' && first.trim().startsWith('{')) {
            const second = JSON.parse(first.trim());
            return second && typeof second === 'object' ? second : null;
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
      if (String(payload?.status || '').toLowerCase() !== 'pending') {
        setPendingQuoteSnapshot(null);
        setChatChangeLabelByKey({});
        return;
      }

      setPendingQuoteSnapshot(payload);
      const nextMap: Record<string, 'Added' | 'Edited' | 'Removed'> = {};
      const items = Array.isArray(payload?.items) ? payload.items : [];
      items.forEach((it: any) => {
        const label = getExplicitChangeLabel(it) || inferChangeLabel(it, {}, [], []);
        if (!label) return;
        getQuoteSnapshotKeys(it).forEach((key) => {
          nextMap[key] = label;
        });
      });
      setChatChangeLabelByKey(nextMap);
    } catch {
      // ignore chat refresh failures
    }
    });
  }, [bookingId]);

  useEffect(() => {
    if (!bookingId) return;
    refreshChatQuotationLabels();
  }, [bookingId, refreshChatQuotationLabels]);

  useEffect(() => {
    if (!hasLivePendingQuoteRequest) return;
    const id = setInterval(() => {
      fetchBookingDetail(true);
      fetchQuotation();
      refreshChatQuotationLabels();
    }, 4000);
    return () => clearInterval(id);
  }, [hasLivePendingQuoteRequest, fetchBookingDetail, refreshChatQuotationLabels]);

  useEffect(() => {
    try {
      if (!lastMessage) return;
      const message = lastMessage as unknown as Record<string, unknown>;
      const bid = Number(message.booking_id ?? message.bookingId ?? message.booking);
      if (!bid || !bookingId || bid !== Number(bookingId)) return;
      const action = (lastMessage.action || lastMessage.type || '').toString().toLowerCase();
      if (['quotation_accepted', 'quotationaccepted', 'booking_updated', 'booking_update', 'new_chat_message', 'new_chatmessage'].includes(action)) {
        refreshChatQuotationLabels();
      }
    } catch {
      // ignore
    }
  }, [lastMessage, bookingId, refreshChatQuotationLabels]);

  const fetchQuotation = async () => {
    if (!bookingId) return;
    try {
      const res = await fetch(`${API_URL}/bookings/shopowner/bookings/${bookingId}/quotation/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        setQuotation(null);
        return;
      }
      const data = await res.json();
      setQuotation(data);
    } catch (e) {
      setQuotation(null);
    }
  };

  // Live timer for active status (view-only)
  useEffect(() => {
    if (!booking) return;
    if (booking.status !== 'active') return;
    if (!booking.active_details?.started_at) return;

    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [booking?.status, booking?.active_details?.started_at]);

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
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
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

  const clientName =
    booking.client
      ? `${booking.client.firstname || ''} ${booking.client.lastname || ''}`.trim() ||
        booking.client.username ||
        booking.client.email ||
        'Client'
      : 'Client';
  const resolvedVehicleType =
    booking.request?.vehicle_type ||
    booking.request?.request_details?.vehicle_type ||
    booking.request?.request_details?.vehicle?.type ||
    null;
  const resolvedVehicleBrand =
    booking.request?.vehicle_brand ||
    booking.request?.request_details?.vehicle_brand ||
    booking.request?.request_details?.vehicle?.brand ||
    null;
  const resolvedVehicleModel =
    booking.request?.vehicle_model ||
    booking.request?.request_details?.vehicle_model ||
    booking.request?.request_details?.vehicle?.model ||
    null;
  const assignedIds = new Set(assignments.map((a) => a.mechanic.id));
  const availableMechanics = shopMechanics.filter((m) => !assignedIds.has(m.account_id));
  const assignedTeam = (assignments.length > 0
    ? assignments
    : (booking.request?.assigned_mechanics || []).map((a) => ({
        id: a.id,
        role: a.role,
        assigned_at: a.assigned_at || '',
        mechanic: a.mechanic,
      }))) as Assignment[];
  const leadCount = assignedTeam.filter((a) => a.role === 'lead').length;
  const assistCount = assignedTeam.filter((a) => a.role === 'assistant').length;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* View-only details (same premium layout, but no mechanic action buttons) */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
      >
        {/* Status Card */}
        <View
          style={[
            styles.statusCard,
            { borderColor: getStatusColor(booking.status) + '40' },
          ]}
        >
          <View
            style={[
              styles.statusIconLarge,
              { backgroundColor: getStatusColor(booking.status) + '20' },
            ]}
          >
            <FontAwesome
              name={getStatusIcon(booking.status) as any}
              size={28}
              color={getStatusColor(booking.status)}
            />
          </View>

          <View style={styles.statusInfo}>
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(booking.status) },
                ]}
              >
                <ThemedText style={styles.statusBadgeText}>
                  {getStatusLabel(booking.status)}
                </ThemedText>
              </View>

              {(booking.status === 'active' || booking.status === 'paused') &&
                booking.active_details?.started_at && (
                  <ThemedText style={styles.timerText}>
                    {formatDuration(timer)}
                  </ThemedText>
                )}

              <ThemedText style={styles.bookingIdText}>#{booking.id}</ThemedText>
            </View>

            <ThemedText style={styles.serviceType}>
              {booking.request?.type
                ? booking.request.type.charAt(0).toUpperCase() +
                  booking.request.type.slice(1) +
                  ' Service'
                : 'Service Request'}
            </ThemedText>
          </View>

          <ThemedText style={styles.amountLarge}>
            ₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}
          </ThemedText>
        </View>

        {/* Chat Section */}
        {canOpenBookingChat(booking) ? (
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() =>
              router.push({ pathname: '/chat/booking_chat', params: { bookingId: String(booking.id) } })
            }
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
              {chatPreview ? (
                <ThemedText style={{ color: '#aaa' }} numberOfLines={3}>
                  {chatPreview}
                </ThemedText>
              ) : (
                <ThemedText style={{ color: '#666' }}>No messages yet. Tap to chat with the client.</ThemedText>
              )}
            </View>
          </TouchableOpacity>
        ) : null}

        {/* Assignment Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
              <FontAwesome name="users" size={16} color="#34C759" />
            </View>
            <ThemedText style={styles.sectionTitle}>Assigned Team</ThemedText>
            {assignedTeam.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
                {leadCount > 0 ? (
                  <View style={{ backgroundColor: '#FF950030', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                    <ThemedText style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                      Lead {leadCount}
                    </ThemedText>
                  </View>
                ) : null}
                {assistCount > 0 ? (
                  <View style={{ backgroundColor: '#34C75930', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
                    <ThemedText style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>
                      Assist {assistCount}
                    </ThemedText>
                  </View>
                ) : null}
                {canManageAssignment(booking.status) ? (
                  <TouchableOpacity
                    onPress={openAssignModal}
                    style={{ backgroundColor: '#FF9500', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}
                    activeOpacity={0.85}
                  >
                    <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Edit</ThemedText>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : canManageAssignment(booking.status) ? (
              <TouchableOpacity
                onPress={openAssignModal}
                style={{ backgroundColor: '#FF9500', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginLeft: 'auto' }}
                activeOpacity={0.85}
              >
                <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Assign</ThemedText>
              </TouchableOpacity>
            ) : null}
          </View>
          {assignedTeam.length === 0 ? (
            <ThemedText style={{ color: '#888', marginTop: 6 }}>No mechanics assigned yet.</ThemedText>
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {assignedTeam.map((a) => (
                <View
                  key={a.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <ThemedText style={{ color: '#ddd' }}>
                    {a.mechanic.firstname} {a.mechanic.lastname}
                  </ThemedText>
                  <View
                    style={{
                      backgroundColor: a.role === 'lead' ? '#FF950030' : '#34C75930',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                    }}
                  >
                    <ThemedText style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                      {a.role === 'lead' ? 'Lead Mechanic' : 'Assisting Mechanic'}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          )}
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

        {/* Client Info */}
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

        {/* Service Location */}
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
                  <ThemedText style={styles.locationValue}>
                    {locationText(booking.service_location.subdivision_village)}
                  </ThemedText>
                </View>
              ) : null}

              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                <ThemedText style={styles.locationValue}>
                  {barangayValue}
                </ThemedText>
              </View>

              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>City</ThemedText>
                <ThemedText style={styles.locationValue}>
                  {cityValue}
                </ThemedText>
              </View>

              {booking.service_location.landmark && (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Landmark</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {booking.service_location.landmark}
                  </ThemedText>
                </View>
              )}
            </View>
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

        {/* Timeline */}
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

            {booking.updated_at &&
              booking.updated_at !== booking.booked_at && (
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

        {/* Pricing & Quotation */}
        {canShowQuotationForStatus(booking.status) && (
          <View style={[styles.sectionCard, isQuotationPending ? { borderColor: '#F2B15C66' } : null]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="calculator" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Pricing & Quotation</ThemedText>
            </View>
            {booking.status === 'pending_payment' ? (
              <View style={{ marginTop: 4, marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: '#151515', borderWidth: 1, borderColor: '#2A2C2E' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                    <FontAwesome name="shield" size={16} color="#34C759" />
                  </View>
                  <ThemedText style={styles.sectionTitle}>Payment Secured</ThemedText>
                  <View style={{ marginLeft: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: getPaymentStatusColor(paymentStatus) + '22', borderWidth: 1, borderColor: getPaymentStatusColor(paymentStatus) + '66' }}>
                    <ThemedText style={{ color: getPaymentStatusColor(paymentStatus), fontSize: 11, fontWeight: '800' }}>
                      {getPaymentStatusLabel(paymentStatus)}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.paymentSummaryGrid}>
                  <View style={styles.paymentSummaryTile}>
                    <ThemedText style={styles.paymentSummaryLabel}>Total</ThemedText>
                    <ThemedText style={styles.paymentSummaryValue}>₱{paymentTotalAmount.toFixed(2)}</ThemedText>
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
                <ThemedText style={[styles.noteText, { marginTop: 6 }]}>
                  Payment split below is based on the final payable amount for this shop booking.
                </ThemedText>
              </View>
            ) : null}
            {hasLivePendingQuoteRequest ? (
              <View style={{ marginTop: 4, marginBottom: 8, padding: 8, borderRadius: 8, backgroundColor: '#F2B15C1F', borderWidth: 1, borderColor: '#F2B15C55', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome name="clock-o" size={12} color="#C89B55" />
                <ThemedText style={{ color: '#C89B55', fontSize: 12 }}>Pending changes are waiting for client approval.</ThemedText>
              </View>
            ) : null}

            {displayQuotation && visibleQuotationItems.length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(() => {
                  const acceptedByAssoc: Record<string, any> = {};
                  const acceptedRows: any[] = [];
                  const removedRows: any[] = [];
                  visibleQuotationItems.forEach((row: any) => {
                    const rowStatus = String(row?.status || displayQuotation?.status || quotation?.status || '').toLowerCase();
                    const key = getAssocKey(row);
                    if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) {
                      acceptedByAssoc[key] = row;
                    }
                    if (rowStatus === 'accepted') acceptedRows.push(row);
                    if (rowStatus === 'rejected') removedRows.push(row);
                  });

                  const renderQuotationRow = (it: any, idx: number) => {
                    const itemStatus = it && (it.status || it.quotation_status || it.state)
                      ? (it.status || it.quotation_status || it.state)
                      : (quotation && quotation.status) || 'pending';
                    const isPending = String(itemStatus).toLowerCase() === 'pending';
                    const isRejected = String(itemStatus).toLowerCase() === 'rejected';
                    const explicit = getExplicitChangeLabel(it);
                    const inferred = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
                    const chatDerived = getQuoteSnapshotKeys(it).map((key) => chatChangeLabelByKey[key]).find(Boolean) || null;
                    const rawChangeLabelUnfiltered = explicit || chatDerived || inferred || null;
                    const serviceId = Number(it?.service);
                    const isBookedServiceItem = Number.isFinite(serviceId) && serviceItemIds.has(serviceId);
                    const rawChangeLabel = isBookedServiceItem && rawChangeLabelUnfiltered === 'Removed' ? null : rawChangeLabelUnfiltered;
                    const changeLabel = (isPending || isRejected) ? rawChangeLabel : null;
                    const isRemoved = changeLabel === 'Removed';
                    const assocKey = getAssocKey(it);
                    const desc = it?.description || it?.name || (it.service ? `Service #${it.service}` : null) || 'Item';
                    const price = Number(it?.unit_price ?? it?.price ?? 0) || 0;
                    const qty = Number(it?.quantity ?? 1) || 1;
                    const key = getQuoteItemKey(it, idx);
                    const isExpanded = expandedQuoteItems[key] ?? false;
                    const beforeItem = it?.previous_description || it?.previous_quantity != null || it?.previous_unit_price != null
                      ? {
                          description: it?.previous_description,
                          quantity: it?.previous_quantity,
                          unit_price: it?.previous_unit_price,
                        }
                      : (changeLabel === 'Edited' && assocKey ? acceptedByAssoc[assocKey] : null);

                    const beforeDescription = beforeItem?.description;
                    const beforeQty = Number(beforeItem?.quantity ?? 1) || 1;
                    const beforeUnitPrice = Number(beforeItem?.unit_price ?? 0) || 0;
                    const beforeLineTotal = beforeUnitPrice * beforeQty;
                    const getChangePillStyle = (label: string | null) => {
                      if (label === 'Added') return { pill: { backgroundColor: '#8CE99A', borderColor: '#5FBF72' }, text: { color: '#1D3A24' } };
                      if (label === 'Edited') return { pill: { backgroundColor: '#FFD49A', borderColor: '#DCA85F' }, text: { color: '#5A3D0A' } };
                      if (label === 'Removed') return { pill: { backgroundColor: '#FFB4B0', borderColor: '#C97673' }, text: { color: '#631B21' } };
                      return { pill: {}, text: {} };
                    };
                    const pillStyle = getChangePillStyle(changeLabel);

                    return (
                      <View key={key} style={[styles.quotationAccordionRow, isRemoved ? styles.removedItem : (changeLabel ? styles.pendingItem : styles.acceptedItem), isExpanded ? styles.quotationAccordionRowExpanded : null]}>
                        <TouchableOpacity style={styles.quotationAccordionHeader} onPress={() => toggleQuoteItem(key)} activeOpacity={0.8}>
                          <View style={styles.quoteHeaderLeft}>
                            <ThemedText style={[styles.receiptItem, isRemoved ? styles.removedItemText : null]} numberOfLines={2}>{desc}</ThemedText>
                            {changeLabel ? (
                              <View style={[styles.pendingPill, pillStyle.pill]}>
                                <ThemedText style={[styles.pendingPillText, pillStyle.text]}>{changeLabel}</ThemedText>
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
                                    {beforeDescription || (it.service ? `Service #${it.service}` : null) || 'Item'}
                                  </ThemedText>
                                </View>
                                <View style={styles.receiptRow}>
                                  <ThemedText style={styles.quotationDetailLabel}>Before Price</ThemedText>
                                  <ThemedText style={[styles.quotationDetailValue, { textDecorationLine: 'line-through', color: '#8E8E93' }]}>₱{beforeLineTotal.toFixed(2)}</ThemedText>
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

                  return (
                    <>
                      <TouchableOpacity
                        style={[styles.quotationListAccordionHeader, quotationListExpanded ? styles.quotationListAccordionHeaderExpanded : null]}
                        onPress={() => setQuotationListExpanded(prev => !prev)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <FontAwesome name="list" size={12} color="#A6ABB2" />
                          <ThemedText style={styles.quotationListAccordionTitle}>
                            Quotation Items ({visibleQuotationItems.length})
                          </ThemedText>
                        </View>
                        <FontAwesome name={quotationListExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#A6ABB2" />
                      </TouchableOpacity>
                      {quotationListExpanded ? visibleQuotationItems.map(renderQuotationRow) : null}

                      <View style={{ height: 1, backgroundColor: '#2A2C2E', marginVertical: 8 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>
                          Convenience Fee Total
                        </ThemedText>
                        <ThemedText style={{ color: '#ECEDEE', fontWeight: '800' }}>₱{effectiveConvenienceFee.toFixed(2)}</ThemedText>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                        <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>
                          Quotation Estimated Total
                        </ThemedText>
                        <ThemedText style={{ color: '#ECEDEE', fontWeight: '800' }}>₱{effectiveQuotationEstimate.toFixed(2)}</ThemedText>
                      </View>
                      {pendingRequestedTotalValue != null ? (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                          <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>Pending Requested Total</ThemedText>
                          <ThemedText style={{ color: '#F2B15C', fontWeight: '800' }}>₱{pendingRequestedTotalValue.toFixed(2)}</ThemedText>
                        </View>
                      ) : null}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                        <ThemedText style={{ color: '#ECEDEE', fontWeight: '700' }}>
                          Total Fee
                        </ThemedText>
                        <ThemedText style={{ color: '#ECEDEE', fontWeight: '800' }}>₱{effectiveTotalFee.toFixed(2)}</ThemedText>
                      </View>
                      {renderPaymentSplit()}
                    </>
                  );
                })()}
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#8E8E93' }}>
                  No quotation available.
                </ThemedText>
              </View>
            )}
            {canEditQuotationForStatus(booking.status) ? (
              <TouchableOpacity
                style={[styles.finishLargeButton, { marginTop: 10, backgroundColor: '#34C759' }]}
                onPress={openQuotationEditor}
                activeOpacity={0.85}
              >
                <FontAwesome name={quotation ? 'pencil' : 'plus'} size={14} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { color: '#fff' }]}>
                  {quotation ? 'Edit Quotation' : 'Create Quotation'}
                </ThemedText>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Active Details (Job Status) */}
        {booking.status === 'active' && booking.active_details && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="info-circle" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Job Status</ThemedText>
            </View>

            <View style={styles.detailChips}>
              <View
                style={[
                  styles.chip,
                  booking.active_details.is_job_done ? styles.chipSuccess : styles.chipDefault,
                ]}
              >
                <FontAwesome
                  name={booking.active_details.is_job_done ? 'check' : 'clock-o'}
                  size={12}
                  color={booking.active_details.is_job_done ? '#34C759' : '#8E8E93'}
                />
                <ThemedText
                  style={[styles.chipText, booking.active_details.is_job_done ? { color: '#34C759' } : null]}
                >
                  {booking.active_details.is_job_done ? 'Job Done' : 'In Progress'}
                </ThemedText>
              </View>

              {booking.active_details.is_rescheduled && (
                <View style={[styles.chip, styles.chipWarning]}>
                  <FontAwesome name="calendar" size={12} color="#FFD60A" />
                  <ThemedText style={[styles.chipText, { color: '#FFD60A' }]}>
                    Rescheduled
                  </ThemedText>
                </View>
              )}
            </View>

            {booking.active_details.reason && (
              <View style={styles.noteBox}>
                <ThemedText style={styles.noteLabel}>Note:</ThemedText>
                <ThemedText style={styles.noteText}>{booking.active_details.reason}</ThemedText>
              </View>
            )}

            {booking.active_details.started_at && (
              <View style={styles.elapsedRow}>
                <ThemedText style={styles.elapsedLabel}>Elapsed</ThemedText>
                <ThemedText style={styles.elapsedValue}>{formatDuration(timer)}</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Before-Service Photos */}
        {booking.active_details && (
          <View style={styles.sectionCard}>
            {(() => {
              const beforePhotos = booking.active_details?.before_pictures?.length
                ? booking.active_details.before_pictures
                : booking.active_details?.before_picture
                  ? [booking.active_details.before_picture]
                  : [];
              const afterPhotos = booking.active_details?.after_pictures?.length
                ? booking.active_details.after_pictures
                : booking.active_details?.after_picture
                  ? [booking.active_details.after_picture]
                  : [];

              const renderPhotos = (photos: string[]) => (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, marginHorizontal: -4 }}>
                  {photos.map((uri, idx) => (
                    <View key={`${uri}-${idx}`} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <TouchableOpacity activeOpacity={0.85} onPress={() => setViewerPhotoUri(uri)}>
                        <Image source={{ uri }} style={{ width: '100%', height: 150, borderRadius: 12 }} contentFit="cover" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );

              return (
                <>
                  <View style={styles.sectionHeader}>
                    <View style={[styles.sectionIcon, { backgroundColor: '#4F8CFF15' }]}>
                      <FontAwesome name="camera" size={16} color="#4F8CFF" />
                    </View>
                    <ThemedText style={styles.sectionTitle}>Before-Service Photos</ThemedText>
                  </View>
                  {beforePhotos.length ? (
                    <>
                      {renderPhotos(beforePhotos.slice(0, visibleBeforePhotoCount))}
                      {beforePhotos.length > visibleBeforePhotoCount ? (
                        <TouchableOpacity
                          style={[styles.refreshBtn, { marginTop: 4, alignSelf: 'flex-start', width: 'auto', paddingHorizontal: 12 }]}
                          onPress={() => setVisibleBeforePhotoCount((prev) => prev + 6)}
                          activeOpacity={0.85}
                        >
                          <ThemedText style={{ color: '#FF8C00', fontWeight: '700' }}>Load More Before Photos</ThemedText>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  ) : (
                    <View
                      style={{
                        marginTop: 8,
                        height: 140,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#2A2C2E',
                        backgroundColor: '#111214',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <FontAwesome name="image" size={26} color="#6C6C70" />
                      <ThemedText style={{ color: '#8E8E93' }}>No before-service photos uploaded yet</ThemedText>
                    </View>
                  )}

                  {(booking.status === 'completed' || afterPhotos.length > 0) ? (
                    <>
                      <View style={[styles.sectionHeader, { marginTop: 8 }]}>
                        <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                          <FontAwesome name="camera" size={16} color="#34C759" />
                        </View>
                        <ThemedText style={styles.sectionTitle}>After-Service Photos</ThemedText>
                      </View>
                      {afterPhotos.length ? (
                        <>
                          {renderPhotos(afterPhotos.slice(0, visibleAfterPhotoCount))}
                          {afterPhotos.length > visibleAfterPhotoCount ? (
                            <TouchableOpacity
                              style={[styles.refreshBtn, { marginTop: 4, alignSelf: 'flex-start', width: 'auto', paddingHorizontal: 12 }]}
                              onPress={() => setVisibleAfterPhotoCount((prev) => prev + 6)}
                              activeOpacity={0.85}
                            >
                              <ThemedText style={{ color: '#FF8C00', fontWeight: '700' }}>Load More After Photos</ThemedText>
                            </TouchableOpacity>
                          ) : null}
                        </>
                      ) : (
                        <View
                          style={{
                            marginTop: 8,
                            height: 140,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: '#2A2C2E',
                            backgroundColor: '#111214',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                          }}
                        >
                          <FontAwesome name="image" size={26} color="#6C6C70" />
                          <ThemedText style={{ color: '#8E8E93' }}>No after-service photos uploaded yet</ThemedText>
                        </View>
                      )}
                    </>
                  ) : null}
                </>
              );
            })()}
          </View>
        )}

        {/* Completion Details */}
        {booking.status === 'completed' &&
          booking.completion_details && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                  <FontAwesome name="check-circle" size={16} color="#34C759" />
                </View>
                <ThemedText style={styles.sectionTitle}>Completion Details</ThemedText>
              </View>

              <View style={styles.completionInfo}>
                <View style={styles.receiptList}>
                  {displayQuotation && (displayQuotation.items || []).length > 0 ? (
                    <>
                      {(displayQuotation.items || []).map((it: any, idx: number) => (
                        <View key={idx} style={styles.receiptRow}>
                          <ThemedText style={styles.receiptItem}>
                            {it.description ||
                              (it.service ? `Service #${it.service}` : null) ||
                              'Item'}
                          </ThemedText>
                          <ThemedText style={styles.receiptAmount}>
                            ₱
                            {((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}
                          </ThemedText>
                        </View>
                      ))}

                      <View style={styles.receiptDivider} />

                      <View style={styles.receiptRow}>
                        <ThemedText style={styles.receiptTotalLabel}>Final Total</ThemedText>
                        <ThemedText style={styles.receiptTotalValue}>
                          ₱
                          {parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}
                        </ThemedText>
                      </View>

                      <View style={styles.receiptRow}>
                        <ThemedText style={styles.receiptYouLabel}>Shop owner receives</ThemedText>
                        <ThemedText style={styles.receiptYouValue}>
                          ₱
                          {Number(paymentSplit?.shop_owner_amount ?? displayQuotation.total_amount ?? 0).toFixed(2)}
                        </ThemedText>
                      </View>
                      {renderPaymentSplit()}
                    </>
                  ) : (
                    <>
                      <View style={styles.completionRow}>
                        <ThemedText style={styles.completionLabel}>Total Amount</ThemedText>
                        <ThemedText style={styles.completionAmount}>
                          ₱{(booking.completion_details.total_amount ?? 0).toFixed(2)}
                        </ThemedText>
                      </View>
                      {renderPaymentSplit()}
                    </>
                  )}
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
        {booking.status === 'cancelled' &&
          booking.cancellation_details && (
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
                  <ThemedText style={styles.infoValue}>
                    {booking.cancellation_details.cancelled_by.name}
                  </ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Date</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {formatDate(booking.cancellation_details.cancelled_at)}
                  </ThemedText>
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
        {booking.status === 'reworked' &&
          (booking as any).rework_details && (
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
                  <ThemedText style={styles.infoValue}>
                    {(booking as any).rework_details.requested_by.name}
                  </ThemedText>
                </View>

                {(booking as any).rework_details.reason && (
                  <View style={styles.noteBox}>
                    <ThemedText style={styles.noteLabel}>Reason:</ThemedText>
                    <ThemedText style={styles.noteText}>
                      {(booking as any).rework_details.reason}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

        <View style={{ height: 28 }} />
      </ScrollView>

      <Modal visible={Boolean(viewerPhotoUri)} transparent animationType="fade" onRequestClose={() => setViewerPhotoUri(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity style={{ position: 'absolute', top: 56, right: 20, zIndex: 2 }} onPress={() => setViewerPhotoUri(null)}>
            <FontAwesome name="times-circle" size={30} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }} activeOpacity={1} onPress={() => setViewerPhotoUri(null)}>
            {viewerPhotoUri ? (
              <Image source={{ uri: viewerPhotoUri }} style={{ width: '94%', height: '80%', borderRadius: 12 }} contentFit="contain" />
            ) : null}
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={assignModalVisible} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: '#1E1E1E',
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              maxHeight: '82%',
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 18,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <ThemedText style={{ color: '#ECEDEE', fontSize: 18, fontWeight: '700' }}>Assign Mechanics</ThemedText>
                <ThemedText style={{ color: '#8E8E93', fontSize: 12, marginTop: 2 }}>
                  {availableMechanics.length} available mechanic{availableMechanics.length === 1 ? '' : 's'}
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <FontAwesome name="times-circle" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false}>
              <ThemedText style={{ color: '#8E8E93', fontSize: 12, fontWeight: '700', marginBottom: 8 }}>
                CURRENT TEAM
              </ThemedText>
              {assignments.length === 0 ? (
                <View
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#2E2E2E',
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    marginBottom: 14,
                    backgroundColor: '#242424',
                  }}
                >
                  <ThemedText style={{ color: '#7F7F83', fontSize: 13 }}>
                    No assigned mechanics yet.
                  </ThemedText>
                </View>
              ) : (
                assignments.map((a) => (
                  <View
                    key={a.id}
                    style={{
                      backgroundColor: '#252525',
                      borderRadius: 10,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <ThemedText numberOfLines={1} style={{ color: '#ECEDEE', fontSize: 14, fontWeight: '600' }}>
                          {a.mechanic.firstname} {a.mechanic.lastname}
                        </ThemedText>
                        <ThemedText style={{ color: '#888', fontSize: 12 }}>
                          {a.role === 'lead' ? 'Lead Mechanic' : 'Assisting Mechanic'}
                        </ThemedText>
                      </View>
                      {assignLoading ? (
                        <ActivityIndicator size="small" color="#FF9500" />
                      ) : (
                        <TouchableOpacity
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            backgroundColor: '#FF3B301A',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={() => handleUnassign(a.id)}
                        >
                          <FontAwesome name="minus" size={14} color="#FF6B63" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {!assignLoading ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: a.role === 'lead' ? '#FF9500' : '#111214',
                            borderWidth: 1,
                            borderColor: '#FF9500',
                            paddingVertical: 8,
                            borderRadius: 8,
                            alignItems: 'center',
                          }}
                          onPress={() => handleUpdateAssignmentRole(a.id, 'lead')}
                          disabled={a.role === 'lead'}
                        >
                          <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                            Make Lead
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: a.role === 'assistant' ? '#34C759' : '#111214',
                            borderWidth: 1,
                            borderColor: '#34C759',
                            paddingVertical: 8,
                            borderRadius: 8,
                            alignItems: 'center',
                          }}
                          onPress={() => handleUpdateAssignmentRole(a.id, 'assistant')}
                          disabled={a.role === 'assistant'}
                        >
                          <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>
                            Make Assist
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ))
              )}

              <ThemedText style={{ color: '#8E8E93', fontSize: 12, fontWeight: '700', marginTop: 2, marginBottom: 8 }}>
                AVAILABLE MECHANICS
              </ThemedText>
              {availableMechanics.length === 0 ? (
                <View
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#2E2E2E',
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    marginBottom: 10,
                    backgroundColor: '#242424',
                  }}
                >
                  <ThemedText style={{ color: '#7F7F83', fontSize: 13 }}>
                    All shop mechanics are already assigned.
                  </ThemedText>
                </View>
              ) : (
                availableMechanics.map((m) => (
                  <View
                    key={m.account_id}
                    style={{
                      backgroundColor: '#252525',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <ThemedText numberOfLines={2} style={{ color: '#ECEDEE', fontSize: 14, fontWeight: '600', marginBottom: 10 }}>
                      {m.firstname} {m.lastname}
                    </ThemedText>
                    {assigningId === m.account_id ? (
                      <View style={{ minHeight: 36, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#FF9500" />
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: '#FF9500',
                            paddingVertical: 8,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={() => handleAssignMechanic(m.account_id, 'lead')}
                        >
                          <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                            Lead
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: '#34C759',
                            paddingVertical: 8,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={() => handleAssignMechanic(m.account_id, 'assistant')}
                        >
                          <ThemedText style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                            Assist
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

