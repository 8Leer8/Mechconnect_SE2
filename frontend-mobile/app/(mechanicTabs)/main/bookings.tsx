import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  request: {
    id: number;
    type: string;
    created_at: string;
  };
  service_location?: {
    street_name: string;
    subdivision_village?: string;
    barangay: string;
    city_municipality: string;
    landmark?: string | null;
  } | null;
}

// Tabs: All, Pending, Active, Completed, Cancelled
type TabType = 'all' | 'pending' | 'active' | 'completed' | 'cancelled';

type MechanicStatusBookingsResponse = {
  status: string;
  bookings: Booking[];
  count: number;
};

type MechanicGroupedBookingsResponse = {
  pending?: { bookings: Booking[]; count: number };
  active: { bookings: Booking[]; count: number };
  completed: { bookings: Booking[]; count: number };
  cancelled: { bookings: Booking[]; count: number };
  reworked: { bookings: Booking[]; count: number };
  disputed: { bookings: Booking[]; count: number };
  total_count: number;
};

export default function BookingsScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  useEffect(() => {
    fetchBookings();
  }, [activeTab]);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);

      // When tab is "all", use the grouped response and flatten
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
          ...(data.active.bookings || []),
          ...(data.completed.bookings || []),
          ...(data.cancelled.bookings || []),
          ...(data.reworked.bookings || []),
          ...(data.disputed.bookings || []),
        ];
        setBookings(all);
      } else {
        // Backend supports status values including "pending" now
        const response = await fetch(`${API_URL}/bookings/mechanic/bookings/?status=${activeTab}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) throw new Error('Failed to fetch bookings');
        const data = (await response.json()) as MechanicStatusBookingsResponse;
        setBookings(data.bookings || []);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#FF8C00';
      case 'reworked': return '#FFD60A';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      default: return '#8E8E93';
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

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      {(['all', 'pending', 'active', 'completed', 'cancelled'] as TabType[]).map(
        (tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <ThemedText
              style={[styles.tabText, activeTab === tab && styles.activeTabText]}
            >
              {tab === 'all'
                ? 'All'
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </ThemedText>
          </TouchableOpacity>
        ),
      )}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
        <TouchableOpacity style={styles.filterButton}>
          <FontAwesome name="filter" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {renderTabs()}

      <ScrollView 
        style={styles.scrollView}
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
            <FontAwesome name="briefcase" size={64} color="#8E8E93" />
            <ThemedText style={styles.emptyText}>No {activeTab} jobs</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {activeTab === 'active' ? 'New jobs will appear here' : `No ${activeTab} jobs yet`}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.bookingsList}>
            {bookings.map((booking) => (
              <TouchableOpacity key={booking.id} style={styles.bookingCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                    <ThemedText style={styles.statusText}>{booking.status.toUpperCase()}</ThemedText>
                  </View>
                  <ThemedText style={styles.bookingId}>#{booking.id}</ThemedText>
                </View>

                <ThemedText style={styles.requestType}>{booking.request.type} Request</ThemedText>

                <View style={styles.infoRow}>
                  <FontAwesome name="user" size={14} color="#8E8E93" />
                  <ThemedText style={styles.requestType}>{booking.request.type} Request</ThemedText>
                </View>

                <View style={styles.infoRow}>
                  <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                  <ThemedText style={styles.infoText} numberOfLines={1}>
                    {booking.service_location
                      ? `${booking.service_location.street_name}, ${booking.service_location.barangay}`
                      : 'No location specified'}
                  </ThemedText>
                </View>

                <View style={styles.infoRow}>
                  <FontAwesome name="calendar" size={14} color="#8E8E93" />
                  <ThemedText style={styles.infoText}>
                    {new Date(booking.booked_at).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </ThemedText>
                </View>

                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>₱{booking.amount_fee.toFixed(2)}</ThemedText>
                  {activeTab === 'pending' ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#2e7d32' }]}
                        onPress={() => handleAcceptPending(booking.request.id)}
                        disabled={actionLoadingId === booking.request.id}
                      >
                        {actionLoadingId === booking.request.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <ThemedText style={styles.actionText}>Accept</ThemedText>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#c62828' }]}
                        onPress={() => handleDeclinePending(booking.request.id)}
                        disabled={actionLoadingId === booking.request.id}
                      >
                        <ThemedText style={styles.actionText}>Decline</ThemedText>
                      </TouchableOpacity>
                    </View>
                  ) : activeTab === 'active' ? (
                    <TouchableOpacity style={styles.actionButton}>
                      <ThemedText style={styles.actionText}>View Details</ThemedText>
                      <FontAwesome name="chevron-right" size={12} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1E1E1E',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  filterButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
  },
  activeTab: {
    backgroundColor: '#FF8C00',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
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
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  bookingsList: {
    padding: 20,
  },
  bookingCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  bookingId: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
  },
  requestType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C00',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});
