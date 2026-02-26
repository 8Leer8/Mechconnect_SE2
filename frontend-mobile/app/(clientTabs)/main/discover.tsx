import React, { useState, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, FlatList, ActivityIndicator, Image, ListRenderItem } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';
import { useRouter } from 'expo-router';
import { styles } from '../../../style/client/discoverStyles';

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        if (activeTab === 'mechanics' && mechanics.length === 0) {
          const response = await fetch(`${API_URL}/users/mechanics/`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (cancelled) return;
          if (!response.ok) throw new Error('Failed to fetch mechanics');
          const data = await response.json() as MechanicsResponse;
          if (!cancelled) {
            setMechanics(data.mechanics || []);
          }
        } else if (activeTab === 'shops' && shops.length === 0) {
          const response = await fetch(`${API_URL}/shops/`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (cancelled) return;
          if (!response.ok) throw new Error('Failed to fetch shops');
          const data = await response.json() as ShopsResponse;
          if (!cancelled) {
            setShops(data.shops || []);
          }
        } else if (activeTab === 'services' && services.length === 0) {
          const response = await fetch(`${API_URL}/services/`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (cancelled) return;
          if (!response.ok) throw new Error('Failed to fetch services');
          const data = await response.json() as ServicesResponse;
          if (!cancelled) {
            setServices(data.services || []);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
          console.error('Error fetching data:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleNotificationPress = useCallback(() => {
    console.log('Notification pressed');
    // Add notification navigation here later
  }, []);

  // Memoized render functions for FlatList
  const renderMechanicItem: ListRenderItem<Mechanic> = useCallback(({ item: mechanic }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/client/mechanic/mechanicprofile?mechanicId=${mechanic.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        {mechanic.profile_photo ? (
          <Image source={{ uri: mechanic.profile_photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <ThemedText style={styles.avatarText}>
              {mechanic.name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
        )}
        <View style={styles.cardInfo}>
          <ThemedText style={styles.cardTitle}>{mechanic.name}</ThemedText>
          <ThemedText style={styles.cardText}>⭐ {mechanic.average_rating.toFixed(1)}</ThemedText>
        </View>
      </View>
      <ThemedText style={styles.cardText}>Contact: {mechanic.contact_number}</ThemedText>
      <ThemedText style={styles.cardText}>Status: {mechanic.status}</ThemedText>
    </TouchableOpacity>
  ), [router]);

  const renderShopItem: ListRenderItem<Shop> = useCallback(({ item: shop }) => (
    <View style={styles.card}>
      {shop.service_banner && (
        <Image source={{ uri: shop.service_banner }} style={styles.shopBanner} />
      )}
      <ThemedText style={styles.cardTitle}>{shop.shop_name}</ThemedText>
      <ThemedText style={styles.cardText}>Owner: {shop.owner_name}</ThemedText>
      <ThemedText style={styles.cardText}>Contact: {shop.contact_number}</ThemedText>
      {shop.description && (
        <ThemedText style={styles.cardText} numberOfLines={2}>
          {shop.description}
        </ThemedText>
      )}
      <View style={styles.badgeContainer}>
        {shop.is_verified && (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>✓ Verified</ThemedText>
          </View>
        )}
        <ThemedText style={styles.statusText}>{shop.status}</ThemedText>
      </View>
    </View>
  ), []);

  const renderServiceItem: ListRenderItem<Service> = useCallback(({ item: service }) => (
    <View style={styles.card}>
      {service.service_picture && (
        <Image source={{ uri: service.service_picture }} style={styles.servicePicture} />
      )}
      <ThemedText style={styles.cardTitle}>{service.name}</ThemedText>
      <ThemedText style={styles.categoryText}>{service.category}</ThemedText>
      {service.description && (
        <ThemedText style={styles.cardText} numberOfLines={3}>
          {service.description}
        </ThemedText>
      )}
      <ThemedText style={styles.priceText}>₱{service.minimum_price?.toFixed(2) || '0.00'}</ThemedText>
    </View>
  ), []);

  const keyExtractor = useCallback((item: Mechanic | Shop | Service) => item.id.toString(), []);

  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyCard}>
      <ThemedText style={styles.emptyText}>
        No {activeTab} available
      </ThemedText>
    </View>
  ), [activeTab]);

  const renderListHeader = useCallback(() => {
    if (loading) {
      return (
        <View style={{ paddingVertical: 20 }}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      );
    }
    if (error) {
      return <ThemedText style={styles.errorText}>{error}</ThemedText>;
    }
    return null;
  }, [loading, error]);

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'mechanics' && styles.activeTab]}
          onPress={() => setActiveTab('mechanics')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'mechanics' && styles.activeTabText]}>
            Mechanics
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'shops' && styles.activeTab]}
          onPress={() => setActiveTab('shops')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'shops' && styles.activeTabText]}>
            Shops
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'services' && styles.activeTab]}
          onPress={() => setActiveTab('services')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'services' && styles.activeTabText]}>
            Services
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content - Using FlatList for better performance */}
      {activeTab === 'mechanics' && (
        <FlatList
          data={mechanics}
          renderItem={renderMechanicItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={!loading && !error ? renderEmptyComponent : null}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          style={{ flex: 1, backgroundColor: '#FFF5E6' }}
          contentContainerStyle={{ padding: 16, backgroundColor: '#FFF5E6' }}
        />
      )}
      {activeTab === 'shops' && (
        <FlatList
          data={shops}
          renderItem={renderShopItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={!loading && !error ? renderEmptyComponent : null}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          style={{ flex: 1, backgroundColor: '#FFF5E6' }}
          contentContainerStyle={{ padding: 16, backgroundColor: '#FFF5E6' }}
        />
      )}
      {activeTab === 'services' && (
        <FlatList
          data={services}
          renderItem={renderServiceItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={!loading && !error ? renderEmptyComponent : null}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          style={{ flex: 1, backgroundColor: '#FFF5E6' }}
          contentContainerStyle={{ padding: 16, backgroundColor: '#FFF5E6' }}
        />
      )}
    </ThemedView>
  );
}
