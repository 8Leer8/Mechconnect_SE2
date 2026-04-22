import React, { useCallback, useEffect, useState } from 'react';
import { useWebSocketContext } from '@/context/WebSocketContext';
export const screenOptions = { headerShown: false } as const;
import { View, ScrollView, TouchableOpacity, RefreshControl, Modal, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { Image } from 'expo-image';
import { styles } from '@/style/mechanic/bookingDetailsStyles';
import { canOpenBookingChat } from '@/lib/bookingAccess';
import { fetchBookingChatPreview } from '@/lib/bookingChatPreview';
import { useNotification } from '@/hooks/useNotification';
import { coerceBarangayForDisplay } from '@/lib/locationAddress';

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
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shopMechanics, setShopMechanics] = useState<ShopMechanic[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [viewerPhotoUri, setViewerPhotoUri] = useState<string | null>(null);
  const [visibleBeforePhotoCount, setVisibleBeforePhotoCount] = useState(6);
  const [visibleAfterPhotoCount, setVisibleAfterPhotoCount] = useState(6);
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
      if (bookingData?.request?.id) {
        loadAssignmentData(bookingData.request.id);
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

  const loadAssignmentData = useCallback(async (requestId: number) => {
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
    } catch {
      setAssignments([]);
    }
  }, []);

  const canManageAssignment = (status: string) =>
    ['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'paused', 'reworked'].includes(status);

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
      await loadAssignmentData(booking.request.id);
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
      await loadAssignmentData(booking.request.id);
      await fetchBookingDetail(true);
      showNotification({ type: 'success', message: 'Assignment removed.' });
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
    const id = setInterval(() => {
      fetchBookingDetail(true);
    }, 20000);
    return () => clearInterval(id);
  }, [bookingId, fetchBookingDetail]);

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
    // Prefer server-saved quotation if available
    if (quotation && (quotation.items || []).length > 0) return quotation;
    if (!booking) return null;
    const details = (booking.request as any)?.request_details || null;
    if (!details) return null;

    const items: any[] = [];
    if (details.service) {
      const svc: any = details.service;
      const unit = Number(svc.minimum_price ?? booking.amount_fee ?? 0) || 0;
      items.push({
        description: svc.name || 'Service',
        quantity: 1,
        unit_price: unit,
        service: svc.id,
      });
    } else if (Array.isArray(details.services) && details.services.length > 0) {
      const primary: any = details.services[0];
      const unit = Number(primary.minimum_price ?? booking.amount_fee ?? 0) || 0;
      items.push({
        description: primary.name || 'Service',
        quantity: 1,
        unit_price: unit,
        service: primary.id,
      });
    }

    if (items.length === 0) return null;
    const total_amount = items.reduce(
      (s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
      0
    );
    return { items, total_amount };
  };

  const displayQuotation = getDisplayQuotation();
  const isQuotationPending = Boolean((quotation && quotation.status === 'pending') || (displayQuotation && displayQuotation.status === 'pending'));

  const normalizeText = (v: any) => String(v ?? '').trim().toLowerCase();
  const normalizeNum = (v: any) => Number(v ?? 0);
  const getAssocKey = (it: any) => {
    const serviceId = Number(it?.service);
    const addOnId = Number(it?.service_add_on);
    if (Number.isFinite(serviceId) && serviceId > 0) return `service:${serviceId}`;
    if (Number.isFinite(addOnId) && addOnId > 0) return `addon:${addOnId}`;
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

    const status = String(it?.status || displayQuotation?.status || quotation?.status || '').toLowerCase();
    if (status === 'rejected') return 'Removed';
    if (status !== 'pending') return null;

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

    const editedFromRemoved = (removedRows || []).find((row: any) => {
      const sameQty = normalizeNum(row?.quantity) === normalizeNum(it?.quantity);
      const samePrice = normalizeNum(row?.unit_price ?? row?.price) === normalizeNum(it?.unit_price ?? it?.price);
      return sameQty && samePrice && isLikelyRename(row?.description, it?.description);
    });
    if (editedFromRemoved) return 'Edited';

    if (it?.is_removed === true || it?.is_deleted === true) return 'Removed';
    if (it?.is_edited === true || it?.is_modified === true) return 'Edited';
    if (it?.is_added === true) return 'Added';

    return 'Added';
  };

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
          </View>
          {assignments.length === 0 ? (
            <ThemedText style={{ color: '#888', marginTop: 6 }}>No mechanics assigned yet.</ThemedText>
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {assignments.map((a) => (
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
          {canManageAssignment(booking.status) ? (
            <TouchableOpacity
              style={[styles.refreshBtn, { marginTop: 14, alignSelf: 'flex-start', width: 'auto', paddingHorizontal: 14 }]}
              onPress={() => setAssignModalVisible(true)}
            >
              <ThemedText style={{ color: '#FF8C00', fontWeight: '700' }}>
                {booking.status === 'accepted' ? 'Assign' : 'Reassign'}
              </ThemedText>
            </TouchableOpacity>
          ) : null}
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

        {/* Quotation (read-only) */}
        {(booking.status === 'accepted' ||
          booking.status === 'on_the_way' ||
          booking.status === 'at_location' ||
          booking.status === 'diagnosing' ||
          booking.status === 'active') && (
          <View style={[styles.sectionCard]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Quotation</ThemedText>
            </View>

            {displayQuotation && (displayQuotation.items || []).length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(() => {
                  const acceptedByAssoc: Record<string, any> = {};
                  const acceptedRows: any[] = [];
                  const removedRows: any[] = [];
                  (displayQuotation.items || []).forEach((row: any) => {
                    const rowStatus = String(row?.status || displayQuotation?.status || quotation?.status || '').toLowerCase();
                    const key = getAssocKey(row);
                    if (rowStatus === 'accepted' && key && !acceptedByAssoc[key]) {
                      acceptedByAssoc[key] = row;
                    }
                    if (rowStatus === 'accepted') acceptedRows.push(row);
                    if (rowStatus === 'rejected') removedRows.push(row);
                  });

                  const quotationAcceptedTotal = (displayQuotation && Array.isArray(displayQuotation.items)) ? (displayQuotation.items || []).reduce((sum: number, it: any) => {
                    const itemStatus = it?.status || displayQuotation?.status || quotation?.status;
                    if (String(itemStatus).toLowerCase() === 'accepted') {
                      return sum + ((Number(it.unit_price) || 0) * (Number(it.quantity) || 1));
                    }
                    return sum;
                  }, 0) : 0;
                  const renderQuotationRow = (it: any, idx: number) => {
                    const itemStatus = it?.status || displayQuotation?.status || quotation?.status;
                    const isPending = String(itemStatus).toLowerCase() === 'pending';
                    const isRejected = String(itemStatus).toLowerCase() === 'rejected';
                    const changeLabel = inferChangeLabel(it, acceptedByAssoc, acceptedRows, removedRows);
                    const assocKey = getAssocKey(it);
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

                    return (
                      <View key={idx} style={{ paddingVertical: 6, opacity: isRejected ? 0.72 : 1 }}>
                        {changeLabel === 'Edited' && beforeItem ? (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 3 }}>
                            <ThemedText style={{ flex: 1, textDecorationLine: 'line-through', color: '#8E8E93' }}>
                              {beforeDescription || (it.service ? `Service #${it.service}` : null) || 'Item'}
                            </ThemedText>
                            <ThemedText style={{ textDecorationLine: 'line-through', color: '#8E8E93' }}>₱{beforeLineTotal.toFixed(2)}</ThemedText>
                          </View>
                        ) : null}

                        {changeLabel === 'Edited' && beforeItem ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 3 }}>
                            <FontAwesome name="long-arrow-down" size={12} color="#8E8E93" />
                            <ThemedText style={{ marginLeft: 6, color: '#8E8E93', fontSize: 11, fontStyle: 'italic' }}>Updated to</ThemedText>
                          </View>
                        ) : null}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ThemedText style={{ flex: 1 }}>{it.description || (it.service ? `Service #${it.service}` : null) || 'Item'}</ThemedText>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <ThemedText>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                            {changeLabel === 'Added' ? <ThemedText style={{ marginLeft: 8, color: '#1D3A24', fontWeight: '700', backgroundColor: '#8CE99A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>Added</ThemedText> : null}
                            {changeLabel === 'Edited' ? <ThemedText style={{ marginLeft: 8, color: '#5A3D0A', fontWeight: '700', backgroundColor: '#FFD49A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>Edited</ThemedText> : null}
                            {changeLabel === 'Removed' ? <ThemedText style={{ marginLeft: 8, color: '#631B21', fontWeight: '700', backgroundColor: '#FFB4B0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>Removed</ThemedText> : null}
                          </View>
                        </View>
                      </View>
                    );
                  };

                  return (
                    <>
                      {(displayQuotation.items || []).map(renderQuotationRow)}

                      <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                        <ThemedText style={{ fontWeight: '600' }}>₱{parseFloat(String(quotationAcceptedTotal || 0)).toFixed(2)}</ThemedText>
                      </View>
                    </>
                  );
                })()}
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#666' }}>
                  No quotation available.
                </ThemedText>
              </View>
            )}
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
                        <ThemedText style={styles.receiptYouLabel}>You receive</ThemedText>
                        <ThemedText style={styles.receiptYouValue}>
                          ₱
                          {parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}
                        </ThemedText>
                      </View>
                    </>
                  ) : (
                    <View style={styles.completionRow}>
                      <ThemedText style={styles.completionLabel}>Total Amount</ThemedText>
                      <ThemedText style={styles.completionAmount}>
                        ₱{(booking.completion_details.total_amount ?? 0).toFixed(2)}
                      </ThemedText>
                    </View>
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
                <ThemedText style={{ fontSize: 18, fontWeight: '700' }}>Assign Mechanics</ThemedText>
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
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <ThemedText numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>
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
                    <ThemedText numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', marginBottom: 10 }}>
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

