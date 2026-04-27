import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNotification } from '@/hooks/useNotification';
import { SkeletonEmergencyList } from '@/components/skeletons/SkeletonLoaders';
import { styles } from '@/style/mechanic/emergencyStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface EmergencyRequest {
  id: number;
  request_type: string;
  created_at: string;
  vehicle_description?: string;
  vehicle_type?: string;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
    latitude?: number;
    longitude?: number;
  };
  client: {
    name: string;
    phone?: string;
  };
  request_details?: {
    description?: string;
    vehicle_description?: string;
    vehicle_type?: string;
    concern_picture?: string;
    concern_pictures?: string[];
    urgency_level?: string;
  };
}

export default function ShopOwnerEmergencyScreen() {
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [shopownerCanAccept, setShopownerCanAccept] = useState(true);
  const [acceptDisabledReason, setAcceptDisabledReason] = useState<string | null>(null);

  useEffect(() => {
    fetchEmergencyRequests();
    const interval = setInterval(fetchEmergencyRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchEmergencyRequests = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/bookings/shopowner/emergency/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const backendMessage =
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : typeof data?.message === 'string' && data.message.trim()
            ? data.message
            : '';
        if (response.status === 404) {
          throw new Error(
            backendMessage || 'Emergency endpoint not found. Please restart backend server and try again.'
          );
        }
        throw new Error(backendMessage || `Failed to fetch emergency requests (${response.status})`);
      }
      setRequests(data.emergency_requests || []);
      setShopownerCanAccept(data?.shopowner_can_accept !== false);
      setAcceptDisabledReason(
        typeof data?.accept_disabled_reason === 'string' && data.accept_disabled_reason.trim()
          ? data.accept_disabled_reason
          : null
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch emergency requests');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEmergencyRequests();
  };

  const handleNavigate = (request: EmergencyRequest) => {
    if (!request.service_location.latitude || !request.service_location.longitude) return;

    router.push({
      pathname: '/mechanic/emergency/emergency_location_map',
      params: {
        latitude: request.service_location.latitude.toString(),
        longitude: request.service_location.longitude.toString(),
        street: request.service_location.street_name,
        barangay: request.service_location.barangay,
        city: request.service_location.city_municipality,
        clientName: request.client?.name || 'Client',
      },
    });
  };

  const handleAcceptEmergency = async (requestId: number) => {
    if (!shopownerCanAccept) {
      showNotification({
        type: 'warning',
        message:
          acceptDisabledReason === 'shop_unavailable'
            ? 'Your shop is unavailable. Switch to accept bookings.'
            : 'You cannot accept emergency requests right now.',
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/bookings/shopowner/emergency/${requestId}/accept/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_fee: 0 }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const acceptedBookingId = Number(
          data?.booking_id ?? data?.bookingId ?? data?.booking?.id ?? data?.booking
        );
        showNotification({
          type: 'success',
          title: 'Emergency Accepted',
          message: 'Emergency request accepted and booking created.',
        });
        fetchEmergencyRequests();
        if (Number.isFinite(acceptedBookingId) && acceptedBookingId > 0) {
          router.push({
            pathname: '/shopowner/booking/booking_details',
            params: { bookingId: String(acceptedBookingId) },
          });
        }
      } else {
        const backendMessage =
          typeof data?.error === 'string' && data.error.trim()
            ? data.error
            : typeof data?.message === 'string' && data.message.trim()
            ? data.message
            : '';
        if (data?.reason === 'shop_unavailable') {
          setShopownerCanAccept(false);
          setAcceptDisabledReason('shop_unavailable');
        }
        showNotification({
          type: 'error',
          message: backendMessage || `Failed to accept emergency request (${response.status})`,
        });
      }
    } catch (err: any) {
      showNotification({
        type: 'error',
        message: err?.message || 'An error occurred while accepting the emergency request',
      });
    }
  };

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getVehicleType = (request: EmergencyRequest) =>
    request.request_details?.vehicle_type || request.vehicle_type || 'Not specified';

  const getVehicleDescription = (request: EmergencyRequest) =>
    request.request_details?.vehicle_description || request.vehicle_description || 'Not specified';

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => router.push('/main/shop')}
            style={{ marginRight: 10 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <FontAwesome name="chevron-left" size={18} color="#FF8C00" />
          </TouchableOpacity>
          <View style={styles.emergencyIcon}>
            <FontAwesome name="exclamation-triangle" size={24} color="#FF3B30" />
          </View>
          <View>
            <ThemedText style={styles.headerTitle}>Emergency Bookings</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Shop owner queue</ThemedText>
          </View>
        </View>
        {requests.length > 0 ? (
          <View style={styles.countBadge}>
            <ThemedText style={styles.countText}>{requests.length}</ThemedText>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}
      >
        {!loading && !error && !shopownerCanAccept && (
          <View style={styles.unavailableBanner}>
            <FontAwesome name="ban" size={14} color="#fff" />
            <ThemedText style={styles.unavailableBannerText}>
              {acceptDisabledReason === 'shop_unavailable'
                ? 'Emergency requests are disabled while your shop is hidden from discovery.'
                : 'Emergency requests are disabled for your account right now.'}
            </ThemedText>
          </View>
        )}

        {loading && !refreshing ? (
          <SkeletonEmergencyList />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchEmergencyRequests}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : requests.length === 0 ? (
          <View style={styles.emptyContainer}>
            <FontAwesome name="check-circle" size={64} color="#34C759" />
            <ThemedText style={styles.emptyText}>No Active Emergencies</ThemedText>
            <ThemedText style={styles.emptySubtext}>No emergency requests right now.</ThemedText>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {requests.map((request, index) => (
              <View
                key={request.id}
                style={[styles.emergencyCard, !shopownerCanAccept && styles.emergencyCardDisabled]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.headerLeft}>
                    <View style={styles.cardNumberBadge}>
                      <ThemedText style={styles.cardNumberText}>{index + 1}</ThemedText>
                    </View>
                    <View style={styles.urgentBadge}>
                      <FontAwesome name="bolt" size={12} color="#fff" />
                      <ThemedText style={styles.urgentText}>URGENT</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.timeAgo}>{getTimeSince(request.created_at)}</ThemedText>
                </View>

                <ThemedText style={styles.requestId}>Emergency #{request.id}</ThemedText>

                <View style={styles.infoSection}>
                  <View style={styles.infoRow}>
                    <FontAwesome name="user" size={16} color="#fff" />
                    <ThemedText style={styles.clientName}>{request.client?.name || 'Client'}</ThemedText>
                  </View>

                  <View style={styles.infoRow}>
                    <FontAwesome name="car" size={16} color="#8E8E93" />
                    <ThemedText style={styles.phoneNumber}>Vehicle Type: {getVehicleType(request)}</ThemedText>
                  </View>

                  {request.client?.phone ? (
                    <View style={styles.infoRow}>
                      <FontAwesome name="phone" size={16} color="#34C759" />
                      <ThemedText style={styles.phoneNumber}>{request.client.phone}</ThemedText>
                    </View>
                  ) : null}

                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={16} color="#FF8C00" />
                    <View style={styles.locationInfo}>
                      <ThemedText style={styles.locationText}>
                        {request.service_location.street_name}, {request.service_location.barangay},{' '}
                        {request.service_location.city_municipality}
                      </ThemedText>
                      {request.service_location.latitude && request.service_location.longitude ? (
                        <ThemedText style={styles.coordsText}>
                          {Number(request.service_location.latitude).toFixed(6)},{' '}
                          {Number(request.service_location.longitude).toFixed(6)}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>

                  {(request.request_details?.concern_pictures?.length || request.request_details?.concern_picture) ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageContainer}>
                      {(request.request_details?.concern_pictures?.length
                        ? request.request_details.concern_pictures
                        : request.request_details?.concern_picture
                        ? [request.request_details.concern_picture]
                        : []
                      ).map((photoUri, idx) => (
                        <Image
                          key={`${request.id}-photo-${idx}`}
                          source={{ uri: photoUri }}
                          style={[styles.concernImage, { marginRight: 8 }]}
                          contentFit="cover"
                        />
                      ))}
                    </ScrollView>
                  ) : null}
                </View>

                {request.request_details?.description ? (
                  <View style={styles.descriptionBox}>
                    <ThemedText style={styles.descriptionLabel}>Issue:</ThemedText>
                    <ThemedText style={styles.descriptionText}>{request.request_details.description}</ThemedText>
                  </View>
                ) : null}

                <View style={styles.descriptionBox}>
                  <ThemedText style={styles.descriptionLabel}>Vehicle:</ThemedText>
                  <ThemedText style={styles.descriptionText}>{getVehicleDescription(request)}</ThemedText>
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.acceptBtn, !shopownerCanAccept && styles.actionBtnDisabled]}
                    onPress={() => handleAcceptEmergency(request.id)}
                    disabled={!shopownerCanAccept}
                  >
                    <FontAwesome name="check" size={16} color="#fff" />
                    <ThemedText style={styles.actionBtnText}>
                      {shopownerCanAccept ? 'Accept' : 'Unavailable'}
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.navigateBtn, !shopownerCanAccept && styles.actionBtnDisabled]}
                    onPress={() => handleNavigate(request)}
                    disabled={!shopownerCanAccept}
                  >
                    <FontAwesome name="location-arrow" size={16} color="#fff" />
                    <ThemedText style={styles.actionBtnText}>Navigate</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}
