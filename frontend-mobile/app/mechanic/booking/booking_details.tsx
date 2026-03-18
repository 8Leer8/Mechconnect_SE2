import React, { useState, useEffect, useCallback } from 'react';
// Ensure the router header is hidden for this route so only the in-page header shows
export const screenOptions = { headerShown: false } as const;
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/bookingDetailsStyles';
import WalletBadge from '@/components/wallet-badge';
import { useNotification } from '@/hooks/useNotification';
import { useConfirmation } from '@/hooks/useConfirmation';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
interface BookingDetail {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at: string;
  completed_at: string | null;
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
    paused_at: string | null;
    total_pause_duration: string | null;
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
  } | null;
}

export default function BookingDetailScreen() {
  const { bookingId, source } = useLocalSearchParams<{ bookingId: string; source?: string }>();
  const navigation = useNavigation();
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const routerHook = useRouter();
  const isMechanicShopSource = source === 'mechanic_shop';
  const [quotation, setQuotation] = useState<any | null>(null);

  // Derive a default/display quotation: prefer saved `quotation`, otherwise build from booking.request.request_details
  const getDisplayQuotation = () => {
    if (quotation && (quotation.items || []).length > 0) return quotation;
    const details = (booking && booking.request && (booking.request as any).request_details) || null;
    if (!details) return null;
    const items: any[] = [];
    // direct request: single service
    if (details.service) {
      const svc: any = details.service;
      const unit = Number(svc.minimum_price ?? booking?.amount_fee ?? 0) || 0;
      items.push({ description: svc.name || 'Service', quantity: 1, unit_price: unit, service: svc.id });
    }
    // broadcast: array of services
    else if (Array.isArray(details.services) && details.services.length > 0) {
      const primary: any = details.services[0];
      const unit = Number(primary.minimum_price ?? booking?.amount_fee ?? 0) || 0;
      items.push({ description: primary.name || 'Service', quantity: 1, unit_price: unit, service: primary.id });
    }
    if (items.length === 0) return null;
    const total_amount = items.reduce((s, it) => s + ((Number(it.unit_price) || 0) * (Number(it.quantity) || 1)), 0);
    return { items, total_amount };
  };

  const displayQuotation = getDisplayQuotation();

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
      const data = await response.json();
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
          const reqData = await reqRes.json();
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

  const fetchQuotation = async () => {
    if (!bookingId) return;
    try {
      const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/quotation/`, {
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

  useEffect(() => {
    // fetch quotation when booking loads
    if (bookingId) fetchQuotation();
  }, [bookingId]);

  // Refetch when the screen regains focus (e.g., after editing a quotation)
  useFocusEffect(
    React.useCallback(() => {
      if (!bookingId) return;
      fetchQuotation();
      // also refresh booking details to keep amounts in sync
      fetchBookingDetail();
    }, [bookingId, fetchBookingDetail])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingDetail();
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
        throw new Error(err?.error || 'Failed to complete booking');
      }
      // refresh booking
      await fetchBookingDetail();
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
    if (!booking?.service_location) {
      showNotification({ type: 'warning', message: 'No service location available for this booking.' });
      return;
    }

    const loc = booking.service_location;
    const address = [
      loc.street_name,
      loc.subdivision_village,
      loc.barangay,
      loc.city_municipality,
    ]
      .filter(Boolean)
      .join(', ');

    // Navigate to in-app map screen
    router.push({
      pathname: '/mechanic/booking/booking_location_map',
      params: {
        address: address,
        street: loc.street_name,
        barangay: loc.barangay,
        city: loc.city_municipality,
      },
    });
  };

  // --- New handlers for status transitions ---
  const [transitioning, setTransitioning] = useState(false);
  const [paymentConfirmedOnUI, setPaymentConfirmedOnUI] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [requestActionLoading, setRequestActionLoading] = useState(false);

  const handleStatusUpdate = async (endpoint: string, successMessage: string, errorMessage: string) => {
    if (!booking) return;
    setTransitioning(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/${endpoint}/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error || errorMessage);
      }
      showNotification({ type: 'success', message: successMessage });
      fetchBookingDetail();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || errorMessage });
    } finally {
      setTransitioning(false);
    }
  };

  const handleStartTravel = () => handleStatusUpdate('start-travel', 'Status updated to On The Way!', 'Failed to start travel');
  const handleCancelTravel = async () => {
    if (!booking) return;
    const ok = await confirm({
      type: 'warning',
      title: 'Cancel Travel',
      message: 'Are you sure you want to cancel travel and revert to previous status?',
      confirmText: 'Cancel Travel',
      cancelText: 'Keep Going',
    });
    if (ok) handleStatusUpdate('cancel-travel', 'Travel cancelled.', 'Failed to cancel travel');
  };
  const handleStartJob = () => handleStatusUpdate('start-job', 'Status updated to Active!', 'Failed to start job');
  const handleCancelJob = async () => {
    if (!booking) return;
    const ok = await confirm({
      type: 'warning',
      title: 'Go Back',
      message: 'Are you sure you want to go back? This will revert the job to On the Way.',
      confirmText: 'Go Back',
      cancelText: 'Stay',
    });
    if (ok) handleStatusUpdate('cancel-job', 'Job cancelled.', 'Failed to cancel job');
  };
  const handlePauseJob = () => handleStatusUpdate('pause-job', 'Job paused.', 'Failed to pause job');
  const handleResumeJob = () => handleStatusUpdate('resume-job', 'Job resumed.', 'Failed to resume job');
  const handleFinishJob = async () => {
    if (!booking) return;
    const ok = await confirm({
      type: 'success',
      title: 'Finish Job',
      message: 'Are you sure you want to finish this job? This will move the booking to pending payment.',
      confirmText: 'Finish',
      cancelText: 'Not Yet',
    });
    if (ok) handleStatusUpdate('finish-job', 'Job finished. Pending payment.', 'Failed to finish job');
  };
  const handlePaymentReceived = () => handleStatusUpdate('payment-received', 'Payment received.', 'Failed to confirm payment');
  const handleCancelBooking = async () => {
    if (!booking) return;
    const ok = await confirm({
      type: 'danger',
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking? This action cannot be undone.',
      confirmText: 'Cancel Booking',
      cancelText: 'Keep Booking',
    });
    if (ok) handleStatusUpdate('cancel-booking', 'Booking cancelled.', 'Failed to cancel booking');
  };

  // Accept / Decline for pending requests
  const handleAcceptRequest = async () => {
    if (!booking || !booking.request) return;
    const requestId = booking.request.id;
    setRequestActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/requests/${requestId}/accept/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || 'Failed to accept request');
      }
      showNotification({ type: 'success', message: 'Request accepted' });
      // Go back to bookings list — it will refresh on focus
      router.back();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to accept request' });
    } finally {
      setRequestActionLoading(false);
    }
  };

  const handleDeclineRequest = async () => {
    if (!booking || !booking.request) return;
    const ok = await confirm({ type: 'danger', title: 'Decline Request', message: 'Are you sure you want to decline this request?', confirmText: 'Decline', cancelText: 'Keep' });
    if (!ok) return;
    const requestId = booking.request.id;
    setRequestActionLoading(true);
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/requests/${requestId}/decline/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || 'Failed to decline request');
      }
      showNotification({ type: 'success', message: 'Request declined' });
      // After decline, go back to list
      router.back();
    } catch (err: any) {
      showNotification({ type: 'error', message: err.message || 'Failed to decline request' });
    } finally {
      setRequestActionLoading(false);
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
      <View style={styles.actionButtonsContainer}>
        {/* Pending: Decline (left) + Accept (right) */}
        {booking.status === 'pending' && (
          <View style={{ width: '100%', flexDirection: 'row', gap: 8 }}>
            <View style={styles.actionButtonWrapper}>
              <TouchableOpacity style={[styles.actionButton, styles.cancelButton, { width: '100%' }]} onPress={handleDeclineRequest} disabled={requestActionLoading}>
                <FontAwesome name="times" size={16} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Decline</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={styles.actionButtonWrapper}>
              <TouchableOpacity style={[styles.actionButton, styles.completeButton, { width: '100%' }]} onPress={handleAcceptRequest} disabled={requestActionLoading}>
                {requestActionLoading ? (
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
        {/* Accepted: Start Travel (primary) then Cancel Booking (secondary) — full width stacked */}
        {booking.status === 'accepted' && (
          <>
            <View style={{ width: '100%' }}>
              <TouchableOpacity style={[styles.largePrimaryButton]} onPress={handleStartTravel} disabled={transitioning}>
                <FontAwesome name="car" size={18} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Start Travel</ThemedText>
              </TouchableOpacity>
            </View>
            
            
            <View style={{ width: '100%', marginTop: 10 }}>
              <TouchableOpacity style={[styles.largeSecondaryButton]} onPress={handleCancelBooking} disabled={transitioning}>
                <FontAwesome name="times" size={18} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Cancel Booking</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* On the way: Start Job (primary) then Cancel Travel (secondary) — full width stacked */}
        {booking.status === 'on_the_way' && (
          <>
            <View style={{ width: '100%' }}>
              <TouchableOpacity style={[styles.largePrimaryButton]} onPress={handleStartJob} disabled={transitioning}>
                <FontAwesome name="play" size={18} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Start Job</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={{ width: '100%', marginTop: 10 }}>
              <TouchableOpacity style={[styles.largeSecondaryButton]} onPress={handleCancelTravel} disabled={transitioning}>
                <FontAwesome name="times" size={18} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Cancel Travel</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Active: Pause + Go Back (top row) and large Finish (bottom) */}
        {booking.status === 'active' && (
          <>
            <View style={{ width: '100%', flexDirection: 'row', gap: 8 }}>
              <View style={styles.actionButtonSmallWrapper}>
                <TouchableOpacity style={[styles.actionButton, styles.pauseButton]} onPress={handlePauseJob} disabled={transitioning}>
                  <FontAwesome name="pause" size={16} color="#fff" />
                  <ThemedText style={styles.actionButtonText}>Pause</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={styles.actionButtonSmallWrapper}>
                <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={handleCancelJob} disabled={transitioning}>
                  <FontAwesome name="arrow-left" size={16} color="#fff" />
                  <ThemedText style={styles.actionButtonText}>Go Back</ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.fullWidthButtonWrapper}>
              <TouchableOpacity style={[styles.finishLargeButton]} onPress={handleFinishJob} disabled={transitioning}>
                <FontAwesome name="flag-checkered" size={18} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Finish Job</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Paused: Resume + Go Back */}
        {booking.status === 'paused' && (
          <>
            <View style={styles.actionButtonWrapper}>
              <TouchableOpacity style={[styles.actionButton, styles.resumeButton]} onPress={handleResumeJob} disabled={transitioning}>
                <FontAwesome name="play" size={16} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Resume Job</ThemedText>
              </TouchableOpacity>
            </View>
            <View style={styles.actionButtonWrapper}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={async () => {
                  const ok = await confirm({
                    type: 'warning',
                    title: 'Go Back',
                    message: 'Are you sure you want to go back? This will revert the job to On the Way.',
                    confirmText: 'Go Back',
                    cancelText: 'Stay',
                  });
                  if (!ok) return;
                  setTransitioning(true);
                  try {
                    // For paused bookings, revert twice to move back to ON_THE_WAY:
                    // PAUSED -> ACTIVE, then ACTIVE -> ON_THE_WAY
                    const first = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/revert-stage/`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                    });
                    if (!first.ok) {
                      const err = await first.json().catch(() => null);
                      throw new Error(err?.error || 'Failed to revert stage');
                    }

                    // second revert
                    const second = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/revert-stage/`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                    });
                    if (!second.ok) {
                      const err = await second.json().catch(() => null);
                      throw new Error(err?.error || 'Failed to revert to on_the_way');
                    }

                    showNotification({ type: 'success', message: 'Reverted to On the Way' });
                    await fetchBookingDetail();
                  } catch (err: any) {
                    showNotification({ type: 'error', message: err.message || 'Failed to revert stage' });
                  } finally {
                    setTransitioning(false);
                  }
                }}
                disabled={transitioning}
              >
                <FontAwesome name="arrow-left" size={16} color="#fff" />
                <ThemedText style={styles.actionButtonText}>Go Back</ThemedText>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Finished: Accept payment (server) */}
        {booking.status === 'finished' && (
          <View style={styles.actionButtonWrapper}>
            <TouchableOpacity style={[styles.actionButton, styles.paymentReceivedButton]} onPress={handlePaymentReceived} disabled={transitioning}>
              <FontAwesome name="money" size={16} color="#fff" />
              <ThemedText style={styles.actionButtonText}>Payment Received</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* Pending payment: checkbox, full-width Mark as Complete, then full-width Go Back */}
        {booking.status === 'pending_payment' && (
          <View style={{ width: '100%' }}>
            <TouchableOpacity
              style={[styles.checkboxRowFull, paymentConfirmedOnUI ? styles.checkboxChecked : styles.checkboxUnchecked]}
              onPress={() => setPaymentConfirmedOnUI(prev => !prev)}
              disabled={transitioning}
            >
              <FontAwesome name={paymentConfirmedOnUI ? 'check-square' : 'square-o'} size={18} color={paymentConfirmedOnUI ? '#34C759' : '#fff'} />
              <ThemedText style={[styles.actionButtonText, { marginLeft: 12 }]}>I received payment</ThemedText>
            </TouchableOpacity>

            <View style={{ marginTop: 12 }}>
              <TouchableOpacity style={[styles.finishLargeButton, !paymentConfirmedOnUI && styles.disabledButton]} onPress={async () => {
                if (!paymentConfirmedOnUI) {
                  showNotification({ type: 'warning', title: 'Confirm Payment', message: 'Please confirm you received payment before marking complete.' });
                  return;
                }
                const ok = await confirm({
                  type: 'success',
                  title: 'Mark as Complete',
                  message: 'Are you sure you want to mark this booking as complete?',
                  confirmText: 'Mark Complete',
                  cancelText: 'Not Yet',
                });
                if (!ok) return;
                setCompleting(true);
                try {
                  const pr = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/payment-received/`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                  });
                  if (!pr.ok) {
                    const e = await pr.json().catch(() => null);
                    throw new Error(e?.error || 'Failed to confirm payment');
                  }
                  const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/complete/`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                  });
                  if (!response.ok) {
                    const err = await response.json().catch(() => null);
                    throw new Error(err?.error || 'Failed to complete booking');
                  }
                  showNotification({ type: 'success', message: 'Booking marked as complete' });
                  fetchBookingDetail();
                } catch (err: any) {
                  showNotification({ type: 'error', message: err.message || 'Failed to mark booking as complete' });
                } finally {
                  setCompleting(false);
                }
              }} disabled={completing || transitioning}>
                {completing ? <ActivityIndicator color="#fff" /> : <FontAwesome name="check" size={18} color="#fff" />}
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Mark as Complete</ThemedText>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12 }}>
              <TouchableOpacity style={[styles.finishLargeButton, styles.cancelButton]} onPress={async () => {
                const ok = await confirm({
                  type: 'warning',
                  title: 'Go Back',
                  message: 'Are you sure you want to revert to the previous stage?',
                  confirmText: 'Go Back',
                  cancelText: 'Stay',
                });
                if (!ok) return;
                setTransitioning(true);
                try {
                  const res = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/revert-stage/`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                  });
                  if (!res.ok) {
                    const err = await res.json().catch(() => null);
                    throw new Error(err?.error || 'Failed to revert stage');
                  }
                  showNotification({ type: 'success', message: 'Reverted to previous stage' });
                  fetchBookingDetail();
                } catch (err: any) {
                  showNotification({ type: 'error', message: err.message || 'Failed to revert stage' });
                } finally {
                  setTransitioning(false);
                }
              }} disabled={transitioning}>
                <FontAwesome name="arrow-left" size={18} color="#fff" />
                <ThemedText style={[styles.actionButtonText, { marginLeft: 12, fontSize: 16 }]}>Go Back</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
                <ThemedText style={styles.statusBadgeText}>{getStatusLabel(booking.status)}</ThemedText>
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
          <ThemedText style={styles.amountLarge}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>
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
            <ThemedText style={{ color: '#666' }}>Open the booking chat to message the client.</ThemedText>
          </View>
        </TouchableOpacity>

        {/* Location Section */}
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
                  <ThemedText style={styles.locationValue}>
                    {booking.service_location.street_name}
                  </ThemedText>
                </View>
                {booking.service_location.subdivision_village && (
                  <View style={styles.locationRow}>
                    <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                    <ThemedText style={styles.locationValue}>
                      {booking.service_location.subdivision_village}
                    </ThemedText>
                  </View>
                )}
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {booking.service_location.barangay}
                  </ThemedText>
                </View>
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>City</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {booking.service_location.city_municipality}
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

              {/* Navigate Button */}
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
            </>
          ) : (
            <View style={styles.noLocationCard}>
              <FontAwesome name="map-o" size={24} color="#555" />
              <ThemedText style={styles.noLocationText}>No location specified</ThemedText>
            </View>
          )}
        </View>

        {/* Booking Timeline */}
        {/* Receipt / Services (shown when pending payment) */}
        {booking.status === 'pending_payment' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="file-text-o" size={16} color="#34C759" />
              </View>
              <ThemedText style={styles.sectionTitle}>Receipt</ThemedText>
              <TouchableOpacity
                onPress={() => routerHook.push({ pathname: '/mechanic/booking/quotation_edit', params: { bookingId: String(booking.id) } })}
                style={{ marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <FontAwesome name={quotation ? 'pencil' : 'plus'} size={16} color="#007AFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.receiptList}>
              {displayQuotation && (displayQuotation.items || []).length > 0 ? (
                <>
                  {(displayQuotation.items || []).map((it: any, idx: number) => (
                    <View key={idx} style={styles.receiptRow}>
                      <ThemedText style={styles.receiptItem}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                      <ThemedText style={styles.receiptAmount}>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                    </View>
                  ))}
                  <View style={styles.receiptDivider} />
                  <View style={styles.receiptRow}> 
                    <ThemedText style={styles.receiptTotalLabel}>Total</ThemedText>
                    <ThemedText style={styles.receiptTotalValue}>₱{parseFloat(String((displayQuotation.total_amount ?? booking.amount_fee) || 0)).toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}> 
                    <ThemedText style={styles.receiptYouLabel}>You receive</ThemedText>
                    <ThemedText style={styles.receiptYouValue}>₱{parseFloat(String((displayQuotation.total_amount ?? booking.amount_fee) || 0)).toFixed(2)}</ThemedText>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>Service</ThemedText>
                    <ThemedText style={styles.receiptAmount}>{booking.request?.type ? booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1) : 'Service'}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}>
                    <ThemedText style={styles.receiptItem}>Quantity</ThemedText>
                    <ThemedText style={styles.receiptAmount}>1</ThemedText>
                  </View>
                  <View style={styles.receiptDivider} />
                  <View style={styles.receiptRow}> 
                    <ThemedText style={styles.receiptTotalLabel}>Total</ThemedText>
                    <ThemedText style={styles.receiptTotalValue}>₱{parseFloat(String(booking.amount_fee || 0)).toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.receiptRow}> 
                    <ThemedText style={styles.receiptYouLabel}>You receive</ThemedText>
                    <ThemedText style={styles.receiptYouValue}>₱{parseFloat(String(booking.amount_fee || 0)).toFixed(2)}</ThemedText>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        {/* Quotation card - visible when booking is booked/accepted */}
        {booking.status === 'accepted' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Quotation</ThemedText>
            </View>

            {displayQuotation && (displayQuotation.items || []).length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(displayQuotation.items || []).map((it: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <ThemedText style={{ flex: 1 }}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                    <ThemedText>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                  <ThemedText style={{ fontWeight: '600' }}>₱{parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}</ThemedText>
                </View>
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity style={[styles.finishLargeButton]} onPress={() => routerHook.push({ pathname: '/mechanic/booking/quotation_edit', params: { bookingId: String(booking.id) } })}>
                    <ThemedText style={[styles.actionButtonText, { color: '#fff' }]}>{quotation ? 'Edit Quotation' : 'Create Quotation'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#666' }}>No quotation yet.</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Quotation card - visible when mechanic is on the way */}
        {booking.status === 'on_the_way' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Quotation</ThemedText>
            </View>

            {displayQuotation && (displayQuotation.items || []).length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(displayQuotation.items || []).map((it: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <ThemedText style={{ flex: 1 }}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                    <ThemedText>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                  <ThemedText style={{ fontWeight: '600' }}>₱{parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}</ThemedText>
                </View>
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity style={[styles.finishLargeButton]} onPress={() => routerHook.push({ pathname: '/mechanic/booking/quotation_edit', params: { bookingId: String(booking.id) } })}>
                    <ThemedText style={[styles.actionButtonText, { color: '#fff' }]}>{quotation ? 'Edit Quotation' : 'Create Quotation'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#666' }}>No quotation yet.</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Quotation card - visible when booking is completed (read-only) */}
        {booking.status === 'completed' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Quotation</ThemedText>
            </View>

            {displayQuotation && (displayQuotation.items || []).length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(displayQuotation.items || []).map((it: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <ThemedText style={{ flex: 1 }}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                    <ThemedText>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                  <ThemedText style={{ fontWeight: '600' }}>₱{parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}</ThemedText>
                </View>
                {/* Read-only in completed status - no edit button */}
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#666' }}>No quotation available.</ThemedText>
              </View>
            )}
          </View>

        )}

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

        {/* Quotation card - visible when booking is active */}
        {booking.status === 'active' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Quotation</ThemedText>
            </View>

            {displayQuotation && (displayQuotation.items || []).length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(displayQuotation.items || []).map((it: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                    <ThemedText style={{ flex: 1 }}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                    <ThemedText>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                  </View>
                ))}
                <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                  <ThemedText style={{ fontWeight: '600' }}>₱{parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}</ThemedText>
                </View>
                <View style={{ marginTop: 10 }}>
                  <TouchableOpacity style={[styles.finishLargeButton]} onPress={() => routerHook.push({ pathname: '/mechanic/booking/quotation_edit', params: { bookingId: String(booking.id) } })}>
                    <ThemedText style={[styles.actionButtonText, { color: '#fff' }]}>{quotation ? 'Edit Quotation' : 'Create Quotation'}</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#666' }}>No quotation yet.</ThemedText>
              </View>
            )}
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
                {displayQuotation && (displayQuotation.items || []).length > 0 ? (
                  <>
                    {(displayQuotation.items || []).map((it: any, idx: number) => (
                      <View key={idx} style={styles.receiptRow}>
                        <ThemedText style={styles.receiptItem}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                        <ThemedText style={styles.receiptAmount}>₱{((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}</ThemedText>
                      </View>
                    ))}
                    <View style={styles.receiptDivider} />
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptTotalLabel}>Final Total</ThemedText>
                      <ThemedText style={styles.receiptTotalValue}>₱{parseFloat(String(displayQuotation.total_amount ?? booking.completion_details?.total_amount ?? booking.amount_fee ?? 0)).toFixed(2)}</ThemedText>
                    </View>
                    <View style={styles.receiptRow}>
                      <ThemedText style={styles.receiptYouLabel}>You receive</ThemedText>
                      <ThemedText style={styles.receiptYouValue}>₱{parseFloat(String(displayQuotation.total_amount ?? booking.completion_details?.total_amount ?? booking.amount_fee ?? 0)).toFixed(2)}</ThemedText>
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
    </ThemedView>
  );
}
