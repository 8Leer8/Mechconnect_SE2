import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Animated } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

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

type MechanicStatusBookingsResponse = {
  status: string;
  bookings: Booking[];
  count: number;
};

type MechanicGroupedBookingsResponse = {
  pending?: { bookings: Booking[]; count: number };
  booked?: { bookings: Booking[]; count: number };
  on_going?: { bookings: Booking[]; count: number };
  completed?: { bookings: Booking[]; count: number };
  cancelled?: { bookings: Booking[]; count: number };
  reworked?: { bookings: Booking[]; count: number };
  disputed?: { bookings: Booking[]; count: number };
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

  useEffect(() => {
    if (tab && tab !== activeTab) {
      setActiveTab(tab as TabType);
    }
  }, [tab]);

  useEffect(() => {
    fetchBookings();
  }, [activeTab]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'all') {
        const response = await fetch(`${API_URL}/bookings/mechanic/bookings/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch bookings');
        const data = (await response.json()) as MechanicGroupedBookingsResponse;
        const all: Booking[] = [
          ...((data.pending?.bookings as Booking[]) || []),
          ...((data.accepted?.bookings as Booking[]) || []),
          ...(data.on_the_way?.bookings || []),
          ...(data.active?.bookings || []),
          ...(data.completed?.bookings || []),
          ...(data.cancelled?.bookings || []),
          ...(data.reworked?.bookings || []),
          ...(data.disputed?.bookings || []),
        ];
        setBookings(all);
        setCounts({
          all: data.total_count || all.length,
          pending: data.pending?.count || 0,
          booked: data.accepted?.count || 0,
          on_going: (data.on_the_way?.count || 0) + (data.active?.count || 0),
          completed: data.completed?.count || 0,
          cancelled: data.cancelled?.count || 0,
          reworked: data.reworked?.count || 0,
          disputed: data.disputed?.count || 0,
        });
      } else {
        let backendStatus = activeTab;
        if (activeTab === 'booked') backendStatus = 'accepted';
        // For 'on_going', fetch both 'on_the_way' and 'active' and merge results
        if (activeTab === 'on_going') {
          const [onTheWayRes, activeRes] = await Promise.all([
            fetch(`${API_URL}/bookings/mechanic/bookings/?status=on_the_way`, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            }),
            fetch(`${API_URL}/bookings/mechanic/bookings/?status=active`, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            }),
          ]);
          if (!onTheWayRes.ok && !activeRes.ok) throw new Error('Failed to fetch bookings');
          const onTheWayData = onTheWayRes.ok ? ((await onTheWayRes.json()) as MechanicStatusBookingsResponse) : { bookings: [] };
          const activeData = activeRes.ok ? ((await activeRes.json()) as MechanicStatusBookingsResponse) : { bookings: [] };
          setBookings([...(onTheWayData.bookings || []), ...(activeData.bookings || [])]);
        } else {
          const response = await fetch(`${API_URL}/bookings/mechanic/bookings/?status=${backendStatus}`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!response.ok) throw new Error('Failed to fetch bookings');
          const data = (await response.json()) as MechanicStatusBookingsResponse;
          setBookings(data.bookings || []);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  // Map backend status to user-friendly label and color
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Booked';
      case 'active': return 'On Going';
      case 'on_the_way': return 'On the Way';
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

  const getStatusIcon = (status: string) => {
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

      await fetchBookings();
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
      pathname: '/(mechanicTabs)/booking_details',
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
              onPress={() => setActiveTab(tab)}
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
                {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </ThemedText>
              {count > 0 && activeTab === 'all' && (
                <View style={[styles.tabCount, isActive && styles.activeTabCount]}>
                  <ThemedText style={[styles.tabCountText, isActive && styles.activeTabCountText]}>
                    {count}
                  </ThemedText>
                </View>
              )}
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

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {bookings.length} {activeTab === 'all' ? 'total' : activeTab} booking{bookings.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
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
          <ActivityIndicator size="large" color="#FF8C00" style={styles.loader} />
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
              {activeTab === 'active' ? 'New jobs will appear here when accepted' :
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
                  if (
                    booking.status === 'active' ||
                    booking.status === 'on_the_way' ||
                    booking.status === 'completed' ||
                    booking.status === 'reworked'
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
                    <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {booking.service_location
                        ? `${booking.service_location.street_name}, ${booking.service_location.barangay}`
                        : 'No location specified'}
                    </ThemedText>
                  </View>

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
                  ) : (booking.status === 'accepted' || booking.status === 'on_the_way' || booking.status === 'active' || booking.status === 'completed' || booking.status === 'reworked') ? (
                    <TouchableOpacity
                      style={styles.detailsBtn}
                      onPress={() => handleViewDetails(booking)}
                    >
                      <ThemedText style={styles.detailsBtnText}>Details</ThemedText>
                      <FontAwesome name="chevron-right" size={11} color="#FF8C00" />
                    </TouchableOpacity>
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
        <View style={{ height: 20 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    backgroundColor: '#1A1C1E',
    maxHeight: 56,
    paddingBottom: 12,
  },
  tabScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#222426',
  },
  activeTab: {
    backgroundColor: '#FF8C00',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#fff',
  },
  tabCount: {
    marginLeft: 6,
    backgroundColor: '#333',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  activeTabCount: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8E8E93',
  },
  activeTabCountText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },
  loader: {
    marginTop: 40,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1A1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#888',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#555',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  bookingsList: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  bookingCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  bookingId: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  requestType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
  },
  timeAgo: {
    fontSize: 11,
    color: '#666',
  },
  cardInfoSection: {
    gap: 6,
    marginBottom: 12,
    paddingLeft: 50,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#8E8E93',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222426',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  declineBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2A2C2E',
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaa',
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#34C759',
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FF8C0015',
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF8C00',
  },
  jobDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#222426',
  },
  jobDoneText: {
    fontSize: 12,
    color: '#34C759',
    fontWeight: '500',
  },
});
