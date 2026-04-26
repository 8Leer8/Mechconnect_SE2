import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, Dimensions, TouchableOpacity, Image, Switch } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { SkeletonDashboard } from '@/components/skeletons/SkeletonLoaders';
import WalletSection from '@/components/wallet-section';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { useFocusEffect } from '@react-navigation/native';
import { getImageUrl } from '@/lib/imageUtils';
import { fetchProfileDetailsCached } from '@/lib/profileCache';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useNotification } from '@/hooks/useNotification';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_API_URL;
const DASHBOARD_REFRESH_THROTTLE_MS = 10 * 1000;
const DASHBOARD_POLL_MS = 60 * 1000;

interface DashboardData {
  shop_name: string;
  total_mechanics: number;
  total_services: number;
  active_bookings: number;
  completed_jobs: number;
  total_revenue: number;
  average_rating: number;
  shop_status: string;
  is_verified: boolean;
}

interface CashRemittanceSummary {
  count: number;
  totalAmount: number;
}

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
};

export default function ShopOwnerHome() {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [shopBannerUrl, setShopBannerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [cashRemittanceSummary, setCashRemittanceSummary] = useState<CashRemittanceSummary>({
    count: 0,
    totalAmount: 0,
  });
  const { lastMessage } = useWebSocketContext();
  const dashboardFetchInFlightRef = useRef(false);
  const lastDashboardFetchAtRef = useRef(0);

  const fetchDashboardData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && now - lastDashboardFetchAtRef.current < DASHBOARD_REFRESH_THROTTLE_MS) {
      setRefreshing(false);
      return;
    }
    if (dashboardFetchInFlightRef.current) {
      setRefreshing(false);
      return;
    }

    dashboardFetchInFlightRef.current = true;
    lastDashboardFetchAtRef.current = now;
    try {
      setError(null);
      const [response, profile, remittanceResponse] = await Promise.all([
        fetch(`${API_URL}/shops/dashboard/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetchProfileDetailsCached(false),
        fetch(`${API_URL}/bookings/shopowner/cash-remittances/?status=pending`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null),
      ]);

      const payload = (await response.json().catch(() => ({}))) as DashboardData & { error?: string };

      if (!response.ok) {
        const serverMsg =
          typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error
            : `Could not load dashboard (HTTP ${response.status})`;
        throw new Error(serverMsg);
      }

      setDashboardData(payload as DashboardData);

      setShopBannerUrl(profile?.current_role_profile?.shop_owner?.shop?.service_banner || null);

      if (remittanceResponse?.ok) {
        const remittancePayload = (await remittanceResponse.json().catch(() => ({}))) as {
          remittances?: { amount?: number | string }[];
          count?: number;
        };
        const remittances = remittancePayload.remittances || [];
        const totalAmount = remittances.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        setCashRemittanceSummary({
          count: remittancePayload.count ?? remittances.length,
          totalAmount,
        });
      } else {
        setCashRemittanceSummary({ count: 0, totalAmount: 0 });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Network error — check API URL and that the server is running.';
      setError(message);
      console.error('Dashboard error:', err);
    } finally {
      dashboardFetchInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    const t = String(lastMessage.type || '').toLowerCase();
    if (t === 'booking_update') {
      fetchDashboardData(true);
    }
  }, [lastMessage, fetchDashboardData]);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
      const poll = setInterval(fetchDashboardData, DASHBOARD_POLL_MS);
      return () => clearInterval(poll);
    }, [fetchDashboardData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData(true);
  };

  const updateShopAvailability = useCallback(async (isAvailable: boolean) => {
    if (!dashboardData || statusUpdating) return;

    const nextPublicStatus: 'available' | 'unavailable' = isAvailable ? 'available' : 'unavailable';
    const nextRawStatus = isAvailable ? 'open' : 'closed';
    const previousRawStatus = dashboardData.shop_status;

    setStatusUpdating(true);
    setDashboardData((prev) => (prev ? { ...prev, shop_status: nextRawStatus } : prev));

    try {
      const response = await fetch(`${API_URL}/users/profile/availability/`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'shop_owner', status: nextPublicStatus }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update availability');
      }
      showNotification({
        type: 'success',
        message: nextPublicStatus === 'available' ? 'Shop is now visible in discovery.' : 'Shop is now hidden from discovery.',
      });
    } catch (error) {
      setDashboardData((prev) => (prev ? { ...prev, shop_status: previousRawStatus } : prev));
      showNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to update availability',
      });
    } finally {
      setStatusUpdating(false);
    }
  }, [dashboardData, showNotification, statusUpdating]);

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText style={styles.greeting}>{getGreeting()}</ThemedText>
              <ThemedText style={styles.shopName}>{dashboardData?.shop_name || 'Loading...'}</ThemedText>
            </View>
          </View>
          <WalletSection
            creditsSource="shop-owner"
            showAddButton
            addHref="/shopowner/wallet"
          />
          <SkeletonDashboard />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !dashboardData) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { justifyContent: 'center', minHeight: '100%' }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText style={styles.greeting}>{getGreeting()}</ThemedText>
              <ThemedText style={styles.shopName}>Dashboard</ThemedText>
            </View>
          </View>
          <WalletSection
            creditsSource="shop-owner"
            showAddButton
            addHref="/shopowner/wallet"
          />
          <View style={[styles.errorContainer, { marginTop: 40 }]}>
            <View style={styles.errorIconWrap}>
              <FontAwesome name="exclamation-triangle" size={36} color="#FF3B30" />
            </View>
            <ThemedText style={[styles.errorText, { fontSize: 16, fontWeight: '600', textAlign: 'center' }]}>
              {error || 'Unable to load dashboard'}
            </ThemedText>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => {
                setLoading(true);
                fetchDashboardData();
              }}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Premium Header */}
        <View style={styles.header}>
            <View style={styles.headerTop}>
            <View style={styles.headerText}>
              <ThemedText style={styles.greeting}>{getGreeting()}</ThemedText>
              <ThemedText style={styles.shopName} numberOfLines={1}>{dashboardData.shop_name}</ThemedText>
            </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <NotificationBell />
                <View style={[styles.statusBadge, { backgroundColor: dashboardData.shop_status === 'open' ? '#34C75920' : '#FF3B3020' }]}>
                  <View style={[styles.statusDot, { backgroundColor: dashboardData.shop_status === 'open' ? '#34C759' : '#FF3B30' }]} />
                  <ThemedText style={[styles.statusText, { color: dashboardData.shop_status === 'open' ? '#34C759' : '#FF3B30' }]}>
                    {dashboardData.shop_status === 'open' ? 'Open' : 'Closed'}
                  </ThemedText>
                </View>
                <Switch
                  value={dashboardData.shop_status === 'open'}
                  onValueChange={(value) => { void updateShopAvailability(value); }}
                  disabled={statusUpdating}
                  trackColor={{ false: '#3A3C3E', true: '#34C759' }}
                  thumbColor="#fff"
                />
              </View>
          </View>

          <View style={styles.bannerWrap}>
            {shopBannerUrl ? (
              <Image source={{ uri: getImageUrl(shopBannerUrl) || '' }} style={styles.bannerImage} />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <FontAwesome name="image" size={22} color="#8E8E93" />
                <ThemedText style={styles.bannerPlaceholderText}>Shop banner unavailable</ThemedText>
              </View>
            )}
          </View>

          {/* Verification Badge */}
          {dashboardData.is_verified && (
            <View style={styles.verifiedBadge}>
              <FontAwesome name="check-circle" size={16} color="#34C759" />
              <ThemedText style={styles.verifiedText}>Verified Shop</ThemedText>
            </View>
          )}
        </View>

        <WalletSection
          creditsSource="shop-owner"
          showAddButton
          addHref="/shopowner/wallet"
        />

        {/* Shop Management */}
        <View style={styles.summarySection}>
          <ThemedText style={styles.sectionTitle}>Shop Management</ThemedText>
          {cashRemittanceSummary.count > 0 ? (
            <TouchableOpacity
              style={styles.remittanceHomeCard}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: '/(shopownerTabs)/main/jobs',
                  params: { tab: 'remittance' },
                } as any)
              }
            >
              <View style={styles.managementActionLeft}>
                <View style={styles.remittanceIcon}>
                  <FontAwesome name="handshake-o" size={16} color="#FFD60A" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.managementActionTitle}>Pending Cash Remittance</ThemedText>
                  <ThemedText style={styles.managementActionSubtitle}>
                    {cashRemittanceSummary.count} job{cashRemittanceSummary.count === 1 ? '' : 's'} need cash surrender.
                  </ThemedText>
                </View>
              </View>
              <View style={styles.remittanceAmountPill}>
                <ThemedText style={styles.remittanceAmountText}>
                  ₱{cashRemittanceSummary.totalAmount.toFixed(2)}
                </ThemedText>
              </View>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.managementActionCard}
            activeOpacity={0.8}
            onPress={() => router.push('/shopowner/others/edit-profile')}
          >
            <View style={styles.managementActionLeft}>
              <View style={styles.managementActionIcon}>
                <FontAwesome name="sitemap" size={16} color="#FF8C00" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.managementActionTitle}>Manage Branches</ThemedText>
                <ThemedText style={styles.managementActionSubtitle}>
                  Add branches, set main branch, and update branch labels.
                </ThemedText>
              </View>
            </View>
            <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Stats Grid - 2x2 */}
        <View style={styles.statsSection}>
          <ThemedText style={styles.sectionTitle}>Quick Stats</ThemedText>
          <View style={styles.statsGrid}>
            {/* Active Bookings */}
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#FF8C0020' }]}>
                <FontAwesome name="calendar-check-o" size={18} color="#FF8C00" />
              </View>
              <ThemedText style={styles.statValue}>{dashboardData.active_bookings}</ThemedText>
              <ThemedText style={styles.statLabel}>Active Bookings</ThemedText>
            </View>

            {/* Total Mechanics */}
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#007AFF20' }]}>
                <FontAwesome name="users" size={18} color="#007AFF" />
              </View>
              <ThemedText style={styles.statValue}>{dashboardData.total_mechanics}</ThemedText>
              <ThemedText style={styles.statLabel}>Mechanics</ThemedText>
            </View>

            {/* Total Services */}
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#34C75920' }]}>
                <FontAwesome name="wrench" size={18} color="#34C759" />
              </View>
              <ThemedText style={styles.statValue}>{dashboardData.total_services}</ThemedText>
              <ThemedText style={styles.statLabel}>Services Offered</ThemedText>
            </View>

            {/* Average Rating */}
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: '#FFCC0020' }]}>
                <FontAwesome name="star" size={18} color="#FFCC00" />
              </View>
              <ThemedText style={styles.statValue}>{dashboardData.average_rating.toFixed(1)}</ThemedText>
              <ThemedText style={styles.statLabel}>Shop Rating</ThemedText>
            </View>
          </View>
        </View>

        {/* Hero Section - Total Revenue and Completed Jobs */}
        <View style={styles.heroSection}>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <FontAwesome name="line-chart" size={28} color="#FF8C00" />
              </View>
              <ThemedText style={styles.heroLabel}>Total Revenue</ThemedText>
            </View>
            <ThemedText style={styles.heroValue}>₱{Number(dashboardData.total_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</ThemedText>
            <ThemedText style={styles.heroSubtext}>This month</ThemedText>
          </View>

          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <FontAwesome name="check-circle" size={28} color="#FF8C00" />
              </View>
              <ThemedText style={styles.heroLabel}>Completed Jobs</ThemedText>
            </View>
            <ThemedText style={styles.heroValue}>{dashboardData.completed_jobs}</ThemedText>
            <ThemedText style={styles.heroSubtext}>All time</ThemedText>
          </View>
        </View>

        {/* Rating Detail Card */}
        <View style={styles.ratingDetailCard}>
          <View style={styles.ratingTop}>
            <View>
              <ThemedText style={styles.ratingTitle}>Customer Rating</ThemedText>
              <View style={styles.ratingStars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <FontAwesome
                    key={star}
                    name={star <= Math.round(dashboardData.average_rating) ? 'star' : 'star-o'}
                    size={14}
                    color="#FFCC00"
                    style={{ marginRight: 3 }}
                  />
                ))}
              </View>
            </View>
            <View style={styles.ratingScore}>
              <ThemedText style={styles.ratingScoreValue}>{dashboardData.average_rating.toFixed(2)}</ThemedText>
              <ThemedText style={styles.ratingScoreMax}>/ 5</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.ratingText}>Based on customer feedback</ThemedText>
        </View>

        {/* Performance Summary */}
        <View style={styles.summarySection}>
          <ThemedText style={styles.sectionTitle}>Performance Overview</ThemedText>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryRowLeft}>
                <View style={[styles.summaryIcon, { backgroundColor: '#FF8C0020' }]}>
                  <FontAwesome name="briefcase" size={14} color="#FF8C00" />
                </View>
                <View>
                  <ThemedText style={styles.summaryLabel}>Total Jobs</ThemedText>
                  <ThemedText style={styles.summarySmall}>Completed services</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.summaryBigValue}>{dashboardData.completed_jobs}</ThemedText>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <View style={styles.summaryRowLeft}>
                <View style={[styles.summaryIcon, { backgroundColor: '#007AFF20' }]}>
                  <FontAwesome name="users" size={14} color="#007AFF" />
                </View>
                <View>
                  <ThemedText style={styles.summaryLabel}>Mechanics</ThemedText>
                  <ThemedText style={styles.summarySmall}>Active mechanics</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.summaryBigValue}>{dashboardData.total_mechanics}</ThemedText>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <View style={styles.summaryRowLeft}>
                <View style={[styles.summaryIcon, { backgroundColor: '#34C75920' }]}>
                  <FontAwesome name="cog" size={14} color="#34C759" />
                </View>
                <View>
                  <ThemedText style={styles.summaryLabel}>Services</ThemedText>
                  <ThemedText style={styles.summarySmall}>Available options</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.summaryBigValue}>{dashboardData.total_services}</ThemedText>
            </View>
          </View>
        </View>

      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B3018',
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: '#FF8C00',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // ─── Header Section ───
  header: {
    marginBottom: 36,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  shopName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  bannerWrap: {
    marginTop: 2,
    marginBottom: 14,
  },
  bannerImage: {
    width: '100%',
    height: 150,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
  },
  bannerPlaceholder: {
    width: '100%',
    height: 150,
    borderRadius: 18,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#252525',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  bannerPlaceholderText: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0F3D1A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1D5A2E',
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#34C759',
    letterSpacing: 0.2,
  },
  // ─── Hero Section ───
  heroSection: {
    gap: 14,
    marginBottom: 32,
  },
  heroCard: {
    backgroundColor: '#151515',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#252525',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#FF8C0020',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FF8C00',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  heroSubtext: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  // ─── Stats Section ───
  statsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: (width - 56) / 2,
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252525',
    paddingHorizontal: 10,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.2,
    width: '100%',
  },
  // ─── Rating Detail Card ───
  ratingDetailCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#252525',
  },
  ratingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  ratingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingScore: {
    alignItems: 'flex-end',
  },
  ratingScoreValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  ratingScoreMax: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  // ─── Summary Section ───
  summarySection: {
    marginBottom: 20,
    gap: 12,
  },
  summaryCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#252525',
    gap: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  summarySmall: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  summaryBigValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FF8C00',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
  },
  managementActionCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#252525',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  remittanceHomeCard: {
    backgroundColor: '#1A1710',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FF950040',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  managementActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  managementActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FF8C0020',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remittanceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFD60A20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remittanceAmountPill: {
    backgroundColor: '#FF950020',
    borderWidth: 1,
    borderColor: '#FF950050',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  remittanceAmountText: {
    color: '#FFD60A',
    fontSize: 13,
    fontWeight: '800',
  },
  managementActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  managementActionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    lineHeight: 17,
  },
});
