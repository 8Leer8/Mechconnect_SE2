import React, { useState, useEffect, useCallback } from 'react';
import {View, ScrollView, TouchableOpacity, RefreshControl} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/bookingStyles';
import { SkeletonBookingList } from '@/components/skeletons/SkeletonLoaders';
import { useWebSocketContext } from '@/context/WebSocketContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

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
  has_backjob?: boolean;
  backjob?: {
    id: number;
    status: string;
    reason?: string | null;
    images?: string[];
  } | null;
}

interface BookingsResponse {
  bookings: Booking[];
  count: number;
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

type TabType = 'active' | 'completed' | 'cancelled' | 'reworked';

export default function BookingScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>((tab as TabType) || 'active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 5;
  const { lastMessage } = useWebSocketContext();

  useEffect(() => {
    if (tab && tab !== activeTab) {
      setActiveTab(tab as TabType);
      setCurrentPage(1); // Reset to first page when tab changes
    }
  }, [tab]);


  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/bookings/bookings/?status=${activeTab}&page=${currentPage}&page_size=${pageSize}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch bookings');
      const data = await response.json() as BookingsResponse;
      setBookings(data.bookings || []);
      setTotalPages(data.total_pages || 1);
      setTotalCount(data.total_count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchData = useCallback(() => {
    fetchBookings();
  }, [activeTab, currentPage]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  // Re-fetch when a WebSocket booking update arrives
  useEffect(() => {
    if (
      lastMessage?.type === 'booking_update' &&
      ['accepted', 'on_the_way', 'active', 'pending_payment', 'completed', 'cancelled', 'reworked', 'disputed'].includes(String(lastMessage?.status || ''))
    ) {
      fetchData();
    }
    // Also react to new chat messages that carry quotation payloads for this booking
    try {
      if (lastMessage?.type === 'booking_update' && lastMessage?.action === 'new_chat_message') {
        const msg = lastMessage?.message as any;
        const bookingIdMsg = Number(lastMessage?.booking_id);
        if (bookingIdMsg && bookings.some(b => b.id === bookingIdMsg)) {
          // message may be an object with nested 'message' or 'message' may be the serialized message
          let contentStr = null;
          if (msg && typeof msg === 'object') contentStr = msg.content || (msg.message && msg.message.content) || null;
          else if (typeof msg === 'string') contentStr = msg;
          if (contentStr) {
            try {
              const parsed = JSON.parse(contentStr);
              if (parsed && parsed.type === 'quotation_request') {
                fetchData();
              }
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
  }, [lastMessage, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchBookings();
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setCurrentPage(1); // Reset to first page when changing tabs
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

  const getTimeSince = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_the_way': return '#007AFF';
      case 'active': return '#FF8C00';
      case 'accepted': return '#00B8D9';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'reworked': return '#FFD60A';
      default: return '#8E8E93';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'accepted': return 'Booked';
      case 'on_the_way': return 'On the Way';
      case 'active': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'reworked': return 'Reworked';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return 'calendar-check-o';
      case 'active': return 'play-circle';
      case 'on_the_way': return 'car';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'reworked': return 'refresh';
      default: return 'circle';
    }
  };

  const getTabIcon = (tab: TabType) => {
    switch (tab) {
      case 'active': return 'play-circle';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'reworked': return 'refresh';
      default: return 'circle';
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Bookings</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {totalCount} total {activeTab} booking{totalCount !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScrollContent}
        style={styles.tabContainer}
      >
        {(['active', 'completed', 'cancelled', 'reworked'] as TabType[]).map((t) => {
          const isActive = activeTab === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => handleTabChange(t)}
              activeOpacity={0.7}
            >
              <FontAwesome name={getTabIcon(t)} size={14} color={isActive ? '#fff' : '#8E8E93'} style={{ marginRight: 6 }} />
              <ThemedText style={[styles.tabText, isActive && styles.activeTabText]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {loading && !refreshing ? (
          <SkeletonBookingList />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchBookings}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <FontAwesome name={getTabIcon(activeTab)} size={40} color="#555" />
            </View>
            <ThemedText style={styles.emptyText}>No {activeTab} bookings</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {activeTab === 'active' ? 'Your active bookings will appear here' : `No ${activeTab} bookings yet`}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.bookingsList}>
            {bookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                activeOpacity={0.7}
                onPress={() => router.push({ pathname: '/client/booking/booking_details', params: { bookingId: booking.id.toString() } })}
              >
                {/* Card Top Row */}
                <View style={styles.cardTopRow}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusIconCircle, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
                      <FontAwesome name={getStatusIcon(booking.status)} size={16} color={getStatusColor(booking.status)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                          <ThemedText style={styles.statusText}>{getStatusLabel(booking.status)}</ThemedText>
                        </View>
                        {booking.has_backjob ? (
                          <View style={styles.backjobBadge}>
                            <ThemedText style={styles.backjobBadgeText}>Backjob</ThemedText>
                          </View>
                        ) : null}
                        <ThemedText style={styles.bookingId}>#{booking.id}</ThemedText>
                      </View>
                      <ThemedText style={styles.requestType}>
                        {booking.request.type
                          ? booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1) + ' Service'
                          : 'Service Request'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.timeAgo}>{getTimeSince(booking.booked_at)}</ThemedText>
                </View>

                {/* Info Rows */}
                <View style={styles.cardInfoSection}>
                  {booking.provider && (
                    <View style={styles.infoRow}>
                      <FontAwesome name="user-o" size={13} color="#8E8E93" />
                      <ThemedText style={styles.infoText}>{booking.provider.name}</ThemedText>
                    </View>
                  )}
                  {booking.service_location && (
                    <View style={styles.infoRow}>
                      <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                      <ThemedText style={styles.infoText} numberOfLines={1}>
                        {booking.service_location.street_name}, {booking.service_location.barangay}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <FontAwesome name="calendar-o" size={13} color="#8E8E93" />
                    <ThemedText style={styles.infoText}>{formatDate(booking.booked_at)}</ThemedText>
                  </View>
                </View>

                {/* Status-specific Banners */}
                {(booking.status === 'active' || booking.status === 'on_the_way') && booking.active_details && (
                  <View style={styles.detailBanner}>
                    {booking.active_details.is_job_done ? (
                      <View style={styles.bannerRow}>
                        <FontAwesome name="check-circle" size={14} color="#34C759" />
                        <ThemedText style={styles.bannerText}>Job marked as done</ThemedText>
                      </View>
                    ) : (
                      <View style={styles.bannerRow}>
                        <FontAwesome name="info-circle" size={14} color="#FF8C00" />
                        <ThemedText style={[styles.bannerText, { color: '#FF8C00' }]}>
                          {booking.status === 'on_the_way' ? 'Mechanic is on the way' : 'Job in progress'}
                        </ThemedText>
                      </View>
                    )}
                  </View>
                )}

                {booking.status === 'cancelled' && booking.cancellation_details && (
                  <View style={styles.detailBanner}>
                    <ThemedText style={styles.bannerText}>
                      Cancelled by: {booking.cancellation_details.cancelled_by.name}
                    </ThemedText>
                  </View>
                )}

                {booking.status === 'reworked' && booking.rework_details && (
                  <View style={styles.detailBanner}>
                    <ThemedText style={styles.bannerText}>
                      Rework by: {booking.rework_details.requested_by.name}
                    </ThemedText>
                  </View>
                )}

                {/* Card Footer */}
                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>₱{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>
                  <TouchableOpacity
                    style={styles.detailsBtn}
                    onPress={() => router.push({ pathname: '/client/booking/booking_details', params: { bookingId: booking.id.toString() } })}
                  >
                    <ThemedText style={styles.detailsBtnText}>Details</ThemedText>
                    <FontAwesome name="chevron-right" size={11} color="#FF8C00" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Pagination Controls */}
        {!loading && !error && totalPages > 1 && (
          <View style={styles.paginationContainer}>
            <TouchableOpacity
              style={[styles.paginationBtn, currentPage === 1 && styles.paginationBtnDisabled]}
              onPress={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              activeOpacity={0.7}
            >
              <FontAwesome name="chevron-left" size={14} color={currentPage === 1 ? '#555' : '#FF8C00'} />
            </TouchableOpacity>

            <View style={styles.paginationInfo}>
              <ThemedText style={styles.paginationText}>
                Page {currentPage} of {totalPages}
              </ThemedText>
              <ThemedText style={styles.paginationSubtext}>
                Showing {bookings.length} of {totalCount} bookings
              </ThemedText>
            </View>

            <TouchableOpacity
              style={[styles.paginationBtn, currentPage === totalPages && styles.paginationBtnDisabled]}
              onPress={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              activeOpacity={0.7}
            >
              <FontAwesome name="chevron-right" size={14} color={currentPage === totalPages ? '#555' : '#FF8C00'} />
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </ThemedView>
  );
}

