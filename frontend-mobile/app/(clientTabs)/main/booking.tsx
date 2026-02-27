import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
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
  updated_at: string;
  completed_at: string | null;
  request: {
    id: number;
    type: string;
    created_at: string;
  };
  provider: {
    id: number;
    name: string;
    email: string;
  } | null;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  active_details?: any;
  cancellation_details?: any;
  rework_details?: any;
  completion_details?: any;
}

interface BookingsResponse {
  bookings: Booking[];
}

type TabType = 'active' | 'completed' | 'cancelled' | 'reworked';

export default function BookingScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>((tab as TabType) || 'active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

      const response = await fetch(`${API_URL}/bookings/bookings?status=${activeTab}`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch bookings');
      const data = await response.json() as BookingsResponse;
      setBookings(data.bookings || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

  const getTimeSince = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_the_way': return '#007AFF';
      case 'active': return '#FF8C00';
      case 'accepted': return '#00B8D9';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'reworked': return '#FFD60A';
      default: return '#8E8E93';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Booked';
      case 'on_the_way': return 'On the Way';
      case 'active': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'reworked': return 'Reworked';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return 'calendar-check-o';
      case 'active': return 'play-circle';
      case 'on_the_way': return 'car';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'reworked': return 'refresh';
      default: return 'circle';
    }
  };

  const getTabIcon = (tab: TabType) => {
    switch (tab) {
      case 'active': return 'play-circle';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'reworked': return 'refresh';
      default: return 'circle';
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {bookings.length} {activeTab} booking{bookings.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScrollContent}
        style={styles.tabContainer}
      >
        {(['active', 'completed', 'cancelled', 'reworked'] as TabType[]).map((t) => {
          const isActive = activeTab === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.7}
            >
              <FontAwesome name={getTabIcon(t)} size={14} color={isActive ? '#fff' : '#8E8E93'} style={{ marginRight: 6 }} />
              <ThemedText style={[styles.tabText, isActive && styles.activeTabText]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
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
            <ThemedText style={styles.emptyText}>No {activeTab} bookings</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {activeTab === 'active' ? 'Your active bookings will appear here' : `No ${activeTab} bookings yet`}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.bookingsList}>
            {bookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/(clientTabs)/booking_details', params: { bookingId: booking.id.toString() } })}
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
                  {booking.provider && (
                    <View style={styles.infoRow}>
                      <FontAwesome name="user-o" size={13} color="#8E8E93" />
                      <ThemedText style={styles.infoText}>{booking.provider.name}</ThemedText>
                    </View>
                  )}
                  {booking.service_location && (
                    <View style={styles.infoRow}>
                      <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                      <ThemedText style={styles.infoText} numberOfLines={1}>
                        {booking.service_location.street_name}, {booking.service_location.barangay}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <FontAwesome name="calendar-o" size={13} color="#8E8E93" />
                    <ThemedText style={styles.infoText}>{formatDate(booking.booked_at)}</ThemedText>
                  </View>
                </View>

                {/* Status-specific Banners */}
                {(booking.status === 'active' || booking.status === 'on_the_way') && booking.active_details && (
                  <View style={styles.detailBanner}>
                    {booking.active_details.is_job_done ? (
                      <View style={styles.bannerRow}>
                        <FontAwesome name="check-circle" size={14} color="#34C759" />
                        <ThemedText style={styles.bannerText}>Job marked as done</ThemedText>
                      </View>
                    ) : (
                      <View style={styles.bannerRow}>
                        <FontAwesome name="info-circle" size={14} color="#FF8C00" />
                        <ThemedText style={[styles.bannerText, { color: '#FF8C00' }]}>
                          {booking.status === 'on_the_way' ? 'Mechanic is on the way' : 'Job in progress'}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}

                {booking.status === 'cancelled' && booking.cancellation_details && (
                  <View style={styles.detailBanner}>
                    <ThemedText style={styles.bannerText}>
                      Cancelled by: {booking.cancellation_details.cancelled_by.name}
                    </ThemedText>
                  </View>
                )}

                {booking.status === 'reworked' && booking.rework_details && (
                  <View style={styles.detailBanner}>
                    <ThemedText style={styles.bannerText}>
                      Rework by: {booking.rework_details.requested_by.name}
                    </ThemedText>
                  </View>
                )}

                {/* Card Footer */}
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>
                  <TouchableOpacity
                    style={styles.detailsBtn}
                    onPress={() => router.push({ pathname: '/(clientTabs)/booking_details', params: { bookingId: booking.id.toString() } })}
                  >
                    <ThemedText style={styles.detailsBtnText}>Details</ThemedText>
                    <FontAwesome name="chevron-right" size={11} color="#FF8C00" />
                  </TouchableOpacity>
                </View>
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
  container: { flex: 1, backgroundColor: '#111214' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  refreshButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FF8C0015', justifyContent: 'center', alignItems: 'center',
  },
  tabContainer: { backgroundColor: '#1A1C1E', maxHeight: 56, paddingBottom: 12 },
  tabScrollContent: { paddingHorizontal: 16, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 20, backgroundColor: '#222426',
  },
  activeTab: { backgroundColor: '#FF8C00' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#8E8E93' },
  activeTabText: { color: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 8 },
  loader: { marginTop: 40 },
  errorContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { fontSize: 16, color: '#FF3B30', marginTop: 16, textAlign: 'center' },
  retryButton: {
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: '#FF8C00', borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyContainer: {
    alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 40,
  },
  emptyIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#1A1C1E', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: '#2A2C2E',
  },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#888' },
  emptySubtext: { fontSize: 13, color: '#555', marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  bookingsList: { paddingHorizontal: 16, paddingTop: 8 },
  bookingCard: {
    backgroundColor: '#1A1C1E', borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#2A2C2E',
  },
  cardTopRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  statusIconCircle: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 9, fontWeight: 'bold', color: '#fff', letterSpacing: 0.5 },
  bookingId: { fontSize: 12, color: '#666', fontWeight: '600' },
  requestType: { fontSize: 14, fontWeight: '600', color: '#ccc' },
  timeAgo: { fontSize: 11, color: '#666' },
  cardInfoSection: { gap: 6, marginBottom: 12, paddingLeft: 50 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 12, color: '#8E8E93', flex: 1 },
  detailBanner: {
    backgroundColor: '#222426', padding: 10, borderRadius: 8,
    marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#FF8C00',
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { fontSize: 12, color: '#8E8E93' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#222426',
  },
  amount: { fontSize: 18, fontWeight: 'bold', color: '#34C759' },
  detailsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, backgroundColor: '#FF8C0015',
  },
  detailsBtnText: { fontSize: 12, fontWeight: '600', color: '#FF8C00' },
});
