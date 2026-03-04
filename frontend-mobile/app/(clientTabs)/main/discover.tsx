import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Image,
  ListRenderItem,
  RefreshControl,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getImageUrl } from '@/lib/imageUtils';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Mechanic {
  id: number;
  name: string;
  profile_photo: string | null;
  contact_number: string;
  average_rating: number;
  status: string;
}

interface Shop {
  id: number;
  shop_name: string;
  owner_name: string;
  contact_number: string;
  email: string;
  description: string;
  service_banner: string | null;
  is_verified: boolean;
  status: string;
}

interface Service {
  id: number;
  name: string;
  description: string;
  service_picture: string | null;
  category: string;
  minimum_price: number;
}

interface MechanicsResponse {
  mechanics: Mechanic[];
}

interface ShopsResponse {
  shops: Shop[];
}

interface ServicesResponse {
  services: Service[];
}

type TabType = 'mechanics' | 'shops' | 'services';

export default function DiscoverScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('mechanics');
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (tab: TabType, force = false) => {
    try {
      setLoading(true);
      setError(null);

      if (tab === 'mechanics' && (mechanics.length === 0 || force)) {
        const response = await fetch(`${API_URL}/users/mechanics/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch mechanics');
        const data = await response.json() as MechanicsResponse;
        setMechanics(data.mechanics || []);
      } else if (tab === 'shops' && (shops.length === 0 || force)) {
        const response = await fetch(`${API_URL}/shops/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch shops');
        const data = await response.json() as ShopsResponse;
        setShops(data.shops || []);
      } else if (tab === 'services' && (services.length === 0 || force)) {
        const response = await fetch(`${API_URL}/services/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch services');
        const data = await response.json() as ServicesResponse;
        setServices(data.services || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mechanics.length, shops.length, services.length]);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(activeTab, true);
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'mechanics', label: 'Mechanics', icon: 'wrench' },
    { key: 'shops', label: 'Shops', icon: 'building' },
    { key: 'services', label: 'Services', icon: 'cogs' },
  ];

  // Memoized render functions for FlatList
  const renderMechanicItem: ListRenderItem<Mechanic> = useCallback(({ item: mechanic }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/client/mechanic/mechanicprofile?mechanicId=${mechanic.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardRow}>
        {mechanic.profile_photo ? (
          <Image source={{ uri: getImageUrl(mechanic.profile_photo) || '' }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <ThemedText style={styles.avatarText}>
              {mechanic.name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}
        <View style={styles.cardBody}>
          <ThemedText style={styles.cardTitle}>{mechanic.name}</ThemedText>
          <View style={styles.ratingRow}>
            <FontAwesome name="star" size={12} color="#FFD60A" />
            <ThemedText style={styles.ratingText}>{mechanic.average_rating.toFixed(1)}</ThemedText>
          </View>
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.statusDot, { backgroundColor: mechanic.status === 'active' ? '#34C759' : '#8E8E93' }]} />
          <ThemedText style={styles.statusLabel}>{mechanic.status}</ThemedText>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <FontAwesome name="phone" size={12} color="#8E8E93" />
        <ThemedText style={styles.footerText}>{mechanic.contact_number}</ThemedText>
      </View>
    </TouchableOpacity>
  ), [router]);

  const renderShopItem: ListRenderItem<Shop> = useCallback(({ item: shop }) => (
    <View style={styles.card}>
      {shop.service_banner && (
        <Image source={{ uri: getImageUrl(shop.service_banner) || '' }} style={styles.shopBanner} />
      )}
      <View style={styles.shopHeader}>
        <View style={styles.shopInfo}>
          <ThemedText style={styles.cardTitle}>{shop.shop_name}</ThemedText>
          <ThemedText style={styles.shopOwner}>by {shop.owner_name}</ThemedText>
        </View>
        {shop.is_verified && (
          <View style={styles.verifiedBadge}>
            <FontAwesome name="check-circle" size={12} color="#34C759" />
            <ThemedText style={styles.verifiedText}>Verified</ThemedText>
          </View>
        )}
      </View>
      {shop.description ? (
        <ThemedText style={styles.descText} numberOfLines={2}>{shop.description}</ThemedText>
      ) : null}
      <View style={styles.cardFooter}>
        <FontAwesome name="phone" size={12} color="#8E8E93" />
        <ThemedText style={styles.footerText}>{shop.contact_number}</ThemedText>
      </View>
    </View>
  ), []);

  const renderServiceItem: ListRenderItem<Service> = useCallback(({ item: service }) => (
    <View style={styles.card}>
      {service.service_picture && (
        <Image source={{ uri: getImageUrl(service.service_picture) || '' }} style={styles.servicePicture} />
      )}
      <View style={styles.serviceHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.cardTitle}>{service.name}</ThemedText>
          <View style={styles.categoryBadge}>
            <ThemedText style={styles.categoryText}>{service.category}</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.priceText}>
          ₱{parseFloat(String(service.minimum_price || '0')).toFixed(2)}
        </ThemedText>
      </View>
      {service.description ? (
        <ThemedText style={styles.descText} numberOfLines={3}>{service.description}</ThemedText>
      ) : null}
    </View>
  ), []);

  const keyExtractor = useCallback((item: Mechanic | Shop | Service) => item.id.toString(), []);

  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyCard}>
      <FontAwesome name="inbox" size={36} color="#555" />
      <ThemedText style={styles.emptyText}>No {activeTab} available</ThemedText>
    </View>
  ), [activeTab]);

  const renderListHeader = useCallback(() => {
    if (loading && !refreshing) {
      return (
        <View style={{ paddingVertical: 30 }}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.errorCard}>
          <FontAwesome name="exclamation-circle" size={24} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData(activeTab, true)}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }, [loading, refreshing, error, activeTab, fetchData]);

  const currentData = activeTab === 'mechanics' ? mechanics : activeTab === 'shops' ? shops : services;
  const currentRenderer = activeTab === 'mechanics' ? renderMechanicItem : activeTab === 'shops' ? renderShopItem : renderServiceItem;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Discover</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            Browse mechanics, shops & services
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <FontAwesome
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.key ? '#fff' : '#8E8E93'}
            />
            <ThemedText style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content - Using FlatList for performance */}
      <FlatList
        data={currentData as any[]}
        renderItem={currentRenderer as any}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={!loading && !error ? renderEmptyComponent : null}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  activeTab: {
    backgroundColor: '#FF8C00',
    borderColor: '#FF8C00',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#fff',
  },
  // List
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 30,
  },
  // Card
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#FF8C0020',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF8C00',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD60A',
  },
  cardRight: {
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 11,
    color: '#8E8E93',
    textTransform: 'capitalize',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
  },
  // Shop
  shopBanner: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 12,
  },
  shopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  shopInfo: {
    flex: 1,
  },
  shopOwner: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#34C75915',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#34C759',
  },
  descText: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
    marginBottom: 4,
  },
  // Service
  servicePicture: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    marginBottom: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF8C0015',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF8C00',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  // Empty
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
  },
  // Error
  errorCard: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
