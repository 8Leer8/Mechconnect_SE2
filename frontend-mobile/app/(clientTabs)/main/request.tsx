import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface CustomRequest {
  id: number;
  provider: { id: number; name: string } | null;
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
}

interface ErrorResponse {
  error: string;
}

type TabType = 'custom' | 'direct' | 'broadcast';

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
  const [activeTab, setActiveTab] = useState<TabType>('custom');
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [directRequests, setDirectRequests] = useState<DirectRequest[]>([]);
  const [broadcastRequests, setBroadcastRequests] = useState<BroadcastRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<BroadcastRequest | null>(null);

  const fetchRequests = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/bookings/requests/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to fetch requests');
      const data = await response.json() as RequestsResponse;

      setCustomRequests(data.custom_requests || []);
      setDirectRequests(data.direct_requests || []);
      setBroadcastRequests(data.broadcast_requests || []);
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

        const response = await fetch(`${API_URL}/bookings/requests/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (cancelled) return;
        if (!response.ok) throw new Error('Failed to fetch requests');
        const data = await response.json() as RequestsResponse;

        if (!cancelled) {
          setCustomRequests(data.custom_requests || []);
          setDirectRequests(data.direct_requests || []);
          setBroadcastRequests(data.broadcast_requests || []);
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
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
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
    if (activeTab === 'direct') {
      router.push('/client/request/direct/choosePart');
    } else if (activeTab === 'custom') {
      router.push('/client/request/custom/mechaniccustomrequest' as any);
    } else if (activeTab === 'broadcast') {
      router.push('/client/request/broadcast/broadcastrequest' as any);
    }
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

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'custom', label: 'Custom', icon: 'pencil-square-o' },
    { key: 'direct', label: 'Direct', icon: 'bolt' },
    { key: 'broadcast', label: 'Broadcast', icon: 'bullhorn' },
  ];

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
      if (r.provider) details.push({ icon: 'wrench', text: r.provider.name });
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
      if (r.provider) details.push({ icon: 'wrench', text: r.provider.name });
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
      if (r.provider) details.push({ icon: 'wrench', text: r.provider.name });
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

  const currentRequests =
    activeTab === 'custom' ? customRequests :
    activeTab === 'direct' ? directRequests : broadcastRequests;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Requests</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {currentRequests.length} {activeTab} request{currentRequests.length !== 1 ? 's' : ''}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <FontAwesome
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.key ? '#fff' : '#8E8E93'}
            />
            <ThemedText style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* Create Button */}
      <View style={styles.createContainer}>
        <TouchableOpacity style={styles.createBtn} onPress={handleCreateRequest} activeOpacity={0.7}>
          <FontAwesome name="plus" size={14} color="#fff" />
          <ThemedText style={styles.createBtnText}>
            Create {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Request
          </ThemedText>
        </TouchableOpacity>
      </View>

      {/* Content */}
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
          {activeTab === 'custom' && renderCustomRequests()}
          {activeTab === 'direct' && renderDirectRequests()}
          {activeTab === 'broadcast' && renderBroadcastRequests()}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  // Header
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  activeTab: {
    backgroundColor: '#FF8C00',
    borderColor: '#FF8C00',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#fff',
  },
  // Create Button
  createContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 14,
  },
  createBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  // Loading / Error
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  // Card
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  // Card Details
  cardDetails: {
    backgroundColor: '#222426',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#ccc',
    flex: 1,
  },
  // Booked banner
  bookedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#34C75915',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  bookedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },
  // Cancel button
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#FF3B3040',
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3B30',
  },
  // Timer
  timerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF8C0015',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF8C00',
  },
  // Expired
  expiredSection: {
    marginBottom: 4,
  },
  expiredMsg: {
    fontSize: 12,
    color: '#FF3B30',
    marginBottom: 10,
  },
  expiredActions: {
    flexDirection: 'row',
    gap: 10,
  },
  resendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 10,
  },
  resendBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  removeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#FF3B3040',
    borderRadius: 10,
    paddingVertical: 10,
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3B30',
  },
  // Empty
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#1A1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF3B3015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  modalDescBox: {
    width: '100%',
    backgroundColor: '#222426',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  modalDescLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 6,
  },
  modalDescText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
  },
  modalWarning: {
    fontSize: 13,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222426',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalDeleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
  },
  modalDeleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
