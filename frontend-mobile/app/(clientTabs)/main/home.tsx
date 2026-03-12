import React, { useState, useEffect, useCallback, useRef } from 'react';
import {View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions, Animated} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/homeStyles';
import { LineChart, BarChart } from 'react-native-chart-kit';
import EmergencyModal from '@/components/EmergencyModal';
import { SkeletonClientHome } from '@/components/skeletons/SkeletonLoaders';

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

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [clientName, setClientName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);

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
        setData(result);
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
                <TouchableOpacity 
                  // @ts-ignore - emergencyQuickAction style exists in homeStyles.js
                  style={[styles.quickActionCard, styles.emergencyQuickAction]} 
                  onPress={() => setShowEmergencyModal(true)}
                >
                  <View style={[styles.quickActionIcon, { backgroundColor: '#FF3B3025' }]}>
                    <FontAwesome name="exclamation-triangle" size={22} color="#FF3B30" />
                  </View>
                  <ThemedText style={[styles.quickActionLabel, { color: '#FF3B30', fontWeight: '700' }]}>Emergency</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
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
                          labels: data.statistics.service_frequency.map(item => item.month),
                          datasets: [{
                            data: data.statistics.service_frequency.map(item => item.count || 0)
                          }]
                        }}
                        width={screenWidth - 48}
                        height={200}
                        yAxisLabel=""
                        yAxisSuffix=""
                        chartConfig={{
                          backgroundColor: '#1E1E1E',
                          backgroundGradientFrom: '#2C2C2E',
                          backgroundGradientTo: '#1C1C1E',
                          decimalPlaces: 0,
                          color: (opacity = 1) => `rgba(255, 140, 0, ${opacity})`,
                          labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                          style: { borderRadius: 16 },
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
                          labels: data.statistics.monthly_spending.map(item => item.month),
                          datasets: [{
                            data: data.statistics.monthly_spending.map(item => item.amount || 0),
                            color: (opacity = 1) => `rgba(52, 199, 89, ${opacity})`,
                            strokeWidth: 3
                          }]
                        }}
                        width={screenWidth - 48}
                        height={200}
                        yAxisLabel="₱"
                        yAxisSuffix=""
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
        onPress={() => setShowEmergencyModal(true)}
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
    </ThemedView>
  );
}
