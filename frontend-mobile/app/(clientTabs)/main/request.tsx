import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from '@/style/client/requestStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface CustomRequest {
  id: number;
  provider: { id: number; name: string } | null;
  shop: { id: number; shop_name: string; contact_number: string; email: string } | null;
  description: string;
  status: string;
  quoted_price: number | null;
  providers_note: string | null;
  concern_picture: string | null;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  has_booking: boolean;
}

interface DirectRequest {
  id: number;
  provider: { id: number; name: string } | null;
  shop: { id: number; shop_name: string; contact_number: string; email: string } | null;
  service: {
    id: number;
    name: string;
    price: number;
  };
  add_ons: {
    id: number;
    name: string;
    price: number;
  }[];
  status: string;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  has_booking: boolean;
}

interface BroadcastRequest {
  id: number;
  provider: { id: number; name: string } | null;
  shop: { id: number; shop_name: string; contact_number: string; email: string } | null;
  description: string;
  providers_note: string | null;
  concern_picture: string | null;
  services: {
    id: number;
    name: string;
  }[];
  status: string;
  service_location: {
    street_name: string;
    barangay: string;
    city_municipality: string;
  } | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  has_booking: boolean;
}

interface RequestsResponse {
  custom_requests: CustomRequest[];
  direct_requests: DirectRequest[];
  broadcast_requests: BroadcastRequest[];
  total_count: number;
  total_pages: number;
  current_page: number;
  page_size: number;
  filter: string;
}

interface ErrorResponse {
  error: string;
}

// Isolated countdown component — has its own 1s interval so only this re-renders, not the whole screen
function CountdownBanner({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(expiresAt).getTime() - now;
  const expired = diff <= 0;
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  const text = expired ? 'Expired' : `Time remaining: ${minutes}m ${seconds}s`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: expired ? '#FF3B3015' : '#FF8C0015',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      <FontAwesome name="clock-o" size={14} color={expired ? '#FF3B30' : '#FF8C00'} />
      <ThemedText style={{ fontSize: 13, fontWeight: '600', color: expired ? '#FF3B30' : '#FF8C00' }}>
        {text}
      </ThemedText>
    </View>
  );
}

export default function RequestScreen() {
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [directRequests, setDirectRequests] = useState<DirectRequest[]>([]);
  const [broadcastRequests, setBroadcastRequests] = useState<BroadcastRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<BroadcastRequest | null>(null);
  
  // Pagination and filter states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'custom' | 'direct' | 'broadcast'>('all');
  const pageSize = 5;

  const fetchRequests = async (silent = false, page = currentPage, filterType = filter) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_URL}/bookings/requests/?page=${page}&page_size=${pageSize}&filter=${filterType}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch requests');
      const data = await response.json() as RequestsResponse;

      setCustomRequests(data.custom_requests || []);
      setDirectRequests(data.direct_requests || []);
      setBroadcastRequests(data.broadcast_requests || []);
      setTotalCount(data.total_count || 0);
      setTotalPages(data.total_pages || 1);
      setCurrentPage(data.current_page || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
        }

        const response = await fetch(
          `${API_URL}/bookings/requests/?page=${currentPage}&page_size=${pageSize}&filter=${filter}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (cancelled) return;
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json() as RequestsResponse;

        if (!cancelled) {
          setCustomRequests(data.custom_requests || []);
          setDirectRequests(data.direct_requests || []);
          setBroadcastRequests(data.broadcast_requests || []);
          setTotalCount(data.total_count || 0);
          setTotalPages(data.total_pages || 1);
          setCurrentPage(data.current_page || 1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'An error occurred');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();
    return () => { cancelled = true; };
  }, [currentPage, filter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleFilterChange = (newFilter: 'all' | 'custom' | 'direct' | 'broadcast') => {
    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleCancelRequest = async (requestId: number) => {
    try {
      const response = await fetch(`${API_URL}/bookings/requests/${requestId}/cancel/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json() as ErrorResponse;
        throw new Error(data.error || 'Failed to cancel request');
      }

      await fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request');
    }
  };

  const handleOpenDeleteModal = (request: BroadcastRequest) => {
    setRequestToDelete(request);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = async () => {
    if (!requestToDelete) return;
    setDeleteModalVisible(false);
    await handleCancelRequest(requestToDelete.id);
    setRequestToDelete(null);
  };

  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
    setRequestToDelete(null);
  };

  const handleResendBroadcast = async (requestId: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/bookings/requests/${requestId}/broadcast/resend/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json() as any;
      if (!response.ok) throw new Error(data.error || 'Failed to resend broadcast request');

      await fetchRequests();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend broadcast request');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = () => {
    router.push('/client/request/main_request_form/main_form' as any);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return '#FF8C00';
      case 'accepted': case 'quoted': return '#34C759';
      case 'rejected': case 'cancelled': return '#FF3B30';
      case 'searching': return '#007AFF';
      case 'expired': return '#FF3B30';
      default: return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'pending': return 'clock-o';
      case 'accepted': case 'quoted': return 'check-circle';
      case 'rejected': case 'cancelled': return 'times-circle';
      case 'searching': return 'search';
      case 'expired': return 'hourglass-end';
      default: return 'circle';
    }
  };

  const renderRequestCard = (
    id: number,
    status: string,
    title: string,
    subtitle: string,
    details: { icon: string; text: string }[],
    hasBooking: boolean,
    onCancel?: () => void,
    extra?: React.ReactNode,
    onPress?: () => void,
  ) => {
    const card = (
      <View key={id} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.cardIconCircle, { backgroundColor: getStatusColor(status) + '20' }]}>
            <FontAwesome name={getStatusIcon(status) as any} size={18} color={getStatusColor(status)} />
          </View>
          <View style={styles.cardInfo}>
            <ThemedText style={styles.cardTitle}>{title}</ThemedText>
            <ThemedText style={styles.cardSubtitle} numberOfLines={2}>{subtitle}</ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
            <ThemedText style={styles.statusBadgeText}>{status.toUpperCase()}</ThemedText>
          </View>
        </View>

      {details.length > 0 && (
        <View style={styles.cardDetails}>
          {details.map((d, i) => (
            <View key={i} style={styles.detailRow}>
              <FontAwesome name={d.icon as any} size={12} color="#8E8E93" style={{ width: 18 }} />
              <ThemedText style={styles.detailText} numberOfLines={1}>{d.text}</ThemedText>
            </View>
          ))}
        </View>
      )}

      {extra}

      {hasBooking && (
        <View style={styles.bookedBanner}>
          <FontAwesome name="check-circle" size={14} color="#34C759" />
          <ThemedText style={styles.bookedText}>Booked</ThemedText>
        </View>
      )}

      {!hasBooking && status !== 'cancelled' && status !== 'expired' && onCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <FontAwesome name="times" size={12} color="#FF3B30" />
          <ThemedText style={styles.cancelBtnText}>Cancel Request</ThemedText>
        </TouchableOpacity>
      )}
    </View>
    );

    if (onPress) {
      return (
        <TouchableOpacity key={id} onPress={onPress} activeOpacity={0.7}>
          {card}
        </TouchableOpacity>
      );
    }

    return card;
  };

  const renderCustomRequests = () => {
    if (customRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <FontAwesome name="inbox" size={36} color="#555" />
          <ThemedText style={styles.emptyText}>No custom requests yet</ThemedText>
        </View>
      );
    }

    return customRequests.map((r) => {
      const details: { icon: string; text: string }[] = [];
      if (r.shop) {
        details.push({ icon: 'building', text: r.shop.shop_name });
      } else if (r.provider) {
        details.push({ icon: 'wrench', text: r.provider.name });
      }
      if (r.quoted_price) details.push({ icon: 'tag', text: `₱${parseFloat(String(r.quoted_price || '0')).toFixed(2)}` });
      if (r.service_location) details.push({ icon: 'map-marker', text: `${r.service_location.street_name}, ${r.service_location.barangay}, ${r.service_location.city_municipality}` });
      details.push({ icon: 'calendar', text: new Date(r.created_at).toLocaleDateString() });

      return renderRequestCard(
        r.id, r.status, `Request #${r.id}`, r.description, details, r.has_booking,
        !r.has_booking && r.status !== 'cancelled' ? () => handleCancelRequest(r.id) : undefined,
      );
    });
  };

  const renderDirectRequests = () => {
    if (directRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <FontAwesome name="inbox" size={36} color="#555" />
          <ThemedText style={styles.emptyText}>No direct requests yet</ThemedText>
        </View>
      );
    }

    return directRequests.map((r) => {
      const addOnsTotal = r.add_ons.reduce((sum, a) => sum + a.price, 0);
      const totalPrice = r.service.price + addOnsTotal;

      const details: { icon: string; text: string }[] = [
        { icon: 'cog', text: r.service.name },
        { icon: 'tag', text: `₱${totalPrice.toFixed(2)}` },
      ];
      if (r.add_ons.length > 0) details.push({ icon: 'plus-circle', text: r.add_ons.map(a => a.name).join(', ') });
      if (r.shop) {
        details.push({ icon: 'building', text: r.shop.shop_name });
      } else if (r.provider) {
        details.push({ icon: 'wrench', text: r.provider.name });
      }
      if (r.service_location) details.push({ icon: 'map-marker', text: `${r.service_location.street_name}, ${r.service_location.barangay}, ${r.service_location.city_municipality}` });
      details.push({ icon: 'calendar', text: new Date(r.created_at).toLocaleDateString() });

      return renderRequestCard(
        r.id, r.status, `Request #${r.id}`, r.service.name, details, r.has_booking,
        !r.has_booking && r.status !== 'cancelled' ? () => handleCancelRequest(r.id) : undefined,
      );
    });
  };

  const renderBroadcastRequests = () => {
    if (broadcastRequests.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <FontAwesome name="inbox" size={36} color="#555" />
          <ThemedText style={styles.emptyText}>No broadcast requests yet</ThemedText>
        </View>
      );
    }

    return broadcastRequests.map((r) => {
      const isExpired = r.status === 'expired';

      const details: { icon: string; text: string }[] = [];
      if (r.services?.length > 0) details.push({ icon: 'list', text: r.services.map(s => s.name).join(', ') });
      if (r.shop) {
        details.push({ icon: 'building', text: r.shop.shop_name });
      } else if (r.provider) {
        details.push({ icon: 'wrench', text: r.provider.name });
      }
      if (r.service_location) details.push({ icon: 'map-marker', text: `${r.service_location.street_name}, ${r.service_location.barangay}, ${r.service_location.city_municipality}` });
      details.push({ icon: 'calendar', text: new Date(r.created_at).toLocaleDateString() });

      const extra = (
        <>
          {/* Timer */}
          {!r.has_booking && r.status === 'searching' && (
            <CountdownBanner expiresAt={r.expires_at} />
          )}

          {/* Expired actions */}
          {isExpired && !r.has_booking && (
            <View style={styles.expiredSection}>
              <ThemedText style={styles.expiredMsg}>No mechanics responded in time.</ThemedText>
              <View style={styles.expiredActions}>
                <TouchableOpacity style={styles.resendBtn} onPress={() => handleResendBroadcast(r.id)} activeOpacity={0.7}>
                  <FontAwesome name="repeat" size={12} color="#fff" />
                  <ThemedText style={styles.resendBtnText}>Send Again</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeBtn} onPress={() => handleOpenDeleteModal(r)} activeOpacity={0.7}>
                  <FontAwesome name="trash" size={12} color="#FF3B30" />
                  <ThemedText style={styles.removeBtnText}>Remove</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      );

      return renderRequestCard(
        r.id, isExpired ? 'expired' : r.status, `Broadcast #${r.id}`, r.description, details, r.has_booking,
        undefined, extra,
        () => {
          router.push({
            pathname: '/client/request/broadcast/broadcastdetail',
            params: {
              id: r.id.toString(),
              description: r.description,
              status: isExpired ? 'expired' : r.status,
              services: JSON.stringify(r.services || []),
              provider: r.provider ? JSON.stringify(r.provider) : '',
              providersNote: r.providers_note || '',
              concernPicture: r.concern_picture || '',
              serviceLocation: r.service_location ? JSON.stringify(r.service_location) : '',
              createdAt: r.created_at,
              expiresAt: r.expires_at,
              acceptedAt: r.accepted_at || '',
              hasBooking: r.has_booking.toString(),
            },
          });
        },
      );
    });
  };

  const totalRequests = totalCount;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Requests</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {totalRequests} total request{totalRequests !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
          <TouchableOpacity
            style={[styles.filterBtn, filter === 'all' && styles.filterBtnActive]}
            onPress={() => handleFilterChange('all')}
            activeOpacity={0.7}
          >
            <FontAwesome name="th-list" size={14} color={filter === 'all' ? '#fff' : '#8E8E93'} />
            <ThemedText style={[styles.filterBtnText, filter === 'all' && styles.filterBtnTextActive]}>
              All
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, filter === 'broadcast' && styles.filterBtnActive]}
            onPress={() => handleFilterChange('broadcast')}
            activeOpacity={0.7}
          >
            <FontAwesome name="bullhorn" size={14} color={filter === 'broadcast' ? '#fff' : '#FF8C00'} />
            <ThemedText style={[styles.filterBtnText, filter === 'broadcast' && styles.filterBtnTextActive]}>
              Broadcast
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, filter === 'custom' && styles.filterBtnActive]}
            onPress={() => handleFilterChange('custom')}
            activeOpacity={0.7}
          >
            <FontAwesome name="pencil-square-o" size={14} color={filter === 'custom' ? '#fff' : '#34C759'} />
            <ThemedText style={[styles.filterBtnText, filter === 'custom' && styles.filterBtnTextActive]}>
              Custom
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, filter === 'direct' && styles.filterBtnActive]}
            onPress={() => handleFilterChange('direct')}
            activeOpacity={0.7}
          >
            <FontAwesome name="bolt" size={14} color={filter === 'direct' ? '#fff' : '#007AFF'} />
            <ThemedText style={[styles.filterBtnText, filter === 'direct' && styles.filterBtnTextActive]}>
              Direct
            </ThemedText>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.createContainer}>
        <TouchableOpacity style={styles.createBtn} onPress={handleCreateRequest} activeOpacity={0.7}>
          <FontAwesome name="plus" size={14} color="#fff" />
          <ThemedText style={styles.createBtnText}>Add Request</ThemedText>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={36} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchRequests()}>
            <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
          }
        >
          {/* Display all request types */}
          {totalRequests === 0 ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="inbox" size={36} color="#555" />
              <ThemedText style={styles.emptyText}>No requests yet</ThemedText>
              <ThemedText style={{ fontSize: 13, color: '#8E8E93', marginTop: 8, textAlign: 'center' }}>
                Tap "Add Request" to create your first request
              </ThemedText>
            </View>
          ) : (
            <>
              {/* Broadcast Requests Section */}
              {broadcastRequests.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
                    <FontAwesome name="bullhorn" size={14} color="#FF8C00" style={{ marginRight: 8 }} />
                    <ThemedText style={{ fontSize: 15, fontWeight: '700', color: '#FF8C00' }}>
                      Broadcast Requests ({broadcastRequests.length})
                    </ThemedText>
                  </View>
                  {renderBroadcastRequests()}
                </View>
              )}

              {/* Custom Requests Section */}
              {customRequests.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
                    <FontAwesome name="pencil-square-o" size={14} color="#34C759" style={{ marginRight: 8 }} />
                    <ThemedText style={{ fontSize: 15, fontWeight: '700', color: '#34C759' }}>
                      Custom Requests ({customRequests.length})
                    </ThemedText>
                  </View>
                  {renderCustomRequests()}
                </View>
              )}

              {/* Direct Requests Section */}
              {directRequests.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 }}>
                    <FontAwesome name="bolt" size={14} color="#007AFF" style={{ marginRight: 8 }} />
                    <ThemedText style={{ fontSize: 15, fontWeight: '700', color: '#007AFF' }}>
                      Direct Requests ({directRequests.length})
                    </ThemedText>
                  </View>
                  {renderDirectRequests()}
                </View>
              )}
            </>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
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
                  {totalCount} total
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

          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={handleCancelDelete}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <FontAwesome name="trash" size={24} color="#FF3B30" />
            </View>
            <ThemedText style={styles.modalTitle}>Delete Request?</ThemedText>

            <View style={styles.modalDescBox}>
              <ThemedText style={styles.modalDescLabel}>Request Description</ThemedText>
              <ThemedText style={styles.modalDescText}>
                {requestToDelete?.description || 'No description'}
              </ThemedText>
            </View>

            <ThemedText style={styles.modalWarning}>
              This action cannot be undone.
            </ThemedText>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={handleCancelDelete} activeOpacity={0.7}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDeleteBtn} onPress={handleConfirmDelete} activeOpacity={0.7}>
                <FontAwesome name="trash" size={14} color="#fff" />
                <ThemedText style={styles.modalDeleteText}>Delete</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

