import React, { useState, useEffect, useCallback, useRef } from 'react';
import {View, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Animated, Image, Modal, Text, StyleSheet} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/homeStyles';
import { LineChart, BarChart } from 'react-native-chart-kit';
import EmergencyModal from '@/components/EmergencyModal';
import { SkeletonClientHome } from '@/components/skeletons/SkeletonLoaders';
import NotificationBell from '@/components/notifications/NotificationBell';
import WalletButton from '@/components/wallet/WalletButton';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { getImageUrl } from '@/lib/imageUtils';
import { fetchProfileDetailsCached } from '@/lib/profileCache';
import { useLocation } from '@/context/LocationContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const screenWidth = Dimensions.get('window').width;

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
  services?: {
    id: number;
    name: string;
    minimum_price: number;
  }[];
  add_ons?: {
    id: number;
    name: string;
    price: number;
  }[];
  status?: string;
}

interface Request {
  id: number;
  request_type: string;
  created_at: string;
  request_details: RequestDetails | null;
  service_location: ServiceLocation | null;
}

interface MonthlyData {
  month: string;
  count?: number;
  amount?: number;
}

const MONTH_ORDER: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const normalizeMonthLabel = (month: string): string => month.trim().toLowerCase();

const normalizeMonthlySeries = (
  source: MonthlyData[],
  valueSelector: (item: MonthlyData) => number
) => {
  // Quick frontend fix: preserve backend entries in order and do not
  // collapse same month names across years. This ensures the chart shows
  // the full sequence (typically 6 items) as returned by the server.
  const labels: string[] = [];
  const values: number[] = [];

  source.forEach((item) => {
    const label = (item.month || '').trim();
    if (!label) return;
    labels.push(label);
    values.push(valueSelector(item));
  });

  return { labels, values };
};

interface Statistics {
  total_bookings: number;
  average_cost: number;
  month_spending: number;
  month_bookings: number;
  most_used_service: string | null;
  service_frequency: MonthlyData[];
  monthly_spending: MonthlyData[];
}

interface HomeData {
  current_bookings: Booking[];
  pending_requests: Request[];
  statistics?: Statistics;
}

interface ClientProfileRole {
  profile_photo?: string | null;
  profile_photo_url?: string | null;
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [clientName, setClientName] = useState<string>('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showSosAlert, setShowSosAlert] = useState(false);
  const [hasMobileNumber, setHasMobileNumber] = useState(false);
  const { lastMessage } = useWebSocketContext();
  const { selectedLocation, setSelectedLocation } = useLocation();
  const params = useLocalSearchParams<{ openEmergency?: string; emLat?: string; emLng?: string; emAddr?: string }>();

  // Emergency button pulse animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      setError(null);

      const [homeRes, profile] = await Promise.all([
        fetch(`${API_URL}/bookings/home/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetchProfileDetailsCached(false),
      ]);

      if (homeRes.ok) {
        const result = await homeRes.json() as HomeData;
        setData(result);
      }

      if (profile) {
        const p = profile;
        const n = p?.full_name || `${p?.firstname || ''} ${p?.lastname || ''}`.trim();
        if (n) setClientName(n);
        const clientProfile = p?.current_role_profile?.client;
        setProfilePhotoUrl(clientProfile?.profile_photo || clientProfile?.profile_photo_url || null);
        // Check if user has verified mobile number (nested inside current_role_profile)
        const roleProfiles = p?.current_role_profile || {};
        let contactNumber = '';
        for (const role of Object.values(roleProfiles)) {
          if (role && typeof role === 'object' && (role as any).contact_number) {
            contactNumber = (role as any).contact_number;
            break;
          }
        }
        setHasMobileNumber(!!contactNumber && contactNumber.length > 0);
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

  // Re-fetch when a WebSocket booking update arrives
  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      fetchAllData();
    }
  }, [lastMessage]);

  useEffect(() => {
    // If user returns from map picker with a selected location,
    // reopen the emergency modal so they can continue filling the form.
    if (selectedLocation && !showEmergencyModal) {
      setShowEmergencyModal(true);
    }
  }, [selectedLocation, showEmergencyModal]);

  useEffect(() => {
    if (params.emLat && params.emLng) {
      const lat = Number(params.emLat);
      const lng = Number(params.emLng);
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        const addr = typeof params.emAddr === 'string' ? decodeURIComponent(params.emAddr) : `${lat}, ${lng}`;
        setSelectedLocation({
          latitude: lat,
          longitude: lng,
          address: addr,
          streetName: '',
          city: '',
          barangay: '',
          radiusKm: 5,
        });
      }
    }

    if (params.openEmergency === '1') {
      setShowEmergencyModal(true);
    }
  }, [params.openEmergency, params.emLat, params.emLng, params.emAddr, setSelectedLocation]);

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
      case 'active':
      case 'on_the_way':
      case 'at_location':
      case 'diagnosing':
        return '#FF8C00';
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
      case 'at_location': return 'At Location';
      case 'diagnosing': return 'Diagnosing';
      case 'active': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const activeCount = data?.current_bookings?.length || 0;
  const pendingCount = data?.pending_requests?.length || 0;

  const serviceFrequency = data?.statistics?.service_frequency || [];
  const normalizedServiceFrequency = normalizeMonthlySeries(
    serviceFrequency,
    (item) => item.count || 0
  );
  const serviceFrequencyCounts = normalizedServiceFrequency.values;
  const maxServiceFrequency = Math.max(...serviceFrequencyCounts, 0);
  const serviceFrequencySegments = maxServiceFrequency <= 1 ? 1 : Math.min(4, maxServiceFrequency);

  const monthlySpending = data?.statistics?.monthly_spending || [];
  const normalizedMonthlySpending = normalizeMonthlySeries(
    monthlySpending,
    (item) => item.amount || 0
  );
  const monthlySpendingValues = normalizedMonthlySpending.values;
  const maxMonthlySpending = Math.max(...monthlySpendingValues, 0);
  const monthlySpendingSegments = maxMonthlySpending <= 0 ? 1 : 4;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.profileCircle}>
              {profilePhotoUrl ? (
                <Image source={{ uri: getImageUrl(profilePhotoUrl) || '' }} style={styles.profileImage} />
              ) : (
                <FontAwesome name="user" size={20} color="#FF8C00" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.greeting}>{getGreeting()}</ThemedText>
              <ThemedText style={styles.clientName}>{clientName || 'Client'}</ThemedText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <WalletButton />
            <NotificationBell />
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
        {/* Quick Stats Row (now scrollable) */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
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

        {loading && !refreshing ? (
          <SkeletonClientHome />
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
            {/* Statistics Dashboard */}
            {data?.statistics && (
              <>
                {/* Overview Statistics Cards */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <View style={[styles.sectionDot, { backgroundColor: '#5856D6' }]} />
                      <ThemedText style={styles.sectionTitle}>Overview</ThemedText>
                    </View>
                  </View>
                  
                  <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { backgroundColor: '#FF8C0015' }]}>
                      <View style={styles.statIconContainer}>
                        <FontAwesome name="check-circle" size={24} color="#FF8C00" />
                      </View>
                      <ThemedText style={styles.statValue}>{data.statistics.total_bookings}</ThemedText>
                      <ThemedText style={styles.statLabel}>Total Bookings</ThemedText>
                    </View>
                    
                    <View style={[styles.statCard, { backgroundColor: '#34C75915' }]}>
                      <View style={styles.statIconContainer}>
                        <FontAwesome name="line-chart" size={24} color="#34C759" />
                      </View>
                      <ThemedText style={styles.statValue}>₱{data.statistics.average_cost.toFixed(0)}</ThemedText>
                      <ThemedText style={styles.statLabel}>Avg Cost</ThemedText>
                    </View>
                  </View>

                  <View style={styles.statsGrid}>
                    <View style={[styles.statCard, { backgroundColor: '#007AFF15' }]}>
                      <View style={styles.statIconContainer}>
                        <FontAwesome name="calendar" size={24} color="#007AFF" />
                      </View>
                      <ThemedText style={styles.statValue}>{data.statistics.month_bookings}</ThemedText>
                      <ThemedText style={styles.statLabel}>This Month</ThemedText>
                    </View>
                    
                    <View style={[styles.statCard, { backgroundColor: '#5856D615' }]}>
                      <View style={styles.statIconContainer}>
                        <FontAwesome name="money" size={24} color="#5856D6" />
                      </View>
                      <ThemedText style={styles.statValue}>₱{data.statistics.month_spending.toFixed(0)}</ThemedText>
                      <ThemedText style={styles.statLabel}>Month Spending</ThemedText>
                    </View>
                  </View>

                  {/* Most Used Service */}
                  {data.statistics.most_used_service && (
                    <View style={styles.mostUsedCard}>
                      <View style={styles.mostUsedLeft}>
                        <FontAwesome name="star" size={20} color="#FFD700" />
                      </View>
                      <View style={styles.mostUsedRight}>
                        <ThemedText style={styles.mostUsedLabel}>Most Used Service</ThemedText>
                        <ThemedText style={styles.mostUsedValue}>
                          {data.statistics.most_used_service.charAt(0).toUpperCase() + data.statistics.most_used_service.slice(1)}
                        </ThemedText>
                      </View>
                    </View>
                  )}
                </View>

                {/* Service Frequency Chart */}
                {data.statistics.service_frequency && data.statistics.service_frequency.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleRow}>
                        <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
                        <ThemedText style={styles.sectionTitle}>Service Frequency</ThemedText>
                      </View>
                    </View>
                    
                    <View style={styles.chartContainer}>
                      <BarChart
                        data={{
                          labels: normalizedServiceFrequency.labels,
                          datasets: [{
                            data: serviceFrequencyCounts
                          }]
                        }}
                        width={screenWidth - 48}
                        height={200}
                        segments={serviceFrequencySegments}
                        yAxisLabel=""
                        yAxisSuffix=""
                        yLabelsOffset={8}
                        xLabelsOffset={-2}
                        chartConfig={{
                          backgroundColor: '#1E1E1E',
                          backgroundGradientFrom: '#2C2C2E',
                          backgroundGradientTo: '#1C1C1E',
                          decimalPlaces: 0,
                          color: (opacity = 1) => `rgba(255, 140, 0, ${opacity})`,
                          labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                          barPercentage: 0.7,
                          style: { borderRadius: 16 },
                          propsForLabels: {
                            fontSize: 10,
                          },
                          propsForBackgroundLines: {
                            strokeDasharray: '',
                            stroke: '#3A3A3C',
                            strokeWidth: 1
                          }
                        }}
                        style={styles.chart}
                        fromZero={true}
                      />
                      <ThemedText style={styles.chartCaption}>Bookings completed per month</ThemedText>
                    </View>
                  </View>
                )}

                {/* Monthly Spending Trend */}
                {data.statistics.monthly_spending && data.statistics.monthly_spending.length > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleRow}>
                        <View style={[styles.sectionDot, { backgroundColor: '#34C759' }]} />
                        <ThemedText style={styles.sectionTitle}>Spending Trend</ThemedText>
                      </View>
                    </View>
                    
                    <View style={styles.chartContainer}>
                      <LineChart
                        data={{
                          labels: normalizedMonthlySpending.labels,
                          datasets: [{
                            data: monthlySpendingValues,
                            color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
                            strokeWidth: 3
                          }]
                        }}
                        width={screenWidth - 48}
                        height={200}
                        segments={monthlySpendingSegments}
                        yAxisLabel="₱"
                        yAxisSuffix=""
                        yLabelsOffset={8}
                        xLabelsOffset={-2}
                        chartConfig={{
                          backgroundColor: '#1E1E1E',
                          backgroundGradientFrom: '#2C2C2E',
                          backgroundGradientTo: '#1C1C1E',
                          decimalPlaces: 0,
                          color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
                          labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                          style: { borderRadius: 16 },
                          propsForDots: {
                            r: '5',
                            strokeWidth: '2',
                            stroke: '#34C759'
                          },
                          propsForBackgroundLines: {
                            strokeDasharray: '',
                            stroke: '#3A3A3C',
                            strokeWidth: 1
                          }
                        }}
                        bezier
                        style={styles.chart}
                      />
                      <ThemedText style={styles.chartCaption}>Total spending over the last 6 months</ThemedText>
                    </View>
                  </View>
                )}
              </>
            )}

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
                    onPress={() => router.push({ pathname: '/client/booking/booking_details', params: { bookingId: booking.id.toString() } })}
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

            <View style={{ height: 30 }} />
          </>
        )}
      </ScrollView>
      
      {/* Floating Emergency SOS Button */}
      <TouchableOpacity 
        style={styles.emergencyFAB}
        onPress={() => {
          if (hasMobileNumber) {
            setShowEmergencyModal(true);
          } else {
            setShowSosAlert(true);
          }
        }}
        activeOpacity={0.8}
      >
        <Animated.View 
          style={[
            styles.emergencyPulse,
            { transform: [{ scale: pulseAnim }] }
          ]} 
        />
        <View style={styles.emergencyFABInner}>
          <FontAwesome name="exclamation" size={22} color="#fff" />
          <ThemedText style={styles.emergencyFABText}>SOS</ThemedText>
        </View>
      </TouchableOpacity>
      
      {/* Emergency Modal */}
      <EmergencyModal
        visible={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        onSuccess={() => {
          fetchAllData(); // Refresh data after successful emergency request
        }}
      />

      {/* SOS Mobile Number Required Alert Modal */}
      <Modal
        visible={showSosAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSosAlert(false)}
      >
        <View style={sosAlertStyles.overlay}>
          <View style={sosAlertStyles.alertBox}>
            <View style={sosAlertStyles.iconCircle}>
              <FontAwesome name="exclamation-circle" size={40} color="#FF8C00" />
            </View>
            <Text style={sosAlertStyles.title}>Mobile Number Required</Text>
            <Text style={sosAlertStyles.subtext}>
              You must have a verified mobile number to request emergency services.
            </Text>
            <View style={sosAlertStyles.buttonRow}>
              <TouchableOpacity
                style={sosAlertStyles.cancelButton}
                onPress={() => setShowSosAlert(false)}
                activeOpacity={0.8}
              >
                <Text style={sosAlertStyles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sosAlertStyles.verifyButton}
                onPress={() => {
                  setShowSosAlert(false);
                  router.push('/client/others/settings');
                }}
                activeOpacity={0.8}
              >
                <Text style={sosAlertStyles.verifyButtonText}>Verify Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const sosAlertStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  alertBox: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5F5F5',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: '#9A9A9A',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9A9A9A',
  },
  verifyButton: {
    flex: 1,
    height: 44,
    backgroundColor: '#FF8C00',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
