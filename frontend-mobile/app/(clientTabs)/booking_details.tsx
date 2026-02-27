import React, { useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { styles } from '@/style/client/bookingStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingDetail {
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
  provider?: {
    id: number;
    name: string;
    email: string;
  } | null;
  service_location?: {
    street_name: string;
    subdivision_village?: string;
    barangay: string;
    city_municipality: string;
    landmark?: string | null;
  } | null;
  active_details?: {
    before_picture: string | null;
    after_picture: string | null;
    is_job_done: boolean;
    is_rescheduled: boolean;
    reason: string | null;
    new_time: string | null;
    new_date: string | null;
    started_at: string | null;
  };
  completion_details?: {
    completed_at: string;
    total_amount: number;
    notes: string;
  };
  cancellation_details?: {
    cancelled_by: { id: number; name: string };
    reason: string;
    cancelled_at: string;
  };
  rework_details?: {
    requested_by: { id: number; name: string };
    reason: string;
    created_at: string;
    completed_at: string | null;
  };
}

export default function ClientBookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBookingDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        // Try both possible endpoints for robustness
        let response = await fetch(`${API_URL}/bookings/bookings/${bookingId}/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          // fallback to mechanic endpoint if needed
          response = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (!response.ok) throw new Error('Failed to fetch booking details');
        const data = await response.json();
        setBooking((data as any).booking || data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    if (bookingId) fetchBookingDetail();
  }, [bookingId]);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  if (!booking) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText style={styles.errorText}>Booking not found</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header with booking name */}
      <View style={{ backgroundColor: '#FF8C00', paddingVertical: 18, paddingHorizontal: 16 }}>
        <ThemedText style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>Booking #{booking.id}</ThemedText>
      </View>
      <ScrollView style={styles.scrollView}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <ThemedText style={styles.bookingId}>Booking #{booking.id}</ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: '#FF8C00' }]}> 
                <ThemedText style={styles.statusText}>{getStatusLabel(booking.status)}</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.amountText}>₱{booking.amount_fee.toFixed(2)}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Booked At:</ThemedText>
            <ThemedText style={styles.dateText}>{formatDate(booking.booked_at)}</ThemedText>
          </View>
          {booking.provider && (
            <View style={styles.infoRow}>
              <ThemedText style={styles.label}>Provider:</ThemedText>
              <ThemedText style={styles.value}>{booking.provider.name}</ThemedText>
            </View>
          )}
          {booking.service_location && (
            <View style={styles.infoRow}>
              <ThemedText style={styles.label}>Location:</ThemedText>
              <ThemedText style={styles.value} numberOfLines={2}>
                {booking.service_location.street_name}, {booking.service_location.barangay}, {booking.service_location.city_municipality}
              </ThemedText>
            </View>
          )}
        </View>
        {/* Details Banner Section */}
        {(booking.status === 'active' || booking.status === 'on_the_way') && booking.active_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>
              {booking.active_details.is_job_done ? '✓ Job marked as done' : 'Mechanic is on the way or job in progress'}
            </ThemedText>
            {booking.active_details.started_at && (
              <ThemedText style={styles.detailText}>Started: {formatDate(booking.active_details.started_at)}</ThemedText>
            )}
            {booking.active_details.reason && (
              <ThemedText style={styles.detailText} numberOfLines={2}>Reason: {booking.active_details.reason}</ThemedText>
            )}
            {booking.active_details.is_rescheduled && (
              <ThemedText style={[styles.detailText, { color: '#FF8C00' }]}>Rescheduled!</ThemedText>
            )}
          </View>
        )}
        {booking.status === 'completed' && booking.completion_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>Total Amount: ₱{booking.completion_details.total_amount.toFixed(2)}</ThemedText>
            <ThemedText style={styles.detailText}>Completed: {formatDate(booking.completion_details.completed_at)}</ThemedText>
            {booking.completion_details.notes && (
              <ThemedText style={styles.detailText} numberOfLines={2}>Notes: {booking.completion_details.notes}</ThemedText>
            )}
          </View>
        )}
        {booking.status === 'cancelled' && booking.cancellation_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>Cancelled by: {booking.cancellation_details.cancelled_by.name}</ThemedText>
            <ThemedText style={styles.detailText}>Reason: {booking.cancellation_details.reason}</ThemedText>
            <ThemedText style={styles.detailText}>Cancelled At: {formatDate(booking.cancellation_details.cancelled_at)}</ThemedText>
          </View>
        )}
        {booking.status === 'reworked' && booking.rework_details && (
          <View style={styles.detailBanner}>
            <ThemedText style={styles.detailText}>Requested by: {booking.rework_details.requested_by.name}</ThemedText>
            <ThemedText style={styles.detailText}>Reason: {booking.rework_details.reason}</ThemedText>
            <ThemedText style={styles.detailText}>Created At: {formatDate(booking.rework_details.created_at)}</ThemedText>
            {booking.rework_details.completed_at && (
              <ThemedText style={styles.detailText}>Completed At: {formatDate(booking.rework_details.completed_at)}</ThemedText>
            )}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

// User-friendly status label
function getStatusLabel(status: string) {
  switch (status) {
    case 'accepted': return 'Booked';
    case 'on_the_way': return 'Mechanic on the way';
    case 'active': return 'In Progress';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'reworked': return 'Reworked';
    case 'disputed': return 'Disputed';
    default: return status;
  }
}

// Styles are imported from bookingStyles.js for consistency
