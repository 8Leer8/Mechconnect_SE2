import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';
import { router } from 'expo-router';
import { styles } from '../../../style/client/bookingStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingsResponse {
  bookings: Booking[];
}

interface Booking {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at: string;
  completed_at: string | null;
  request: {
    id: number;
    type: string;
    created_at: string;
  };
  provider: {
    id: number;
    name: string;
    email: string;
  } | null;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  active_details?: any;
  cancellation_details?: any;
  rework_details?: any;
  completion_details?: any;
}

interface BookingsResponse {
  bookings: Booking[];
}

type TabType = 'active' | 'completed' | 'cancelled' | 'reworked';

export default function BookingScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchBookings = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        const response = await fetch(`${API_URL}/bookings/bookings?status=${activeTab}`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (cancelled) return;

        if (!response.ok) throw new Error('Failed to fetch bookings');
        
        const data = await response.json() as BookingsResponse;
        if (!cancelled) {
          setBookings(data.bookings || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
          console.error('Error fetching bookings:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchBookings();

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleNotificationPress = () => {
    console.log('Notification pressed');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_the_way': return '#FF2D55'; // urgent pink/red
      case 'active': return '#FF8C00';
      case 'completed': return '#4CAF50';
      case 'cancelled': return '#FF4500';
      case 'reworked': return '#FFB84D';
      default: return '#999';
    }
  };

  const renderBookings = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerContainer}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      );
    }

    if (bookings.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <ThemedText style={styles.emptyText}>
            No {activeTab} bookings
          </ThemedText>
        </View>
      );
    }

    return bookings.map((booking) => (
      <View key={booking.id} style={styles.card}>
        {/* Header with Status Badge */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <ThemedText style={styles.bookingId}>Booking #{booking.id}</ThemedText>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
              <ThemedText style={[styles.statusText, booking.status === 'on_the_way' && { color: '#fff', fontWeight: 'bold', textTransform: 'none', fontSize: 13 }]}> 
                {booking.status === 'on_the_way' ? 'Mechanic on the way' : booking.status.toUpperCase()}
              </ThemedText>
              {booking.status === 'on_the_way' && (
                <ThemedText style={{ color: '#fff', fontSize: 10, fontWeight: 'bold', marginTop: 2, letterSpacing: 0.5 }}>
                  Please be ready!
                </ThemedText>
              )}
            </View>
          </View>
          <ThemedText style={styles.amountText}>₱{booking.amount_fee.toFixed(2)}</ThemedText>
        </View>

        {/* Provider Info */}
        {booking.provider && (
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Provider:</ThemedText>
            <ThemedText style={styles.value}>{booking.provider.name}</ThemedText>
          </View>
        )}

        {/* Service Location */}
        {booking.service_location && (
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Location:</ThemedText>
            <ThemedText style={styles.value} numberOfLines={2}>
              {booking.service_location.street_name}, {booking.service_location.barangay}, {booking.service_location.city_municipality}
            </ThemedText>
          </View>
        )}

        {/* Request Type */}
        <View style={styles.infoRow}>
          <ThemedText style={styles.label}>Type:</ThemedText>
          <ThemedText style={styles.value}>{booking.request.type}</ThemedText>
        </View>

        {/* Date */}
        <View style={styles.infoRow}>
          <ThemedText style={styles.label}>Booked:</ThemedText>
          <ThemedText style={styles.dateText}>{formatDate(booking.booked_at)}</ThemedText>
        </View>

        {/* Status-specific Details */}
        {(booking.status === 'active' || booking.status === 'on_the_way') && booking.active_details && (
          <View style={styles.detailBanner}>
            {booking.active_details.is_job_done ? (
              <ThemedText style={styles.detailText}>✓ Job marked as done</ThemedText>
            ) : (
              <ThemedText style={[styles.detailText, { color: '#FF2D55', fontWeight: 'bold' }]}>Mechanic is on the way or job in progress</ThemedText>
            )}
            {booking.active_details.started_at && (
              <ThemedText style={styles.detailText}>
                Started: {formatDate(booking.active_details.started_at)}
              </ThemedText>
            )}
            {booking.active_details.reason && (
              <ThemedText style={styles.detailText} numberOfLines={2}>
                Reason: {booking.active_details.reason}
              </ThemedText>
            )}
            {booking.active_details.is_rescheduled && (
              <ThemedText style={styles.detailText}>
                Rescheduled!
              </ThemedText>
            )}
          </View>
        )}

        {booking.status === 'cancelled' && booking.cancellation_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>
              Cancelled by: {booking.cancellation_details.cancelled_by.name}
            </ThemedText>
            {booking.cancellation_details.reason && (
              <ThemedText style={styles.detailText} numberOfLines={2}>
                Reason: {booking.cancellation_details.reason}
              </ThemedText>
            )}
          </View>
        )}

        {booking.status === 'reworked' && booking.rework_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>
              Requested by: {booking.rework_details.requested_by.name}
            </ThemedText>
            {booking.rework_details.reason && (
              <ThemedText style={styles.detailText} numberOfLines={2}>
                Reason: {booking.rework_details.reason}
              </ThemedText>
            )}
          </View>
        )}

        {booking.status === 'completed' && booking.completion_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>
              Total Amount: ₱{booking.completion_details.total_amount.toFixed(2)}
            </ThemedText>
            <ThemedText style={styles.detailText}>
              Completed: {formatDate(booking.completion_details.completed_at)}
            </ThemedText>
          </View>
        )}
        <TouchableOpacity
          style={{ marginTop: 10, alignSelf: 'flex-end', backgroundColor: '#FF8C00', borderRadius: 6, paddingHorizontal: 14, paddingVertical: 7 }}
          onPress={() => router.push({ pathname: '/(clientTabs)/booking_details', params: { bookingId: booking.id.toString() } })}
        >
          <ThemedText style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Details</ThemedText>
        </TouchableOpacity>
      </View>
    ));
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      
      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
            In Progress
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>
            Completed
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'cancelled' && styles.activeTab]}
          onPress={() => setActiveTab('cancelled')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'cancelled' && styles.activeTabText]}>
            Cancelled
          </ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reworked' && styles.activeTab]}
          onPress={() => setActiveTab('reworked')}
        >
          <ThemedText style={[styles.tabText, activeTab === 'reworked' && styles.activeTabText]}>
            Reworked
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {renderBookings()}
      </ScrollView>
    </ThemedView>
  );
}
