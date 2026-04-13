import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/homeStyles';
import WalletSection from '@/components/wallet-section';
import { SkeletonMechanicHome } from '@/components/skeletons/SkeletonLoaders';
import { useWebSocketContext } from '@/context/WebSocketContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  request: {
    id: number;
    type: string;
    request_type?: string;
    service_location?: {
      street_name: string;
      barangay: string;
      city_municipality: string;
    };
  };
  client?: {
    firstname: string;
    lastname: string;
  };
  service_location?: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
}

interface GroupedBookings {
  active: { count: number };
  completed: { count: number };
  cancelled: { count: number };
  pending?: { count: number };
  total_count: number;
  total_earnings: number;
}

export default function HomeScreen() {
  const [activeJobs, setActiveJobs] = useState<Booking[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Booking[]>([]);
  const [stats, setStats] = useState<GroupedBookings | null>(null);
  const [mechanicName, setMechanicName] = useState<string>('Mechanic');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { lastMessage } = useWebSocketContext();

  const fetchSections = useCallback(async () => {
    try {
      setError(null);

      const opts = { method: 'GET', credentials: 'include' as RequestCredentials, headers: { 'Content-Type': 'application/json' } };

      // All 4 requests in one round-trip; the no-status stats call now returns total_earnings
      // via a single SQL Sum aggregate — no need for a separate heavy fetch.
      const [acceptedRes, onGoingRes, pendingRes, statsRes, profileRes] = await Promise.all([
        fetch(`${API_URL}/bookings/mechanic/bookings/?status=accepted&page_size=5`, opts),
        fetch(`${API_URL}/bookings/mechanic/bookings/?status=on_going&page_size=5`, opts),
        fetch(`${API_URL}/bookings/mechanic/bookings/?status=pending&page_size=5`, opts),
        fetch(`${API_URL}/bookings/mechanic/bookings/`, opts),
        fetch(`${API_URL}/users/profile/details/`, opts),
      ]);

      const [acceptedData, onGoingData, pendingData, statsData, profileData] = await Promise.all([
        acceptedRes.ok ? acceptedRes.json() : Promise.resolve(null),
        onGoingRes.ok ? onGoingRes.json() : Promise.resolve(null),
        pendingRes.ok ? pendingRes.json() : Promise.resolve(null),
        statsRes.ok ? statsRes.json() : Promise.resolve(null),
        profileRes.ok ? profileRes.json() : Promise.resolve(null),
      ]);

      // Merge accepted + on_going, sort newest first, cap at 5
      const accepted: Booking[] = acceptedData?.bookings ?? [];
      const onGoing: Booking[] = onGoingData?.bookings ?? [];
      const merged = [...accepted, ...onGoing]
        .sort((a, b) => new Date(b.booked_at).getTime() - new Date(a.booked_at).getTime())
        .slice(0, 5);
      setActiveJobs(merged);

      setPendingRequests(pendingData?.bookings ?? []);

      if (statsData) setStats(statsData);

      if (profileData) {
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

  // Re-fetch whenever the tab comes into focus
  useFocusEffect(useCallback(() => {
    fetchSections();
  }, [fetchSections]));

  // Re-fetch when a WebSocket booking update arrives
  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      fetchSections();
    }
  }, [lastMessage]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSections();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return '#007AFF';
      case 'on_the_way': return '#FF9500';
      case 'active': return '#FF8C00';
      case 'paused': return '#FFD60A';
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

  const activeCount = stats?.active?.count || 0;
  const pendingCount = stats?.pending?.count || 0;
  const completedCount = stats?.completed?.count || 0;
  const totalEarnings = stats?.total_earnings ?? 0;

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
          <SkeletonMechanicHome />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchSections}>
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

              {activeJobs.length > 0 ? (
                activeJobs.map((booking) => (
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
                          {booking.request?.type ? `${booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1)} Service` : 'Service Request'}
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

              {pendingRequests.length > 0 ? (
                pendingRequests.map((req) => (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={styles.requestCardTop}>
                      <View style={styles.requestTypeContainer}>
                        <View style={[styles.requestTypeBadge, { backgroundColor: '#007AFF20' }]}>
                          <FontAwesome name="file-text-o" size={14} color="#007AFF" />
                          <ThemedText style={[styles.requestTypeText, { color: '#007AFF' }]}>
                            Direct Request
                          </ThemedText>
                        </View>
                      </View>
                      <ThemedText style={styles.requestTime}>
                        {new Date(req.booked_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </ThemedText>
                    </View>
                    {req.client && (
                      <View style={styles.requestInfoRow}>
                        <FontAwesome name="user-o" size={12} color="#8E8E93" />
                        <ThemedText style={styles.requestInfoText}>
                          {`${req.client.firstname || ''} ${req.client.lastname || ''}`.trim()}
                        </ThemedText>
                      </View>
                    )}
                    {req.service_location && (
                      <View style={styles.requestInfoRow}>
                        <FontAwesome name="map-marker" size={12} color="#8E8E93" />
                        <ThemedText style={styles.requestInfoText} numberOfLines={1}>
                          {req.service_location.barangay}, {req.service_location.city_municipality}
                        </ThemedText>
                      </View>
                    )}
                    <View style={styles.requestActions}>
                      <TouchableOpacity
                        style={styles.acceptButton}
                        onPress={() => router.push({ pathname: '/(mechanicTabs)/main/bookings', params: { tab: 'pending' } })}
                      >
                        <FontAwesome name="eye" size={12} color="#fff" />
                        <ThemedText style={styles.acceptText}>View</ThemedText>
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

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}
