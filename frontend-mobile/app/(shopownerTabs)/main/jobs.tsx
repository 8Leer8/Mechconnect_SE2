import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { useNotification } from '@/hooks/useNotification';
import { useConfirmation } from '@/hooks/useConfirmation';
import { SkeletonBookingList } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  has_backjob?: boolean;
  backjob?: { id?: number; status?: string } | null;
  backjob_status?: string | null;
  is_backjob?: boolean;
  dispute_status?: 'none' | 'active' | 'resolved' | string;
  amount_fee: number;
  booked_at: string;
  updated_at?: string;
  completed_at?: string | null;
  request: {
    id: number;
    type: string;
    created_at: string;
    assigned_mechanics?: {
      id: number;
      role: string;
      mechanic?: { id: number; firstname?: string; lastname?: string; username?: string };
    }[];
  };
  provider?: { id: number; name: string; email: string } | null;
  service_location?: {
    street_name: string;
    subdivision_village?: string;
    barangay: string;
    city_municipality: string;
    landmark?: string | null;
  } | null;
  active_details?: {
    is_job_done: boolean;
    is_rescheduled: boolean;
    started_at?: string;
  };
  client?: {
    firstname?: string;
    lastname?: string;
    name?: string;
  };
}

interface CashRemittance {
  id: number;
  booking_id: number;
  amount: number;
  status: string;
  reminders_count: number;
  last_reminded_at?: string | null;
  created_at: string;
  booking: {
    id: number;
    amount_fee: number;
    completed_at?: string | null;
  };
  client: {
    firstname?: string;
    lastname?: string;
    username?: string;
  };
  lead_mechanic: {
    id: number;
    firstname?: string;
    lastname?: string;
    username?: string;
  };
}

type PendingRequest = {
  id: number;
  request_type: string;
  created_at: string;
  service_location?: {
    street_name?: string;
    barangay?: string;
    city_municipality?: string;
  } | null;
  client?: {
    firstname?: string;
    lastname?: string;
  } | null;
};

type HomeResponse = {
  pending_requests: PendingRequest[];
};

type TabType =
  | 'all'
  | 'pending'
  | 'booked'
  | 'assigned'
  | 'on_going'
  | 'completed'
  | 'cancelled'
  | 'reworked'
  | 'disputed'
  | 'remittance';
type RequestTabType = 'custom' | 'direct' | 'broadcast';

type GroupedResponse = {
  accepted?: { bookings: Booking[]; count: number };
  on_the_way?: { bookings: Booking[]; count: number };
  active?: { bookings: Booking[]; count: number };
  paused?: { bookings: Booking[]; count: number };
  finished?: { bookings: Booking[]; count: number };
  pending_payment?: { bookings: Booking[]; count: number };
  completed?: { bookings: Booking[]; count: number };
  cancelled?: { bookings: Booking[]; count: number };
  reworked?: { bookings: Booking[]; count: number };
  disputed?: { bookings: Booking[]; count: number };
  total_count: number;
};

type FilteredResponse = {
  status: string;
  bookings: Booking[];
  count: number;
};

// ── Assignment types ──
interface ShopMechanic {
  id: number;
  account_id: number;
  firstname: string;
  lastname: string;
  profile_photo: string | null;
  status: string;
}

interface Assignment {
  id: number;
  mechanic: { id: number; firstname: string; lastname: string; username: string };
  role: 'lead' | 'assistant';
  assigned_at: string;
}

export default function ShopOwnerJobsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const { lastMessage } = useWebSocketContext();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [declinedRequests, setDeclinedRequests] = useState<PendingRequest[]>([]);
  const [requestTab, setRequestTab] = useState<RequestTabType>('custom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cashRemittances, setCashRemittances] = useState<CashRemittance[]>([]);
  const [remittanceActionId, setRemittanceActionId] = useState<number | null>(null);

  // Assign modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignRequestId, setAssignRequestId] = useState<number | null>(null);
  const [shopMechanics, setShopMechanics] = useState<ShopMechanic[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mechanicsLoading, setMechanicsLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [acceptLoadingId, setAcceptLoadingId] = useState<number | null>(null);
  const [declineLoadingId, setDeclineLoadingId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 8;

  useEffect(() => {
    if (params.tab === 'remittance') {
      setActiveTab('remittance');
    }
  }, [params.tab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const fetchBookings = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      if (!silent) setLoading(true);
      setError(null);
      const statusQuery =
        activeTab === 'all'
          ? 'all'
          : activeTab === 'booked'
          ? 'accepted'
          : activeTab === 'assigned'
          ? 'accepted'
          : activeTab === 'on_going'
          ? 'on_going'
          : activeTab;

      const res = await fetch(
        `${API_URL}/bookings/shopowner/bookings/?status=${statusQuery}&page=${currentPage}&page_size=${pageSize}`,
        {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!res.ok) throw new Error(`Failed to fetch ${activeTab} bookings`);
      const data = (await res.json()) as any;
      const fetchedBookings = data.bookings || [];
      const filteredBookings =
        activeTab === 'booked'
          ? fetchedBookings.filter((booking: Booking) => !hasRequestAssignments(booking))
          : activeTab === 'assigned'
          ? fetchedBookings.filter((booking: Booking) => hasRequestAssignments(booking))
          : fetchedBookings;
      setBookings(filteredBookings);
      setTotalCount(
        activeTab === 'booked' || activeTab === 'assigned'
          ? filteredBookings.length
          : data.total_count || 0
      );
      setTotalPages(activeTab === 'booked' || activeTab === 'assigned' ? 1 : data.total_pages || 1);

      if (statusQuery === 'cancelled') {
        try {
          const declRes = await fetch(`${API_URL}/bookings/shopowner/requests/declined/`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (declRes.ok) {
            const declData = (await declRes.json()) as { declined_requests: PendingRequest[] };
            setDeclinedRequests(declData.declined_requests || []);
          } else {
            setDeclinedRequests([]);
          }
        } catch {
          setDeclinedRequests([]);
        }
      } else {
        setDeclinedRequests([]);
      }

      if (data.tab_counts) {
        const acceptedCount = data.tab_counts.accepted || 0;
        setCounts((prev) => {
          const assignedCount = activeTab === 'assigned' ? filteredBookings.length : prev.assigned || 0;
          return {
            all: data.total_count || 0,
            booked: Math.max(0, acceptedCount - assignedCount),
            assigned: assignedCount,
            on_going:
              (data.tab_counts.on_the_way || 0) +
              (data.tab_counts.at_location || 0) +
              (data.tab_counts.diagnosing || 0) +
              (data.tab_counts.active || 0),
            completed: data.tab_counts.completed || 0,
            cancelled: data.tab_counts.cancelled || 0,
            reworked: data.tab_counts.reworked || 0,
            disputed: data.tab_counts.disputed || 0,
          };
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, currentPage]);

  const fetchRequests = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/bookings/shopowner/requests/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = (await res.json()) as HomeResponse;
      setPendingRequests(data.pending_requests || []);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch requests');
      setPendingRequests([]);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchCashRemittances = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/bookings/shopowner/cash-remittances/?status=pending`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to fetch cash remittances');
      const data = (await res.json()) as { remittances?: CashRemittance[]; count?: number };
      const items = data.remittances || [];
      setCashRemittances(items);
      setCounts((prev) => ({ ...prev, remittance: data.count ?? items.length }));
    } catch (e: any) {
      setError(e.message || 'Failed to fetch cash remittances');
      setCashRemittances([]);
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch when a WebSocket booking update arrives (e.g., lead mechanic starts/finishes job)
  useEffect(() => {
    if (!lastMessage) return;
    const t = String(lastMessage.type || '').toLowerCase();
    if (t !== 'booking_update') return;
    if (activeTab === 'pending') fetchRequests({ silent: true });
    else if (activeTab === 'remittance') fetchCashRemittances({ silent: true });
    else fetchBookings({ silent: true });
  }, [lastMessage, activeTab, currentPage, fetchBookings, fetchRequests, fetchCashRemittances]);

  const onRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'pending') {
      fetchRequests();
    } else if (activeTab === 'remittance') {
      fetchCashRemittances();
    } else {
      fetchBookings();
    }
  };

  const fetchData = useCallback(() => {
    if (activeTab === 'pending') fetchRequests({ silent: true });
    else if (activeTab === 'remittance') fetchCashRemittances({ silent: true });
    else fetchBookings({ silent: true });
  }, [activeTab, fetchBookings, fetchRequests, fetchCashRemittances]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
      const poll = setInterval(fetchData, 20000);
      return () => clearInterval(poll);
    }, [fetchData])
  );

  useEffect(() => {
    if (activeTab === 'pending') fetchRequests();
    else if (activeTab === 'remittance') fetchCashRemittances();
    else fetchBookings();
  }, [activeTab, currentPage, fetchBookings, fetchRequests, fetchCashRemittances]);

  // ── Status helpers ──
  const getStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      booked: 'Booked',
      accepted: 'Booked',
      active: 'Active',
      on_the_way: 'On the Way',
      at_location: 'At Location',
      diagnosing: 'Diagnosing',
      paused: 'Paused',
      finished: 'Finished',
      pending_payment: 'Pending Payment',
      backjob_pending: 'Backjob Pending',
      completed: 'Completed',
      cancelled: 'Cancelled',
      reworked: 'Reworked',
      disputed: 'Disputed',
    };
    return map[s] || s.charAt(0).toUpperCase() + s.slice(1);
  };

  const getStatusColor = (s: string) => {
    const map: Record<string, string> = {
      booked: '#00B8D9',
      accepted: '#00B8D9',
      active: '#FF8C00',
      on_the_way: '#007AFF',
      at_location: '#5AC8FA',
      diagnosing: '#AF52DE',
      paused: '#8E8E93',
      finished: '#34C759',
      pending_payment: '#FFD60A',
      backjob_pending: '#FFD60A',
      completed: '#34C759',
      cancelled: '#FF3B30',
      reworked: '#FFD60A',
      disputed: '#AF52DE',
    };
    return map[s] || '#8E8E93';
  };

  const getStatusIcon = (s: string): any => {
    const map: Record<string, string> = {
      booked: 'calendar-check-o',
      accepted: 'calendar-check-o',
      active: 'play-circle',
      on_the_way: 'car',
      at_location: 'map-marker',
      diagnosing: 'search',
      paused: 'pause-circle',
      finished: 'check-circle',
      pending_payment: 'money',
      backjob_pending: 'refresh',
      completed: 'check-circle',
      cancelled: 'times-circle',
      reworked: 'refresh',
      disputed: 'exclamation-circle',
    };
    return map[s] || 'circle';
  };

  const hasRequestAssignments = (b: Booking) => {
    const am = b.request?.assigned_mechanics;
    return Array.isArray(am) && am.length > 0;
  };

  /** Shop owner jobs view: show "Assigned" once mechanics are linked. */
  const getCardStatusLabel = (b: Booking) => {
    if (isBackjobBooking(b)) {
      return 'Backjob';
    }
    if ((b.status === 'accepted' || b.status === 'booked') && hasRequestAssignments(b)) {
      return 'Assigned';
    }
    return getStatusLabel(b.status);
  };

  const getCardStatusColor = (b: Booking) => {
    if (isBackjobBooking(b)) {
      return '#FFD60A';
    }
    if ((b.status === 'accepted' || b.status === 'booked') && hasRequestAssignments(b)) {
      return '#34C759';
    }
    return getStatusColor(b.status);
  };

  const getCardStatusIcon = (b: Booking) => {
    if (isBackjobBooking(b)) {
      return 'refresh';
    }
    if ((b.status === 'accepted' || b.status === 'booked') && hasRequestAssignments(b)) {
      return 'users';
    }
    return getStatusIcon(b.status);
  };

  const getAssignedMechanicPreview = (b: Booking) => {
    const assigned = b.request?.assigned_mechanics || [];
    if (assigned.length === 0) return null;

    const firstMechanic = assigned[0]?.mechanic;
    const firstName = firstMechanic?.firstname || '';
    const lastName = firstMechanic?.lastname || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const displayName = fullName || firstMechanic?.username || 'Assigned mechanic';

    if (assigned.length === 1) return displayName;
    return `${displayName} +${assigned.length - 1} more`;
  };

  const isBackjobBooking = (b: Booking) => {
    const status = String(b.status || '').toLowerCase();
    return Boolean(
      b.has_backjob ||
      b.is_backjob ||
      b.backjob ||
      String(b.backjob_status || '').trim() ||
      status === 'backjob_pending' ||
      status === 'reworked'
    );
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatMoney = (amount: number) => `₱${Number(amount || 0).toFixed(2)}`;

  const getPersonName = (person?: { firstname?: string; lastname?: string; username?: string }) => {
    if (!person) return 'Unknown';
    const fullName = `${person.firstname || ''} ${person.lastname || ''}`.trim();
    return fullName || person.username || 'Unknown';
  };

  const getTimeSince = (d: string) => {
    const sec = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (sec < 60) return 'Just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  };

  // ── Assign Modal logic ──
  const openAssignModal = async (requestId: number) => {
    setAssignRequestId(requestId);
    setAssignModalVisible(true);
    setMechanicsLoading(true);
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
        const md = (await mechRes.json()) as any;
        setShopMechanics(md.mechanics || []);
      }
      if (assignRes.ok) {
        const ad = (await assignRes.json()) as any;
        setAssignments(Array.isArray(ad) ? (ad as Assignment[]) : []);
      }
    } catch {
      showNotification({ type: 'error', message: 'Failed to load mechanics' });
    } finally {
      setMechanicsLoading(false);
    }
  };

  const closeAssignModal = () => {
    setAssignModalVisible(false);
    setAssignRequestId(null);
    setShopMechanics([]);
    setAssignments([]);
  };

  const handleAssignMechanic = async (accountId: number, role: 'lead' | 'assistant') => {
    if (!assignRequestId) return;
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
      const res = await fetch(
        `${API_URL}/bookings/requests/${assignRequestId}/assignments/add/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mechanic_id: accountId, role }),
        }
      );
      const data = (await res.json()) as any;
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to assign' });
        return;
      }
      setAssignments((prev) => [...prev, data as Assignment]);
      const row = data as Assignment;
      setBookings((prev) =>
        prev.map((booking) => {
          if (booking.request.id !== assignRequestId) return booking;
          const am = booking.request.assigned_mechanics || [];
          if (am.some((x) => x.id === row.id)) return booking;
          return {
            ...booking,
            request: {
              ...booking.request,
              assigned_mechanics: [
                ...am,
                { id: row.id, role: row.role, mechanic: { id: row.mechanic.id } },
              ],
            },
          };
        })
      );
      await fetchBookings({ silent: true });
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    } finally {
      setAssigningId(null);
    }
  };

  const handleUnassign = async (assignmentId: number) => {
    if (!assignRequestId) return;
    const target = assignments.find((a) => a.id === assignmentId);
    if (target?.role === 'lead') {
      const leadCount = assignments.filter((a) => a.role === 'lead').length;
      if (leadCount <= 1) {
        showNotification({ type: 'error', message: 'At least one lead must remain assigned.' });
        return;
      }
    }
    try {
      const res = await fetch(
        `${API_URL}/bookings/requests/${assignRequestId}/assignments/${assignmentId}/remove/`,
        { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const d = (await res.json()) as any;
        showNotification({ type: 'error', message: d.error || 'Failed to remove' });
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      setBookings((prev) =>
        prev.map((booking) => {
          if (booking.request.id !== assignRequestId) return booking;
          const am = booking.request.assigned_mechanics;
          if (!am?.length) return booking;
          return {
            ...booking,
            request: {
              ...booking.request,
              assigned_mechanics: am.filter((x) => x.id !== assignmentId),
            },
          };
        })
      );
      await fetchBookings({ silent: true });
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    }
  };

  const assignedIds = new Set(assignments.map((a) => a.mechanic.id));
  const availableMechanics = shopMechanics.filter((m) => !assignedIds.has(m.account_id));

  // ── Pending Requests helpers (same backend as old Requests screen) ──
  const customRequests = pendingRequests.filter((r) => r.request_type === 'custom');
  const directRequests = pendingRequests.filter((r) => r.request_type === 'direct');
  const broadcastRequests = pendingRequests.filter(
    (r) => r.request_type === 'broadcast' || r.request_type === 'emergency'
  );

  const listToShow =
    requestTab === 'custom'
      ? customRequests
      : requestTab === 'direct'
      ? directRequests
      : broadcastRequests;

  const handleAccept = async (r: PendingRequest) => {
    const endpoint =
      r.request_type === 'direct'
        ? `${API_URL}/bookings/shopowner/requests/${r.id}/accept/`
        : `${API_URL}/bookings/shopowner/requests/${r.id}/accept-custom/`;

    setAcceptLoadingId(r.id);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        if (data?.error === 'Request is not pending') {
          // Backend says this request was already processed; remove it from the list
          setPendingRequests((prev) => prev.filter((p) => p.id !== r.id));
          showNotification({
            type: 'info',
            message: 'This request was already processed and is no longer pending.',
          });
        } else if (data?.reason === 'shop_unavailable') {
          showNotification({
            type: 'warning',
            message: data?.error || 'Your shop is unavailable. Switch to accept bookings.',
          });
        } else {
          showNotification({ type: 'error', message: data.error || 'Failed to accept request' });
        }
        return;
      }
      setPendingRequests((prev) => prev.filter((p) => p.id !== r.id));
      // After accepting, move job to Accepted tab and refresh bookings there
      showNotification({ type: 'success', message: data.message || 'Request accepted' });
      setActiveTab('booked');
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    } finally {
      setAcceptLoadingId(null);
    }
  };

  const handleDecline = async (r: PendingRequest) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Decline Request',
      message: 'Are you sure you want to decline this request?',
      confirmText: 'Decline',
      cancelText: 'Cancel',
    });
    if (!ok) return;
    const endpoint =
      r.request_type === 'direct'
        ? `${API_URL}/bookings/shopowner/requests/${r.id}/decline/`
        : `${API_URL}/bookings/shopowner/requests/${r.id}/decline-custom/`;

    setDeclineLoadingId(r.id);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as any;
      if (!res.ok) {
        if (data?.error === 'Request is not pending') {
          // Backend says this request was already processed; remove it from the list
          setPendingRequests((prev) => prev.filter((p) => p.id !== r.id));
          showNotification({
            type: 'info',
            message: 'This request was already processed and is no longer pending.',
          });
        } else {
          showNotification({ type: 'error', message: data.error || 'Failed to decline request' });
        }
        return;
      }
      showNotification({ type: 'info', message: data.message || 'Request declined' });
      setPendingRequests((prev) => prev.filter((p) => p.id !== r.id));
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    } finally {
      setDeclineLoadingId(null);
    }
  };

  const handleMarkRemittanceReceived = async (item: CashRemittance) => {
    const ok = await confirm({
      type: 'success',
      title: 'Mark Cash Received',
      message: `Confirm that ${getPersonName(item.lead_mechanic)} surrendered ${formatMoney(item.amount)}?`,
      confirmText: 'Received',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    setRemittanceActionId(item.id);
    try {
      const res = await fetch(`${API_URL}/bookings/shopowner/cash-remittances/${item.id}/received/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to update remittance' });
        return;
      }
      showNotification({ type: 'success', message: data.message || 'Cash remittance received.' });
      fetchCashRemittances({ silent: true });
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    } finally {
      setRemittanceActionId(null);
    }
  };

  const handleRemindRemittance = async (item: CashRemittance) => {
    const ok = await confirm({
      type: 'warning',
      title: 'Send Remittance Reminder',
      message: `Remind ${getPersonName(item.lead_mechanic)} to remit ${formatMoney(item.amount)} for booking #${item.booking_id}?`,
      confirmText: 'Send Reminder',
      cancelText: 'Cancel',
    });
    if (!ok) return;

    setRemittanceActionId(item.id);
    try {
      const res = await fetch(`${API_URL}/bookings/shopowner/cash-remittances/${item.id}/remind/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to send reminder' });
        return;
      }
      showNotification({ type: 'success', message: data.message || 'Reminder sent.' });
      fetchCashRemittances({ silent: true });
    } catch {
      showNotification({ type: 'error', message: 'Network error' });
    } finally {
      setRemittanceActionId(null);
    }
  };

  // ── Tab bar ──
  const tabConfig: { key: TabType; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'th-list' },
    { key: 'pending', label: 'Pending', icon: 'envelope' },
    { key: 'remittance', label: 'Remit', icon: 'handshake-o' },
    { key: 'booked', label: 'Booked', icon: 'calendar-check-o' },
    { key: 'assigned', label: 'Assigned', icon: 'users' },
    { key: 'on_going', label: 'On Going', icon: 'play-circle' },
    { key: 'completed', label: 'Completed', icon: 'check-circle' },
    { key: 'cancelled', label: 'Cancelled', icon: 'times-circle' },
    { key: 'reworked', label: 'Reworked', icon: 'refresh' },
    { key: 'disputed', label: 'Disputed', icon: 'exclamation-circle' },
  ];

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Jobs</ThemedText>
          <ThemedText style={styles.headerSub}>
            {activeTab === 'pending'
              ? `${listToShow.length} pending request${listToShow.length !== 1 ? 's' : ''}`
              : activeTab === 'remittance'
              ? `${cashRemittances.length} cash remittance${cashRemittances.length !== 1 ? 's' : ''}`
              : `${bookings.length} ${activeTab === 'all' ? 'total' : activeTab} job${
                  bookings.length !== 1 ? 's' : ''
                }`}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.7}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* Tabs container */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
          style={styles.tabBar}
        >
          {tabConfig.map((t) => {
            const active = activeTab === t.key;
            const c =
              t.key === 'pending'
                ? pendingRequests.length
                : t.key === 'remittance'
                ? cashRemittances.length
                : (counts[t.key] || 0);
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(t.key)}
              >
                <FontAwesome
                  name={t.icon as any}
                  size={13}
                  color={active ? '#fff' : '#888'}
                  style={{ marginRight: 5 }}
                />
                <ThemedText style={[styles.tabText, active && styles.tabTextActive]}>
                  {`${t.label} ${c}`}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content container */}
      <View style={styles.listWrapper}>
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9500" />
          }
        >
        {loading && !refreshing ? (
          <SkeletonBookingList />
        ) : error ? (
          <View style={styles.center}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                if (activeTab === 'remittance') fetchCashRemittances();
                else fetchBookings();
              }}
            >
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : activeTab === 'remittance' ? (
          cashRemittances.length === 0 ? (
            <View style={styles.center}>
              <View style={styles.emptyCircle}>
                <FontAwesome name="check-circle" size={40} color="#555" />
              </View>
              <ThemedText style={styles.emptyText}>No pending cash remittances</ThemedText>
              <ThemedText style={styles.emptySub}>Cash shop shares will appear here after completed cash jobs.</ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {cashRemittances.map((item) => (
                <View key={item.id} style={styles.remittanceCard}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardTopLeft}>
                      <View style={[styles.statusDot, { backgroundColor: '#FF950025' }]}>
                        <FontAwesome name="handshake-o" size={15} color="#FF9500" />
                      </View>
                      <View>
                        <View style={styles.statusRow}>
                          <View style={[styles.statusBadge, { backgroundColor: '#FF9500' }]}>
                            <ThemedText style={styles.statusLabel}>CASH REMITTANCE</ThemedText>
                          </View>
                          <ThemedText style={styles.bookingId}>#{item.booking_id}</ThemedText>
                        </View>
                        <ThemedText style={styles.reqType}>Lead: {getPersonName(item.lead_mechanic)}</ThemedText>
                      </View>
                    </View>
                    <ThemedText style={styles.timeAgo}>{getTimeSince(item.created_at)}</ThemedText>
                  </View>

                  <View style={styles.remittanceAmountBox}>
                    <ThemedText style={styles.remittanceAmountLabel}>Shop cash share to collect</ThemedText>
                    <ThemedText style={styles.remittanceAmount}>{formatMoney(item.amount)}</ThemedText>
                  </View>

                  <View style={styles.infoSection}>
                    <View style={styles.infoRow}>
                      <FontAwesome name="user" size={13} color="#888" />
                      <ThemedText style={styles.infoText} numberOfLines={1}>
                        Client: {getPersonName(item.client)}
                      </ThemedText>
                    </View>
                    <View style={styles.infoRow}>
                      <FontAwesome name="money" size={13} color="#888" />
                      <ThemedText style={styles.infoText}>
                        Job total: {formatMoney(item.booking.amount_fee)}
                      </ThemedText>
                    </View>
                    <View style={styles.infoRow}>
                      <FontAwesome name="bell" size={13} color="#888" />
                      <ThemedText style={styles.infoText}>
                        Reminders sent: {item.reminders_count}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <TouchableOpacity
                      style={styles.detailsPillBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/shopowner/booking/booking_details',
                          params: { bookingId: String(item.booking_id) },
                        })
                      }
                    >
                      <ThemedText style={styles.detailsPillBtnText}>Details</ThemedText>
                      <FontAwesome name="chevron-right" size={10} color="#FF8C00" />
                    </TouchableOpacity>
                    <View style={styles.footerActions}>
                      <TouchableOpacity
                        style={[styles.assignBtn, { backgroundColor: '#242424' }]}
                        onPress={() => handleRemindRemittance(item)}
                        disabled={remittanceActionId === item.id}
                      >
                        <ThemedText style={styles.assignBtnText}>Remind</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.assignPrimaryBtn}
                        onPress={() => handleMarkRemittanceReceived(item)}
                        disabled={remittanceActionId === item.id}
                      >
                        {remittanceActionId === item.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <FontAwesome name="check" size={11} color="#fff" />
                            <ThemedText style={styles.assignPrimaryBtnText}>Received</ThemedText>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )
        ) : activeTab === 'pending' ? (
          <>
            {/* Inner tabs for Requests: Custom / Direct / Broadcast */}
            <View style={styles.requestTabsWrapper}>
              <View style={styles.requestTabsRow}>
                {(['custom', 'direct', 'broadcast'] as RequestTabType[]).map((tab) => {
                  const active = requestTab === tab;
                  const labelBase =
                    tab === 'custom' ? 'Custom' : tab === 'direct' ? 'Direct' : 'Broadcast';
                  const tabCount =
                    tab === 'custom'
                      ? customRequests.length
                      : tab === 'direct'
                      ? directRequests.length
                      : broadcastRequests.length;
                  const label = `${labelBase} ${tabCount}`;
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.requestTab,
                        active && styles.requestTabActive,
                      ]}
                      onPress={() => setRequestTab(tab)}
                    >
                      <ThemedText
                        style={[
                          styles.requestTabText,
                          active && styles.requestTabTextActive,
                        ]}
                      >
                        {label}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {listToShow.length === 0 ? (
              <View style={styles.center}>
                <IconSymbol name="tray.fill" size={52} color="#888" />
                <ThemedText style={styles.emptyText}>
                  {requestTab === 'custom'
                    ? 'No custom requests'
                    : requestTab === 'direct'
                    ? 'No direct requests'
                    : 'No broadcast requests'}
                </ThemedText>
              </View>
            ) : (
              <View style={styles.list}>
                {listToShow.map((r) => (
                  <View key={r.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardTopLeft}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: '#FF950015' },
                          ]}
                        >
                          <IconSymbol
                            name="envelope.fill"
                            size={16}
                            color="#FF9500"
                          />
                        </View>
                        <View>
                          <View style={styles.statusRow}>
                            <View
                              style={[
                                styles.statusBadge,
                                { backgroundColor: '#FF9500' },
                              ]}
                            >
                              <ThemedText style={styles.statusLabel}>
                                {(r.request_type || 'request').toUpperCase()}
                              </ThemedText>
                            </View>
                          </View>
                          <ThemedText style={styles.reqType}>
                            {new Date(r.created_at).toLocaleDateString()}
                          </ThemedText>
                        </View>
                      </View>
                    </View>

                    <View style={styles.infoSection}>
                      <View style={styles.infoRow}>
                        <FontAwesome name="user" size={13} color="#888" />
                        <ThemedText style={styles.infoText} numberOfLines={1}>
                          {r.client
                            ? `${r.client.firstname || ''} ${r.client.lastname || ''}`.trim() ||
                              'Client'
                            : 'Client'}
                        </ThemedText>
                      </View>
                      <View style={styles.infoRow}>
                        <FontAwesome name="map-marker" size={14} color="#888" />
                        <ThemedText style={styles.infoText} numberOfLines={1}>
                          {r.service_location
                            ? `${r.service_location.barangay || ''} ${
                                r.service_location.city_municipality
                                  ? `, ${r.service_location.city_municipality}`
                                  : ''
                              }`.trim() || 'Location'
                            : 'Location'}
                        </ThemedText>
                      </View>
                    </View>

                    <View style={styles.pendingRequestFooter}>
                      <View style={styles.footerActions}>
                        <TouchableOpacity
                          style={[styles.assignBtn, { backgroundColor: '#2A2A2A' }]}
                          onPress={() => handleDecline(r)}
                          disabled={declineLoadingId === r.id || acceptLoadingId === r.id}
                        >
                          {declineLoadingId === r.id ? (
                            <ActivityIndicator size="small" color="#FF3B30" />
                          ) : (
                            <ThemedText
                              style={[
                                styles.assignBtnText,
                                { color: '#FF3B30' },
                              ]}
                            >
                              Decline
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.assignBtn}
                          onPress={() => handleAccept(r)}
                          disabled={acceptLoadingId === r.id || declineLoadingId === r.id}
                        >
                          {acceptLoadingId === r.id ? (
                            <ActivityIndicator size="small" color="#FF9500" />
                          ) : (
                            <ThemedText style={styles.assignBtnText}>
                              Accept
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.assignBtn, { backgroundColor: '#FF8C0015' }]}
                        onPress={() =>
                          router.push({
                            pathname: '/shopowner/request_details',
                            params: { requestId: String(r.id) },
                          })
                        }
                        activeOpacity={0.7}
                      >
                        <ThemedText style={[styles.assignBtnText, { color: '#FF8C00' }]}>Details</ThemedText>
                        <FontAwesome name="chevron-right" size={11} color="#FF8C00" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : activeTab === 'cancelled' ? (
          declinedRequests.length === 0 && bookings.length === 0 ? (
            <View style={styles.center}>
              <View style={styles.emptyCircle}>
                <FontAwesome name="inbox" size={40} color="#555" />
              </View>
              <ThemedText style={styles.emptyText}>No cancelled jobs or declined requests</ThemedText>
              <ThemedText style={styles.emptySub}>Declined requests and cancelled jobs will appear here</ThemedText>
            </View>
          ) : (
          <View style={styles.list}>
            {declinedRequests.map((r) => (
              <View key={`declined-${r.id}`} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusDot, { backgroundColor: '#FF3B3025' }]}>
                      <FontAwesome name="times-circle" size={16} color="#FF3B30" />
                    </View>
                    <View>
                      <View style={[styles.statusBadge, { backgroundColor: '#FF3B30' }]}>
                        <ThemedText style={styles.statusLabel}>DECLINED</ThemedText>
                      </View>
                      <ThemedText style={styles.reqType}>
                        {(r.request_type || 'request').toUpperCase()} · {new Date(r.created_at).toLocaleDateString()}
                      </ThemedText>
                    </View>
                  </View>
                </View>
                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <FontAwesome name="user" size={13} color="#888" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {r.client
                        ? `${r.client.firstname || ''} ${r.client.lastname || ''}`.trim() || 'Client'
                        : 'Client'}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={14} color="#888" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {r.service_location
                        ? `${r.service_location.barangay || ''} ${r.service_location.city_municipality ? `, ${r.service_location.city_municipality}` : ''}`.trim() || 'Location'
                        : 'Location'}
                    </ThemedText>
                  </View>
                </View>
              </View>
            ))}
            {bookings.map((b) => (
              <View key={b.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusDot, { backgroundColor: getCardStatusColor(b) + '25' }]}>
                      <FontAwesome name={getCardStatusIcon(b)} size={15} color={getCardStatusColor(b)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getCardStatusColor(b) }]}>
                          <ThemedText style={styles.statusLabel}>{getCardStatusLabel(b)}</ThemedText>
                        </View>
                        <ThemedText style={styles.bookingId}>#{b.id}</ThemedText>
                      </View>
                      <ThemedText style={styles.reqType}>
                        {b.request.type
                          ? b.request.type.charAt(0).toUpperCase() + b.request.type.slice(1) + ' Service'
                          : 'Service Request'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.timeAgo}>{getTimeSince(b.booked_at)}</ThemedText>
                </View>
                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <FontAwesome name="user" size={13} color="#888" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {b.client
                        ? `${b.client.firstname || ''} ${b.client.lastname || ''}`.trim() || b.client.name || 'Client'
                        : 'Client'}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={14} color="#888" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {b.service_location
                        ? `${b.service_location.street_name || ''}, ${b.service_location.barangay || ''}`
                        : 'No location'}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="calendar-o" size={13} color="#888" />
                    <ThemedText style={styles.infoText}>{formatDate(b.booked_at)}</ThemedText>
                  </View>
                  {hasRequestAssignments(b) ? (
                    <View style={styles.infoRow}>
                      <FontAwesome name="users" size={13} color="#888" />
                      <ThemedText style={styles.infoText} numberOfLines={1}>
                        {getAssignedMechanicPreview(b)}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>
                    ₱{parseFloat(String(b.amount_fee || '0')).toFixed(2)}
                  </ThemedText>
                  <View style={styles.footerActions}>
                    <TouchableOpacity
                      style={styles.detailsPillBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/shopowner/booking/booking_details',
                          params: { bookingId: b.id.toString() },
                        })
                      }
                    >
                      <ThemedText style={styles.detailsPillBtnText}>Details</ThemedText>
                      <FontAwesome name="chevron-right" size={10} color="#FF8C00" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </View>
          )
        ) : bookings.length === 0 ? (
          <View style={styles.center}>
            <View style={styles.emptyCircle}>
              <FontAwesome name="inbox" size={40} color="#555" />
            </View>
            <ThemedText style={styles.emptyText}>
              No {activeTab === 'all' ? '' : activeTab + ' '}jobs
            </ThemedText>
            <ThemedText style={styles.emptySub}>Accepted requests will appear here</ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {bookings.map((b) => (
              <View key={b.id} style={styles.card}>
                {activeTab === 'completed' && String(b.dispute_status || 'none').toLowerCase() === 'active' ? (
                  <View style={styles.disputeBanner}>
                    <FontAwesome name="warning" size={13} color="#FF3B30" />
                    <ThemedText style={styles.disputeBannerText}>
                      Active Dispute: Account functions limited until resolved.
                    </ThemedText>
                  </View>
                ) : null}
                {/* Top row */}
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusDot, { backgroundColor: getCardStatusColor(b) + '25' }]}>
                      <FontAwesome name={getCardStatusIcon(b)} size={15} color={getCardStatusColor(b)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getCardStatusColor(b) }]}>
                          <ThemedText style={styles.statusLabel}>{getCardStatusLabel(b)}</ThemedText>
                        </View>
                        <ThemedText style={styles.bookingId}>#{b.id}</ThemedText>
                      </View>
                      <ThemedText style={styles.reqType}>
                        {b.request.type
                          ? b.request.type.charAt(0).toUpperCase() + b.request.type.slice(1) + ' Service'
                          : 'Service Request'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.timeAgo}>{getTimeSince(b.booked_at)}</ThemedText>
                </View>

                {/* Info */}
                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <FontAwesome name="user" size={13} color="#888" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {b.client
                        ? `${b.client.firstname || ''} ${b.client.lastname || ''}`.trim() || b.client.name || 'Client'
                        : 'Client'}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={14} color="#888" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {b.service_location
                        ? `${b.service_location.street_name || ''}, ${b.service_location.barangay || ''}`
                        : 'No location'}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="calendar-o" size={13} color="#888" />
                    <ThemedText style={styles.infoText}>{formatDate(b.booked_at)}</ThemedText>
                  </View>
                  {hasRequestAssignments(b) ? (
                    <View style={styles.infoRow}>
                      <FontAwesome name="users" size={13} color="#888" />
                      <ThemedText style={styles.infoText} numberOfLines={1}>
                        {getAssignedMechanicPreview(b)}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>
                    ₱{parseFloat(String(b.amount_fee || '0')).toFixed(2)}
                  </ThemedText>

                  <View style={styles.footerActions}>
                    <TouchableOpacity
                      style={styles.detailsPillBtn}
                      onPress={() =>
                        router.push({
                          pathname: '/shopowner/booking/booking_details',
                          params: { bookingId: b.id.toString() },
                        })
                      }
                    >
                      <ThemedText style={styles.detailsPillBtnText}>Details</ThemedText>
                      <FontAwesome name="chevron-right" size={10} color="#FF8C00" />
                    </TouchableOpacity>

                    {b.status === 'accepted' ? (
                      <TouchableOpacity
                        style={styles.assignPrimaryBtn}
                        onPress={() => openAssignModal(b.request.id)}
                      >
                        <FontAwesome name="users" size={11} color="#fff" />
                        <ThemedText style={styles.assignPrimaryBtnText}>
                          {hasRequestAssignments(b) ? 'Reassign' : 'Assign'}
                        </ThemedText>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {activeTab !== 'pending' && activeTab !== 'remittance' && !loading && !error && totalPages > 1 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <TouchableOpacity
              style={[styles.assignBtn, currentPage <= 1 ? { opacity: 0.45 } : null]}
              onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ThemedText style={styles.assignBtnText}>Prev</ThemedText>
            </TouchableOpacity>
            <ThemedText style={{ color: '#A0A0A0', fontSize: 12 }}>
              Page {currentPage} of {totalPages} ({totalCount})
            </ThemedText>
            <TouchableOpacity
              style={[styles.assignBtn, currentPage >= totalPages ? { opacity: 0.45 } : null]}
              onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              <ThemedText style={styles.assignBtnText}>Next</ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>

      {/* ── Assign Mechanics Modal ── */}
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
              <TouchableOpacity onPress={closeAssignModal}>
                <FontAwesome name="times-circle" size={22} color="#888" />
              </TouchableOpacity>
            </View>

            {mechanicsLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FF9500" />
              </View>
            ) : (
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
            )}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151718' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF8C0018',
    borderWidth: 1,
    borderColor: '#FF8C0028',
  },

  // Tabs (All / Requests / Accepted / ...)
  tabsContainer: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
  },
  tabBar: { maxHeight: 52 },
  tabScroll: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: '#FF9500',
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#fff' },
  tabBadge: {
    marginLeft: 6,
    backgroundColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Inner request tabs (Custom / Direct / Broadcast)
  requestTabsWrapper: {
    marginTop: 16,
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  requestTabsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
  },
  requestTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1E1E1E',
  },
  requestTabActive: {
    backgroundColor: '#FF9500',
  },
  requestTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
  },
  requestTabTextActive: {
    color: '#fff',
  },

  // List
  listWrapper: {
    flex: 1,
    paddingTop: 4,
  },
  listContent: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 30 },
  list: { gap: 12 },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  emptyCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyText: { fontSize: 16, color: '#aaa', fontWeight: '600' },
  emptySub: { fontSize: 13, color: '#666' },
  errorText: { color: '#FF3B30', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  retryText: { color: '#fff', fontWeight: '700' },

  // Card
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  remittanceCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF950035',
  },
  disputeBanner: {
    borderWidth: 1,
    borderColor: '#FF3B3060',
    backgroundColor: '#FF3B3018',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disputeBannerText: {
    color: '#FFD6D2',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusLabel: { fontSize: 11, fontWeight: '700', color: '#fff' },
  bookingId: { fontSize: 12, color: '#888' },
  reqType: { fontSize: 12, color: '#aaa', marginTop: 2 },
  timeAgo: { fontSize: 11, color: '#666' },

  infoSection: { marginTop: 12, gap: 6, paddingLeft: 46 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 13, color: '#ccc', flex: 1 },
  remittanceAmountBox: {
    marginTop: 14,
    marginLeft: 46,
    backgroundColor: '#FF950014',
    borderWidth: 1,
    borderColor: '#FF950030',
    borderRadius: 12,
    padding: 12,
  },
  remittanceAmountLabel: {
    color: '#FFB45C',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  remittanceAmount: {
    color: '#FF9500',
    fontSize: 24,
    fontWeight: '800',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  /** Pending request row: Decline / Accept left, Details bottom-right */
  pendingRequestFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    gap: 8,
  },
  amount: { fontSize: 18, fontWeight: '700', color: '#FF9500' },
  footerActions: { flexDirection: 'row', gap: 8 },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF950020',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  assignBtnText: { fontSize: 13, fontWeight: '700', color: '#FF9500' },
  detailsPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C0015',
    borderWidth: 1,
    borderColor: '#FF8C0030',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  detailsPillBtnText: { fontSize: 12, fontWeight: '700', color: '#FF8C00' },
  assignPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  assignPrimaryBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  modalBody: { paddingHorizontal: 20, paddingTop: 12 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  mechRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  mechInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  mechName: { fontSize: 14, color: '#fff', fontWeight: '600' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleLead: { backgroundColor: '#FF950030' },
  roleAssist: { backgroundColor: '#34C75930' },
  roleText: { fontSize: 11, fontWeight: '700', color: '#FF9500' },
  assignActions: { flexDirection: 'row', gap: 6 },
  leadBtn: { backgroundColor: '#FF9500', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  assistBtn: { backgroundColor: '#34C759', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  doneBtn: {
    backgroundColor: '#FF9500',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
