import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const { width } = Dimensions.get('window');

interface Booking {
  id: number;
  status: string;
  amount_fee: string;
  booked_at: string;
  request: {
    request_type: string;
    service_location: any;
  };
  provider?: {
    name: string;
  } | null;
  service_location?: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
}

interface ServiceLocation {
  street_name: string;
  subdivision_village?: string;
  barangay: string;
  city_municipality: string;
  landmark?: string;
}

interface RequestDetails {
  description?: string;
  quoted_price?: string;
  service?: {
    id: number;
    name: string;
    minimum_price: number;
  };
  services?: Array<{
    id: number;
    name: string;
    minimum_price: number;
  }>;
  add_ons?: Array<{
    id: number;
    name: string;
    price: number;
  }>;
  status?: string;
}

interface Request {
  id: number;
  request_type: string;
  created_at: string;
  request_details: RequestDetails | null;
  service_location: ServiceLocation | null;
}

interface HomeData {
  current_bookings: Booking[];
  pending_requests: Request[];
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [clientName, setClientName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllData = useCallback(async () => {
    try {
      setError(null);

      const [homeRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/bookings/home/`, {
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
        const result = await homeRes.json() as HomeData;
        if (!('error' in result)) {
          setData(result);
        }
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        const p = profileData.profile || profileData;
        const n = p?.full_name || `${p?.firstname || ''} ${p?.lastname || ''}`.trim();
        if (n) setClientName(n);
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

    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAllData();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': case 'on_the_way': return '#FF8C00';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'accepted': return '#00B8D9';
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
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const activeCount = data?.current_bookings?.length || 0;
  const pendingCount = data?.pending_requests?.length || 0;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <ThemedText style={styles.greeting}>{getGreeting()}</ThemedText>
            <ThemedText style={styles.clientName}>{clientName || 'Client'}</ThemedText>
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

        {/* Quick Stats Row */}
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
            {/* Current Bookings Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
                  <ThemedText style={styles.sectionTitle}>Current Bookings</ThemedText>
                </View>
                <TouchableOpacity onPress={() => router.push({ pathname: '/(clientTabs)/main/booking', params: { tab: 'active' } })}>
                  <ThemedText style={styles.seeAll}>See All →</ThemedText>
                </TouchableOpacity>
              </View>

              {data?.current_bookings && data.current_bookings.length > 0 ? (
                data.current_bookings.slice(0, 3).map((booking) => (
                  <TouchableOpacity
                    key={booking.id}
                    style={styles.jobCard}
                    onPress={() => router.push({ pathname: '/(clientTabs)/booking_details', params: { bookingId: booking.id.toString() } })}
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
                          {booking.request?.request_type
                            ? `${booking.request.request_type.charAt(0).toUpperCase() + booking.request.request_type.slice(1)} Service`
                            : 'Service Request'}
                        </ThemedText>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor(booking.status) }]} />
                      </View>
                      <View style={styles.jobInfoRow}>
                        <FontAwesome name="tag" size={11} color="#8E8E93" />
                        <ThemedText style={styles.jobInfoText}>
                          {getStatusLabel(booking.status)}
                        </ThemedText>
                      </View>
                      {booking.provider && (
                        <View style={styles.jobInfoRow}>
                          <FontAwesome name="user-o" size={11} color="#8E8E93" />
                          <ThemedText style={styles.jobInfoText}>{booking.provider.name}</ThemedText>
                        </View>
                      )}
                    </View>
                    <View style={styles.jobCardRight}>
                      <ThemedText style={styles.jobAmount}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>
                      <FontAwesome name="chevron-right" size={12} color="#555" />
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <FontAwesome name="calendar-o" size={36} color="#555" />
                  <ThemedText style={styles.emptyTitle}>No Active Bookings</ThemedText>
                  <ThemedText style={styles.emptySubtext}>Your bookings will appear here</ThemedText>
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
                <TouchableOpacity onPress={() => router.push('/(clientTabs)/main/request')}>
                  <ThemedText style={styles.seeAll}>See All →</ThemedText>
                </TouchableOpacity>
              </View>

              {data?.pending_requests && data.pending_requests.length > 0 ? (
                data.pending_requests.slice(0, 3).map((request) => {
                  // Calculate estimated price
                  let estimatedPrice = 0;
                  if (request.request_details?.quoted_price) {
                    estimatedPrice = parseFloat(request.request_details.quoted_price);
                  } else if (request.request_details?.service?.minimum_price) {
                    estimatedPrice = request.request_details.service.minimum_price;
                    if (request.request_details.add_ons) {
                      estimatedPrice += request.request_details.add_ons.reduce((sum, addon) => sum + addon.price, 0);
                    }
                  } else if (request.request_details?.services && request.request_details.services.length > 0) {
                    estimatedPrice = request.request_details.services.reduce((sum, service) => sum + service.minimum_price, 0);
                    if (request.request_details.add_ons) {
                      estimatedPrice += request.request_details.add_ons.reduce((sum, addon) => sum + addon.price, 0);
                    }
                  }

                  return (
                    <View key={request.id} style={styles.requestCard}>
                      <View style={styles.requestCardTop}>
                        <View style={styles.requestTypeBadge}>
                          <FontAwesome
                            name={request.request_type === 'emergency' ? 'exclamation-triangle' : 
                                  request.request_type === 'broadcast' ? 'bullhorn' : 'file-text-o'}
                            size={14}
                            color={request.request_type === 'emergency' ? '#FF3B30' : 
                                   request.request_type === 'broadcast' ? '#FF8C00' : '#007AFF'}
                          />
                          <ThemedText style={[styles.requestTypeText, {
                            color: request.request_type === 'emergency' ? '#FF3B30' : 
                                   request.request_type === 'broadcast' ? '#FF8C00' : '#007AFF',
                          }]}>
                            {request.request_type.charAt(0).toUpperCase() + request.request_type.slice(1)}
                          </ThemedText>
                        </View>
                        <ThemedText style={styles.requestTime}>
                          {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </ThemedText>
                      </View>
                      
                      {request.request_details?.description && (
                        <ThemedText style={styles.requestDescription} numberOfLines={2}>
                          {request.request_details.description}
                        </ThemedText>
                      )}
                      
                      <View style={styles.requestInfoRow}>
                        {estimatedPrice > 0 && (
                          <View style={styles.requestInfoItem}>
                            <FontAwesome name="money" size={12} color="#34C759" />
                            <ThemedText style={styles.requestInfoLabel}>Est. Price:</ThemedText>
                            <ThemedText style={styles.requestPriceText}>₱{estimatedPrice.toFixed(2)}</ThemedText>
                          </View>
                        )}
                        {request.service_location && (
                          <View style={styles.requestInfoItem}>
                            <FontAwesome name="map-marker" size={12} color="#FF8C00" />
                            <ThemedText style={styles.requestInfoLabel} numberOfLines={1}>
                              {request.service_location.barangay}, {request.service_location.city_municipality}
                            </ThemedText>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyCard}>
                  <FontAwesome name="inbox" size={36} color="#555" />
                  <ThemedText style={styles.emptyTitle}>No Pending Requests</ThemedText>
                  <ThemedText style={styles.emptySubtext}>Create a request to find a mechanic</ThemedText>
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
                <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/(clientTabs)/main/booking')}>
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF8C0015' }]}>
                    <FontAwesome name="calendar-check-o" size={22} color="#FF8C00" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>My Bookings</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/(clientTabs)/main/request')}>
                  <View style={[styles.quickActionIcon, { backgroundColor: '#007AFF15' }]}>
                    <FontAwesome name="file-text-o" size={22} color="#007AFF" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>My Requests</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/(clientTabs)/main/discover')}>
                  <View style={[styles.quickActionIcon, { backgroundColor: '#34C75915' }]}>
                    <FontAwesome name="compass" size={22} color="#34C759" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>Discover</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickActionCard} onPress={() => router.push('/client/request/broadcast/broadcastrequest' as any)}>
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF3B3015' }]}>
                    <FontAwesome name="exclamation-triangle" size={22} color="#FF3B30" />
                  </View>
                  <ThemedText style={styles.quickActionLabel}>Emergency</ThemedText>
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
  container: { flex: 1, backgroundColor: '#111214' },
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
  headerLeft: { flex: 1 },
  greeting: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
  clientName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 2 },
  notificationButton: { position: 'relative' },
  notifCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2A2C2E', justifyContent: 'center', alignItems: 'center',
  },
  badge: {
    position: 'absolute', top: -2, right: -2,
    backgroundColor: '#FF3B30', borderRadius: 10,
    minWidth: 20, height: 20,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#1A1C1E',
  },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  quickStatsRow: {
    flexDirection: 'row', backgroundColor: '#222426',
    borderRadius: 16, padding: 16, alignItems: 'center',
  },
  quickStat: { flex: 1, alignItems: 'center' },
  quickStatIcon: {
    width: 36, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  quickStatValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  quickStatLabel: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  quickStatDivider: { width: 1, height: 40, backgroundColor: '#333' },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  loader: { marginTop: 40 },
  errorContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorText: { fontSize: 16, color: '#FF3B30', marginTop: 16, textAlign: 'center' },
  retryButton: {
    marginTop: 16, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: '#FF8C00', borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  seeAll: { fontSize: 13, color: '#FF8C00', fontWeight: '600' },
  jobCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1C1E', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#2A2C2E',
  },
  jobCardLeft: { marginRight: 12 },
  jobIconCircle: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  jobCardCenter: { flex: 1 },
  jobCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  jobTitle: { fontSize: 15, fontWeight: '600', color: '#fff', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  jobInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  jobInfoText: { fontSize: 12, color: '#8E8E93', flex: 1 },
  jobCardRight: { alignItems: 'flex-end', marginLeft: 8, gap: 8 },
  jobAmount: { fontSize: 15, fontWeight: 'bold', color: '#34C759' },
  requestCard: {
    backgroundColor: '#1A1C1E', borderRadius: 14, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#2A2C2E',
  },
  requestCardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  requestTypeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#222426',
  },
  requestTypeText: { fontSize: 12, fontWeight: '700' },
  requestTime: { fontSize: 12, color: '#8E8E93' },
  requestDescription: { fontSize: 13, color: '#8E8E93', lineHeight: 18, marginBottom: 10 },
  requestInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  requestInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: '45%',
  },
  requestInfoLabel: {
    fontSize: 11,
    color: '#8E8E93',
    flex: 1,
  },
  requestPriceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#34C759',
  },
  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickActionCard: {
    width: (width - 50) / 2,
    backgroundColor: '#1A1C1E', borderRadius: 14, padding: 18,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A2C2E',
  },
  quickActionIcon: {
    width: 48, height: 48, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  quickActionLabel: { fontSize: 13, fontWeight: '600', color: '#ccc' },
  emptyCard: {
    backgroundColor: '#1A1C1E', borderRadius: 14, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: '#2A2C2E',
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#888', marginTop: 12 },
  emptySubtext: { fontSize: 12, color: '#555', marginTop: 4 },
});
