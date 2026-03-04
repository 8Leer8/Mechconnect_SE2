import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { getImageUrl } from '@/lib/imageUtils';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Review {
  id: number;
  reviewer_name: string;
  reviewer_photo: string | null;
  rating: number;
  comment: string;
  created_at: string;
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

interface Specialty {
  id: number;
  name: string;
  description: string;
}

interface MechanicProfile {
  id: number;
  account_id: number;
  full_name: string;
  firstname: string;
  lastname: string;
  middlename: string | null;
  email: string;
  username: string;
  profile_photo_url: string | null;
  bio: string | null;
  average_rating: string;
  total_reviews: number;
  reviews: Review[];
  years_active: number;
  account_created: string;
  is_part_of_shop: boolean;
  shop_name: string | null;
  shop_id: number | null;
  specialties: Specialty[];
  services: Service[];
  contact_number: string | null;
  status: string;
}

export default function MechanicProfileScreen() {
  const router = useRouter();
  const { mechanicId } = useLocalSearchParams<{ mechanicId: string }>();
  const [profile, setProfile] = useState<MechanicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMechanicProfile = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/users/mechanics/${mechanicId}/profile/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch mechanic profile');

      const data = await response.json() as { mechanic: MechanicProfile };
      setProfile(data.mechanic);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (mechanicId) fetchMechanicProfile();
  }, [mechanicId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMechanicProfile(true);
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
      case 'active': return '#34C759';
      case 'busy': return '#FF8C00';
      case 'offline': return '#8E8E93';
      default: return '#8E8E93';
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#FF8C00" style={{ marginTop: 100 }} />
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

  const rating = parseFloat(profile.average_rating);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="chevron-left" size={18} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Mechanic Profile</ThemedText>
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
          {profile.profile_photo_url ? (
            <Image
              source={{ uri: getImageUrl(profile.profile_photo_url) || '' }}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <ThemedText style={styles.avatarText}>
                {profile.firstname.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}

          <ThemedText style={styles.name}>{profile.full_name}</ThemedText>

          {/* Rating */}
          <View style={styles.ratingRow}>
            {profile.total_reviews > 0 ? (
              <>
                <View style={styles.starsRow}>{renderStars(rating)}</View>
                <ThemedText style={styles.ratingText}>
                  {rating.toFixed(1)} ({profile.total_reviews})
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.noRatingText}>No ratings yet</ThemedText>
            )}
          </View>

          {/* Status */}
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(profile.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(profile.status) }]} />
            <ThemedText style={[styles.statusLabel, { color: getStatusColor(profile.status) }]}>
              {profile.status.charAt(0).toUpperCase() + profile.status.slice(1)}
            </ThemedText>
          </View>

          {/* Quick Stats */}
          <View style={styles.quickStats}>
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{profile.services?.length || 0}</ThemedText>
              <ThemedText style={styles.statLabel}>Services</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <ThemedText style={styles.statValue}>{profile.total_reviews}</ThemedText>
              <ThemedText style={styles.statLabel}>Reviews</ThemedText>
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
              const providerAccountId = profile.account_id || profile.id;
              router.push({
                pathname: '/client/request/direct/mechanicdirectrequest',
                params: { mechanicId: String(providerAccountId) },
              });
            }}
          >
            <FontAwesome name="paper-plane" size={16} color="#fff" />
            <ThemedText style={styles.directRequestText}>Send Direct Request</ThemedText>
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
                Joined {new Date(profile.account_created).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
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
            {profile.is_part_of_shop && profile.shop_name && (
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <FontAwesome name="building" size={14} color="#FF8C00" />
                </View>
                <ThemedText style={styles.infoText}>Works at {profile.shop_name}</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Bio */}
        {profile.bio && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About</ThemedText>
            <View style={styles.card}>
              <ThemedText style={styles.bioText}>{profile.bio}</ThemedText>
            </View>
          </View>
        )}

        {/* Specialties */}
        {profile.specialties && profile.specialties.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Specialties</ThemedText>
            <View style={styles.tagsRow}>
              {profile.specialties.map((s) => (
                <View key={s.id} style={styles.tag}>
                  <FontAwesome name="star" size={10} color="#FF8C00" />
                  <ThemedText style={styles.tagText}>{s.name}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

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

        {/* Reviews */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            Reviews {profile.total_reviews > 0 && `(${profile.total_reviews})`}
          </ThemedText>
          {profile.reviews && profile.reviews.length > 0 ? (
            profile.reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  {review.reviewer_photo ? (
                    <Image
                      source={{ uri: getImageUrl(review.reviewer_photo) || '' }}
                      style={styles.reviewerAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.reviewerAvatar, styles.reviewerAvatarPlaceholder]}>
                      <ThemedText style={styles.reviewerAvatarText}>
                        {review.reviewer_name.charAt(0).toUpperCase()}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.reviewerInfo}>
                    <ThemedText style={styles.reviewerName}>{review.reviewer_name}</ThemedText>
                    <View style={styles.starsRow}>{renderStars(review.rating)}</View>
                  </View>
                  <ThemedText style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </ThemedText>
                </View>
                {review.comment && (
                  <ThemedText style={styles.reviewComment}>{review.comment}</ThemedText>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="comments-o" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No reviews yet</ThemedText>
            </View>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  errorText: { fontSize: 16, color: '#FF3B30', marginTop: 16, textAlign: 'center' },
  retryBtn: { marginTop: 16, backgroundColor: '#FF8C00', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1A1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#222426', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  // Profile Card
  profileCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: '#1A1C1E',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#FF8C00', marginBottom: 14 },
  avatarPlaceholder: { backgroundColor: '#FF8C0030', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 40, fontWeight: 'bold', color: '#FF8C00' },
  name: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  starsRow: { flexDirection: 'row', gap: 2 },
  ratingText: { fontSize: 13, color: '#8E8E93' },
  noRatingText: { fontSize: 13, color: '#555', fontStyle: 'italic' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 18,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '700' },

  // Quick Stats
  quickStats: {
    flexDirection: 'row',
    backgroundColor: '#222426',
    borderRadius: 14,
    padding: 14,
    width: '100%',
    marginBottom: 18,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: '#333', alignSelf: 'center' },

  // Direct Request
  directRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF8C00',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  directRequestText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Sections
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 12 },

  // Info
  infoCard: { backgroundColor: '#1A1C1E', borderRadius: 14, borderWidth: 1, borderColor: '#2A2C2E', overflow: 'hidden' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222426',
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: { fontSize: 14, color: '#ccc', flex: 1 },

  // Bio
  card: { backgroundColor: '#1A1C1E', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2A2C2E' },
  bioText: { fontSize: 14, color: '#ccc', lineHeight: 22 },

  // Tags / Specialties
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C0015',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF8C0030',
  },
  tagText: { fontSize: 12, fontWeight: '600', color: '#FF8C00' },

  // Services
  serviceCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  serviceTop: { flexDirection: 'row', alignItems: 'center' },
  serviceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  serviceCategory: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  servicePrice: { fontSize: 16, fontWeight: 'bold', color: '#34C759' },
  serviceDesc: { fontSize: 13, color: '#8E8E93', lineHeight: 20, marginTop: 10, paddingLeft: 52 },

  // Reviews
  reviewCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  reviewerAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  reviewerAvatarPlaceholder: { backgroundColor: '#FF8C0030', justifyContent: 'center', alignItems: 'center' },
  reviewerAvatarText: { fontSize: 14, fontWeight: 'bold', color: '#FF8C00' },
  reviewerInfo: { flex: 1 },
  reviewerName: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 3 },
  reviewDate: { fontSize: 11, color: '#555' },
  reviewComment: { fontSize: 13, color: '#ccc', lineHeight: 20 },

  // Empty
  emptyCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyText: { fontSize: 14, color: '#555', marginTop: 10 },
});
