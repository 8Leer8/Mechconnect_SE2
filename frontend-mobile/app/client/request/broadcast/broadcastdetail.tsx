import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

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

  const [refreshing, setRefreshing] = useState(false);
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

  // Calculate time remaining for searching requests
  useEffect(() => {
    if (status === 'searching' && expiresAt) {
      const calculateTimeRemaining = () => {
        const now = new Date().getTime();
        const expiryTime = new Date(expiresAt).getTime();
        const remaining = Math.max(0, expiryTime - now);
        setTimeRemaining(remaining);
      };

      // Initial calculation
      calculateTimeRemaining();

      // Update every second
      const interval = setInterval(calculateTimeRemaining, 1000);

      return () => clearInterval(interval);
    }
  }, [status, expiresAt]);

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
    setTimeout(() => setRefreshing(false), 1000);
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
          <ThemedText style={styles.descriptionText}>{description || 'No description provided'}</ThemedText>
        </View>

        {/* Services Section */}
        {services.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="list" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Requested Services</ThemedText>
            </View>
            <View style={styles.servicesList}>
              {services.map((service: any, index: number) => (
                <View key={index} style={styles.serviceItem}>
                  <FontAwesome name="check" size={12} color="#34C759" />
                  <ThemedText style={styles.serviceName}>{service.name}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Provider Information */}
        {provider && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="wrench" size={16} color="#34C759" />
              </View>
              <ThemedText style={styles.sectionTitle}>Mechanic Information</ThemedText>
            </View>
            <View style={styles.providerInfo}>
              <View style={styles.providerRow}>
                <ThemedText style={styles.providerLabel}>Name</ThemedText>
                <ThemedText style={styles.providerValue}>{provider.name}</ThemedText>
              </View>
            </View>
            {providersNote && (
              <View style={styles.noteBox}>
                <ThemedText style={styles.noteLabel}>Mechanic's Note</ThemedText>
                <ThemedText style={styles.noteText}>{providersNote}</ThemedText>
              </View>
            )}
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
            {(status === 'accepted' || hasBooking) && acceptedAt ? (
              <>
                <View style={styles.timelineLine} />
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: '#34C759' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>Accepted</ThemedText>
                    <ThemedText style={styles.timelineDate}>{formatDate(acceptedAt)}</ThemedText>
                  </View>
                </View>
              </>
            ) : expiresAt && status !== 'accepted' && !hasBooking && (
              <>
                <View style={styles.timelineLine} />
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: status === 'expired' ? '#FF3B30' : '#FF8C00' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>
                      {status === 'expired' ? 'Expired' : 'Expires'}
                    </ThemedText>
                    <ThemedText style={styles.timelineDate}>{formatDate(expiresAt)}</ThemedText>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  // Status Card
  statusCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statusIconLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: {
    flex: 1,
    gap: 6,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  broadcastType: {
    fontSize: 13,
    color: '#8E8E93',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FF8C0015',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  timerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF8C00',
  },
  bookedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#34C75915',
    borderRadius: 8,
  },
  bookedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34C759',
  },
  // Section Cards
  sectionCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Description
  descriptionText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  // Services List
  servicesList: {
    gap: 12,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#222426',
    borderRadius: 8,
  },
  serviceName: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: '500',
  },
  // Provider Info
  providerInfo: {
    gap: 12,
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerLabel: {
    fontSize: 13,
    color: '#8E8E93',
  },
  providerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
    flex: 1,
    textAlign: 'right',
  },
  noteBox: {
    backgroundColor: '#222426',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 18,
  },
  // Location
  locationDetails: {
    gap: 12,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationLabel: {
    fontSize: 13,
    color: '#8E8E93',
    width: 100,
  },
  locationValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ccc',
    flex: 1,
    textAlign: 'right',
  },
  // Timeline
  timeline: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ccc',
  },
  timelineDate: {
    fontSize: 12,
    color: '#8E8E93',
  },
  timelineLine: {
    width: 2,
    height: 16,
    backgroundColor: '#333',
    marginLeft: 5,
    marginVertical: 2,
  },
});
