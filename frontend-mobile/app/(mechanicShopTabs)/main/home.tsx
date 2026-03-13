import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { TopNav } from '@/components/navigation';
import { SkeletonMechanicShopHome } from '@/components/skeletons/SkeletonLoaders';
import { useWebSocketContext } from '@/context/WebSocketContext';

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
    };
  };
}

export default function MechanicShopDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo>({ shop_id: null, shop_name: null });
  const [mechanicName, setMechanicName] = useState<string>('Mechanic');
  const [mechanicStatus, setMechanicStatus] = useState<string>('available');
  const [rating, setRating] = useState<number>(0);
  const { lastMessage } = useWebSocketContext();

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch profile details
      const profileResponse = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        const profile = profileData.profile as ProfileData;
        
        setMechanicName(profile.full_name || 'Mechanic');
        setMechanicStatus(profile.current_role_profile?.mechanic?.status || 'available');
        const mechanicRating = profile.current_role_profile?.mechanic?.average_rating;
        setRating(Number(mechanicRating) || 0);
        
        // Set shop info from profile
        const mechanicProfile = profile.current_role_profile?.mechanic;
        if (mechanicProfile?.is_working_for_shop && mechanicProfile.shop_name) {
          setShopInfo({
            shop_id: mechanicProfile.shop_id,
            shop_name: mechanicProfile.shop_name,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Re-fetch when a WebSocket booking update arrives
  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      fetchDashboardData();
    }
  }, [lastMessage]);

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
          <SkeletonMechanicShopHome />
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Shop Header */}
        <View style={styles.shopHeader}>
          <FontAwesome name="building" size={28} color="#FF8C00" />
          <View style={styles.shopInfo}>
            <ThemedText style={styles.shopLabel}>Working at</ThemedText>
            <ThemedText style={styles.shopName}>
              {shopInfo.shop_name || 'No Shop Assigned'}
            </ThemedText>
          </View>
        </View>

        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <ThemedText style={styles.welcomeText}>Welcome back,</ThemedText>
          <ThemedText style={styles.mechanicName}>{mechanicName}</ThemedText>
          <View style={styles.statusBadge}>
            <View style={[
              styles.statusDot,
              mechanicStatus === 'available' ? styles.availableDot : styles.workingDot
            ]} />
            <ThemedText style={styles.statusText}>
              {mechanicStatus === 'available' ? 'Available' : 'Working'}
            </ThemedText>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <FontAwesome name="star" size={24} color="#FFD700" />
            <ThemedText style={styles.statValue}>
              {Number(rating || 0).toFixed(1)}
            </ThemedText>
            <ThemedText style={styles.statLabel}>Rating</ThemedText>
          </View>

          <View style={styles.statCard}>
            <FontAwesome name="calendar-check-o" size={24} color="#4CAF50" />
            <ThemedText style={styles.statValue}>-</ThemedText>
            <ThemedText style={styles.statLabel}>Jobs Today</ThemedText>
          </View>

          <View style={styles.statCard}>
            <FontAwesome name="wrench" size={24} color="#2196F3" />
            <ThemedText style={styles.statValue}>-</ThemedText>
            <ThemedText style={styles.statLabel}>Completed</ThemedText>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
          
          <TouchableOpacity style={styles.actionCard}>
            <View style={styles.actionIcon}>
              <FontAwesome name="clock-o" size={20} color="#FF8C00" />
            </View>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionTitle}>Today's Schedule</ThemedText>
              <ThemedText style={styles.actionSubtitle}>View your bookings for today</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard}>
            <View style={styles.actionIcon}>
              <FontAwesome name="history" size={20} color="#FF8C00" />
            </View>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionTitle}>Work History</ThemedText>
              <ThemedText style={styles.actionSubtitle}>Check past completed jobs</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard}>
            <View style={styles.actionIcon}>
              <FontAwesome name="building" size={20} color="#FF8C00" />
            </View>
            <View style={styles.actionInfo}>
              <ThemedText style={styles.actionTitle}>Shop Details</ThemedText>
              <ThemedText style={styles.actionSubtitle}>View shop information</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Recent Activity</ThemedText>
          <View style={styles.emptyState}>
            <FontAwesome name="inbox" size={40} color="#555" />
            <ThemedText style={styles.emptyText}>No recent activity</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Your recent jobs will appear here
            </ThemedText>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF8C00',
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
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ECEDEE',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
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
  emptyState: {
    backgroundColor: '#1C1C1E',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
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
