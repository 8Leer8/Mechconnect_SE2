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
    service_location: {
      street_name: string;
      barangay: string;
      city_municipality: string;
    };
  };
  client: {
    name: string;
  };
}

interface Request {
  id: number;
  request_type: string;
  created_at: string;
}

interface HomeData {
  current_bookings: Booking[];
  pending_requests: Request[];
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/bookings/home/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch home data');
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchHomeData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#FF8C00';
      case 'completed': return '#34C759';
      case 'reworked': return '#FFD60A';
      default: return '#8E8E93';
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.greeting}>Welcome Back! 👋</ThemedText>
          <ThemedText style={styles.subtitle}>Your Jobs Today</ThemedText>
        </View>
        <TouchableOpacity style={styles.notificationButton}>
          <FontAwesome name="bell" size={22} color="#fff" />
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>3</ThemedText>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: '#FF8C00' }]}>
            <FontAwesome name="briefcase" size={24} color="#fff" />
            <ThemedText style={styles.statValue}>{data?.current_bookings?.length || 0}</ThemedText>
            <ThemedText style={styles.statLabel}>Active Jobs</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#007AFF' }]}>
            <FontAwesome name="clock-o" size={24} color="#fff" />
            <ThemedText style={styles.statValue}>{data?.pending_requests?.length || 0}</ThemedText>
            <ThemedText style={styles.statLabel}>Pending</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#34C759' }]}>
            <FontAwesome name="dollar" size={24} color="#fff" />
            <ThemedText style={styles.statValue}>0</ThemedText>
            <ThemedText style={styles.statLabel}>Today's Earnings</ThemedText>
          </View>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color="#FF8C00" style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchHomeData}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Jobs */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>Active Jobs</ThemedText>
                <TouchableOpacity>
                  <ThemedText style={styles.seeAll}>See All</ThemedText>
                </TouchableOpacity>
              </View>

              {data?.current_bookings && data.current_bookings.length > 0 ? (
                data.current_bookings.slice(0, 3).map((booking) => (
                  <TouchableOpacity key={booking.id} style={styles.jobCard}>
                    <View style={styles.jobHeader}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                        <ThemedText style={styles.statusText}>{booking.status.toUpperCase()}</ThemedText>
                      </View>
                      <ThemedText style={styles.jobId}>#{booking.id}</ThemedText>
                    </View>
                    <ThemedText style={styles.jobTitle}>{booking.request.type} Request</ThemedText>
                    <View style={styles.jobDetail}>
                      <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                      <ThemedText style={styles.jobDetailText}>
                        {booking.request.service_location.barangay}, {booking.request.service_location.city_municipality}
                      </ThemedText>
                    </View>
                    <View style={styles.jobFooter}>
                      <View style={styles.jobDetail}>
                        <FontAwesome name="user" size={14} color="#8E8E93" />
                        <ThemedText style={styles.jobDetailText}>{booking.client?.name || 'Client'}</ThemedText>
                      </View>
                      <ThemedText style={styles.jobAmount}>₱{booking.amount_fee.toFixed(2)}</ThemedText>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <FontAwesome name="briefcase" size={48} color="#8E8E93" />
                  <ThemedText style={styles.emptyText}>No active jobs</ThemedText>
                </View>
              )}
            </View>

            {/* Pending Requests */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>Pending Requests</ThemedText>
                <TouchableOpacity>
                  <ThemedText style={styles.seeAll}>See All</ThemedText>
                </TouchableOpacity>
              </View>

              {data?.pending_requests && data.pending_requests.length > 0 ? (
                data.pending_requests.slice(0, 3).map((request) => (
                  <TouchableOpacity key={request.id} style={styles.requestCard}>
                    <View style={styles.requestHeader}>
                      <ThemedText style={styles.requestTitle}>{request.request_type} Request</ThemedText>
                      <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
                    </View>
                    <ThemedText style={styles.requestDate}>
                      {new Date(request.created_at).toLocaleDateString()}
                    </ThemedText>
                    <View style={styles.requestActions}>
                      <TouchableOpacity style={styles.acceptButton}>
                        <ThemedText style={styles.acceptText}>Accept</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.declineButton}>
                        <ThemedText style={styles.declineText}>Decline</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <FontAwesome name="inbox" size={48} color="#8E8E93" />
                  <ThemedText style={styles.emptyText}>No pending requests</ThemedText>
                </View>
              )}
            </View>
          </>
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
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#fff',
    marginTop: 4,
    textAlign: 'center',
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  seeAll: {
    fontSize: 14,
    color: '#FF8C00',
    fontWeight: '600',
  },
  jobCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  jobId: {
    fontSize: 14,
    color: '#8E8E93',
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  jobDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  jobDetailText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  jobAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#34C759',
  },
  requestCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  requestDate: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  declineText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 12,
  },
});