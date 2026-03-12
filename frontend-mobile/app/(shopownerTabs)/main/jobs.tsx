import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopNav } from '@/components/navigation';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at?: string;
  completed_at?: string | null;
  request: {
    id: number;
    type: string;
    created_at: string;
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

type TabType = 'all' | 'requests' | 'accepted' | 'on_going' | 'completed' | 'cancelled';
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
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [declinedRequests, setDeclinedRequests] = useState<PendingRequest[]>([]);
  const [requestTab, setRequestTab] = useState<RequestTabType>('custom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Assign modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignRequestId, setAssignRequestId] = useState<number | null>(null);
  const [shopMechanics, setShopMechanics] = useState<ShopMechanic[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mechanicsLoading, setMechanicsLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchRequests();
    } else {
      fetchBookings();
    }
  }, [activeTab]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'all') {
        const res = await fetch(`${API_URL}/bookings/shopowner/bookings/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error('Failed to fetch bookings');
        const data = (await res.json()) as GroupedResponse;

        const rawAll: Booking[] = [
          ...(data.accepted?.bookings || []),
          ...(data.on_the_way?.bookings || []),
          ...(data.active?.bookings || []),
          ...(data.paused?.bookings || []),
          ...(data.finished?.bookings || []),
          ...(data.pending_payment?.bookings || []),
          ...(data.completed?.bookings || []),
          ...(data.cancelled?.bookings || []),
          ...(data.reworked?.bookings || []),
          ...(data.disputed?.bookings || []),
        ];
        const seen = new Set<number>();
        const all = rawAll.filter((b) => {
          if (seen.has(b.id)) return false;
          seen.add(b.id);
          return true;
        });
        setBookings(all);
        setCounts({
          all: data.total_count || all.length,
          accepted: (data.accepted?.count || 0),
          on_going:
            (data.on_the_way?.count || 0) +
            (data.active?.count || 0) +
            (data.paused?.count || 0),
          completed: (data.completed?.count || 0),
          cancelled: (data.cancelled?.count || 0),
        });
      } else if (activeTab === 'on_going') {
        const [r1, r2] = await Promise.all([
          fetch(`${API_URL}/bookings/shopowner/bookings/?status=on_the_way`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`${API_URL}/bookings/shopowner/bookings/?status=active`, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }),
        ]);
        if (!r1.ok || !r2.ok) throw new Error('Failed to fetch on-going bookings');
        const d1 = (await r1.json()) as FilteredResponse;
        const d2 = (await r2.json()) as FilteredResponse;
        const merged = [...(d1.bookings || [])];
        const ids = new Set(merged.map((b) => b.id));
        (d2.bookings || []).forEach((b) => {
          if (!ids.has(b.id)) merged.push(b);
        });
        setBookings(merged);
      } else {
        const statusQuery = activeTab;
        const res = await fetch(
          `${API_URL}/bookings/shopowner/bookings/?status=${statusQuery}`,
          {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        if (!res.ok) throw new Error(`Failed to fetch ${activeTab} bookings`);
        const data = (await res.json()) as FilteredResponse;
        setBookings(data.bookings || []);

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
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
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
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (activeTab === 'requests') {
      fetchRequests();
    } else {
      fetchBookings();
    }
  };

  // ── Status helpers ──
  const getStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      accepted: 'Accepted',
      active: 'Active',
      on_the_way: 'On the Way',
      paused: 'Paused',
      finished: 'Finished',
      pending_payment: 'Pending Payment',
      completed: 'Completed',
      cancelled: 'Cancelled',
      reworked: 'Reworked',
      disputed: 'Disputed',
    };
    return map[s] || s.charAt(0).toUpperCase() + s.slice(1);
  };

  const getStatusColor = (s: string) => {
    const map: Record<string, string> = {
      accepted: '#00B8D9',
      active: '#FF8C00',
      on_the_way: '#007AFF',
      paused: '#8E8E93',
      finished: '#34C759',
      pending_payment: '#FFD60A',
      completed: '#34C759',
      cancelled: '#FF3B30',
      reworked: '#FFD60A',
      disputed: '#AF52DE',
    };
    return map[s] || '#8E8E93';
  };

  const getStatusIcon = (s: string): any => {
    const map: Record<string, string> = {
      accepted: 'calendar-check-o',
      active: 'play-circle',
      on_the_way: 'car',
      paused: 'pause-circle',
      finished: 'check-circle',
      pending_payment: 'money',
      completed: 'check-circle',
      cancelled: 'times-circle',
      reworked: 'refresh',
      disputed: 'exclamation-circle',
    };
    return map[s] || 'circle';
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
        const md = await mechRes.json();
        setShopMechanics(md.mechanics || []);
      }
      if (assignRes.ok) {
        const ad = await assignRes.json();
        setAssignments(ad || []);
      }
    } catch {
      Alert.alert('Error', 'Failed to load mechanics');
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
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to assign');
        return;
      }
      setAssignments((prev) => [...prev, data as Assignment]);
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setAssigningId(null);
    }
  };

  const handleUnassign = async (assignmentId: number) => {
    if (!assignRequestId) return;
    try {
      const res = await fetch(
        `${API_URL}/bookings/requests/${assignRequestId}/assignments/${assignmentId}/remove/`,
        { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' } }
      );
      if (!res.ok) {
        const d = await res.json();
        Alert.alert('Error', d.error || 'Failed to remove');
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch {
      Alert.alert('Error', 'Network error');
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

    setActionLoading(r.id);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to accept request');
        return;
      }
      setPendingRequests((prev) => prev.filter((p) => p.id !== r.id));
      Alert.alert('Success', data.message || 'Request accepted');
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = (r: PendingRequest) => {
    Alert.alert('Decline Request', 'Are you sure you want to decline this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const endpoint =
            r.request_type === 'direct'
              ? `${API_URL}/bookings/shopowner/requests/${r.id}/decline/`
              : `${API_URL}/bookings/shopowner/requests/${r.id}/decline-custom/`;

          setActionLoading(r.id);
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) {
              Alert.alert('Error', data.error || 'Failed to decline request');
              return;
            }
            Alert.alert('Declined', data.message || 'Request declined');
            setPendingRequests((prev) => prev.filter((p) => p.id !== r.id));
          } catch {
            Alert.alert('Error', 'Network error');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  // ── Tab bar ──
  const tabConfig: { key: TabType; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'th-list' },
    { key: 'requests', label: 'Requests', icon: 'envelope' },
    { key: 'accepted', label: 'Accepted', icon: 'calendar-check-o' },
    { key: 'on_going', label: 'On Going', icon: 'play-circle' },
    { key: 'completed', label: 'Completed', icon: 'check-circle' },
    { key: 'cancelled', label: 'Cancelled', icon: 'times-circle' },
  ];

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={() => {}} />

      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Jobs</ThemedText>
        <ThemedText style={styles.headerSub}>
          {activeTab === 'requests'
            ? `${listToShow.length} pending request${listToShow.length !== 1 ? 's' : ''}`
            : `${bookings.length} ${activeTab === 'all' ? 'total' : activeTab} job${
                bookings.length !== 1 ? 's' : ''
              }`}
        </ThemedText>
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
            const c = counts[t.key] || 0;
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
                  {t.label}
                </ThemedText>
                {c > 0 && activeTab === 'all' && (
                  <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                    <ThemedText style={styles.tabBadgeText}>{c}</ThemedText>
                  </View>
                )}
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
          <ActivityIndicator size="large" color="#FF9500" style={{ marginTop: 60 }} />
        ) : error ? (
          <View style={styles.center}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchBookings}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : activeTab === 'requests' ? (
          <>
            {/* Inner tabs for Requests: Custom / Direct / Broadcast */}
            <View style={styles.requestTabsWrapper}>
              <View style={styles.requestTabsRow}>
                {(['custom', 'direct', 'broadcast'] as RequestTabType[]).map((tab) => {
                  const active = requestTab === tab;
                  const label =
                    tab === 'custom' ? 'Custom' : tab === 'direct' ? 'Direct' : 'Broadcast';
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

                    <View style={styles.cardFooter}>
                      <View style={styles.footerActions}>
                        <TouchableOpacity
                          style={[styles.assignBtn, { backgroundColor: '#2A2A2A' }]}
                          onPress={() => handleDecline(r)}
                          disabled={actionLoading === r.id}
                        >
                          <ThemedText
                            style={[
                              styles.assignBtnText,
                              { color: '#FF3B30' },
                            ]}
                          >
                            Decline
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.assignBtn}
                          onPress={() => handleAccept(r)}
                          disabled={actionLoading === r.id}
                        >
                          {actionLoading === r.id ? (
                            <ActivityIndicator size="small" color="#FF9500" />
                          ) : (
                            <ThemedText style={styles.assignBtnText}>
                              Accept
                            </ThemedText>
                          )}
                        </TouchableOpacity>
                      </View>
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
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(b.status) + '25' }]}>
                      <FontAwesome name={getStatusIcon(b.status)} size={15} color={getStatusColor(b.status)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(b.status) }]}>
                          <ThemedText style={styles.statusLabel}>{getStatusLabel(b.status)}</ThemedText>
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
                </View>
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>
                    ₱{parseFloat(String(b.amount_fee || '0')).toFixed(2)}
                  </ThemedText>
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
                {/* Top row */}
                <View style={styles.cardTop}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusDot, { backgroundColor: getStatusColor(b.status) + '25' }]}>
                      <FontAwesome name={getStatusIcon(b.status)} size={15} color={getStatusColor(b.status)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(b.status) }]}>
                          <ThemedText style={styles.statusLabel}>{getStatusLabel(b.status)}</ThemedText>
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
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>
                    ₱{parseFloat(String(b.amount_fee || '0')).toFixed(2)}
                  </ThemedText>

                  <View style={styles.footerActions}>
                    {activeTab === 'on_going' ? (
                      <>
                        <TouchableOpacity
                          style={[styles.assignBtn, { backgroundColor: '#2A2A2A' }]}
                          onPress={() =>
                            router.push({
                              pathname: '/shopowner/booking/booking_details',
                              params: { bookingId: b.id.toString() },
                            })
                          }
                        >
                          <ThemedText
                            style={[
                              styles.assignBtnText,
                              { color: '#FFFFFF' },
                            ]}
                          >
                            View details
                          </ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.assignBtn, { backgroundColor: '#34C759' }]}
                          // TODO: call complete endpoint then refresh
                          onPress={() => {}}
                        >
                          <ThemedText
                            style={[
                              styles.assignBtnText,
                              { color: '#000000' },
                            ]}
                          >
                            Completed
                          </ThemedText>
                        </TouchableOpacity>
                      </>
                    ) : (
                      // Assign Mechanics button — available for non-terminal statuses outside On Going tab
                      ['accepted', 'on_the_way', 'active', 'paused'].includes(b.status) && (
                        <TouchableOpacity
                          style={styles.assignBtn}
                          onPress={() => openAssignModal(b.request.id)}
                        >
                          <FontAwesome name="users" size={12} color="#FF9500" />
                          <ThemedText style={styles.assignBtnText}>Assign</ThemedText>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>

      {/* ── Assign Mechanics Modal ── */}
      <Modal visible={assignModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Assign Mechanics</ThemedText>
              <TouchableOpacity onPress={closeAssignModal}>
                <IconSymbol name="xmark.circle.fill" size={28} color="#888" />
              </TouchableOpacity>
            </View>

            {mechanicsLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FF9500" />
              </View>
            ) : (
              <ScrollView style={styles.modalBody}>
                {assignments.length > 0 && (
                  <>
                    <ThemedText style={styles.sectionLabel}>Assigned</ThemedText>
                    {assignments.map((a) => (
                      <View key={a.id} style={styles.mechRow}>
                        <View style={styles.mechInfo}>
                          <FontAwesome name="user-circle" size={18} color="#34C759" />
                          <ThemedText style={styles.mechName}>
                            {a.mechanic.firstname} {a.mechanic.lastname}
                          </ThemedText>
                          <View
                            style={[
                              styles.roleBadge,
                              a.role === 'lead' ? styles.roleLead : styles.roleAssist,
                            ]}
                          >
                            <ThemedText style={styles.roleText}>
                              {a.role === 'lead' ? 'Lead' : 'Assistant'}
                            </ThemedText>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => handleUnassign(a.id)}>
                          <FontAwesome name="minus-circle" size={22} color="#FF3B30" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}

                <ThemedText
                  style={[styles.sectionLabel, { marginTop: assignments.length > 0 ? 20 : 0 }]}
                >
                  Shop Mechanics{availableMechanics.length === 0 ? ' (none available)' : ''}
                </ThemedText>
                {availableMechanics.map((m) => (
                  <View key={m.account_id} style={styles.mechRow}>
                    <View style={styles.mechInfo}>
                      <FontAwesome name="user-circle-o" size={18} color="#888" />
                      <ThemedText style={styles.mechName}>
                        {m.firstname} {m.lastname}
                      </ThemedText>
                    </View>
                    <View style={styles.assignActions}>
                      {assigningId === m.account_id ? (
                        <ActivityIndicator size="small" color="#FF9500" />
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.leadBtn}
                            onPress={() => handleAssignMechanic(m.account_id, 'lead')}
                          >
                            <ThemedText style={styles.btnLabel}>Lead</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.assistBtn}
                            onPress={() => handleAssignMechanic(m.account_id, 'assistant')}
                          >
                            <ThemedText style={styles.btnLabel}>Assist</ThemedText>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.doneBtn} onPress={closeAssignModal}>
              <ThemedText style={styles.doneBtnText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151718' },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },

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

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  amount: { fontSize: 18, fontWeight: '700', color: '#FF9500' },
  footerActions: { flexDirection: 'row', gap: 8 },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF950020',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  assignBtnText: { fontSize: 13, fontWeight: '700', color: '#FF9500' },

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
