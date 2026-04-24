import React, { useRef, useState, useEffect } from 'react';
import {View, ScrollView, TouchableOpacity, RefreshControl, BackHandler } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/mechanicProfileStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { formatStructuredAddress } from '@/lib/locationAddress';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { useNotification } from '@/hooks/useNotification';

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

interface AddOn {
  id: number;
  name: string;
  description: string;
  price: string;
  image: string | null;
  service_name: string | null;
}

interface Address {
  id?: number;
  label?: string | null;
  is_main?: boolean;
  lat?: number | null;
  lng?: number | null;
  formatted_address?: string | null;
  house_building_number?: string | null;
  street_name?: string | null;
  subdivision_village?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  region?: string | null;
  postal_code?: string | null;
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
  address?: Address | null;
  addresses?: Address[];
}

function formatDistanceLabel(distanceKm?: string | null) {
  if (!distanceKm) {
    return null;
  }

  const numericDistance = Number(distanceKm);
  if (Number.isNaN(numericDistance)) {
    return null;
  }

  if (numericDistance < 1) {
    return `${Math.max(0, Math.round(numericDistance * 1000))} m away`;
  }

  return `${numericDistance.toFixed(1)} km away`;
}

export default function MechanicProfileScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { showNotification } = useNotification();
  const { mechanicId, id, distance_km, source, member_active, fromBroadcast, broadcastId, offerId, returnParams } = useLocalSearchParams<{
    mechanicId?: string;
    id?: string;
    distance_km?: string;
    source?: string;
    member_active?: string;
    fromBroadcast?: string;
    broadcastId?: string;
    offerId?: string;
    returnParams?: string;
  }>();
  const resolvedMechanicId = mechanicId || id;
  const isMountedRef = useRef(true);
  const [profile, setProfile] = useState<MechanicProfile | null>(null);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [memberActive, setMemberActive] = useState<boolean>(member_active !== 'false');
  const [actionLoading, setActionLoading] = useState<'toggle' | 'remove' | null>(null);
  const [acceptingBroadcastOffer, setAcceptingBroadcastOffer] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchMechanicProfile = async (silent = false) => {
    try {
      if (!silent && isMountedRef.current) setLoading(true);
      if (isMountedRef.current) setError(null);

      const response = await fetch(`${API_URL}/users/mechanics/${resolvedMechanicId}/profile/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch mechanic profile');

      const data = await response.json() as { mechanic: MechanicProfile; addons?: AddOn[]; is_favorited?: boolean };
      if (isMountedRef.current) {
        setProfile(data.mechanic);
        setAddons(data.addons || data.mechanic?.addons || []);
        setIsFavorited(Boolean(data.is_favorited));
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (resolvedMechanicId) fetchMechanicProfile();
  }, [resolvedMechanicId]);

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

  const navigateBackToBroadcastDetails = () => {
    let parsedParams: Record<string, string> = {};
    if (typeof returnParams === 'string' && returnParams.trim().length > 0) {
      try {
        const candidate = JSON.parse(returnParams) as Record<string, unknown>;
        parsedParams = Object.entries(candidate).reduce((acc, [key, value]) => {
          if (typeof value === 'string' && value.length > 0) {
            acc[key] = value;
          }
          return acc;
        }, {} as Record<string, string>);
      } catch {
        parsedParams = {};
      }
    }

    const fallbackId = typeof broadcastId === 'string' ? broadcastId : '';
    router.replace({
      pathname: '/client/request/broadcast/broadcastdetail',
      params: {
        ...parsedParams,
        id: parsedParams.id || fallbackId,
      },
    });
  };

  const handleBack = () => {
    if (fromBroadcast === 'true') {
      navigateBackToBroadcastDetails();
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(clientTabs)/main/discover');
  };

  const showDirectRequest = !pathname.includes('/_direct-request');
  const isShopOwnerView = source === 'shop_owner';

  const handleAcceptMechanicFromBroadcast = async () => {
    if (acceptingBroadcastOffer || fromBroadcast !== 'true' || !broadcastId || !offerId) return;

    setAcceptingBroadcastOffer(true);
    try {
      const response = await fetch(`${API_URL}/bookings/broadcasts/${broadcastId}/select-mechanic/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: Number(offerId) }),
      });

      const data = await response.json().catch(() => ({})) as { error?: string; booking_id?: number };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to select mechanic');
      }

      const bookingId = Number(data.booking_id ?? 0);
      if (bookingId > 0) {
        router.replace({
          pathname: '/client/booking/booking_details',
          params: { bookingId: String(bookingId) },
        });
        return;
      }

      throw new Error('Booking was created but no booking ID was returned');
    } catch (error) {
      showNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to select mechanic',
      });
    } finally {
      setAcceptingBroadcastOffer(false);
    }
  };

  const handleDirectRequest = () => {
    const providerAccountId = profile?.account_id || profile?.id;
    const profileMechanicId = resolvedMechanicId || (profile ? String(profile.id) : '');
    if (!profileMechanicId || !providerAccountId || !profile) return;

    console.log('Passing mechanic address to direct request:', {
      barangay: profile.address?.barangay,
      city_municipality: profile.address?.city_municipality,
      province: profile.address?.province,
    });

    if (pathname.includes('main_request_form')) {
      router.push({
        pathname: '/client/request/main_request_form/mechanic-profile/_direct-request/[id]',
        params: {
          id: String(profileMechanicId),
          mechanicId: String(profileMechanicId),
          providerId: String(providerAccountId),
          providerName: profile.full_name,
          street_name: profile.address?.street_name || undefined,
          subdivision_village: profile.address?.subdivision_village || undefined,
          barangay: profile.address?.barangay || undefined,
          city_municipality: profile.address?.city_municipality || undefined,
          province: profile.address?.province || undefined,
          region: profile.address?.region || undefined,
          providerStreet: profile.address?.street_name || undefined,
          providerSubdivision: profile.address?.subdivision_village || undefined,
          providerBarangay: profile.address?.barangay || undefined,
          providerCity: profile.address?.city_municipality || undefined,
          providerProvince: profile.address?.province || undefined,
          providerRegion: profile.address?.region || undefined,
          distance_km: typeof distance_km === 'string' ? distance_km : undefined,
        },
      });
      return;
    }

    if (pathname.includes('/client/booking/mechanic-profile')) {
      router.push({
        pathname: '/client/booking/mechanic-profile/_direct-request/[id]',
        params: {
          id: String(profileMechanicId),
          mechanicId: String(profileMechanicId),
          providerId: String(providerAccountId),
          providerName: profile.full_name,
          street_name: profile.address?.street_name || undefined,
          subdivision_village: profile.address?.subdivision_village || undefined,
          barangay: profile.address?.barangay || undefined,
          city_municipality: profile.address?.city_municipality || undefined,
          province: profile.address?.province || undefined,
          region: profile.address?.region || undefined,
          providerStreet: profile.address?.street_name || undefined,
          providerSubdivision: profile.address?.subdivision_village || undefined,
          providerBarangay: profile.address?.barangay || undefined,
          providerCity: profile.address?.city_municipality || undefined,
          providerProvince: profile.address?.province || undefined,
          providerRegion: profile.address?.region || undefined,
          distance_km: typeof distance_km === 'string' ? distance_km : undefined,
        },
      });
      return;
    }

    router.push({
      pathname: '/client/mechanic/_direct-request/[id]',
      params: {
        id: String(profileMechanicId),
        mechanicId: String(profileMechanicId),
        providerId: String(providerAccountId),
        providerName: profile.full_name,
        street_name: profile.address?.street_name || undefined,
        subdivision_village: profile.address?.subdivision_village || undefined,
        barangay: profile.address?.barangay || undefined,
        city_municipality: profile.address?.city_municipality || undefined,
        province: profile.address?.province || undefined,
        region: profile.address?.region || undefined,
        providerStreet: profile.address?.street_name || undefined,
        providerSubdivision: profile.address?.subdivision_village || undefined,
        providerBarangay: profile.address?.barangay || undefined,
        providerCity: profile.address?.city_municipality || undefined,
        providerProvince: profile.address?.province || undefined,
        providerRegion: profile.address?.region || undefined,
        distance_km: typeof distance_km === 'string' ? distance_km : undefined,
      },
    });
  };

  const handleToggleFavorite = async () => {
    if (!profile || actionLoading) return;
    setActionLoading('toggle');
    try {
      const response = await fetch(`${API_URL}/users/favorites/toggle/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_type: 'mechanic',
          provider_id: profile.id,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showNotification({ type: 'error', message: (data as { error?: string }).error || 'Failed to update favorites' });
        return;
      }
      const nextValue = Boolean((data as { is_favorited?: boolean }).is_favorited);
      setIsFavorited(nextValue);
      showNotification({
        type: 'success',
        message: nextValue ? 'Mechanic added to favorites' : 'Mechanic removed from favorites',
      });
    } catch {
      showNotification({ type: 'error', message: 'Failed to update favorites' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async () => {
    if (!profile || actionLoading) return;
    setActionLoading('toggle');
    try {
      const nextActive = !memberActive;
      const res = await fetch(`${API_URL}/shops/mechanics/set-active/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mechanic_id: profile.id,
          is_active: nextActive,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotification({ type: 'error', message: data?.error || 'Failed to update mechanic status' });
        return;
      }
      setMemberActive(Boolean(data?.assignment_active ?? nextActive));
      await fetchMechanicProfile(true);
      showNotification({
        type: 'success',
        message: nextActive ? 'Mechanic activated successfully' : 'Mechanic deactivated successfully',
      });
    } catch {
      showNotification({ type: 'error', message: 'Failed to update mechanic status' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async () => {
    if (!profile || actionLoading) return;
    setActionLoading('remove');
    try {
      const res = await fetch(`${API_URL}/shops/mechanics/remove/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mechanic_id: profile.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotification({ type: 'error', message: data?.error || 'Failed to remove mechanic' });
        return;
      }
      showNotification({ type: 'success', message: 'Mechanic removed from shop' });
      handleBack();
    } catch {
      showNotification({ type: 'error', message: 'Failed to remove mechanic' });
    } finally {
      setActionLoading(null);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });

      return () => subscription.remove();
    }, [router])
  );

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
          <TouchableOpacity style={styles.retryBtn} onPress={handleBack}>
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
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
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

          {/* Action Buttons */}
          {showDirectRequest && (
            isShopOwnerView ? (
              <View style={styles.shopOwnerActionsRow}>
                <TouchableOpacity
                  style={styles.deactivateBtn}
                  activeOpacity={0.7}
                  onPress={handleDeactivate}
                  disabled={actionLoading !== null}
                >
                  <FontAwesome name={memberActive ? 'pause' : 'play'} size={14} color="#fff" />
                  <ThemedText style={styles.actionBtnText}>
                    {actionLoading === 'toggle' ? 'Updating...' : memberActive ? 'Deactivate' : 'Activate'}
                  </ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeBtn}
                  activeOpacity={0.7}
                  onPress={handleRemove}
                  disabled={actionLoading !== null}
                >
                  <FontAwesome name="trash" size={14} color="#fff" />
                  <ThemedText style={styles.actionBtnText}>
                    {actionLoading === 'remove' ? 'Removing...' : 'Remove'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.clientActionsRow}>
                <TouchableOpacity
                  style={[styles.directRequestBtn, styles.clientDirectRequestBtn]}
                  activeOpacity={0.7}
                  onPress={handleDirectRequest}
                >
                  <FontAwesome name="paper-plane" size={16} color="#fff" />
                  <ThemedText style={styles.directRequestText}>Send Direct Request</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.favoriteBtn, isFavorited && styles.favoriteBtnActive]}
                  activeOpacity={0.7}
                  onPress={handleToggleFavorite}
                  disabled={actionLoading !== null}
                >
                  <FontAwesome name={isFavorited ? 'heart' : 'heart-o'} size={16} color="#fff" />
                  <ThemedText style={styles.favoriteBtnText}>
                    {actionLoading === 'toggle'
                      ? 'Updating...'
                      : isFavorited
                        ? 'Unfavorite'
                        : 'Favorite'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            )
          )}

          {fromBroadcast === 'true' && (
            <View style={{ width: '100%', marginTop: 12, gap: 10 }}>
              <TouchableOpacity
                style={{
                  width: '100%',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#FF8C00',
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                activeOpacity={0.7}
                onPress={navigateBackToBroadcastDetails}
              >
                <ThemedText style={{ color: '#FFB45E', fontSize: 13, fontWeight: '700' }}>Go back to details</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  width: '100%',
                  borderRadius: 12,
                  backgroundColor: acceptingBroadcastOffer ? '#FF8C00AA' : '#FF8C00',
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
                activeOpacity={0.7}
                onPress={handleAcceptMechanicFromBroadcast}
                disabled={acceptingBroadcastOffer || !broadcastId || !offerId}
              >
                <FontAwesome name="check" size={14} color="#fff" />
                <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {acceptingBroadcastOffer ? 'Accepting...' : 'Accept Mechanic'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
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
            {formatStructuredAddress(profile.address) ? (
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <FontAwesome name="map-marker" size={14} color="#FF8C00" />
                </View>
                <ThemedText style={styles.infoText}>{formatStructuredAddress(profile.address)}</ThemedText>
              </View>
            ) : null}
            {formatDistanceLabel(distance_km) ? (
              <View style={styles.infoRow}>
                <View style={styles.infoIconCircle}>
                  <FontAwesome name="road" size={14} color="#FF8C00" />
                </View>
                <ThemedText style={styles.infoText}>{formatDistanceLabel(distance_km)}</ThemedText>
              </View>
            ) : null}
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

        {profile.addresses && profile.addresses.length > 0 && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Branches</ThemedText>
            <View style={styles.card}>
              {profile.addresses.map((branch, index) => (
                <View key={branch.id ?? `${branch.label}-${index}`} style={styles.branchRow}>
                  <View style={styles.branchIconCircle}>
                    <FontAwesome name="map-marker" size={12} color="#FF8C00" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.branchTitle}>
                      {branch.label || (branch.is_main ? 'Main Branch' : `Branch ${index + 1}`)}
                    </ThemedText>
                    <ThemedText style={styles.branchText} numberOfLines={2}>
                      {branch.formatted_address || formatStructuredAddress(branch) || 'No address saved'}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

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

        {/* Add-ons */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>
            Add-ons {addons.length > 0 && `(${addons.length})`}
          </ThemedText>
          {addons.length > 0 ? (
            addons.map((addon) => (
              <View key={addon.id} style={styles.serviceCard}>
                <View style={styles.serviceTop}>
                  <View style={styles.serviceIconCircle}>
                    <FontAwesome name="plus-circle" size={16} color="#FF8C00" />
                  </View>
                  <View style={styles.serviceInfo}>
                    <ThemedText style={styles.serviceName}>{addon.name}</ThemedText>
                    {addon.service_name && (
                      <ThemedText style={styles.serviceCategory}>Under: {addon.service_name}</ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.servicePrice}>P{parseFloat(addon.price).toFixed(2)}</ThemedText>
                </View>
                {addon.description && (
                  <ThemedText style={styles.serviceDesc}>{addon.description}</ThemedText>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <FontAwesome name="plus-square-o" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No add-ons listed</ThemedText>
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

