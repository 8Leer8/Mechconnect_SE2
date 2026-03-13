import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/shopProfileStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Mechanic {
  id: number;
  account_id: number;
  full_name: string;
  firstname: string;
  lastname: string;
  profile_photo: string | null;
  contact_number: string | null;
  bio: string | null;
  average_rating: number;
  status: string;
  date_joined: string;
}

interface Service {
  id: number;
  service_id: number;
  service_name: string;
  service_description: string;
  service_category: string | null;
  service_picture: string | null;
  price: string;
}

interface Owner {
  id: number;
  account_id: number;
  full_name: string;
  email: string;
}

interface ShopProfile {
  id: number;
  shop_name: string;
  contact_number: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  service_banner: string | null;
  is_verified: boolean;
  status: string;
  created_at: string;
  years_active: number;
  owner: Owner;
  average_rating: number;
  total_mechanics: number;
  total_services: number;
  mechanics: Mechanic[];
  services: Service[];
}

export default function ShopProfileScreen() {
  const router = useRouter();
  const { shopId } = useLocalSearchParams<{ shopId: string }>();
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShopProfile = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/shops/${shopId}/profile/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch shop profile');

      const data = await response.json() as { shop: ShopProfile };
      setProfile(data.shop);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (shopId) fetchShopProfile();
  }, [shopId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchShopProfile(true);
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    for (let i = 0; i < 5; i++) {
      if (i < full) stars.push(<FontAwesome key={i} name="star" size={14} color="#FFD60A" />);
      else if (i === full && half) stars.push(<FontAwesome key={i} name="star-half-full" size={14} color="#FFD60A" />);
      else stars.push(<FontAwesome key={i} name="star-o" size={14} color="#FFD60A" />);
    }
    return stars;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return '#34C759';
      case 'closed': return '#8E8E93';
      default: return '#8E8E93';
    }
  };

  const getMechanicStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active': return '#34C759';
      case 'busy': return '#FF8C00';
      case 'offline': return '#8E8E93';
      default: return '#8E8E93';
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 60 }}>
          <SkeletonDetailPage />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !profile) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'Profile not found'}</ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <ThemedText style={styles.retryBtnText}>Go Back</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const rating = profile.average_rating;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="chevron-left" size={18} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Shop Profile</ThemedText>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Banner */}
          {profile.service_banner ? (
            <Image
              source={{ uri: getImageUrl(profile.service_banner) || '' }}
              style={styles.banner}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.banner, styles.bannerPlaceholder]}>
              <FontAwesome name="building" size={48} color="#555" style={styles.bannerIcon} />
            </View>
          )}

          {/* Shop Name */}
          <ThemedText style={styles.shopName}>{profile.shop_name}</ThemedText>
          <ThemedText style={styles.ownerName}>by {profile.owner.full_name}</ThemedText>

          {/* Rating */}
          <View style={styles.ratingRow}>
            {profile.total_mechanics > 0 && rating > 0 ? (
              <>
                <View style={styles.starsRow}>{renderStars(rating)}</View>
                <ThemedText style={styles.ratingText}>
                  {rating.toFixed(1)} (avg from mechanics)
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.noRatingText}>No ratings yet</ThemedText>
            )}
          </View>

          {/* Badges */}
          <View style={styles.badgesRow}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(profile.status) + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(profile.status) }]} />
              <ThemedText style={[styles.statusLabel, { color: getStatusColor(profile.status) }]}>
                {profile.status.charAt(0).toUpperCase() + profile.status.slice(1)}
              </ThemedText>
            </View>
            {profile.is_verified && (
              <View style={styles.verifiedBadge}>
                <FontAwesome name="check-circle" size={12} color="#34C759" />
                <ThemedText style={styles.verifiedText}>Verified</ThemedText>
              </View>
            )}
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{profile.total_mechanics}</ThemedText>
              <ThemedText style={styles.statLabel}>Mechanics</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{profile.total_services}</ThemedText>
              <ThemedText style={styles.statLabel}>Services</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{rating > 0 ? rating.toFixed(1) : '—'}</ThemedText>
              <ThemedText style={styles.statLabel}>Rating</ThemedText>
            </View>
          </View>

          {/* Direct Request Button */}
          <TouchableOpacity
            style={styles.directRequestBtn}
            activeOpacity={0.7}
            onPress={() => {
              router.push({
                pathname: '/client/request/direct/shopdirectrequest',
                params: { shopId: String(profile.id) },
              });
            }}
          >
            <FontAwesome name="paper-plane" size={16} color="#fff" />
            <ThemedText style={styles.directRequestText}>Request Service from Shop</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Info</ThemedText>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconCircle}>
                <FontAwesome name="calendar" size={14} color="#FF8C00" />
              </View>
              <ThemedText style={styles.infoText}>
                Established {new Date(profile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </ThemedText>
            </View>
            {profile.contact_number && (
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <FontAwesome name="phone" size={14} color="#FF8C00" />
                </View>
                <ThemedText style={styles.infoText}>{profile.contact_number}</ThemedText>
              </View>
            )}
            {profile.email && (
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <FontAwesome name="envelope" size={14} color="#FF8C00" />
                </View>
                <ThemedText style={styles.infoText}>{profile.email}</ThemedText>
              </View>
            )}
            {profile.website && (
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <FontAwesome name="globe" size={14} color="#FF8C00" />
                </View>
                <ThemedText style={styles.infoText}>{profile.website}</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Description */}
        {profile.description && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About</ThemedText>
            <View style={styles.card}>
              <ThemedText style={styles.descriptionText}>{profile.description}</ThemedText>
            </View>
          </View>
        )}

        {/* Mechanics */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            Our Mechanics {profile.total_mechanics > 0 && `(${profile.total_mechanics})`}
          </ThemedText>
          {profile.mechanics && profile.mechanics.length > 0 ? (
            profile.mechanics.map((mechanic) => (
              <TouchableOpacity
                key={mechanic.id}
                style={styles.mechanicCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/client/mechanic/mechanicprofile?mechanicId=${mechanic.id}`)}
              >
                <View style={styles.mechanicRow}>
                  {mechanic.profile_photo ? (
                    <Image
                      source={{ uri: getImageUrl(mechanic.profile_photo) || '' }}
                      style={styles.mechanicAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.mechanicAvatar, styles.mechanicAvatarPlaceholder]}>
                      <ThemedText style={styles.mechanicAvatarText}>
                        {mechanic.firstname.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.mechanicInfo}>
                    <ThemedText style={styles.mechanicName}>{mechanic.full_name}</ThemedText>
                    <View style={styles.mechanicRatingRow}>
                      <FontAwesome name="star" size={12} color="#FFD60A" />
                      <ThemedText style={styles.ratingText}>
                        {mechanic.average_rating > 0 ? mechanic.average_rating.toFixed(1) : 'No rating'}
                      </ThemedText>
                      <View style={[styles.mechanicStatusDot, { backgroundColor: getMechanicStatusColor(mechanic.status) }]} />
                      <ThemedText style={[styles.ratingText, { color: getMechanicStatusColor(mechanic.status) }]}>
                        {mechanic.status}
                      </ThemedText>
                    </View>
                  </View>
                  <FontAwesome name="chevron-right" size={16} color="#555" style={styles.mechanicChevron} />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="users" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No mechanics yet</ThemedText>
            </View>
          )}
        </View>

        {/* Services */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            Services Offered {profile.services?.length > 0 && `(${profile.services.length})`}
          </ThemedText>
          {profile.services && profile.services.length > 0 ? (
            profile.services.map((svc) => (
              <View key={svc.id} style={styles.serviceCard}>
                <View style={styles.serviceTop}>
                  <View style={styles.serviceIconCircle}>
                    <FontAwesome name="wrench" size={16} color="#FF8C00" />
                  </View>
                  <View style={styles.serviceInfo}>
                    <ThemedText style={styles.serviceName}>{svc.service_name}</ThemedText>
                    {svc.service_category && (
                      <ThemedText style={styles.serviceCategory}>{svc.service_category}</ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.servicePrice}>₱{parseFloat(svc.price).toFixed(2)}</ThemedText>
                </View>
                {svc.service_description && (
                  <ThemedText style={styles.serviceDesc}>{svc.service_description}</ThemedText>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="wrench" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No services listed</ThemedText>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}
