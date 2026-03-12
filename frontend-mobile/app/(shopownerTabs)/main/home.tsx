import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { TopNav } from '@/components/navigation';
import { SkeletonDashboard } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

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

export default function ShopOwnerHome() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/shops/dashboard/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json() as DashboardData;
      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <TopNav onNotificationPress={handleNotificationPress} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SkeletonDashboard />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !dashboardData) {
    return (
      <ThemedView style={styles.container}>
        <TopNav onNotificationPress={handleNotificationPress} />
        <View style={styles.errorContainer}>
          <View style={styles.errorIconWrap}>
            <FontAwesome name="exclamation-triangle" size={32} color="#FF3B30" />
          </View>
          <ThemedText style={styles.errorText}>{error || 'No data available'}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9500" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText style={styles.greeting}>Dashboard</ThemedText>
            <ThemedText style={styles.shopName}>{dashboardData.shop_name}</ThemedText>
          </View>
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: dashboardData.shop_status === 'open' ? '#34C759' : '#FF3B30' }]} />
            <ThemedText style={styles.statusText}>
              {dashboardData.shop_status === 'open' ? 'Open' : 'Closed'}
            </ThemedText>
          </View>
        </View>

        {/* Verification Badge */}
        {dashboardData.is_verified && (
          <View style={styles.verifiedBadge}>
            <FontAwesome name="check-circle" size={18} color="#34C759" />
            <ThemedText style={styles.verifiedText}>Verified Shop</ThemedText>
          </View>
        )}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Total Mechanics */}
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FF950018' }]}>
              <FontAwesome name="users" size={20} color="#FF9500" />
            </View>
            <ThemedText style={styles.statValue}>{dashboardData.total_mechanics}</ThemedText>
            <ThemedText style={styles.statLabel}>Mechanics</ThemedText>
          </View>

          {/* Total Services */}
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#34C75918' }]}>
              <FontAwesome name="wrench" size={20} color="#34C759" />
            </View>
            <ThemedText style={styles.statValue}>{dashboardData.total_services}</ThemedText>
            <ThemedText style={styles.statLabel}>Services</ThemedText>
          </View>

          {/* Active Bookings */}
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#FF950018' }]}>
              <FontAwesome name="calendar-check-o" size={20} color="#FF9500" />
            </View>
            <ThemedText style={styles.statValue}>{dashboardData.active_bookings}</ThemedText>
            <ThemedText style={styles.statLabel}>Active</ThemedText>
          </View>

          {/* Completed Jobs */}
          <View style={styles.statCard}>
            <View style={[styles.statIconContainer, { backgroundColor: '#34C75918' }]}>
              <FontAwesome name="check-circle" size={20} color="#34C759" />
            </View>
            <ThemedText style={styles.statValue}>{dashboardData.completed_jobs}</ThemedText>
            <ThemedText style={styles.statLabel}>Completed</ThemedText>
          </View>
        </View>

        {/* Revenue Card */}
        <View style={styles.revenueCard}>
          <View style={styles.revenueHeader}>
            <View style={styles.revenueIconCircle}>
              <FontAwesome name="line-chart" size={20} color="#FF9500" />
            </View>
            <ThemedText style={styles.revenueLabel}>Total Revenue</ThemedText>
          </View>
          <ThemedText style={styles.revenueValue} numberOfLines={2} adjustsFontSizeToFit>
            ₱{Number(dashboardData.total_revenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </ThemedText>
        </View>

        {/* Rating Card */}
        <View style={styles.ratingCard}>
          <View style={styles.ratingHeader}>
            <FontAwesome name="star" size={22} color="#FFCC00" />
            <ThemedText style={styles.ratingLabel}>Average Rating</ThemedText>
          </View>
          <View style={styles.ratingContent}>
            <ThemedText style={styles.ratingValue}>{dashboardData.average_rating.toFixed(2)}</ThemedText>
            <ThemedText style={styles.ratingMax}> / 5.00</ThemedText>
          </View>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <FontAwesome
                key={star}
                name={star <= Math.round(dashboardData.average_rating) ? 'star' : 'star-o'}
                size={16}
                color="#FFCC00"
              />
            ))}
          </View>
        </View>

        {/* Quick Stats Summary */}
        <View style={styles.summaryCard}>
          <ThemedText style={styles.summaryTitle}>Performance Summary</ThemedText>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Total Jobs</ThemedText>
            <ThemedText style={styles.summaryValue}>{dashboardData.completed_jobs}</ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Team Size</ThemedText>
            <ThemedText style={styles.summaryValue}>{dashboardData.total_mechanics} mechanics</ThemedText>
          </View>
          <View style={styles.summaryRow}>
            <ThemedText style={styles.summaryLabel}>Service Count</ThemedText>
            <ThemedText style={styles.summaryValue}>{dashboardData.total_services} services</ThemedText>
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
    paddingTop: 56,
    paddingBottom: 32,
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 16,
    color: '#888',
    marginBottom: 4,
  },
  shopName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0F1F12',
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1D3B22',
  },
  verifiedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#34C759',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252525',
  },
  statIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#888',
  },
  revenueCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#252525',
  },
  revenueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  revenueLabel: {
    fontSize: 16,
    color: '#888',
  },
  revenueValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF9500',
    flexShrink: 1,
  },
  revenueIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF950018',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#252525',
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 16,
    color: '#888',
  },
  ratingContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  ratingValue: {
    fontSize: 30,
    fontWeight: '700',
    color: '#fff',
  },
  ratingMax: {
    fontSize: 20,
    color: '#888',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  summaryCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#252525',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  summaryLabel: {
    fontSize: 15,
    color: '#888',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
