import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { styles } from '@/style/client/serviceDetailStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface ServiceDetail {
  id: number;
  name: string;
  description: string;
  service_picture: string | null;
  category: {
    id: number | null;
    name: string | null;
  };
  minimum_price: number;
  market_pricing: {
    average: number;
    median: number;
    min_price: number;
    max_price: number;
  } | null;
}

interface Mechanic {
  id: number;
  name: string;
  profile_photo: string | null;
  contact_number: string;
  average_rating: number;
  status: string;
  service_price: number;
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
  service_price: number;
}

interface ServiceDetailResponse {
  service: ServiceDetail;
  mechanics: Mechanic[];
  mechanics_count: number;
  shops: Shop[];
  shops_count: number;
}

export default function ServiceDetailScreen() {
  const params = useLocalSearchParams();
  const serviceId = params.serviceId as string;

  const [service, setService] = useState<ServiceDetail | null>(null);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchServiceDetail = async () => {
    try {
      setError(null);

      const response = await fetch(`${API_URL}/services/${serviceId}/providers/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch service details');
      }
      const data = await response.json() as ServiceDetailResponse;

      setService(data.service);
      setMechanics(data.mechanics || []);
      setShops(data.shops || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Service detail fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchServiceDetail();
  }, [serviceId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchServiceDetail();
  };

  if (loading && !refreshing) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <FontAwesome name="arrow-left" size={18} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Service Details</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SkeletonDetailPage />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <FontAwesome name="arrow-left" size={18} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Service Details</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchServiceDetail} activeOpacity={0.7}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  if (!service) return null;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <FontAwesome name="arrow-left" size={18} color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Service Details</ThemedText>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Service Info Card */}
        <View style={styles.serviceCard}>
          {service.service_picture && (
            <Image source={{ uri: getImageUrl(service.service_picture) || '' }} style={styles.servicePicture} />
          )}
          <View style={styles.serviceInfo}>
            <View style={styles.serviceTitleRow}>
              <ThemedText style={styles.serviceName}>{service.name}</ThemedText>
              {service.category.name && (
                <View style={styles.categoryBadge}>
                  <ThemedText style={styles.categoryText}>{service.category.name}</ThemedText>
                </View>
              )}
            </View>
            {service.description && (
              <ThemedText style={styles.serviceDescription}>{service.description}</ThemedText>
            )}

            {/* Pricing Info */}
            <View style={styles.pricingSection}>
              <View style={styles.priceCard}>
                <FontAwesome name="tag" size={16} color="#FF8C00" />
                <View style={styles.priceInfo}>
                  <ThemedText style={styles.priceLabel}>Lowest Price</ThemedText>
                  <ThemedText style={styles.priceValue}>₱{service.minimum_price.toFixed(2)}</ThemedText>
                </View>
              </View>

              {service.market_pricing && (
                <>
                  <View style={styles.priceCard}>
                    <FontAwesome name="line-chart" size={16} color="#34C759" />
                    <View style={styles.priceInfo}>
                      <ThemedText style={styles.priceLabel}>Average Price</ThemedText>
                      <ThemedText style={styles.priceValue}>₱{service.market_pricing.average.toFixed(2)}</ThemedText>
                    </View>
                  </View>

                  <View style={styles.priceRangeCard}>
                    <FontAwesome name="arrows-h" size={14} color="#007AFF" />
                    <ThemedText style={styles.priceRangeText}>
                      Price Range: ₱{service.minimum_price.toFixed(0)} - ₱{service.market_pricing.max_price.toFixed(0)}
                    </ThemedText>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Mechanics Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <FontAwesome name="wrench" size={16} color="#FF8C00" />
              <ThemedText style={styles.sectionTitle}>Mechanics ({mechanics.length})</ThemedText>
            </View>
          </View>

          {mechanics.length > 0 ? (
            mechanics.map((mechanic) => (
              <TouchableOpacity
                key={mechanic.id}
                style={styles.providerCard}
                onPress={() => router.push(`/client/mechanic/mechanicprofile?mechanicId=${mechanic.id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.providerRow}>
                  {mechanic.profile_photo ? (
                    <Image source={{ uri: getImageUrl(mechanic.profile_photo) || '' }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <ThemedText style={styles.avatarText}>
                        {mechanic.name.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.providerInfo}>
                    <ThemedText style={styles.providerName}>{mechanic.name}</ThemedText>
                    <View style={styles.providerDetails}>
                      <View style={styles.ratingRow}>
                        <FontAwesome name="star" size={12} color="#FFD60A" />
                        <ThemedText style={styles.ratingText}>{mechanic.average_rating.toFixed(1)}</ThemedText>
                      </View>
                      <View style={styles.detailDivider} />
                      <FontAwesome name="phone" size={11} color="#8E8E93" />
                      <ThemedText style={styles.contactText}>{mechanic.contact_number}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.providerRight}>
                    <ThemedText style={styles.providerPrice}>₱{mechanic.service_price.toFixed(2)}</ThemedText>
                    <View style={[styles.statusDot, { backgroundColor: mechanic.status === 'available' ? '#34C759' : '#8E8E93' }]} />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="wrench" size={32} color="#555" />
              <ThemedText style={styles.emptyText}>No mechanics offer this service yet</ThemedText>
            </View>
          )}
        </View>

        {/* Shops Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <FontAwesome name="building" size={16} color="#007AFF" />
              <ThemedText style={styles.sectionTitle}>Shops ({shops.length})</ThemedText>
            </View>
          </View>

          {shops.length > 0 ? (
            shops.map((shop) => (
              <TouchableOpacity
                key={shop.id}
                style={styles.providerCard}
                onPress={() => router.push(`/client/shop/shopprofile?shopId=${shop.id}`)}
                activeOpacity={0.7}
              >
                {shop.service_banner && (
                  <Image source={{ uri: getImageUrl(shop.service_banner) || '' }} style={styles.shopBanner} />
                )}
                <View style={styles.shopContent}>
                  <View style={styles.shopHeader}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.providerName}>{shop.shop_name}</ThemedText>
                      <ThemedText style={styles.shopOwner}>by {shop.owner_name}</ThemedText>
                    </View>
                    {shop.is_verified && (
                      <View style={styles.verifiedBadge}>
                        <FontAwesome name="check-circle" size={12} color="#34C759" />
                        <ThemedText style={styles.verifiedText}>Verified</ThemedText>
                      </View>
                    )}
                  </View>
                  {shop.description && (
                    <ThemedText style={styles.shopDescription} numberOfLines={2}>
                      {shop.description}
                    </ThemedText>
                  )}
                  <View style={styles.shopFooter}>
                    <View style={styles.shopContact}>
                      <FontAwesome name="phone" size={11} color="#8E8E93" />
                      <ThemedText style={styles.contactText}>{shop.contact_number}</ThemedText>
                    </View>
                    <ThemedText style={styles.providerPrice}>₱{shop.service_price.toFixed(2)}</ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="building" size={32} color="#555" />
              <ThemedText style={styles.emptyText}>No shops offer this service yet</ThemedText>
            </View>
          )}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </ThemedView>
  );
}
