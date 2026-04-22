import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getImageUrl } from '@/lib/imageUtils';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type TabType = 'mechanics' | 'shops';

type FavoriteMechanic = {
  id: number;
  name: string;
  profile_photo: string | null;
  contact_number: string | null;
  average_rating: number;
  status: string;
  is_working_for_shop?: boolean;
  is_favorited?: boolean;
};

type FavoriteShop = {
  id: number;
  shop_name: string;
  owner_name: string;
  service_banner: string | null;
  contact_number: string | null;
  email: string | null;
  description: string | null;
  is_verified: boolean;
  status: string;
  is_favorited?: boolean;
};

type FavoritesResponse = {
  mechanics: FavoriteMechanic[];
  shops: FavoriteShop[];
};

export default function FavoritesScreen() {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>('mechanics');
  const [mechanics, setMechanics] = useState<FavoriteMechanic[]>([]);
  const [shops, setShops] = useState<FavoriteShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/users/favorites/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to load favorites');
      }

      const payload = data as FavoritesResponse;
      setMechanics(Array.isArray(payload.mechanics) ? payload.mechanics : []);
      setShops(Array.isArray(payload.shops) ? payload.shops : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load favorites');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFavorites();
  };

  const toggleFavorite = useCallback(async (providerType: 'mechanic' | 'shop', providerId: number) => {
    try {
      const response = await fetch(`${API_URL}/users/favorites/toggle/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_type: providerType,
          provider_id: providerId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Failed to update favorites');
      }

      const isFavorited = Boolean((data as { is_favorited?: boolean }).is_favorited);
      if (providerType === 'mechanic') {
        setMechanics((prev) => (isFavorited ? prev : prev.filter((item) => item.id !== providerId)));
      } else {
        setShops((prev) => (isFavorited ? prev : prev.filter((item) => item.id !== providerId)));
      }
    } catch (err) {
      showNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update favorites',
      });
    }
  }, [showNotification]);

  const currentItems = useMemo(() => (activeTab === 'mechanics' ? mechanics : shops), [activeTab, mechanics, shops]);

  const getStatusColor = (status: string, type: TabType) => {
    const normalized = String(status || '').toLowerCase();
    if (type === 'mechanics') return normalized === 'available' ? '#34C759' : '#FF3B30';
    return normalized === 'open' ? '#34C759' : '#FF3B30';
  };

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#111214' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14 }}>
        <TouchableOpacity
          style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF8C0015', marginRight: 10 }}
          onPress={() => router.back()}
        >
          <FontAwesome name="chevron-left" size={15} color="#FF8C00" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Favorites</ThemedText>
          <ThemedText style={{ color: '#8E8E93', marginTop: 2 }}>
            {mechanics.length + shops.length} saved provider{mechanics.length + shops.length === 1 ? '' : 's'}
          </ThemedText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
        <TouchableOpacity
          style={{
            flex: 1,
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            backgroundColor: activeTab === 'mechanics' ? '#FF8C00' : '#1A1C1E',
            borderWidth: 1,
            borderColor: activeTab === 'mechanics' ? '#FF8C00' : '#2A2C2E',
          }}
          onPress={() => setActiveTab('mechanics')}
        >
          <ThemedText style={{ color: activeTab === 'mechanics' ? '#fff' : '#8E8E93', fontWeight: '700' }}>
            Mechanics ({mechanics.length})
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            flex: 1,
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            backgroundColor: activeTab === 'shops' ? '#FF8C00' : '#1A1C1E',
            borderWidth: 1,
            borderColor: activeTab === 'shops' ? '#FF8C00' : '#2A2C2E',
          }}
          onPress={() => setActiveTab('shops')}
        >
          <ThemedText style={{ color: activeTab === 'shops' ? '#fff' : '#8E8E93', fontWeight: '700' }}>
            Shops ({shops.length})
          </ThemedText>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <ThemedText style={{ color: '#8E8E93' }}>Loading favorites...</ThemedText>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <FontAwesome name="exclamation-circle" size={44} color="#FF3B30" />
          <ThemedText style={{ color: '#FF3B30', marginTop: 10, textAlign: 'center' }}>{error}</ThemedText>
          <TouchableOpacity
            style={{ marginTop: 14, borderRadius: 10, backgroundColor: '#FF8C00', paddingVertical: 10, paddingHorizontal: 18 }}
            onPress={fetchFavorites}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 2 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
          showsVerticalScrollIndicator={false}
        >
          {currentItems.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
              <FontAwesome name="heart-o" size={42} color="#666" />
              <ThemedText style={{ color: '#A0A0A0', marginTop: 12 }}>
                No favorite {activeTab === 'mechanics' ? 'mechanics' : 'shops'} yet
              </ThemedText>
            </View>
          ) : activeTab === 'mechanics' ? (
            mechanics.map((mechanic) => (
              <TouchableOpacity
                key={mechanic.id}
                style={{
                  backgroundColor: '#1A1C1E',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#2A2C2E',
                  padding: 14,
                  marginBottom: 10,
                }}
                onPress={() => router.push(`/client/mechanic/mechanicprofile?mechanicId=${mechanic.id}`)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {mechanic.profile_photo ? (
                    <Image
                      source={{ uri: getImageUrl(mechanic.profile_photo) || '' }}
                      style={{ width: 48, height: 48, borderRadius: 16, marginRight: 12 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 16,
                        marginRight: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#FF8C0030',
                      }}
                    >
                      <ThemedText style={{ color: '#FF8C00', fontWeight: '700', fontSize: 16 }}>
                        {mechanic.name.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{mechanic.name}</ThemedText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <FontAwesome name="star" size={12} color="#FFD60A" />
                      <ThemedText style={{ color: '#FFD60A', fontWeight: '600' }}>
                        {Number(mechanic.average_rating || 0) > 0 ? Number(mechanic.average_rating).toFixed(1) : 'No rating'}
                      </ThemedText>
                    </View>
                    <ThemedText style={{ color: '#8E8E93', marginTop: 6, fontSize: 12 }}>
                      {mechanic.is_working_for_shop ? 'Shop Mechanic' : 'Independent'}
                    </ThemedText>
                  </View>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2C2E' }}
                      onPress={(event) => {
                        event.stopPropagation();
                        toggleFavorite('mechanic', mechanic.id);
                      }}
                    >
                      <FontAwesome name="heart" size={15} color="#FF5A5F" />
                    </TouchableOpacity>
                    <ThemedText style={{ color: getStatusColor(mechanic.status, 'mechanics'), fontSize: 11, fontWeight: '600' }}>
                      {String(mechanic.status || '').toLowerCase() === 'available' ? 'Available' : 'Not Available'}
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            shops.map((shop) => (
              <TouchableOpacity
                key={shop.id}
                style={{
                  backgroundColor: '#1A1C1E',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#2A2C2E',
                  padding: 14,
                  marginBottom: 10,
                }}
                onPress={() => router.push(`/client/shop/shopprofile?shopId=${shop.id}`)}
                activeOpacity={0.8}
              >
                {shop.service_banner ? (
                  <Image
                    source={{ uri: getImageUrl(shop.service_banner) || '' }}
                    style={{ width: '100%', height: 120, borderRadius: 12, marginBottom: 12 }}
                  />
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{shop.shop_name}</ThemedText>
                    <ThemedText style={{ color: '#8E8E93', marginTop: 2, fontSize: 12 }}>by {shop.owner_name}</ThemedText>
                  </View>
                  <TouchableOpacity
                    style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A2C2E' }}
                    onPress={(event) => {
                      event.stopPropagation();
                      toggleFavorite('shop', shop.id);
                    }}
                  >
                    <FontAwesome name="heart" size={15} color="#FF5A5F" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getStatusColor(shop.status, 'shops') }} />
                  <ThemedText style={{ color: getStatusColor(shop.status, 'shops'), fontSize: 12, fontWeight: '600' }}>
                    {String(shop.status || '').toLowerCase() === 'open' ? 'Open' : 'Closed'}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}
