import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/broadcastDetailStyles';
import { useWebSocketContext } from '@/context/WebSocketContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BroadcastOffer {
  id: number;
  status: string;
  mechanic: {
    id: number;
    firstname: string;
    lastname: string;
    name: string;
    phone?: string | null;
  };
  mechanic_rating?: number | null;
  distance_km?: number | null;
  estimated_price?: number | null;
  convenience_fee?: number | null;
  estimated_eta_minutes?: number | null;
  created_at?: string;
  responded_at?: string | null;
}

interface BroadcastPayload {
  id: number;
  description: string;
  status: string;
  services: { id: number; name: string }[];
  concern_picture?: string | null;
  expires_at?: string | null;
  accepted_at?: string | null;
}

interface BroadcastOffersResponse {
  broadcast: BroadcastPayload;
  offers: BroadcastOffer[];
  count: number;
}

export default function BroadcastDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    description: string;
    status: string;
    services: string;
    provider: string;
    providersNote: string;
    concernPicture: string;
    serviceLocation: string;
    createdAt: string;
    expiresAt: string;
    acceptedAt: string;
    hasBooking: string;
  }>();

  const { lastMessage } = useWebSocketContext();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [broadcastData, setBroadcastData] = useState<BroadcastOffersResponse | null>(null);
  const [offers, setOffers] = useState<BroadcastOffer[]>([]);
  const [selectingOfferId, setSelectingOfferId] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  const broadcastId = params.id;
  const description = params.description || '';
  const status = params.status || 'searching';
  const services = params.services ? JSON.parse(params.services) : [];
  const provider = params.provider ? JSON.parse(params.provider) : null;
  const providersNote = params.providersNote || '';
  const serviceLocation = params.serviceLocation ? JSON.parse(params.serviceLocation) : null;
  const createdAt = params.createdAt || '';
  const expiresAt = params.expiresAt || '';
  const acceptedAt = params.acceptedAt || '';
  const hasBooking = params.hasBooking === 'true';
  const liveBroadcast = broadcastData?.broadcast || null;
  const currentStatus = liveBroadcast?.status || status;
  const currentDescription = liveBroadcast?.description || description;
  const currentServices = liveBroadcast?.services || services;
  const currentExpiresAt = liveBroadcast?.expires_at || expiresAt;
  const currentAcceptedAt = liveBroadcast?.accepted_at || acceptedAt;
  const acceptedOffer = useMemo(
    () => offers.find((offer) => offer.status === 'accepted') || null,
    [offers]
  );
  const pendingOffers = useMemo(
    () => offers.filter((offer) => offer.status === 'pending'),
    [offers]
  );

  const fetchBroadcastOffers = async (silent = false) => {
    if (!broadcastId) return;
    try {
      if (!silent) setLoading(true);
      setSelectionError(null);
      const response = await fetch(`${API_URL}/bookings/broadcasts/${broadcastId}/offers/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json() as BroadcastOffersResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load broadcast offers');
      }

      setBroadcastData(data);
      setOffers(Array.isArray(data.offers) ? data.offers : []);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : 'Failed to load broadcast offers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSelectMechanic = async (offerId: number) => {
    if (!broadcastId || selectingOfferId) return;

    setSelectingOfferId(offerId);
    setSelectionError(null);
    try {
      const response = await fetch(`${API_URL}/bookings/broadcasts/${broadcastId}/select-mechanic/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer_id: offerId }),
      });

      const data = await response.json() as { error?: string; booking_id?: number };
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
      setSelectionError(error instanceof Error ? error.message : 'Failed to select mechanic');
      setSelectingOfferId(null);
      fetchBroadcastOffers(true);
    }
  };

  // Calculate time remaining for searching requests
  useEffect(() => {
    if (currentStatus === 'searching' && currentExpiresAt) {
      const calculateTimeRemaining = () => {
        const now = new Date().getTime();
        const expiryTime = new Date(currentExpiresAt).getTime();
        const remaining = Math.max(0, expiryTime - now);
        setTimeRemaining(remaining);
      };

      // Initial calculation
      calculateTimeRemaining();

      // Update every second
      const interval = setInterval(calculateTimeRemaining, 1000);

      return () => clearInterval(interval);
    }
  }, [currentStatus, currentExpiresAt]);

  useEffect(() => {
    fetchBroadcastOffers();
  }, [broadcastId]);

  useEffect(() => {
    if (!broadcastId) return;
    const interval = setInterval(() => {
      if (currentStatus === 'searching') {
        fetchBroadcastOffers(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [broadcastId, currentStatus]);

  useEffect(() => {
    if (!lastMessage) return;
    const messageBroadcastId = Number(lastMessage.broadcast_id ?? lastMessage.broadcastId ?? 0) || null;
    if (messageBroadcastId && broadcastId && messageBroadcastId !== Number(broadcastId)) {
      return;
    }

    if (
      lastMessage.action === 'broadcast_offer_created' ||
      lastMessage.action === 'offer_rejected' ||
      lastMessage.action === 'booking_finalized' ||
      lastMessage.action === 'broadcast_finalized' ||
      lastMessage.action === 'broadcast_removed'
    ) {
      fetchBroadcastOffers(true);
    }
  }, [lastMessage, broadcastId]);

  const formatTimeRemaining = (milliseconds: number) => {
    if (milliseconds <= 0) return 'Expired';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchBroadcastOffers(true);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'searching': return 'Searching for Mechanics';
      case 'accepted': return 'Accepted';
      case 'expired': return 'Expired';
      case 'cancelled': return 'Cancelled';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getMechanicDisplayRating = (rating?: number | null) => {
    if (rating === null || rating === undefined || rating <= 0) return 'New';
    return `${rating.toFixed(1)} / 5`;
  };

  const formatDistance = (distance?: number | null) => {
    if (distance === null || distance === undefined) return '--';
    return `${distance.toFixed(2)} km`;
  };

  const formatEta = (eta?: number | null) => {
    if (eta === null || eta === undefined) return '--';
    return `${eta} min`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'searching': return '#007AFF';
      case 'accepted': return '#34C759';
      case 'expired': return '#FF3B30';
      case 'cancelled': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'searching': return 'search';
      case 'accepted': return 'check-circle';
      case 'expired': return 'hourglass-end';
      case 'cancelled': return 'times-circle';
      default: return 'circle';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderMechanicCard = (offer: BroadcastOffer) => (
    <View
      key={offer.id}
      style={{
        borderWidth: 1,
        borderColor: '#FFFFFF14',
        backgroundColor: '#FFFFFF08',
        borderRadius: 18,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontSize: 15, fontWeight: '700' }}>{offer.mechanic.name}</ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <FontAwesome name="star" size={12} color="#FFB000" />
            <ThemedText style={{ fontSize: 12, color: '#B8B8C0' }}>{getMechanicDisplayRating(offer.mechanic_rating)}</ThemedText>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: offer.status === 'pending' ? '#FF8C00' : '#34C759' }]}>
          <ThemedText style={styles.statusBadgeText}>{offer.status.toUpperCase()}</ThemedText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <FontAwesome name="map-marker" size={12} color="#8E8E93" />
          <ThemedText style={{ fontSize: 12, color: '#C9C9CF' }}>{formatDistance(offer.distance_km)}</ThemedText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <FontAwesome name="clock-o" size={12} color="#8E8E93" />
          <ThemedText style={{ fontSize: 12, color: '#C9C9CF' }}>{formatEta(offer.estimated_eta_minutes)}</ThemedText>
        </View>
      </View>

      <TouchableOpacity
        style={{
          marginTop: 14,
          borderRadius: 14,
          backgroundColor: selectingOfferId === offer.id ? '#FF8C00AA' : '#FF8C00',
          paddingVertical: 12,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        }}
        onPress={() => handleSelectMechanic(offer.id)}
        disabled={selectingOfferId !== null}
        activeOpacity={0.8}
      >
        {selectingOfferId === offer.id ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <FontAwesome name="check" size={13} color="#fff" />
        )}
        <ThemedText style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
          Confirm Selection
        </ThemedText>
      </TouchableOpacity>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Broadcast #{broadcastId}</ThemedText>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
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
        {/* Status Card */}
        <View style={[styles.statusCard, { borderColor: getStatusColor(status) + '40' }]}>
          <View style={[styles.statusIconLarge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <FontAwesome name={getStatusIcon(status) as any} size={28} color={getStatusColor(status)} />
          </View>
          <View style={styles.statusInfo}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
              <ThemedText style={styles.statusBadgeText}>{getStatusLabel(status)}</ThemedText>
            </View>
            <ThemedText style={styles.broadcastType}>Broadcast Request</ThemedText>
            {status === 'searching' && timeRemaining > 0 && (
              <View style={styles.timerContainer}>
                <FontAwesome name="clock-o" size={14} color="#FF8C00" />
                <ThemedText style={styles.timerText}>
                  {formatTimeRemaining(timeRemaining)} remaining
                </ThemedText>
              </View>
            )}
          </View>
          {hasBooking && (
            <View style={styles.bookedIndicator}>
              <FontAwesome name="check-circle" size={16} color="#34C759" />
              <ThemedText style={styles.bookedText}>Booked</ThemedText>
            </View>
          )}
        </View>

        {/* Description Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="file-text-o" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.sectionTitle}>Description</ThemedText>
          </View>
          <ThemedText style={styles.descriptionText}>{currentDescription || 'No description provided'}</ThemedText>
        </View>

        {/* Services Section */}
        {currentServices.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="list" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Requested Services</ThemedText>
            </View>
            <View style={styles.servicesList}>
              {currentServices.map((service: any, index: number) => (
                <View key={index} style={styles.serviceItem}>
                  <FontAwesome name="check" size={12} color="#34C759" />
                  <ThemedText style={styles.serviceName}>{service.name}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Mechanic Offers */}
        {currentStatus === 'searching' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="users" size={16} color="#34C759" />
              </View>
              <ThemedText style={styles.sectionTitle}>Mechanics Waiting</ThemedText>
            </View>

            {loading ? (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <ActivityIndicator color="#FF8C00" />
              </View>
            ) : pendingOffers.length === 0 ? (
              <ThemedText style={{ color: '#A5A5AD', fontSize: 13, lineHeight: 20 }}>
                No mechanics have requested to accept this broadcast yet.
              </ThemedText>
            ) : (
              <View>
                {pendingOffers.map(renderMechanicCard)}
              </View>
            )}
          </View>
        )}

        {/* Selected Mechanic */}
        {currentStatus === 'accepted' && acceptedOffer && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="wrench" size={16} color="#34C759" />
              </View>
              <ThemedText style={styles.sectionTitle}>Selected Mechanic</ThemedText>
            </View>
            <View style={styles.providerInfo}>
              <View style={styles.providerRow}>
                <ThemedText style={styles.providerLabel}>Name</ThemedText>
                <ThemedText style={styles.providerValue}>{acceptedOffer.mechanic.name}</ThemedText>
              </View>
              <View style={styles.providerRow}>
                <ThemedText style={styles.providerLabel}>Rating</ThemedText>
                <ThemedText style={styles.providerValue}>{getMechanicDisplayRating(acceptedOffer.mechanic_rating)}</ThemedText>
              </View>
              <View style={styles.providerRow}>
                <ThemedText style={styles.providerLabel}>Distance</ThemedText>
                <ThemedText style={styles.providerValue}>{formatDistance(acceptedOffer.distance_km)}</ThemedText>
              </View>
              <View style={styles.providerRow}>
                <ThemedText style={styles.providerLabel}>ETA</ThemedText>
                <ThemedText style={styles.providerValue}>{formatEta(acceptedOffer.estimated_eta_minutes)}</ThemedText>
              </View>
            </View>
          </View>
        )}

        {selectionError && (
          <View style={{ marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 12, backgroundColor: '#FF3B3018', borderWidth: 1, borderColor: '#FF3B3038' }}>
            <ThemedText style={{ color: '#FFB4AA', fontSize: 13, fontWeight: '600' }}>{selectionError}</ThemedText>
          </View>
        )}

        {/* Location Section */}
        {serviceLocation && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
                <FontAwesome name="map-marker" size={16} color="#FF3B30" />
              </View>
              <ThemedText style={styles.sectionTitle}>Service Location</ThemedText>
            </View>
            <View style={styles.locationDetails}>
              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>Street</ThemedText>
                <ThemedText style={styles.locationValue}>{serviceLocation.street_name}</ThemedText>
              </View>
              {serviceLocation.subdivision_village && (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                  <ThemedText style={styles.locationValue}>{serviceLocation.subdivision_village}</ThemedText>
                </View>
              )}
              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                <ThemedText style={styles.locationValue}>{serviceLocation.barangay}</ThemedText>
              </View>
              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>City</ThemedText>
                <ThemedText style={styles.locationValue}>{serviceLocation.city_municipality}</ThemedText>
              </View>
              {serviceLocation.landmark && (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Landmark</ThemedText>
                  <ThemedText style={styles.locationValue}>{serviceLocation.landmark}</ThemedText>
                </View>
              )}
            </View>

          </View>
        )}

        {/* Timeline Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#8E8E9315' }]}>
              <FontAwesome name="clock-o" size={16} color="#8E8E93" />
            </View>
            <ThemedText style={styles.sectionTitle}>Timeline</ThemedText>
          </View>
          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: '#007AFF' }]} />
              <View style={styles.timelineContent}>
                <ThemedText style={styles.timelineLabel}>Created</ThemedText>
                <ThemedText style={styles.timelineDate}>{formatDate(createdAt)}</ThemedText>
              </View>
            </View>
            {(currentStatus === 'accepted' || hasBooking) && currentAcceptedAt ? (
              <>
                <View style={styles.timelineLine} />
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: '#34C759' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>Accepted</ThemedText>
                    <ThemedText style={styles.timelineDate}>{formatDate(currentAcceptedAt)}</ThemedText>
                  </View>
                </View>
              </>
            ) : currentExpiresAt && currentStatus !== 'accepted' && !hasBooking && (
              <>
                <View style={styles.timelineLine} />
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: currentStatus === 'expired' ? '#FF3B30' : '#FF8C00' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>
                      {currentStatus === 'expired' ? 'Expired' : 'Expires'}
                    </ThemedText>
                    <ThemedText style={styles.timelineDate}>{formatDate(currentExpiresAt)}</ThemedText>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </ThemedView>
  );
}
