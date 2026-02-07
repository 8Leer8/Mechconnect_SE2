import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Linking } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

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
    urgency_level?: string;
  };
}

export default function EmergencyScreen() {
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
      const response = await fetch(`${API_URL}/bookings/home/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch emergency requests');
      const data = await response.json();
      
      // Filter for emergency requests
      const emergencies = (data.pending_requests || []).filter(
        (req: any) => req.request_type === 'emergency'
      );
      
      setRequests(emergencies);
    } catch (err: any) {
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

  const handleNavigate = (location: any) => {
    if (location.latitude && location.longitude) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
      Linking.openURL(url);
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
          <ActivityIndicator size="large" color="#FF3B30" style={styles.loader} />
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
                  <View style={styles.urgentBadge}>
                    <FontAwesome name="bolt" size={12} color="#fff" />
                    <ThemedText style={styles.urgentText}>URGENT</ThemedText>
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
                    <FontAwesome name="map-marker" size={16} color="#FF8C00" />
                    <ThemedText style={styles.locationText}>
                      {request.service_location.street_name}, {request.service_location.barangay}, {request.service_location.city_municipality}
                    </ThemedText>
                  </View>

                  {request.request_details?.description && (
                    <View style={styles.descriptionBox}>
                      <ThemedText style={styles.descriptionLabel}>Issue:</ThemedText>
                      <ThemedText style={styles.descriptionText}>
                        {request.request_details.description}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.acceptBtn]}
                    onPress={() => console.log('Accept emergency', request.id)}
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
                    onPress={() => handleNavigate(request.service_location)}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1E1E1E',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emergencyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 16,
    minWidth: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  loader: {
    marginTop: 40,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
  },
  requestsList: {
    padding: 20,
  },
  emergencyCard: {
    backgroundColor: '#2A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FF3B30',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  urgentText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  timeAgo: {
    fontSize: 12,
    color: '#FF8C00',
    fontWeight: '600',
  },
  requestId: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  infoSection: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  locationText: {
    fontSize: 14,
    color: '#8E8E93',
    flex: 1,
  },
  descriptionBox: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  descriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF8C00',
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    color: '#fff',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  acceptBtn: {
    backgroundColor: '#34C759',
  },
  callBtn: {
    backgroundColor: '#007AFF',
  },
  navigateBtn: {
    backgroundColor: '#FF8C00',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
