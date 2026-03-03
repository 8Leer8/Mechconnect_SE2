import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions, Linking } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import WalletSection from '@/components/wallet-section';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const { width } = Dimensions.get('window');

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
    firstname: string;
    lastname: string;
  };
  service_location?: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
}

interface PendingRequest {
  id: number;
  request_type: string;
  created_at: string;
  client?: {
    firstname: string;
    lastname: string;
  };
  service_location?: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  };
}

interface HomeData {
  current_bookings: Booking[];
  pending_requests: PendingRequest[];
}

interface GroupedBookings {
  active: { bookings: Booking[]; count: number };
  completed: { bookings: Booking[]; count: number };
  cancelled: { bookings: Booking[]; count: number };
  pending?: { bookings: any[]; count: number };
  total_count: number;
}

export default function HomeScreen() {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [stats, setStats] = useState<GroupedBookings | null>(null);
  const [mechanicName, setMechanicName] = useState<string>('Mechanic');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllData = useCallback(async () => {
    try {
      setError(null);

      const [homeRes, bookingsRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/bookings/home/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${API_URL}/bookings/mechanic/bookings/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${API_URL}/users/profile/details/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      if (homeRes.ok) {
        const result = await homeRes.json();
        setHomeData(result);
      }

      if (bookingsRes.ok) {
        const result = await bookingsRes.json();
        setStats(result);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const p = profileData.profile || profileData;
        const n = p?.full_name || `${p?.firstname || ''} ${p?.lastname || ''}`.trim();
        if (n) setMechanicName(n);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();

    // Silently refresh dashboard every 30 seconds
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#FF8C00';
      case 'completed': return '#34C759';
      case 'reworked': return '#FFD60A';
      case 'cancelled': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  //greeting function based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const totalEarnings = stats?.completed?.bookings?.reduce(
    (sum: number, b: any) => sum + parseFloat(String(b.amount_fee || '0')), 0
  ) || 0;

  const activeCount = stats?.active?.count || 0;
  const pendingCount = stats?.pending?.count || 0;
  const completedCount = stats?.completed?.count || 0;

  return (
    <ThemedView style={styles.container}>
      {/* Header with gradient-like effect */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <ThemedText style={styles.greeting}>{getGreeting()}</ThemedText>
            <ThemedText style={styles.mechanicName}>{mechanicName}</ThemedText>
          </View>
          <TouchableOpacity style={styles.notificationButton}>
            <View style={styles.notifCircle}>
              <FontAwesome name="bell-o" size={20} color="#fff" />
            </View>
            {pendingCount > 0 && (
              <View style={styles.badge}>
                <ThemedText style={styles.badgeText}>{pendingCount}</ThemedText>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Stats Row inside header */}
        <View style={styles.quickStatsRow}>
          <View style={styles.quickStat}>
            <View style={[styles.quickStatIcon, { backgroundColor: 'rgba(255, 140, 0, 0.2)' }]}>
              <FontAwesome name="wrench" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.quickStatValue}>{activeCount}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>Active</ThemedText>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStat}>
            <View style={[styles.quickStatIcon, { backgroundColor: 'rgba(0, 122, 255, 0.2)' }]}>
              <FontAwesome name="clock-o" size={16} color="#007AFF" />
            </View>
            <ThemedText style={styles.quickStatValue}>{pendingCount}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>Pending</ThemedText>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStat}>
            <View style={[styles.quickStatIcon, { backgroundColor: 'rgba(52, 199, 89, 0.2)' }]}>
              <FontAwesome name="check-circle" size={16} color="#34C759" />
            </View>
            <ThemedText style={styles.quickStatValue}>{completedCount}</ThemedText>
            <ThemedText style={styles.quickStatLabel}>Done</ThemedText>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Wallet Section */}
        <WalletSection />

        {/* Earnings Banner */}
        <View style={styles.earningsBanner}>
          <View style={styles.earningsLeft}>
            <ThemedText style={styles.earningsLabel}>Total Earnings</ThemedText>
            <ThemedText style={styles.earningsValue}>₱{totalEarnings.toFixed(2)}</ThemedText>
          </View>
          <View style={styles.earningsIcon}>
            <FontAwesome name="line-chart" size={28} color="#FF8C00" />
          </View>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="large" color="#FF8C00" style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchAllData}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Jobs Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
                  <ThemedText style={styles.sectionTitle}>Active Jobs</ThemedText>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: '/(mechanicTabs)/main/bookings', params: { tab: 'on_going' } })}>
                  <ThemedText style={styles.seeAll}>See All →</ThemedText>
                </TouchableOpacity>
              </View>

              {homeData?.current_bookings && homeData.current_bookings.length > 0 ? (
                homeData.current_bookings.slice(0, 3).map((booking) => (
                  <TouchableOpacity
                    key={booking.id}
                    style={styles.jobCard}
                    onPress={() => router.push({ pathname: '/(mechanicTabs)/main/bookings', params: { tab: 'on_going', highlight: booking.id.toString() } })}
                    activeOpacity={0.7}
                  >
                    <View style={styles.jobCardLeft}>
                      <View style={[styles.jobIconCircle, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
                        <FontAwesome name="wrench" size={18} color={getStatusColor(booking.status)} />
                      </View>
                    </View>
                    <View style={styles.jobCardCenter}>
                      <View style={styles.jobCardTitleRow}>
                        <ThemedText style={styles.jobTitle} numberOfLines={1}>
                          {booking.request?.request_type ? `${booking.request.request_type.charAt(0).toUpperCase() + booking.request.request_type.slice(1)} Service` : 'Service Request'}
                        </ThemedText>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
                      </View>
                      <View style={styles.jobInfoRow}>
                        <FontAwesome name="map-marker" size={12} color="#8E8E93" />
                        <ThemedText style={styles.jobInfoText} numberOfLines={1}>
                          {booking.service_location
                            ? `${booking.service_location.barangay}, ${booking.service_location.city_municipality}`
                            : booking.request?.service_location
                              ? `${booking.request.service_location.barangay}, ${booking.request.service_location.city_municipality}`
                              : 'Location pending'}
                        </ThemedText>
                      </View>
                      <View style={styles.jobInfoRow}>
                        <FontAwesome name="user-o" size={11} color="#8E8E93" />
                        <ThemedText style={styles.jobInfoText}>
                          {booking.client
                            ? `${booking.client.firstname || ''} ${booking.client.lastname || ''}`.trim() || 'Client'
                            : 'Client'}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.jobCardRight}>
                      <ThemedText style={styles.jobAmount}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>
                      <FontAwesome name="chevron-right" size={12} color="#555" />
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <FontAwesome name="briefcase" size={36} color="#555" />
                  <ThemedText style={styles.emptyTitle}>No Active Jobs</ThemedText>
                  <ThemedText style={styles.emptySubtext}>Accepted jobs will appear here</ThemedText>
                </View>
              )}
            </View>

            {/* Pending Requests Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionDot, { backgroundColor: '#007AFF' }]} />
                  <ThemedText style={styles.sectionTitle}>Pending Requests</ThemedText>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: '/(mechanicTabs)/main/bookings', params: { tab: 'pending' } })}>
                  <ThemedText style={styles.seeAll}>See All →</ThemedText>
                </TouchableOpacity>
              </View>

              {homeData?.pending_requests && homeData.pending_requests.length > 0 ? (
                homeData.pending_requests.slice(0, 3).map((request) => (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={styles.requestCardTop}>
                      <View style={styles.requestTypeContainer}>
                        <View style={[styles.requestTypeBadge, {
                          backgroundColor: request.request_type === 'emergency' ? '#FF3B3020' : '#007AFF20',
                        }]}>
                          <FontAwesome
                            name={request.request_type === 'emergency' ? 'exclamation-triangle' : 'file-text-o'}
                            size={14}
                            color={request.request_type === 'emergency' ? '#FF3B30' : '#007AFF'}
                          />
                          <ThemedText style={[styles.requestTypeText, {
                            color: request.request_type === 'emergency' ? '#FF3B30' : '#007AFF',
                          }]}>
                            {request.request_type.charAt(0).toUpperCase() + request.request_type.slice(1)}
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText style={styles.requestTime}>
                        {new Date(request.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </ThemedText>
                    </View>
                    {request.client && (
                      <View style={styles.requestInfoRow}>
                        <FontAwesome name="user-o" size={12} color="#8E8E93" />
                        <ThemedText style={styles.requestInfoText}>
                          {`${request.client.firstname || ''} ${request.client.lastname || ''}`.trim()}
                        </ThemedText>
                      </View>
                    )}
                    {request.service_location && (
                      <View style={styles.requestInfoRow}>
                        <FontAwesome name="map-marker" size={12} color="#8E8E93" />
                        <ThemedText style={styles.requestInfoText} numberOfLines={1}>
                          {request.service_location.barangay}, {request.service_location.city_municipality}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.requestActions}>
                      <TouchableOpacity style={styles.declineButton}>
                        <ThemedText style={styles.declineText}>Decline</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.acceptButton}>
                        <FontAwesome name="check" size={12} color="#fff" />
                        <ThemedText style={styles.acceptText}>Accept</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <FontAwesome name="inbox" size={36} color="#555" />
                  <ThemedText style={styles.emptyTitle}>No Pending Requests</ThemedText>
                  <ThemedText style={styles.emptySubtext}>New client requests will show here</ThemedText>
                </View>
              )}
            </View>

            {/* Quick Actions */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionDot, { backgroundColor: '#34C759' }]} />
                  <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
                </View>
              </View>
              <View style={styles.quickActionsGrid}>
                <TouchableOpacity
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(mechanicTabs)/main/bookings')}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF8C0015' }]}>
                    <FontAwesome name="calendar-check-o" size={22} color="#FF8C00" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>My Bookings</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(mechanicTabs)/main/emergency')}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF3B3015' }]}>
                    <FontAwesome name="exclamation-triangle" size={22} color="#FF3B30" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>Emergencies</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(mechanicTabs)/main/map')}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#007AFF15' }]}>
                    <FontAwesome name="map" size={22} color="#007AFF" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>Job Map</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickActionCard}
                  onPress={() => router.push('/(mechanicTabs)/main/profile')}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#34C75915' }]}>
                    <FontAwesome name="user-circle" size={22} color="#34C759" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>My Profile</ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  headerContainer: {
    backgroundColor: '#1A1C1E',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  mechanicName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 2,
  },
  notificationButton: {
    position: 'relative',
  },
  notifCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1A1C1E',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#222426',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#333',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  earningsBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FF8C0030',
  },
  earningsLeft: {},
  earningsLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 4,
  },
  earningsValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FF8C00',
  },
  earningsIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  seeAll: {
    fontSize: 13,
    color: '#FF8C00',
    fontWeight: '600',
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  jobCardLeft: {
    marginRight: 12,
  },
  jobIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jobCardCenter: {
    flex: 1,
  },
  jobCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  jobTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  jobInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  jobInfoText: {
    fontSize: 12,
    color: '#8E8E93',
    flex: 1,
  },
  jobCardRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
    gap: 8,
  },
  jobAmount: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#34C759',
  },
  requestCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  requestCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  requestTypeContainer: {},
  requestTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  requestTypeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  requestTime: {
    fontSize: 12,
    color: '#8E8E93',
  },
  requestInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  requestInfoText: {
    fontSize: 12,
    color: '#8E8E93',
    flex: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#34C759',
    paddingVertical: 10,
    borderRadius: 10,
  },
  acceptText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  declineButton: {
    flex: 1,
    backgroundColor: '#2A2C2E',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  declineText: {
    color: '#aaa',
    fontWeight: '600',
    fontSize: 13,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionCard: {
    width: (width - 50) / 2,
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
  },
  emptyCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
  },
});