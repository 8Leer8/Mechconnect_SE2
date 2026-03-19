import React, { useCallback, useEffect, useState } from 'react';
export const screenOptions = { headerShown: false } as const;
import { View, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonDetailPage } from '@/components/skeletons/SkeletonLoaders';
import { styles } from '@/style/mechanic/bookingDetailsStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface BookingDetail {
  id: number;
  status: string;
  amount_fee: number;
  booked_at: string;
  updated_at?: string;
  completed_at?: string | null;
  request: {
    id: number;
    type: string;
    created_at: string;
    request_details?: any;
  };
  client?: {
    firstname?: string;
    lastname?: string;
    username?: string;
    email?: string;
  };
  provider?: { id: number; name: string; email: string } | null;
  shop?: { id: number; shop_name: string; contact_number?: string; email?: string } | null;
  service_location?: {
    street_name: string;
    subdivision_village?: string;
    barangay: string;
    city_municipality: string;
    landmark?: string | null;
  } | null;
  active_details?: {
    is_job_done?: boolean;
    is_rescheduled?: boolean;
    started_at?: string | null;
    reason?: string | null;
  };
  completion_details?: {
    completed_at: string;
    total_amount: number;
    notes?: string;
  };
  cancellation_details?: {
    cancelled_by: { id: number; name: string };
    reason: string;
    cancelled_at: string;
  };
}

export default function ShopOwnerBookingDetailScreen() {
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const navigation = useNavigation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    try {
      navigation.setOptions && navigation.setOptions({ headerShown: false });
    } catch {}
    try {
      navigation.getParent && navigation.getParent()?.setOptions && navigation.getParent()?.setOptions({ headerShown: false });
    } catch {}
  }, []);

  const fetchBookingDetail = useCallback(async (silent = false) => {
    if (!bookingId) return;
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch(`${API_URL}/bookings/shopowner/bookings/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch booking details');
      setBooking(data.booking || data);

      // Initialize elapsed timer immediately for active status (view-only)
      const bookingData = data.booking || data;
      if (
        bookingData?.status === 'active' &&
        bookingData?.active_details?.started_at
      ) {
        const startedMs = new Date(bookingData.active_details.started_at).getTime();
        if (!isNaN(startedMs)) {
          setTimer(Math.max(0, Math.floor((Date.now() - startedMs) / 1000)));
        }
      } else {
        setTimer(0);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchBookingDetail();
  }, [fetchBookingDetail]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookingDetail(true);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'Booked';
      case 'active':
        return 'On Going';
      case 'on_the_way':
        return 'On the Way';
      case 'paused':
        return 'Paused';
      case 'finished':
        return 'Finished';
      case 'pending_payment':
        return 'Pending Payment';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'pending':
        return 'Pending';
      case 'reworked':
        return 'Reworked';
      case 'disputed':
        return 'Disputed';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#00B8D9';
      case 'active':
        return '#FF8C00';
      case 'on_the_way':
        return '#007AFF';
      case 'paused':
        return '#8E8E93';
      case 'finished':
        return '#34C759';
      case 'pending_payment':
        return '#FFD60A';
      case 'reworked':
        return '#FFD60A';
      case 'completed':
        return '#34C759';
      case 'cancelled':
        return '#FF3B30';
      case 'pending':
        return '#8E8E93';
      case 'disputed':
        return '#AF52DE';
      default:
        return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'calendar-check-o';
      case 'active':
        return 'play-circle';
      case 'on_the_way':
        return 'car';
      case 'paused':
        return 'pause-circle';
      case 'finished':
        return 'check-circle';
      case 'pending_payment':
        return 'money';
      case 'completed':
        return 'check-circle';
      case 'cancelled':
        return 'times-circle';
      case 'pending':
        return 'clock-o';
      case 'reworked':
        return 'refresh';
      case 'disputed':
        return 'exclamation-circle';
      default:
        return 'circle';
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const getDisplayQuotation = () => {
    if (!booking) return null;
    const details = (booking.request as any)?.request_details || null;
    if (!details) return null;

    const items: any[] = [];
    if (details.service) {
      const svc: any = details.service;
      const unit = Number(svc.minimum_price ?? booking.amount_fee ?? 0) || 0;
      items.push({
        description: svc.name || 'Service',
        quantity: 1,
        unit_price: unit,
        service: svc.id,
      });
    } else if (Array.isArray(details.services) && details.services.length > 0) {
      const primary: any = details.services[0];
      const unit = Number(primary.minimum_price ?? booking.amount_fee ?? 0) || 0;
      items.push({
        description: primary.name || 'Service',
        quantity: 1,
        unit_price: unit,
        service: primary.id,
      });
    }

    if (items.length === 0) return null;
    const total_amount = items.reduce(
      (s, it) =>
        s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1),
      0
    );
    return { items, total_amount };
  };

  const displayQuotation = getDisplayQuotation();

  // Live timer for active status (view-only)
  useEffect(() => {
    if (!booking) return;
    if (booking.status !== 'active') return;
    if (!booking.active_details?.started_at) return;

    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [booking?.status, booking?.active_details?.started_at]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          <SkeletonDetailPage />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !booking) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'Booking not found'}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchBookingDetail()}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  const clientName =
    booking.client
      ? `${booking.client.firstname || ''} ${booking.client.lastname || ''}`.trim() ||
        booking.client.username ||
        booking.client.email ||
        'Client'
      : 'Client';

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Booking Details</ThemedText>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* View-only details (same premium layout, but no mechanic action buttons) */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
      >
        {/* Status Card */}
        <View
          style={[
            styles.statusCard,
            { borderColor: getStatusColor(booking.status) + '40' },
          ]}
        >
          <View
            style={[
              styles.statusIconLarge,
              { backgroundColor: getStatusColor(booking.status) + '20' },
            ]}
          >
            <FontAwesome
              name={getStatusIcon(booking.status) as any}
              size={28}
              color={getStatusColor(booking.status)}
            />
          </View>

          <View style={styles.statusInfo}>
            <View style={styles.statusBadgeRow}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(booking.status) },
                ]}
              >
                <ThemedText style={styles.statusBadgeText}>
                  {getStatusLabel(booking.status)}
                </ThemedText>
              </View>

              {(booking.status === 'active' || booking.status === 'paused') &&
                booking.active_details?.started_at && (
                  <ThemedText style={styles.timerText}>
                    {formatDuration(timer)}
                  </ThemedText>
                )}

              <ThemedText style={styles.bookingIdText}>#{booking.id}</ThemedText>
            </View>

            <ThemedText style={styles.serviceType}>
              {booking.request?.type
                ? booking.request.type.charAt(0).toUpperCase() +
                  booking.request.type.slice(1) +
                  ' Service'
                : 'Service Request'}
            </ThemedText>
          </View>

          <ThemedText style={styles.amountLarge}>
            ₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}
          </ThemedText>
        </View>

        {/* Client Info */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
              <FontAwesome name="user" size={16} color="#007AFF" />
            </View>
            <ThemedText style={styles.sectionTitle}>Client Information</ThemedText>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <ThemedText style={styles.infoLabel}>Name</ThemedText>
              <ThemedText style={styles.infoValue}>{clientName}</ThemedText>
            </View>

            {booking.client?.email && (
              <View style={styles.infoItem}>
                <ThemedText style={styles.infoLabel}>Email</ThemedText>
                <ThemedText style={styles.infoValue}>{booking.client.email}</ThemedText>
              </View>
            )}
          </View>
        </View>

        {/* Service Location */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
              <FontAwesome name="map-marker" size={16} color="#FF3B30" />
            </View>
            <ThemedText style={styles.sectionTitle}>Service Location</ThemedText>
          </View>

          {booking.service_location ? (
            <View style={styles.locationDetails}>
              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>Street</ThemedText>
                <ThemedText style={styles.locationValue}>
                  {booking.service_location.street_name}
                </ThemedText>
              </View>

              {booking.service_location.subdivision_village && (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Subdivision</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {booking.service_location.subdivision_village}
                  </ThemedText>
                </View>
              )}

              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>Barangay</ThemedText>
                <ThemedText style={styles.locationValue}>
                  {booking.service_location.barangay}
                </ThemedText>
              </View>

              <View style={styles.locationRow}>
                <ThemedText style={styles.locationLabel}>City</ThemedText>
                <ThemedText style={styles.locationValue}>
                  {booking.service_location.city_municipality}
                </ThemedText>
              </View>

              {booking.service_location.landmark && (
                <View style={styles.locationRow}>
                  <ThemedText style={styles.locationLabel}>Landmark</ThemedText>
                  <ThemedText style={styles.locationValue}>
                    {booking.service_location.landmark}
                  </ThemedText>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noLocationCard}>
              <FontAwesome name="map-o" size={24} color="#555" />
              <ThemedText style={styles.noLocationText}>No location specified</ThemedText>
            </View>
          )}
        </View>

        {/* Timeline */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="clock-o" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={styles.sectionTitle}>Timeline</ThemedText>
          </View>

          <View style={styles.timeline}>
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, { backgroundColor: '#007AFF' }]} />
              <View style={styles.timelineContent}>
                <ThemedText style={styles.timelineLabel}>Booked</ThemedText>
                <ThemedText style={styles.timelineDate}>{formatDate(booking.booked_at)}</ThemedText>
              </View>
            </View>

            <View style={styles.timelineLine} />

            {booking.active_details?.started_at && (
              <>
                <View style={styles.timelineItem}>
                  <View style={[styles.timelineDot, { backgroundColor: '#FF8C00' }]} />
                  <View style={styles.timelineContent}>
                    <ThemedText style={styles.timelineLabel}>Started</ThemedText>
                    <ThemedText style={styles.timelineDate}>
                      {formatDate(booking.active_details.started_at)}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.timelineLine} />
              </>
            )}

            {booking.updated_at &&
              booking.updated_at !== booking.booked_at && (
                <>
                  <View style={styles.timelineItem}>
                    <View style={[styles.timelineDot, { backgroundColor: '#8E8E93' }]} />
                    <View style={styles.timelineContent}>
                      <ThemedText style={styles.timelineLabel}>Last Updated</ThemedText>
                      <ThemedText style={styles.timelineDate}>{formatDate(booking.updated_at)}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.timelineLine} />
                </>
              )}

            {booking.completed_at && (
              <View style={styles.timelineItem}>
                <View style={[styles.timelineDot, { backgroundColor: '#34C759' }]} />
                <View style={styles.timelineContent}>
                  <ThemedText style={styles.timelineLabel}>Completed</ThemedText>
                  <ThemedText style={styles.timelineDate}>{formatDate(booking.completed_at)}</ThemedText>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Quotation (read-only) */}
        {(booking.status === 'accepted' ||
          booking.status === 'on_the_way' ||
          booking.status === 'active') && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#007AFF15' }]}>
                <FontAwesome name="file-text-o" size={16} color="#007AFF" />
              </View>
              <ThemedText style={styles.sectionTitle}>Quotation</ThemedText>
            </View>

            {displayQuotation && (displayQuotation.items || []).length > 0 ? (
              <View style={{ paddingVertical: 8 }}>
                {(displayQuotation.items || []).map((it: any, idx: number) => (
                  <View
                    key={idx}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 6,
                    }}
                  >
                    <ThemedText style={{ flex: 1 }}>
                      {it.description ||
                        (it.service ? `Service #${it.service}` : null) ||
                        'Item'}
                    </ThemedText>
                    <ThemedText>
                      ₱
                      {((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}
                    </ThemedText>
                  </View>
                ))}

                <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 8 }} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <ThemedText style={{ fontWeight: '600' }}>Estimated Total</ThemedText>
                  <ThemedText style={{ fontWeight: '600' }}>
                    ₱
                    {parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}
                  </ThemedText>
                </View>
              </View>
            ) : (
              <View style={{ paddingVertical: 8 }}>
                <ThemedText style={{ marginBottom: 8, color: '#666' }}>
                  No quotation available.
                </ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Active Details (Job Status) */}
        {booking.status === 'active' && booking.active_details && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name="info-circle" size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.sectionTitle}>Job Status</ThemedText>
            </View>

            <View style={styles.detailChips}>
              <View
                style={[
                  styles.chip,
                  booking.active_details.is_job_done ? styles.chipSuccess : styles.chipDefault,
                ]}
              >
                <FontAwesome
                  name={booking.active_details.is_job_done ? 'check' : 'clock-o'}
                  size={12}
                  color={booking.active_details.is_job_done ? '#34C759' : '#8E8E93'}
                />
                <ThemedText
                  style={[styles.chipText, booking.active_details.is_job_done ? { color: '#34C759' } : null]}
                >
                  {booking.active_details.is_job_done ? 'Job Done' : 'In Progress'}
                </ThemedText>
              </View>

              {booking.active_details.is_rescheduled && (
                <View style={[styles.chip, styles.chipWarning]}>
                  <FontAwesome name="calendar" size={12} color="#FFD60A" />
                  <ThemedText style={[styles.chipText, { color: '#FFD60A' }]}>
                    Rescheduled
                  </ThemedText>
                </View>
              )}
            </View>

            {booking.active_details.reason && (
              <View style={styles.noteBox}>
                <ThemedText style={styles.noteLabel}>Note:</ThemedText>
                <ThemedText style={styles.noteText}>{booking.active_details.reason}</ThemedText>
              </View>
            )}

            {booking.active_details.started_at && (
              <View style={styles.elapsedRow}>
                <ThemedText style={styles.elapsedLabel}>Elapsed</ThemedText>
                <ThemedText style={styles.elapsedValue}>{formatDuration(timer)}</ThemedText>
              </View>
            )}
          </View>
        )}

        {/* Completion Details */}
        {booking.status === 'completed' &&
          booking.completion_details && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#34C75915' }]}>
                  <FontAwesome name="check-circle" size={16} color="#34C759" />
                </View>
                <ThemedText style={styles.sectionTitle}>Completion Details</ThemedText>
              </View>

              <View style={styles.completionInfo}>
                <View style={styles.receiptList}>
                  {displayQuotation && (displayQuotation.items || []).length > 0 ? (
                    <>
                      {(displayQuotation.items || []).map((it: any, idx: number) => (
                        <View key={idx} style={styles.receiptRow}>
                          <ThemedText style={styles.receiptItem}>
                            {it.description ||
                              (it.service ? `Service #${it.service}` : null) ||
                              'Item'}
                          </ThemedText>
                          <ThemedText style={styles.receiptAmount}>
                            ₱
                            {((it.unit_price || 0) * (it.quantity || 1)).toFixed(2)}
                          </ThemedText>
                        </View>
                      ))}

                      <View style={styles.receiptDivider} />

                      <View style={styles.receiptRow}>
                        <ThemedText style={styles.receiptTotalLabel}>Final Total</ThemedText>
                        <ThemedText style={styles.receiptTotalValue}>
                          ₱
                          {parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}
                        </ThemedText>
                      </View>

                      <View style={styles.receiptRow}>
                        <ThemedText style={styles.receiptYouLabel}>You receive</ThemedText>
                        <ThemedText style={styles.receiptYouValue}>
                          ₱
                          {parseFloat(String(displayQuotation.total_amount || 0)).toFixed(2)}
                        </ThemedText>
                      </View>
                    </>
                  ) : (
                    <View style={styles.completionRow}>
                      <ThemedText style={styles.completionLabel}>Total Amount</ThemedText>
                      <ThemedText style={styles.completionAmount}>
                        ₱{(booking.completion_details.total_amount ?? 0).toFixed(2)}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {booking.completion_details.notes && (
                  <View style={styles.noteBox}>
                    <ThemedText style={styles.noteLabel}>Notes:</ThemedText>
                    <ThemedText style={styles.noteText}>{booking.completion_details.notes}</ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

        {/* Cancellation Details */}
        {booking.status === 'cancelled' &&
          booking.cancellation_details && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#FF3B3015' }]}>
                  <FontAwesome name="times-circle" size={16} color="#FF3B30" />
                </View>
                <ThemedText style={styles.sectionTitle}>Cancellation Details</ThemedText>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Cancelled By</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {booking.cancellation_details.cancelled_by.name}
                  </ThemedText>
                </View>

                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Date</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {formatDate(booking.cancellation_details.cancelled_at)}
                  </ThemedText>
                </View>

                {booking.cancellation_details.reason && (
                  <View style={styles.noteBox}>
                    <ThemedText style={styles.noteLabel}>Reason:</ThemedText>
                    <ThemedText style={styles.noteText}>{booking.cancellation_details.reason}</ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

        {/* Rework Details */}
        {booking.status === 'reworked' &&
          (booking as any).rework_details && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: '#FFD60A15' }]}>
                  <FontAwesome name="refresh" size={16} color="#FFD60A" />
                </View>
                <ThemedText style={styles.sectionTitle}>Rework Details</ThemedText>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <ThemedText style={styles.infoLabel}>Requested By</ThemedText>
                  <ThemedText style={styles.infoValue}>
                    {(booking as any).rework_details.requested_by.name}
                  </ThemedText>
                </View>

                {(booking as any).rework_details.reason && (
                  <View style={styles.noteBox}>
                    <ThemedText style={styles.noteLabel}>Reason:</ThemedText>
                    <ThemedText style={styles.noteText}>
                      {(booking as any).rework_details.reason}
                    </ThemedText>
                  </View>
                )}
              </View>
            </View>
          )}

        <View style={{ height: 28 }} />
      </ScrollView>
    </ThemedView>
  );
}

