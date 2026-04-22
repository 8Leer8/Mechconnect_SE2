import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { styles } from '@/style/mechanic/bookingsStyles';
import { SkeletonBookingList } from '@/components/skeletons/SkeletonLoaders';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { fetchProfileDetailsCached } from '@/lib/profileCache';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Booking {
  id: number;
  status: string;
  dispute_status?: 'none' | 'active' | 'resolved' | string;
  amount_fee: number;
  booked_at: string;
  request: {
    id: number;
    type: string;
    created_at: string;
  };
  service_location?: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  active_details?: {
    is_job_done: boolean;
  };
  dispute_details?: {
    dispute_status?: string;
  };
}

type TabType = 'all' | 'pending' | 'booked' | 'on_going' | 'completed' | 'cancelled' | 'reworked' | 'disputed';

const JOB_TAB_LABELS: Record<TabType, string> = {
  all: 'All',
  pending: 'Pending',
  booked: 'Booked',
  on_going: 'On Going',
  completed: 'Completed',
  cancelled: 'Cancelled',
  reworked: 'Reworked',
  disputed: 'Disputed',
};

type MechanicPaginatedResponse = {
  bookings: Booking[];
  count: number;
  total_count: number;
  page: number;
  total_pages: number;
  tab_counts?: {
    pending: number;
    accepted: number;
    on_the_way: number;
    active: number;
    completed: number;
    cancelled: number;
    reworked: number;
    disputed: number;
  };
};

type MechanicCountsResponse = {
  pending?: { count: number };
  accepted?: { count: number };
  on_the_way?: { count: number };
  active?: { count: number };
  completed?: { count: number };
  cancelled?: { count: number };
  reworked?: { count: number };
  disputed?: { count: number };
  total_count: number;
};

export default function MechanicShopJobsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>((tab as TabType) || 'all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [mechanicLocked, setMechanicLocked] = useState(false);
  const [receiptUploadingBookingId, setReceiptUploadingBookingId] = useState<number | null>(null);
  const [isShopMechanic, setIsShopMechanic] = useState(false);
  const { lastMessage } = useWebSocketContext();
  const pageSize = 5;

  useEffect(() => {
    if (!tab) return;
    const normalized =
      isShopMechanic && tab === 'pending' ? 'booked' : (tab as TabType);
    if (normalized !== activeTab) {
      setActiveTab(normalized);
      setCurrentPage(1);
    }
  }, [tab, activeTab, isShopMechanic]);

  useEffect(() => {
    if (isShopMechanic && activeTab === 'pending') {
      setActiveTab('booked');
      setCurrentPage(1);
    }
  }, [isShopMechanic, activeTab]);

  const fetchCounts = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) return;

      const data = (await response.json()) as MechanicCountsResponse;
      setCounts({
        all: data.total_count || 0,
        pending: data.pending?.count || 0,
        booked: data.accepted?.count || 0,
        on_going: (data.on_the_way?.count || 0) + (data.active?.count || 0),
        completed: data.completed?.count || 0,
        cancelled: data.cancelled?.count || 0,
        reworked: data.reworked?.count || 0,
        disputed: data.disputed?.count || 0,
      });
    } catch {
      // Non-blocking counts fetch.
    }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (activeTab !== 'all') {
        fetchCounts();
      }

      let statusQuery = 'all';
      if (activeTab === 'booked') statusQuery = 'accepted';
      else if (activeTab === 'on_going') statusQuery = 'on_going';
      else if (activeTab !== 'all') statusQuery = activeTab;

      const response = await fetch(
        `${API_URL}/bookings/mechanic/bookings/?status=${statusQuery}&page=${currentPage}&page_size=${pageSize}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch ${activeTab} jobs`);
      }

      const data = (await response.json()) as MechanicPaginatedResponse;
      setBookings(data.bookings || []);
      setTotalCount(data.total_count || 0);
      setTotalPages(data.total_pages || 1);

      if (data.tab_counts) {
        const tc = data.tab_counts;
        setCounts({
          all: data.total_count || 0,
          pending: tc.pending || 0,
          booked: tc.accepted || 0,
          on_going: (tc.on_the_way || 0) + (tc.active || 0),
          completed: tc.completed || 0,
          cancelled: tc.cancelled || 0,
          reworked: tc.reworked || 0,
          disputed: tc.disputed || 0,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, currentPage, fetchCounts]);

  const fetchMechanicLockState = useCallback(async () => {
    try {
      const profile = await fetchProfileDetailsCached(false);
      if (!profile) return;
      const m = profile?.current_role_profile?.mechanic;
      setMechanicLocked(Boolean(m?.is_locked));
      setIsShopMechanic(Boolean(m?.is_working_for_shop));
    } catch {
      // non-blocking state fetch
    }
  }, []);

  const fetchData = useCallback(() => {
    fetchJobs();
    fetchCounts();
    fetchMechanicLockState();
  }, [fetchJobs, fetchCounts, fetchMechanicLockState]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    if (lastMessage?.type === 'booking_update') {
      fetchData();
    }
  }, [lastMessage, fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchJobs();
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleViewDetails = (bookingId: number) => {
    router.push({
      pathname: '/mechanic/booking/booking_details',
      params: {
        bookingId: bookingId.toString(),
        source: 'mechanic_shop',
      },
    });
  };

  const handleAcceptPending = async (requestId: number) => {
    if (mechanicLocked) {
      setError('You must resolve your active dispute to continue working.');
      return;
    }
    try {
      setActionLoadingId(requestId);
      const response = await fetch(
        `${API_URL}/bookings/mechanic/requests/${requestId}/accept/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to accept request');
      }

      await fetchJobs();
    } catch (err: any) {
      setError(err.message || 'Failed to accept request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclinePending = async (requestId: number) => {
    try {
      setActionLoadingId(requestId);
      const response = await fetch(
        `${API_URL}/bookings/mechanic/requests/${requestId}/decline/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to decline request');
      }

      await fetchJobs();
    } catch (err: any) {
      setError(err.message || 'Failed to decline request');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUploadRefundReceipt = async (bookingId: number) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        setError('Gallery permission is required to upload refund receipt.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const photoUri = result.assets[0].uri;
      const fileName = photoUri.split('/').pop() || `refund-${bookingId}.jpg`;
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';

      const formData = new FormData();
      formData.append('refund_receipt_image', {
        uri: photoUri,
        name: fileName,
        type: mime,
      } as any);

      setReceiptUploadingBookingId(bookingId);
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/disputes/upload-receipt/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as any)?.error || 'Failed to upload refund receipt');
      }

      await fetchData();
    } catch (err: any) {
      setError(err?.message || 'Failed to upload refund receipt');
    } finally {
      setReceiptUploadingBookingId(null);
    }
  };

  const getTabIcon = (tabKey: TabType) => {
    switch (tabKey) {
      case 'all': return 'th-list';
      case 'pending': return 'clock-o';
      case 'booked': return 'calendar-check-o';
      case 'on_going': return 'play-circle';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'reworked': return 'refresh';
      case 'disputed': return 'exclamation-circle';
      default: return 'circle';
    }
  };

  const getStatusLabel = (status: string) => {
    if (isShopMechanic && status === 'pending') {
      return 'Booked';
    }
    switch (status) {
      case 'accepted': return 'Booked';
      case 'active': return 'On Going';
      case 'on_the_way': return 'On the Way';
      case 'at_location': return 'At Location';
      case 'diagnosing': return 'Diagnosing';
      case 'paused': return 'Paused';
      case 'finished': return 'Finished';
      case 'pending_payment': return 'Pending Payment';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'pending': return 'Pending';
      case 'reworked': return 'Reworked';
      case 'disputed': return 'Disputed';
      default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return 'calendar-check-o';
      case 'active': return 'play-circle';
      case 'on_the_way': return 'car';
      case 'at_location': return 'map-marker';
      case 'diagnosing': return 'search';
      case 'paused': return 'pause-circle';
      case 'finished': return 'check-circle';
      case 'pending_payment': return 'money';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'times-circle';
      case 'pending': return 'clock-o';
      case 'reworked': return 'refresh';
      case 'disputed': return 'exclamation-circle';
      default: return 'circle';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return '#00B8D9';
      case 'active': return '#FF8C00';
      case 'on_the_way': return '#007AFF';
      case 'at_location': return '#5AC8FA';
      case 'diagnosing': return '#AF52DE';
      case 'paused': return '#8E8E93';
      case 'finished': return '#34C759';
      case 'pending_payment': return '#FFD60A';
      case 'completed': return '#34C759';
      case 'cancelled': return '#FF3B30';
      case 'pending': return '#8E8E93';
      case 'reworked': return '#FFD60A';
      case 'disputed': return '#AF52DE';
      default: return '#8E8E93';
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const getTimeSince = (dateString: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const tabs: TabType[] = isShopMechanic
    ? ['all', 'booked', 'on_going', 'completed', 'cancelled', 'reworked', 'disputed']
    : ['all', 'pending', 'booked', 'on_going', 'completed', 'cancelled', 'reworked', 'disputed'];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Jobs</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {totalCount > 0 ? totalCount : bookings.length}{' '}
            {activeTab === 'all' ? 'total' : JOB_TAB_LABELS[activeTab]?.toLowerCase() || activeTab} job
            {(totalCount > 0 ? totalCount : bookings.length) !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScrollContent}
        style={styles.tabContainer}
      >
        {tabs.map((tabKey) => {
          const isActive = activeTab === tabKey;
          const count = counts[tabKey] || 0;
          return (
            <TouchableOpacity
              key={tabKey}
              style={[styles.tab, isActive && styles.activeTab]}
              onPress={() => {
                setActiveTab(tabKey);
                setCurrentPage(1);
              }}
              activeOpacity={0.7}
            >
              <FontAwesome
                name={getTabIcon(tabKey)}
                size={14}
                color={isActive ? '#fff' : '#8E8E93'}
                style={{ marginRight: 6 }}
              />
              <ThemedText style={[styles.tabText, isActive && styles.activeTabText]}>
                {JOB_TAB_LABELS[tabKey]}
              </ThemedText>
              {count > 0 && activeTab === 'all' && (
                <View style={[styles.tabCount, isActive && styles.activeTabCount]}>
                  <ThemedText style={[styles.tabCountText, isActive && styles.activeTabCountText]}>
                    {count}
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {mechanicLocked ? (
          <View style={styles.lockBanner}>
            <FontAwesome name="lock" size={14} color="#FF3B30" />
            <ThemedText style={styles.lockBannerText}>
              You must resolve your active dispute to continue working.
            </ThemedText>
          </View>
        ) : null}

        {loading && !refreshing ? (
          <SkeletonBookingList />
        ) : error ? (
          <View style={styles.errorContainer}>
            <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <TouchableOpacity style={styles.retryButton} onPress={fetchJobs}>
              <ThemedText style={styles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <FontAwesome name={getTabIcon(activeTab)} size={40} color="#555" />
            </View>
            <ThemedText style={styles.emptyText}>
              No {activeTab === 'all' ? '' : `${JOB_TAB_LABELS[activeTab].toLowerCase()} `}jobs
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {activeTab === 'on_going'
                ? 'Active jobs will appear here'
                : activeTab === 'pending'
                ? 'Client requests will appear here'
                : activeTab === 'booked' && isShopMechanic
                ? 'Jobs the shop has accepted and assigned to you appear here until you start travel.'
                : `No ${JOB_TAB_LABELS[activeTab]} jobs yet`}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.bookingsList}>
            {bookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                activeOpacity={0.7}
                onPress={() => {
                  if (
                    booking.status === 'active' ||
                    booking.status === 'on_the_way' ||
                    booking.status === 'at_location' ||
                    booking.status === 'diagnosing' ||
                    booking.status === 'paused' ||
                    booking.status === 'completed' ||
                    booking.status === 'reworked' ||
                    booking.status === 'pending_payment' ||
                    booking.status === 'accepted'
                  ) {
                    handleViewDetails(booking.id);
                  }
                }}
              >
                {activeTab === 'completed' && String(booking.dispute_status || 'none').toLowerCase() === 'active' ? (
                  <View style={styles.disputeBanner}>
                    <FontAwesome name="warning" size={13} color="#FF3B30" />
                    <ThemedText style={styles.disputeBannerText}>
                      Active Dispute: Account functions limited until resolved.
                    </ThemedText>
                  </View>
                ) : null}

                <View style={styles.cardTopRow}>
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.statusIconCircle, { backgroundColor: `${getStatusColor(booking.status)}20` }]}>
                      <FontAwesome name={getStatusIcon(booking.status)} size={16} color={getStatusColor(booking.status)} />
                    </View>
                    <View>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                          <ThemedText style={styles.statusText}>{getStatusLabel(booking.status)}</ThemedText>
                        </View>
                        <ThemedText style={styles.bookingId}>#{booking.id}</ThemedText>
                      </View>
                      <ThemedText style={styles.requestType}>
                        {booking.request.type
                          ? `${booking.request.type.charAt(0).toUpperCase() + booking.request.type.slice(1)} Service`
                          : 'Service Request'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.timeAgo}>{getTimeSince(booking.booked_at)}</ThemedText>
                </View>

                <View style={styles.cardInfoSection}>
                  <View style={styles.infoRow}>
                    <FontAwesome name="map-marker" size={14} color="#8E8E93" />
                    <ThemedText style={styles.infoText} numberOfLines={1}>
                      {booking.service_location
                        ? `${booking.service_location.street_name}, ${booking.service_location.barangay}`
                        : 'No location specified'}
                    </ThemedText>
                  </View>
                  <View style={styles.infoRow}>
                    <FontAwesome name="calendar-o" size={13} color="#8E8E93" />
                    <ThemedText style={styles.infoText}>{formatDate(booking.booked_at)}</ThemedText>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <ThemedText style={styles.amount}>P{parseFloat(String(booking.amount_fee || '0')).toFixed(2)}</ThemedText>

                  {booking.status === 'pending' ? (
                    <View style={styles.pendingActions}>
                      <TouchableOpacity
                        style={styles.declineBtn}
                        onPress={() => handleDeclinePending(booking.request.id)}
                        disabled={actionLoadingId === booking.request.id || mechanicLocked}
                      >
                        <ThemedText style={styles.declineBtnText}>Decline</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.acceptBtn, mechanicLocked ? styles.acceptBtnDisabled : null]}
                        onPress={() => handleAcceptPending(booking.request.id)}
                        disabled={actionLoadingId === booking.request.id || mechanicLocked}
                      >
                        {actionLoadingId === booking.request.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <FontAwesome name="check" size={11} color="#fff" />
                            <ThemedText style={styles.acceptBtnText}>Accept</ThemedText>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    booking.status === 'accepted' ||
                    booking.status === 'on_the_way' ||
                    booking.status === 'at_location' ||
                    booking.status === 'diagnosing' ||
                    booking.status === 'active' ||
                    booking.status === 'paused' ||
                    booking.status === 'completed' ||
                    booking.status === 'reworked' ||
                    booking.status === 'pending_payment'
                  ) ? (
                    <TouchableOpacity style={styles.detailsBtn} onPress={() => handleViewDetails(booking.id)}>
                      <ThemedText style={styles.detailsBtnText}>Details</ThemedText>
                      <FontAwesome name="chevron-right" size={11} color="#FF8C00" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {booking.status === 'active' && booking.active_details?.is_job_done && (
                  <View style={styles.jobDoneBanner}>
                    <FontAwesome name="check-circle" size={14} color="#34C759" />
                    <ThemedText style={styles.jobDoneText}>Job marked as done</ThemedText>
                  </View>
                )}

                {String(booking.dispute_details?.dispute_status || '').toLowerCase() === 'waiting_for_mechanic_payment' ? (
                  <View style={styles.jobDoneBanner}>
                    <FontAwesome name="money" size={14} color="#FFD60A" />
                    <ThemedText style={[styles.jobDoneText, { color: '#FFD60A' }]}>Refund receipt required by admin</ThemedText>
                    <TouchableOpacity
                      style={styles.uploadReceiptBtn}
                      onPress={() => handleUploadRefundReceipt(booking.id)}
                      disabled={receiptUploadingBookingId === booking.id}
                    >
                      {receiptUploadingBookingId === booking.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <FontAwesome name="upload" size={11} color="#fff" />
                          <ThemedText style={styles.uploadReceiptBtnText}>Upload Receipt</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        )}

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
              <ThemedText style={styles.paginationText}>Page {currentPage} of {totalPages}</ThemedText>
              <ThemedText style={styles.paginationSubtext}>{totalCount} total jobs</ThemedText>
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
      </ScrollView>
    </ThemedView>
  );
}
