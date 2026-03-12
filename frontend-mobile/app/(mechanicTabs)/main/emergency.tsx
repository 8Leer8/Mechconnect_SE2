import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/emergencyStyles';
import { useNotification } from '@/hooks/useNotification';
import { SkeletonEmergencyList } from '@/components/skeletons/SkeletonLoaders';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface EmergencyRequest {
  id: number;
  request_type: string;
  created_at: string;
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
    concern_picture?: string;
    urgency_level?: string;
  };
}

export default function EmergencyScreen() {
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchEmergencyRequests();
    // Poll for new emergencies every 30 seconds
    const interval = setInterval(fetchEmergencyRequests, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchEmergencyRequests = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_URL}/bookings/mechanic/emergency/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch emergency requests');
      const data = await response.json();
      const emergencies = data.emergency_requests || [];
      setRequests(emergencies);
    } catch (err: any) {
      console.error('[Emergency Page] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchEmergencyRequests();
  };

  const handleCall = (phone?: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleNavigate = (request: EmergencyRequest) => {
    if (request.service_location.latitude && request.service_location.longitude) {
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
    }
  };

  const handleAcceptEmergency = async (requestId: number) => {
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/emergency/${requestId}/accept/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_fee: 0 }), // Can be updated to show amount input
      });

      const data = await response.json();

      if (response.ok) {
        showNotification({ type: 'success', title: 'Emergency Accepted', message: 'You have accepted this emergency request. The booking has been created.' });
        fetchEmergencyRequests();
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to accept emergency request' });
      }
    } catch (error) {
      console.error('Error accepting emergency:', error);
      showNotification({ type: 'error', message: 'An error occurred while accepting the emergency request' });
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

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.emergencyIcon}>
            <FontAwesome name="exclamation-triangle" size={24} color="#FF3B30" />
          </View>
          <View>
            <ThemedText style={styles.headerTitle}>Emergency Requests</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Real-time alerts</ThemedText>
          </View>
        </View>
        {requests.length > 0 && (
          <View style={styles.countBadge}>
            <ThemedText style={styles.countText}>{requests.length}</ThemedText>
          </View>
        )}
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />
        }
      >
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
            <ThemedText style={styles.emptySubtext}>You'll be notified when new emergency requests arrive</ThemedText>
          </View>
        ) : (
          <View style={styles.requestsList}>
            {requests.map((request, index) => (
              <View key={request.id} style={styles.emergencyCard}>
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

                  {request.client?.phone && (
                    <View style={styles.infoRow}>
                      <FontAwesome name="phone" size={16} color="#34C759" />
                      <ThemedText style={styles.phoneNumber}>{request.client.phone}</ThemedText>
                    </View>
                  )}

                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={16} color="#FF8C00" />
                    <View style={styles.locationInfo}>
                      <ThemedText style={styles.locationText}>
                        {request.service_location.street_name}, {request.service_location.barangay}, {request.service_location.city_municipality}
                      </ThemedText>
                      {request.service_location.latitude && request.service_location.longitude && (
                        <ThemedText style={styles.coordsText}>
                          {Number(request.service_location.latitude).toFixed(6)}, {Number(request.service_location.longitude).toFixed(6)}
                        </ThemedText>
                      )}
                    </View>
                  </View>

                  {request.request_details?.concern_picture && (
                    <View style={styles.imageContainer}>
                      <Image 
                        source={{ uri: request.request_details.concern_picture }} 
                        style={styles.concernImage}
                        contentFit="cover"
                      />
                    </View>
                  )}
                </View>

                {request.request_details?.description && (
                  <View style={styles.descriptionBox}>
                    <ThemedText style={styles.descriptionLabel}>Issue:</ThemedText>
                    <ThemedText style={styles.descriptionText}>
                      {request.request_details.description}
                    </ThemedText>
                  </View>
                )}

                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.acceptBtn]}
                    onPress={() => handleAcceptEmergency(request.id)}
                  >
                    <FontAwesome name="check" size={16} color="#fff" />
                    <ThemedText style={styles.actionBtnText}>Accept</ThemedText>
                  </TouchableOpacity>

                  {request.client?.phone && (
                    <TouchableOpacity 
                      style={[styles.actionBtn, styles.callBtn]}
                      onPress={() => handleCall(request.client.phone)}
                    >
                      <FontAwesome name="phone" size={16} color="#fff" />
                      <ThemedText style={styles.actionBtnText}>Call</ThemedText>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.navigateBtn]}
                    onPress={() => handleNavigate(request)}
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
