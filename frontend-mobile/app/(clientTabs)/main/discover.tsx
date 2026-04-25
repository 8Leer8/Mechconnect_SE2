import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, View, TouchableOpacity, FlatList, Image, ListRenderItem, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Feather, FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { styles } from '@/style/client/discoverStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { SkeletonDiscoverList } from '@/components/skeletons/SkeletonLoaders';
import { useNotification } from '@/hooks/useNotification';
import { useLocation } from '@/context/LocationContext';
import { getDistanceKm } from '@/context/LocationContext';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { useWebSocketContext } from '@/context/WebSocketContext';
import {
  formatStructuredAddress,
  geocodeAddress,
  type StructuredAccountAddress,
} from '@/lib/locationAddress';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Mechanic {
  id: number;
  name: string;
  profile_photo: string | null;
  address?: StructuredAccountAddress | null;
  address_label?: string | null;
  average_rating: number;
  status: string;
  is_working_for_shop?: boolean;
  is_favorited?: boolean;
  distance_km?: number | null;
}

interface Shop {
  id: number;
  shop_name: string;
  owner_name: string;
  email: string;
  description: string;
  address?: StructuredAccountAddress | null;
  address_label?: string | null;
  service_banner: string | null;
  is_verified: boolean;
  status: string;
  is_favorited?: boolean;
  average_rating?: number;
  distance_km?: number | null;
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
type ProviderFilterType = 'all' | 'favorites' | 'most_rated' | 'least_rated' | 'nearest';

function formatDistanceLabel(distanceKm?: number | null) {
  if (distanceKm === null || distanceKm === undefined || Number.isNaN(Number(distanceKm))) {
    return null;
  }

  const numericDistance = Number(distanceKm);
  if (numericDistance < 1) {
    return `${Math.max(0, Math.round(numericDistance * 1000))} m away`;
  }

  return `${numericDistance.toFixed(1)} km away`;
}

function formatProviderAddress(address?: StructuredAccountAddress | null, addressLabel?: string | null) {
  return addressLabel || formatStructuredAddress(address) || null;
}

async function enrichProvidersWithDistance<T extends {
  address?: StructuredAccountAddress | null;
  address_label?: string | null;
  distance_km?: number | null;
}>(
  items: T[],
  clientLocation: { latitude: number; longitude: number } | null,
) {
  if (items.length === 0) {
    return items;
  }

  if (!clientLocation) {
    return items.map((item) => ({
      ...item,
      distance_km: null,
    }));
  }

  return Promise.all(
    items.map(async (item) => {
      const addressLabel = formatProviderAddress(item.address, item.address_label);
      if (!addressLabel) {
        return {
          ...item,
          distance_km: null,
        };
      }

      const coordinates = await geocodeAddress(addressLabel);
      if (!coordinates) {
        return {
          ...item,
          distance_km: null,
        };
      }

      return {
        ...item,
        distance_km: Number(getDistanceKm(clientLocation, coordinates).toFixed(2)),
      };
    }),
  );
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { showNotification } = useNotification();
  const { selectedLocation } = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('mechanics');
  const [providerFilter, setProviderFilter] = useState<ProviderFilterType>('all');
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clientLocation, setClientLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSocketRefreshAtRef = useRef(0);
  const latestFetchRequestIdRef = useRef(0);
  const { lastMessage } = useWebSocketContext();

  useEffect(() => {
    if (selectedLocation && selectedLocation.latitude && selectedLocation.longitude) {
      setClientLocation({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
      });
      return;
    }

    let cancelled = false;

    const resolveCurrentLocation = async () => {
      try {
        const permission = await ensureForegroundLocationAccess();
        if (!permission.granted || cancelled) {
          return;
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (!cancelled) {
          setClientLocation({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }
      } catch {
        if (!cancelled) {
          setClientLocation(null);
        }
      }
    };

    resolveCurrentLocation();

    return () => {
      cancelled = true;
    };
  }, [selectedLocation]);

  const fetchData = useCallback(async (tab: TabType, force = false) => {
    const requestId = ++latestFetchRequestIdRef.current;
    try {
      setLoading(true);
      setError(null);

      if (tab === 'mechanics') {
        const response = await fetch(`${API_URL}/users/mechanics/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch mechanics');
        const data = await response.json() as MechanicsResponse;
        if (requestId !== latestFetchRequestIdRef.current) return;
        setMechanics(await enrichProvidersWithDistance(data.mechanics || [], clientLocation));
      } else if (tab === 'shops') {
        const response = await fetch(`${API_URL}/shops/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch shops');
        const data = await response.json() as ShopsResponse;
        if (requestId !== latestFetchRequestIdRef.current) return;
        setShops(await enrichProvidersWithDistance(data.shops || [], clientLocation));
      } else if (tab === 'services') {
        const response = await fetch(`${API_URL}/services/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Failed to fetch services');
        const data = await response.json() as ServicesResponse;
        if (requestId !== latestFetchRequestIdRef.current) return;
        setServices(data.services || []);
      }
    } catch (err) {
      if (requestId !== latestFetchRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      if (requestId !== latestFetchRequestIdRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientLocation, providerFilter]);

  useEffect(() => {
    fetchData(activeTab, true);
  }, [activeTab, providerFilter, clientLocation, fetchData]);

  useEffect(() => {
    if (!lastMessage) return;
    if (activeTab === 'services') return;

    const messageType = String(lastMessage.type || '').toLowerCase();
    const action = String(lastMessage.action || '').toLowerCase();
    const shouldRefresh =
      messageType === 'booking_update' ||
      messageType === 'notification_update' ||
      action === 'provider_status_updated';

    if (!shouldRefresh) return;

    const now = Date.now();
    if (now - lastSocketRefreshAtRef.current < 2500) return;
    lastSocketRefreshAtRef.current = now;

    void fetchData(activeTab, true);
  }, [lastMessage, activeTab, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(activeTab, true);
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
        setMechanics((prev) =>
          prev.map((item) =>
            item.id === providerId ? { ...item, is_favorited: isFavorited } : item,
          ),
        );
      } else {
        setShops((prev) =>
          prev.map((item) =>
            item.id === providerId ? { ...item, is_favorited: isFavorited } : item,
          ),
        );
      }
    } catch (err) {
      showNotification({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update favorites',
      });
    }
  }, [showNotification]);

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'mechanics', label: 'Mechanics', icon: 'tool' },
    { key: 'shops', label: 'Shops', icon: 'home' },
    { key: 'services', label: 'Services', icon: 'grid' },
  ];

  const formatRating = (rating: number) => {
    const value = Number(rating || 0);
    return value > 0 ? value.toFixed(1) : 'No rating';
  };

  const isAvailableStatus = (statusValue: string, type: 'mechanic' | 'shop') => {
    const normalized = (statusValue || '').toLowerCase();
    return type === 'mechanic' ? normalized === 'available' : normalized === 'open';
  };

  const getAvailabilityColor = (statusValue: string, type: 'mechanic' | 'shop') =>
    isAvailableStatus(statusValue, type) ? '#34C759' : '#FF3B30';

  const getAvailabilityLabel = (statusValue: string, type: 'mechanic' | 'shop') =>
    isAvailableStatus(statusValue, type) ? 'Available' : 'Unavailable';

  const providerFilters: { key: ProviderFilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'favorites', label: 'Favorites' },
    { key: 'most_rated', label: 'Most Rated' },
    { key: 'least_rated', label: 'Least Rated' },
    { key: 'nearest', label: 'Nearest' },
  ];

  const selectedProviderFilterLabel = providerFilters.find(
    (filter) => filter.key === providerFilter,
  )?.label ?? 'All';

  const currentData = useMemo(() => {
    if (activeTab === 'services') {
      return services;
    }

    const providerData = activeTab === 'mechanics' ? mechanics : shops;

    if (providerFilter === 'favorites') {
      return providerData.filter((item) => Boolean(item.is_favorited));
    }

    if (providerFilter === 'nearest') {
      return [...providerData].sort((left, right) => {
        const leftDistance = left.distance_km ?? Number.POSITIVE_INFINITY;
        const rightDistance = right.distance_km ?? Number.POSITIVE_INFINITY;

        return leftDistance - rightDistance;
      });
    }

    if (providerFilter === 'most_rated' || providerFilter === 'least_rated') {
      return [...providerData].sort((left, right) => {
        const leftRating = Number(left.average_rating || 0);
        const rightRating = Number(right.average_rating || 0);

        return providerFilter === 'most_rated'
          ? rightRating - leftRating
          : leftRating - rightRating;
      });
    }

    return providerData;
  }, [activeTab, providerFilter, mechanics, shops, services]);

  const getEmptyMessage = useCallback(() => {
    if (activeTab === 'services') {
      return 'No services available';
    }

    const subject = activeTab === 'mechanics' ? 'mechanics' : 'shops';

    if (providerFilter === 'favorites') {
      return `No favorite ${subject} yet`;
    }

    if (providerFilter === 'nearest') {
      return `No nearby ${subject} found`;
    }

    if (providerFilter === 'most_rated' || providerFilter === 'least_rated') {
      return `No ${subject} match this filter`;
    }

    return `No ${subject} available`;
  }, [activeTab, providerFilter]);

  // Memoized render functions for FlatList
  const renderMechanicItem: ListRenderItem<Mechanic> = useCallback(({ item: mechanic }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        const distanceParam = mechanic.distance_km !== null && mechanic.distance_km !== undefined
          ? `&distance_km=${mechanic.distance_km}`
          : '';

        router.push(`/client/mechanic/mechanicprofile?mechanicId=${mechanic.id}${distanceParam}`);
      }}
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
            <Feather name="star" size={12} color="#FFD60A" />
              <ThemedText style={styles.ratingText}>{formatRating(mechanic.average_rating)}</ThemedText>
          </View>
          {formatDistanceLabel(mechanic.distance_km) ? (
            <View style={styles.distanceRow}>
              <Feather name="map-pin" size={11} color="#8E8E93" />
              <ThemedText style={styles.distanceText}>{formatDistanceLabel(mechanic.distance_km)}</ThemedText>
            </View>
          ) : null}
          {formatProviderAddress(mechanic.address, mechanic.address_label) ? (
            <View style={styles.addressRow}>
              <Feather name="map-pin" size={11} color="#8E8E93" />
              <ThemedText style={styles.addressText} numberOfLines={2}>
                {formatProviderAddress(mechanic.address, mechanic.address_label)}
              </ThemedText>
            </View>
          ) : null}
            <View style={styles.summaryRow}>
              <View style={styles.summaryChip}>
                <Feather name="briefcase" size={11} color="#8E8E93" />
                <ThemedText style={styles.summaryText}>
                  {mechanic.is_working_for_shop ? 'Shop Mechanic' : 'Independent'}
                </ThemedText>
              </View>
            </View>
        </View>
        <View style={styles.cardRight}>
          <TouchableOpacity
            style={styles.favoriteBtn}
            onPress={(event) => {
              event.stopPropagation();
              toggleFavorite('mechanic', mechanic.id);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome
              name={mechanic.is_favorited ? 'heart' : 'heart-o'}
              size={15}
              color={mechanic.is_favorited ? '#FF5A5F' : '#8E8E93'}
            />
          </TouchableOpacity>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getAvailabilityColor(mechanic.status, 'mechanic') },
            ]}
          />
          <ThemedText
            style={[
              styles.statusLabel,
              { color: getAvailabilityColor(mechanic.status, 'mechanic') },
            ]}
          >
            {getAvailabilityLabel(mechanic.status, 'mechanic')}
          </ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  ), [router]);

  const renderShopItem: ListRenderItem<Shop> = useCallback(({ item: shop }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        const distanceParam = shop.distance_km !== null && shop.distance_km !== undefined
          ? `&distance_km=${shop.distance_km}`
          : '';

        router.push(`/client/shop/shopprofile?shopId=${shop.id}${distanceParam}`);
      }}
      activeOpacity={0.7}
    >
      {shop.service_banner && (
        <Image source={{ uri: getImageUrl(shop.service_banner) || '' }} style={styles.shopBanner} />
      )}
      <View style={styles.shopHeader}>
        <View style={styles.shopInfo}>
          <ThemedText style={styles.cardTitle}>{shop.shop_name}</ThemedText>
          <ThemedText style={styles.shopOwner}>by {shop.owner_name}</ThemedText>
          <View style={styles.ratingRow}>
            <Feather name="star" size={12} color="#FFD60A" />
            <ThemedText style={styles.ratingText}>{formatRating(shop.average_rating || 0)}</ThemedText>
          </View>
          {formatDistanceLabel(shop.distance_km) ? (
            <View style={styles.distanceRow}>
              <Feather name="map-pin" size={11} color="#8E8E93" />
              <ThemedText style={styles.distanceText}>{formatDistanceLabel(shop.distance_km)}</ThemedText>
            </View>
          ) : null}
          {formatProviderAddress(shop.address, shop.address_label) ? (
            <View style={styles.addressRow}>
              <Feather name="map-pin" size={11} color="#8E8E93" />
              <ThemedText style={styles.addressText} numberOfLines={2}>
                {formatProviderAddress(shop.address, shop.address_label)}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.shopHeaderRight}>
          <TouchableOpacity
            style={styles.favoriteBtn}
            onPress={(event) => {
              event.stopPropagation();
              toggleFavorite('shop', shop.id);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome
              name={shop.is_favorited ? 'heart' : 'heart-o'}
              size={15}
              color={shop.is_favorited ? '#FF5A5F' : '#8E8E93'}
            />
          </TouchableOpacity>
          {shop.is_verified && (
            <View style={styles.verifiedBadge}>
              <Feather name="check-circle" size={12} color="#34C759" />
              <ThemedText style={styles.verifiedText}>Verified</ThemedText>
            </View>
          )}
        </View>
      </View>
      {shop.description ? (
        <ThemedText style={styles.descText} numberOfLines={2}>{shop.description}</ThemedText>
      ) : null}
      <View style={styles.summaryRow}>
        <View
          style={[
            styles.summaryChip,
            { borderColor: getAvailabilityColor(shop.status, 'shop') + '40' },
          ]}
        >
          <View
            style={[
              styles.summaryDot,
              { backgroundColor: getAvailabilityColor(shop.status, 'shop') },
            ]}
          />
          <ThemedText
            style={[
              styles.summaryText,
              { color: getAvailabilityColor(shop.status, 'shop') },
            ]}
          >
            {getAvailabilityLabel(shop.status, 'shop')}
          </ThemedText>
        </View>
        <View style={styles.summaryChip}>
          <Feather name="mail" size={11} color="#8E8E93" />
          <ThemedText style={styles.summaryText} numberOfLines={1}>
            {shop.email || 'No email'}
          </ThemedText>
        </View>
      </View>
    </TouchableOpacity>
  ), [router]);

  const renderServiceItem: ListRenderItem<Service> = useCallback(({ item: service }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/client/service/servicedetail?serviceId=${service.id}`)}
      activeOpacity={0.7}
    >
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
      <View style={styles.viewDetailsRow}>
        <ThemedText style={styles.viewDetailsText}>View Details</ThemedText>
        <Feather name="chevron-right" size={12} color="#FF8C00" />
      </View>
    </TouchableOpacity>
  ), [router]);

  const currentRenderer = activeTab === 'mechanics'
    ? renderMechanicItem
    : activeTab === 'shops'
      ? renderShopItem
      : renderServiceItem;

  const keyExtractor = useCallback((item: Mechanic | Shop | Service) => item.id.toString(), []);

  const renderEmptyComponent = useCallback(() => (
    <View style={styles.emptyCard}>
      <Feather name="inbox" size={36} color="#555" />
      <ThemedText style={styles.emptyText}>{getEmptyMessage()}</ThemedText>
    </View>
  ), [getEmptyMessage]);

  const renderListHeader = useCallback(() => {
    if (error) {
      return (
        <View style={styles.errorCard}>
          <Feather name="alert-circle" size={24} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData(activeTab, true)}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }
    return null;
  }, [loading, refreshing, error, activeTab, fetchData]);

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
          <Feather name="refresh-cw" size={16} color="#FF8C00" />
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
            <Feather
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

      {activeTab !== 'services' ? (
        <View style={styles.filterContainer}>
          <ThemedText style={styles.filterLabel}>Filter</ThemedText>
          <TouchableOpacity
            style={styles.filterButton}
            activeOpacity={0.75}
            onPress={() => setIsFilterModalVisible(true)}
          >
            <View style={styles.filterButtonContent}>
              <ThemedText style={styles.filterButtonText}>{selectedProviderFilterLabel}</ThemedText>
              <Feather name="chevron-down" size={16} color="#8E8E93" />
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        transparent
        visible={isFilterModalVisible}
        animationType="fade"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.filterModalOverlay}
          activeOpacity={1}
          onPress={() => setIsFilterModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.filterModalCard} onPress={() => null}>
            <View style={styles.filterModalHeader}>
              <ThemedText style={styles.filterModalTitle}>Select Filter</ThemedText>
              <TouchableOpacity
                style={styles.filterModalClose}
                onPress={() => setIsFilterModalVisible(false)}
                activeOpacity={0.75}
              >
                <Feather name="x" size={18} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterModalList}>
              {providerFilters.map((filter) => {
                const isActive = providerFilter === filter.key;

                return (
                  <TouchableOpacity
                    key={filter.key}
                    style={[styles.filterModalOption, isActive && styles.filterModalOptionActive]}
                    onPress={() => {
                      setProviderFilter(filter.key);
                      setIsFilterModalVisible(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <ThemedText
                      style={[
                        styles.filterModalOptionText,
                        isActive && styles.filterModalOptionTextActive,
                      ]}
                    >
                      {filter.label}
                    </ThemedText>
                    {isActive ? <Feather name="check" size={16} color="#FF8C00" /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Content - Using FlatList for performance */}
      {loading && !refreshing ? (
        <View style={styles.list}>
          <SkeletonDiscoverList variant={activeTab as 'mechanics' | 'shops' | 'services'} />
        </View>
      ) : (
        <FlatList
          data={currentData as any[]}
          renderItem={currentRenderer as any}
          keyExtractor={keyExtractor}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={!error ? renderEmptyComponent : null}
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
      )}
    </ThemedView>
  );
}

