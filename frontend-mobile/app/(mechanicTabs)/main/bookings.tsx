import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/bookingsStyles';
import WalletBadge from '@/components/wallet-badge';
import { SkeletonBookingList } from '@/components/skeletons/SkeletonLoaders';
import { useWebSocketContext } from '@/context/WebSocketContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at?: string;
  request: {
    id: number;
    type: string;
    created_at: string;
    vehicle_type?: string | null;
    vehicle_model?: string | null;
    request_details?: {
      vehicle_type?: string | null;
      vehicle_model?: string | null;
      vehicle?: {
        type?: string | null;
        model?: string | null;
      };
    } | null;
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

// Tabs: All, Pending, Booked, On Going, Completed, Cancelled, Reworked, Disputed
type TabType = 'all' | 'pending' | 'booked' | 'on_going' | 'completed' | 'cancelled' | 'reworked' | 'disputed';
const TAB_LABELS: Record<TabType, string> = {
  all: 'All',
  pending: 'Pending',
  booked: 'Booked',
  on_going: 'On Going',
  completed: 'Completed',
  cancelled: 'Cancelled',
  reworked: 'Reworked',
  disputed: 'Disputed',
};

type MechanicPaginatedResponse = {
  status: string;
  bookings: Booking[];
  count: number;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  tab_counts?: {
    pending: number;
    accepted: number;
    on_the_way: number;
    active: number;
    completed: number;
    cancelled: number;
    reworked: number;
    disputed: number;
  };
};

type MechanicCountsResponse = {
  pending?: { count: number };
  accepted?: { count: number };
  on_the_way?: { count: number };
  active?: { count: number };
  finished?: { count: number };
  pending_payment?: { count: number };
  completed?: { count: number };
  cancelled?: { count: number };
  reworked?: { count: number };
  disputed?: { count: number };
  total_count: number;
};

export default function BookingsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>((tab as TabType) || 'all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [allCache, setAllCache] = useState<Booking[] | null>(null);
  const pageSize = 5;
  const { lastMessage } = useWebSocketContext();
  const dividerColor = useThemeColor({}, 'icon');

  useEffect(() => {
    if (tab && tab !== activeTab) {
      setActiveTab(tab as TabType);
      setCurrentPage(1);
    }
  }, [tab]);


  const fetchCounts = async () => {
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = (await response.json()) as MechanicCountsResponse;
        setCounts({
          all: data.total_count || 0,
          pending: data.pending?.count || 0,
          booked: data.accepted?.count || 0,
          on_going: (data.on_the_way?.count || 0) + (data.active?.count || 0),
          completed: data.completed?.count || 0,
          cancelled: data.cancelled?.count || 0,
          reworked: data.reworked?.count || 0,
          disputed: data.disputed?.count || 0,
        });
      }
    } catch (_) {
      // counts are non-critical; silently fail
    }
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch tab counts only when not on 'all' tab (all tab includes counts in response)
      if (activeTab !== 'all') {
        fetchCounts();
      }

      // Map tab to backend status query. For the 'reworked' tab ask the backend
      // for the dedicated 'reworked' filter so backjob entries are returned.
      let statusQuery: string;
      if (activeTab === 'all') statusQuery = 'all';
      else if (activeTab === 'booked') statusQuery = 'accepted';
      else if (activeTab === 'on_going') statusQuery = 'on_going';
      else if (activeTab === 'reworked') statusQuery = 'reworked';
      else statusQuery = activeTab;

      // Single paginated call — same pattern as client side
      const response = await fetch(
        `${API_URL}/bookings/mechanic/bookings/?status=${statusQuery}&page=${currentPage}&page_size=${pageSize}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!response.ok) throw new Error(`Failed to fetch ${activeTab} bookings`);
      const data = (await response.json()) as MechanicPaginatedResponse;
      // When viewing reworked tab, use the backend's reworked response directly.
      if (activeTab === 'reworked') {
        const candidates = data.bookings || [];
        setBookings(candidates);
        // cache the full list for reference
        setAllCache(data.bookings || []);
      } else {
        setBookings(data.bookings || []);
      }
      setTotalCount(data.total_count || 0);
      setTotalPages(data.total_pages || 1);

      // Use tab_counts from the 'all' response directly
      if (data.tab_counts) {
        const tc = data.tab_counts;
        setCounts({
          all: data.total_count || 0,
          pending: tc.pending || 0,
          booked: tc.accepted || 0,
          on_going: (tc.on_the_way || 0) + (tc.active || 0),
          completed: tc.completed || 0,
          cancelled: tc.cancelled || 0,
          reworked: tc.reworked || 0,
          disputed: tc.disputed || 0,
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // server now provides `has_backjob` in booking responses; no per-booking checks needed

  const fetchData = useCallback(() => {
    fetchBookings();
    fetchCounts();
  }, [activeTab, currentPage]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Re-fetch when a WebSocket booking update arrives
  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      // refresh list on any booking-related websocket event (includes new chat messages/backjob requests)
      fetchData();
    }
  }, [lastMessage, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  // Map backend status to user-friendly label and color
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Booked';
      case 'active': return 'On Going';
      case 'on_the_way': return 'On the Way';
      case 'at_location': return 'At Location';
      case 'diagnosing': return 'Diagnosing';
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
      case 'at_location': return '#5AC8FA';
      case 'diagnosing': return '#AF52DE';
      case 'paused': return '#8E8E93';
      case 'finished': return '#34C759';
      case 'pending_payment': return '#FFD60A';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'pending': return '#8E8E93';
      case 'reworked': return '#FFD60A';
      case 'disputed': return '#AF52DE';
      default: return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return 'calendar-check-o';
      case 'active': return 'play-circle';
      case 'on_the_way': return 'car';
      case 'at_location': return 'map-marker';
      case 'diagnosing': return 'search';
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

  const handleAcceptPending = async (requestId: number) => {
    try {
      setActionLoadingId(requestId);
      const response = await fetch(
        `${API_URL}/bookings/mechanic/requests/${requestId}/accept/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const raw = await response.json().catch(() => ({}));
        const errData = raw as { error?: string };
        throw new Error(errData.error || 'Failed to accept request');
      }
      const payload = await response.json().catch(() => ({} as any));
      const acceptedBookingId = Number(
        payload?.booking_id ?? payload?.bookingId ?? payload?.booking?.id ?? payload?.booking
      );
      await fetchBookings();
      if (Number.isFinite(acceptedBookingId) && acceptedBookingId > 0) {
        router.push({
          pathname: '/mechanic/booking/booking_details',
          params: { bookingId: String(acceptedBookingId) },
        });
      }
    } catch (e: any) {
      console.error('Accept error', e);
      setError(e.message || 'Failed to accept request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclinePending = async (requestId: number) => {
    try {
      setActionLoadingId(requestId);
      const response = await fetch(
        `${API_URL}/bookings/mechanic/requests/${requestId}/decline/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const raw = await response.json().catch(() => ({}));
        const errData = raw as { error?: string };
        throw new Error(errData.error || 'Failed to decline request');
      }

      await fetchBookings();
    } catch (e: any) {
      console.error('Decline error', e);
      setError(e.message || 'Failed to decline request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleViewDetails = (booking: Booking) => {
    router.push({
      pathname: '/mechanic/booking/booking_details',
      params: { bookingId: booking.id.toString() },
    });
  };

  const getTabIcon = (tab: TabType) => {
    switch (tab) {
      case 'all': return 'th-list';
      case 'pending': return 'clock-o';
      case 'booked': return 'calendar-check-o';
      case 'on_going': return 'play-circle';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'reworked': return 'refresh';
      case 'disputed': return 'exclamation-circle';
      default: return 'circle';
    }
  };

  const renderTabs = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabScrollContent}
      style={styles.tabContainer}
    >
      {(['all', 'pending', 'booked', 'on_going', 'completed', 'cancelled', 'reworked', 'disputed'] as TabType[]).map(
        (tab) => {
          const isActive = activeTab === tab;
          const count = counts[tab] || 0;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => handleTabChange(tab)}
              activeOpacity={0.7}
            >
              <FontAwesome
                name={getTabIcon(tab)}
                size={14}
                color={isActive ? '#fff' : '#8E8E93'}
                style={{ marginRight: 6 }}
              />
              <ThemedText
                style={[styles.tabText, isActive && styles.activeTabText]}
              >
                {`${TAB_LABELS[tab]} ${count}`}
              </ThemedText>
            </TouchableOpacity>
          );
        },
      )}
    </ScrollView>
  );

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const getTimeSince = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getVehiclePreview = (booking: Booking) => {
    const vehicleType =
      booking.request?.vehicle_type ||
      booking.request?.request_details?.vehicle_type ||
      booking.request?.request_details?.vehicle?.type ||
      '';
    const vehicleModel =
      booking.request?.vehicle_model ||
      booking.request?.request_details?.vehicle_model ||
      booking.request?.request_details?.vehicle?.model ||
      '';

    if (vehicleType && vehicleModel) return `${vehicleType} - ${vehicleModel}`;
    if (vehicleType) return vehicleType;
    if (vehicleModel) return vehicleModel;
    return 'Vehicle not specified';
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {totalCount > 0 ? totalCount : bookings.length} {activeTab === 'all' ? 'total' : activeTab} booking{(totalCount > 0 ? totalCount : bookings.length) !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
            <FontAwesome name="refresh" size={18} color="#FF8C00" />
          </TouchableOpacity>
          <WalletBadge onPress={() => router.push('/mechanic/wallet')} />
        </View>
      </View>

      {renderTabs()}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {loading && !refreshing ? (
          <SkeletonBookingList />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchBookings}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <FontAwesome name={getTabIcon(activeTab)} size={40} color="#555" />
            </View>
            <ThemedText style={styles.emptyText}>No {activeTab === 'all' ? '' : activeTab + ' '}bookings</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {activeTab === 'on_going' ? 'New jobs will appear here when accepted' :
               activeTab === 'pending' ? 'Client requests will appear here' :
               `No ${activeTab} bookings yet`}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.bookingsList}>
            {bookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                activeOpacity={0.7}
                onPress={() => {
                    // Allow viewing details for active flows as well as
                    // pending direct requests so mechanics can inspect
                    // the incoming direct booking before accepting/declining.
                    if (
                          booking.status === 'active' ||
                          booking.status === 'on_the_way' ||
                          booking.status === 'at_location' ||
                          booking.status === 'diagnosing' ||
                          booking.status === 'paused' ||
                          booking.status === 'completed' ||
                          booking.status === 'reworked' ||
                          booking.status === 'pending_payment' ||
                          // allow pending direct-type requests to be opened
                          (booking.status === 'pending' && booking.request && booking.request.type === 'direct')
                        ) {
                      handleViewDetails(booking);
                    }
                  }}
              >
                {/* Card Top Row */}
                <View style={styles.cardTopRow}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusIconCircle, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
                      <FontAwesome name={getStatusIcon(booking.status)} size={16} color={getStatusColor(booking.status)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}> 
                          <ThemedText style={styles.statusText}>{getStatusLabel(booking.status)}</ThemedText>
                        </View>
                                        { (booking as any).has_backjob && booking.status === 'completed' ? (
                                          <View style={styles.backjobBadge}>
                                            <ThemedText style={styles.backjobText}>Reworked</ThemedText>
                                          </View>
                                        ) : (booking as any).has_backjob ? (
                                          <View style={styles.backjobBadge}>
                                            <ThemedText style={styles.backjobText}>Backjob</ThemedText>
                                          </View>
                                        ) : null}
                        <ThemedText style={styles.bookingId}>#{booking.id}</ThemedText>
                      </View>
                      <ThemedText style={styles.requestType}>
                        {booking.request.type
                          ? booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1) + ' Service'
                          : 'Service Request'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.timeAgo}>{getTimeSince(booking.booked_at)}</ThemedText>
                </View>

                {/* Info Rows */}
                <View style={styles.cardInfoSection}>
                  <View style={styles.infoRow}>
                    <FontAwesome name="car" size={13} color="#8E8E93" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {getVehiclePreview(booking)}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {booking.service_location
                        ? `${booking.service_location.street_name}, ${booking.service_location.barangay}`
                        : 'No location specified'}
                    </ThemedText>
                  </View>

                  {/* Quotation preview for completed bookings (read-only) */}
                  {booking.status === 'completed' && (booking as any).quotation && (
                    <ThemedView lightColor="#fff" darkColor="#1A1C1E" style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginTop: 8 }}>
                      <ThemedText style={{ fontSize: 14, fontWeight: '600', marginBottom: 6 }}>Quotation</ThemedText>
                      {((booking as any).quotation.items || []).map((it: any, idx: number) => (
                        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                          <ThemedText style={{ flex: 1 }}>{it.description || (it.service && `Service #${it.service}`) || 'Item'}</ThemedText>
                          <ThemedText>₱{(((it.unit_price || 0) * (it.quantity || 1)) || 0).toFixed(2)}</ThemedText>
                        </View>
                      ))}
                      <View style={{ height: 1, backgroundColor: dividerColor, marginVertical: 8 }} />
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                        <ThemedText style={{ fontWeight: '600' }}>₱{parseFloat(String((booking as any).quotation.total_amount || 0)).toFixed(2)}</ThemedText>
                      </View>
                    </ThemedView>
                  )}

                  <View style={styles.infoRow}>
                    <FontAwesome name="calendar-o" size={13} color="#8E8E93" />
                    <ThemedText style={styles.infoText}>{formatDate(booking.booked_at)}</ThemedText>
                  </View>
                </View>

                {/* Card Footer */}
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>

                  {booking.status === 'pending' ? (
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => handleDeclinePending(booking.request.id)}
                        disabled={actionLoadingId === booking.request.id}
                      >
                        <ThemedText style={styles.declineBtnText}>Decline</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleAcceptPending(booking.request.id)}
                        disabled={actionLoadingId === booking.request.id}
                      >
                        {actionLoadingId === booking.request.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <FontAwesome name="check" size={11} color="#fff" />
                            <ThemedText style={styles.acceptBtnText}>Accept</ThemedText>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (booking.status === 'accepted' || booking.status === 'on_the_way' || booking.status === 'at_location' || booking.status === 'diagnosing' || booking.status === 'active' || booking.status === 'paused' || booking.status === 'completed' || booking.status === 'reworked' || booking.status === 'pending_payment') ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={styles.detailsBtn}
                        onPress={() => handleViewDetails(booking)}
                      >
                        <ThemedText style={styles.detailsBtnText}>Details</ThemedText>
                        <FontAwesome name="chevron-right" size={11} color="#FF8C00" />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {/* Active booking extra info */}
                {booking.status === 'active' && booking.active_details?.is_job_done && (
                  <View style={styles.jobDoneBanner}>
                    <FontAwesome name="check-circle" size={14} color="#34C759" />
                    <ThemedText style={styles.jobDoneText}>Job marked as done</ThemedText>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        {/* Pagination Controls */}
        {!loading && !error && totalPages > 1 && (
          <View style={styles.paginationContainer}>
            <TouchableOpacity
              style={[styles.paginationBtn, currentPage === 1 && styles.paginationBtnDisabled]}
              onPress={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              activeOpacity={0.7}
            >
              <FontAwesome name="chevron-left" size={14} color={currentPage === 1 ? '#555' : '#FF8C00'} />
            </TouchableOpacity>

            <View style={styles.paginationInfo}>
              <ThemedText style={styles.paginationText}>
                Page {currentPage} of {totalPages}
              </ThemedText>
              <ThemedText style={styles.paginationSubtext}>
                Showing {bookings.length} of {totalCount} bookings
              </ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.paginationBtn, currentPage === totalPages && styles.paginationBtnDisabled]}
              onPress={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              activeOpacity={0.7}
            >
              <FontAwesome name="chevron-right" size={14} color={currentPage === totalPages ? '#555' : '#FF8C00'} />
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </ThemedView>
  );
}
