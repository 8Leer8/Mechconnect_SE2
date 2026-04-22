import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { SkeletonMechanicShopHome } from '@/components/skeletons/SkeletonLoaders';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { getImageUrl } from '@/lib/imageUtils';
import { fetchProfileDetailsCached } from '@/lib/profileCache';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface ShopInfo {
  shop_id: number | null;
  shop_name: string | null;
}

interface ProfileData {
  full_name: string;
  current_role_profile: {
    mechanic?: {
      is_working_for_shop: boolean;
      status: string;
      average_rating: number;
      shop_id: number | null;
      shop_name: string | null;
      profile_photo?: string | null;
      profile_photo_url?: string | null;
    };
  };
}

interface Booking {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  request: {
    id: number;
    type: string;
  };
  service_location?: {
    street_name?: string;
    barangay?: string;
    city_municipality?: string;
  } | null;
}

interface BookingListResponse {
  bookings: Booking[];
}

interface MechanicStatsResponse {
  pending?: { count: number };
  accepted?: { count: number };
  on_the_way?: { count: number };
  active?: { count: number };
  completed?: { count: number };
  cancelled?: { count: number };
  total_count?: number;
  total_earnings?: number;
}

export default function MechanicShopDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo>({ shop_id: null, shop_name: null });
  const [mechanicName, setMechanicName] = useState<string>('Mechanic');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [assignedCount, setAssignedCount] = useState<number>(0);
  const [onGoingCount, setOnGoingCount] = useState<number>(0);
  const [bookedCount, setBookedCount] = useState<number>(0);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [todayCount, setTodayCount] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [nextJob, setNextJob] = useState<Booking | null>(null);
  const [recentJobs, setRecentJobs] = useState<Booking[]>([]);
  const [allJobs, setAllJobs] = useState<Booking[]>([]);
  const { lastMessage } = useWebSocketContext();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return '#00B8D9';
      case 'on_the_way': return '#007AFF';
      case 'active': return '#FF8C00';
      case 'paused': return '#8E8E93';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'reworked': return '#FFD60A';
      default: return '#8E8E93';
    }
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      accepted: 'Booked',
      on_the_way: 'On the Way',
      active: 'On Going',
      paused: 'Paused',
      completed: 'Completed',
      cancelled: 'Cancelled',
      pending_payment: 'Pending Payment',
      reworked: 'Reworked',
      disputed: 'Disputed',
    };
    return map[status] || status;
  };

  const dateKey = (dateString: string) => {
    const d = new Date(dateString);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const fetchProfileAndStats = useCallback(async () => {
    try {
      const options: RequestInit = {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      };
      const [profileResponse, statsResponse] = await Promise.all([
        fetchProfileDetailsCached(false),
        fetch(`${API_URL}/bookings/mechanic/bookings/`, options),
      ]);

      if (profileResponse) {
        const profile = profileResponse as ProfileData;

        setMechanicName(profile.full_name || 'Mechanic');
        setRating(Number(profile.current_role_profile?.mechanic?.average_rating) || 0);

        const mechanicProfile = profile.current_role_profile?.mechanic;
        setProfilePhotoUrl(mechanicProfile?.profile_photo || mechanicProfile?.profile_photo_url || null);
        if (mechanicProfile?.is_working_for_shop && mechanicProfile.shop_name) {
          setShopInfo({
            shop_id: mechanicProfile.shop_id,
            shop_name: mechanicProfile.shop_name,
          });
        }
      }

      if (statsResponse.ok) {
        const statsData = (await statsResponse.json()) as MechanicStatsResponse;
        setAssignedCount(Number(statsData.total_count) || 0);
        setBookedCount(Number(statsData.accepted?.count) || 0);
        setOnGoingCount((Number(statsData.on_the_way?.count) || 0) + (Number(statsData.active?.count) || 0));
        setCompletedCount(Number(statsData.completed?.count) || 0);
        setTotalEarnings(Number(statsData.total_earnings) || 0);
      }
    } catch (error) {
      console.error('Error fetching profile/stats:', error);
    }
  }, []);

  const fetchJobsData = useCallback(async () => {
    try {
      const options: RequestInit = {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      };
      setJobsLoading(true);
      const allBookingsResponse = await fetch(
        `${API_URL}/bookings/mechanic/bookings/?status=all&page=1&page_size=12&compact=1`,
        options
      );
      if (!allBookingsResponse.ok) return;

      const allBookingsData = (await allBookingsResponse.json()) as BookingListResponse;
      const bookings = allBookingsData.bookings || [];
      setAllJobs(bookings);
      setRecentJobs(bookings.slice(0, 4));

      const today = dateKey(new Date().toISOString());
      const todays = bookings.filter((booking) => dateKey(booking.booked_at) === today);
      setTodayCount(todays.length);

      const openStatuses = new Set(['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'paused', 'pending_payment']);
      const nextOpen = bookings
        .filter((booking) => openStatuses.has(booking.status))
        .sort((a, b) => new Date(a.booked_at).getTime() - new Date(b.booked_at).getTime());
      setNextJob(nextOpen.length > 0 ? nextOpen[0] : null);
    } catch (error) {
      console.error('Error fetching jobs list:', error);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const fetchDashboardData = useCallback(async () => {
    try {
      await fetchProfileAndStats();
      await fetchJobsData();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchProfileAndStats, fetchJobsData]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Re-fetch when a WebSocket booking update arrives
  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      fetchJobsData();
      fetchProfileAndStats();
    }
  }, [lastMessage, fetchJobsData, fetchProfileAndStats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const completionRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;
  const avgCompletedValue = completedCount > 0 ? totalEarnings / completedCount : 0;
  const openStatuses = new Set(['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'paused', 'pending_payment']);
  const upcomingJobs = allJobs.filter((job) => openStatuses.has(job.status)).length;
  const todayCompletedValue = allJobs
    .filter((job) => dateKey(job.booked_at) === dateKey(new Date().toISOString()) && job.status === 'completed')
    .reduce((sum, job) => sum + Number(job.amount_fee || 0), 0);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.pageHeader}>
          <View>
            <ThemedText style={styles.pageTitle}>Dashboard</ThemedText>
            <ThemedText style={styles.pageSubtitle}>Shop mechanic overview</ThemedText>
          </View>
          <TouchableOpacity style={styles.headerRefreshButton} onPress={onRefresh}>
            <FontAwesome name="refresh" size={18} color="#FF8C00" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SkeletonMechanicShopHome />
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.pageHeader}>
        <View>
          <ThemedText style={styles.pageTitle}>Dashboard</ThemedText>
          <ThemedText style={styles.pageSubtitle}>Track assigned jobs and performance</ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <NotificationBell />
          <TouchableOpacity style={styles.headerRefreshButton} onPress={onRefresh}>
            <FontAwesome name="refresh" size={18} color="#FF8C00" />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Shop Header */}
        <View style={styles.shopHeader}>
            <View style={styles.shopHeaderLeft}>
              <View style={styles.profileCircle}>
                {profilePhotoUrl ? (
                  <Image source={{ uri: getImageUrl(profilePhotoUrl) || '' }} style={styles.profileImage} />
                ) : (
                  <FontAwesome name="user" size={20} color="#FF8C00" />
                )}
              </View>
              <FontAwesome name="building" size={28} color="#FF8C00" />
              <View style={styles.shopInfo}>
                <ThemedText style={styles.shopLabel}>{getGreeting()}</ThemedText>
                <ThemedText style={styles.shopName}>
                  {shopInfo.shop_name || 'No Shop Assigned'}
                </ThemedText>
              </View>
          </View>
          <View style={styles.ratingBadge}>
            <FontAwesome name="star" size={12} color="#FFD700" />
            <ThemedText style={styles.ratingBadgeText}>{Number(rating || 0).toFixed(1)}</ThemedText>
          </View>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <ThemedText style={styles.welcomeText}>Welcome back,</ThemedText>
          <ThemedText style={styles.mechanicName}>{mechanicName}</ThemedText>
        </View>

        {/* Insight Cards */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#FF8C001A' }]}>
              <FontAwesome name="briefcase" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.metricValue}>{assignedCount}</ThemedText>
            <ThemedText style={styles.metricLabel}>Assigned Jobs</ThemedText>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#007AFF1A' }]}>
              <FontAwesome name="play-circle" size={16} color="#007AFF" />
            </View>
            <ThemedText style={styles.metricValue}>{onGoingCount}</ThemedText>
            <ThemedText style={styles.metricLabel}>On Going</ThemedText>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#00B8D91A' }]}>
              <FontAwesome name="calendar-check-o" size={16} color="#00B8D9" />
            </View>
            <ThemedText style={styles.metricValue}>{bookedCount}</ThemedText>
            <ThemedText style={styles.metricLabel}>Booked</ThemedText>
          </View>

          <View style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: '#34C7591A' }]}>
              <FontAwesome name="check-circle" size={16} color="#34C759" />
            </View>
            <ThemedText style={styles.metricValue}>{completedCount}</ThemedText>
            <ThemedText style={styles.metricLabel}>Completed</ThemedText>
          </View>
        </View>

        <View style={styles.snapshotRow}>
          <View style={styles.snapshotCard}>
            <ThemedText style={styles.snapshotLabel}>Today Jobs</ThemedText>
            <ThemedText style={styles.snapshotValue}>{todayCount}</ThemedText>
          </View>
          <View style={styles.snapshotCard}>
            <ThemedText style={styles.snapshotLabel}>Total Earnings</ThemedText>
            <ThemedText style={styles.snapshotValue}>P{totalEarnings.toFixed(0)}</ThemedText>
          </View>
        </View>

        {/* Next Assigned Job */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Next Assigned Job</ThemedText>
          {jobsLoading ? (
            <View style={styles.emptyStateCompact}>
              <ThemedText style={styles.emptyCompactText}>Loading next job...</ThemedText>
            </View>
          ) : nextJob ? (
            <TouchableOpacity style={styles.nextJobCard} onPress={() => router.push('/(mechanicShopTabs)/main/jobs')}>
              <View style={styles.nextJobTop}>
                <View style={[styles.nextJobStatusDot, { backgroundColor: getStatusColor(nextJob.status) }]} />
                <ThemedText style={styles.nextJobStatus}>{getStatusLabel(nextJob.status)}</ThemedText>
                <ThemedText style={styles.nextJobTime}>
                  {new Date(nextJob.booked_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </ThemedText>
              </View>
              <ThemedText style={styles.nextJobTitle}>
                {nextJob.request?.type
                  ? `${nextJob.request.type.charAt(0).toUpperCase() + nextJob.request.type.slice(1)} Service`
                  : 'Service Request'}
              </ThemedText>
              <ThemedText style={styles.nextJobLocation} numberOfLines={1}>
                {nextJob.service_location
                  ? `${nextJob.service_location.street_name || ''}, ${nextJob.service_location.barangay || ''}`
                  : 'No location specified'}
              </ThemedText>
              <View style={styles.nextJobFooter}>
                <ThemedText style={styles.nextJobAmount}>P{Number(nextJob.amount_fee || 0).toFixed(2)}</ThemedText>
                <ThemedText style={styles.nextJobAction}>View Jobs</ThemedText>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.emptyStateCompact}>
              <FontAwesome name="calendar-o" size={18} color="#666" />
              <ThemedText style={styles.emptyCompactText}>No active assigned job right now</ThemedText>
            </View>
          )}
        </View>

        {/* Performance Insights */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Performance Insights</ThemedText>
          <View style={styles.performanceCard}>
            <View style={styles.performanceRow}>
              <ThemedText style={styles.performanceLabel}>Completion Rate</ThemedText>
              <ThemedText style={styles.performanceValue}>{completionRate}%</ThemedText>
            </View>
            <View style={styles.performanceTrack}>
              <View style={[styles.performanceFill, { width: `${Math.min(100, completionRate)}%` }]} />
            </View>

            <View style={styles.performanceSplitRow}>
              <View style={styles.performanceMiniCard}>
                <ThemedText style={styles.performanceMiniLabel}>Avg. Completed Value</ThemedText>
                <ThemedText style={styles.performanceMiniValue}>P{avgCompletedValue.toFixed(0)}</ThemedText>
              </View>
              <View style={styles.performanceMiniCard}>
                <ThemedText style={styles.performanceMiniLabel}>Upcoming Open Jobs</ThemedText>
                <ThemedText style={styles.performanceMiniValue}>{upcomingJobs}</ThemedText>
              </View>
            </View>

            <View style={styles.performanceRowLast}>
              <ThemedText style={styles.performanceLabel}>Completed Value Today</ThemedText>
              <ThemedText style={styles.performanceToday}>P{todayCompletedValue.toFixed(0)}</ThemedText>
            </View>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Recent Activity</ThemedText>
          {jobsLoading ? (
            <View style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>Loading recent activity...</ThemedText>
            </View>
          ) : recentJobs.length > 0 ? (
            recentJobs.map((job) => (
              <View key={job.id} style={styles.activityRow}>
                <View style={[styles.activityDot, { backgroundColor: getStatusColor(job.status) }]} />
                <View style={styles.activityContent}>
                  <ThemedText style={styles.activityTitle} numberOfLines={1}>
                    #{job.id} {job.request?.type ? `${job.request.type.charAt(0).toUpperCase() + job.request.type.slice(1)} Service` : 'Service Request'}
                  </ThemedText>
                  <ThemedText style={styles.activitySubtitle} numberOfLines={1}>
                    {new Date(job.booked_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.activityStatus, { color: getStatusColor(job.status) }]}>
                  {getStatusLabel(job.status)}
                </ThemedText>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <FontAwesome name="inbox" size={40} color="#555" />
              <ThemedText style={styles.emptyText}>No recent activity</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Assigned jobs will appear here
              </ThemedText>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  shopHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  profileCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2A2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#34363A',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#222426',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ratingBadgeText: {
    fontSize: 12,
    color: '#ECEDEE',
    fontWeight: '700',
  },
  shopInfo: {
    marginLeft: 12,
    flex: 1,
  },
  shopLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 2,
  },
  shopName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF8C00',
  },
  welcomeSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 16,
    color: '#8E8E93',
    marginBottom: 4,
  },
  mechanicName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  availableDot: {
    backgroundColor: '#4CAF50',
  },
  workingDot: {
    backgroundColor: '#FF8C00',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 14,
    gap: 12,
  },
  metricCard: {
    width: '47%',
    backgroundColor: '#1A1C1E',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  metricIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  metricLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  snapshotRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  snapshotCard: {
    flex: 1,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    padding: 14,
  },
  snapshotLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  snapshotValue: {
    fontSize: 20,
    marginTop: 5,
    color: '#ECEDEE',
    fontWeight: '700',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  nextJobCard: {
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    padding: 14,
  },
  nextJobTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  nextJobStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  nextJobStatus: {
    fontSize: 12,
    color: '#BFC0C2',
    fontWeight: '600',
  },
  nextJobTime: {
    marginLeft: 'auto',
    fontSize: 12,
    color: '#8E8E93',
  },
  nextJobTitle: {
    fontSize: 15,
    color: '#ECEDEE',
    fontWeight: '700',
  },
  nextJobLocation: {
    marginTop: 4,
    fontSize: 12,
    color: '#8E8E93',
  },
  nextJobFooter: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextJobAmount: {
    color: '#34C759',
    fontWeight: '700',
    fontSize: 16,
  },
  nextJobAction: {
    color: '#FF8C00',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyStateCompact: {
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  emptyCompactText: {
    color: '#777',
    fontSize: 13,
  },
  emptyState: {
    backgroundColor: '#1A1C1E',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  activityRow: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 10,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '600',
  },
  activitySubtitle: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 3,
  },
  activityStatus: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 10,
  },
  performanceCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  performanceRowLast: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  performanceLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  performanceValue: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
  },
  performanceToday: {
    color: '#34C759',
    fontSize: 16,
    fontWeight: '700',
  },
  performanceTrack: {
    width: '100%',
    height: 8,
    borderRadius: 10,
    backgroundColor: '#252729',
    overflow: 'hidden',
  },
  performanceFill: {
    height: '100%',
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  performanceSplitRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  performanceMiniCard: {
    flex: 1,
    backgroundColor: '#202224',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 10,
  },
  performanceMiniLabel: {
    color: '#8E8E93',
    fontSize: 11,
  },
  performanceMiniValue: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#636366',
    marginTop: 4,
    textAlign: 'center',
  },
});
