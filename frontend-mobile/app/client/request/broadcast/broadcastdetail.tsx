import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/broadcastDetailStyles';

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
