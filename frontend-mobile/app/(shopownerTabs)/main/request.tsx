import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, Modal, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopNav } from '@/components/navigation';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type PendingRequest = {
  id: number;
  request_type: string;
  created_at: string;
  service_location?: {
    street_name?: string;
    barangay?: string;
    city_municipality?: string;
  } | null;
  client?: {
    firstname?: string;
    lastname?: string;
  } | null;
};

type HomeResponse = {
  pending_requests: PendingRequest[];
};

type TabType = 'custom' | 'direct' | 'broadcast';

type ShopMechanic = {
  id: number;
  account_id: number;
  firstname: string;
  lastname: string;
  profile_photo: string | null;
  status: string;
};

type Assignment = {
  id: number;
  mechanic: { id: number; firstname: string; lastname: string; username: string };
  role: 'lead' | 'assistant';
  assigned_at: string;
};

export default function ShopOwnerRequestScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('custom');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Assign Mechanics modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignRequestId, setAssignRequestId] = useState<number | null>(null);
  const [shopMechanics, setShopMechanics] = useState<ShopMechanic[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [mechanicsLoading, setMechanicsLoading] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const fetchRequests = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_URL}/bookings/home/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Failed to fetch requests');
      const data = (await res.json()) as HomeResponse;
      setPending(data.pending_requests || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch requests');
      setPending([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleAccept = async (r: PendingRequest) => {
    const endpoint =
      r.request_type === 'direct'
        ? `${API_URL}/bookings/shopowner/requests/${r.id}/accept/`
        : `${API_URL}/bookings/shopowner/requests/${r.id}/accept-custom/`;

    setActionLoading(r.id);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to accept request');
        return;
      }
      setPending((prev) => prev.filter((p) => p.id !== r.id));
      // Open assign-mechanics modal for direct requests
      if (r.request_type === 'direct') {
        openAssignModal(r.id);
      } else {
        Alert.alert('Success', data.message || 'Request accepted');
      }
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setActionLoading(null);
    }
  };

  // ── Assign-Mechanics Modal helpers ──

  const openAssignModal = async (requestId: number) => {
    setAssignRequestId(requestId);
    setAssignModalVisible(true);
    setMechanicsLoading(true);
    try {
      // Fetch shop mechanics + existing assignments in parallel
      const [mechRes, assignRes] = await Promise.all([
        fetch(`${API_URL}/shops/mechanics/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
        fetch(`${API_URL}/bookings/requests/${requestId}/assignments/`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      if (mechRes.ok) {
        const mechData = await mechRes.json();
        setShopMechanics(mechData.mechanics || []);
      }
      if (assignRes.ok) {
        const assignData = await assignRes.json();
        setAssignments(assignData || []);
      }
    } catch {
      Alert.alert('Error', 'Failed to load mechanics');
    } finally {
      setMechanicsLoading(false);
    }
  };

  const closeAssignModal = () => {
    setAssignModalVisible(false);
    setAssignRequestId(null);
    setShopMechanics([]);
    setAssignments([]);
  };

  const handleAssignMechanic = async (mechanicAccountId: number, role: 'lead' | 'assistant') => {
    if (!assignRequestId) return;
    setAssigningId(mechanicAccountId);
    try {
      const res = await fetch(
        `${API_URL}/bookings/requests/${assignRequestId}/assignments/add/`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mechanic_id: mechanicAccountId, role }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to assign mechanic');
        return;
      }
      setAssignments((prev) => [...prev, data as Assignment]);
    } catch {
      Alert.alert('Error', 'Network error');
    } finally {
      setAssigningId(null);
    }
  };

  const handleUnassign = async (assignmentId: number) => {
    if (!assignRequestId) return;
    try {
      const res = await fetch(
        `${API_URL}/bookings/requests/${assignRequestId}/assignments/${assignmentId}/remove/`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!res.ok) {
        const data = await res.json();
        Alert.alert('Error', data.error || 'Failed to remove');
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch {
      Alert.alert('Error', 'Network error');
    }
  };

  // IDs of already-assigned mechanics
  const assignedMechanicIds = new Set(assignments.map((a) => a.mechanic.id));
  // Available mechanics (from shop, not yet assigned)
  const availableMechanics = shopMechanics.filter(
    (m) => !assignedMechanicIds.has(m.account_id)
  );

  const handleDecline = (r: PendingRequest) => {
    Alert.alert('Decline Request', 'Are you sure you want to decline this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: async () => {
          const endpoint =
            r.request_type === 'direct'
              ? `${API_URL}/bookings/shopowner/requests/${r.id}/decline/`
              : `${API_URL}/bookings/shopowner/requests/${r.id}/decline-custom/`;

          setActionLoading(r.id);
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (!res.ok) {
              Alert.alert('Error', data.error || 'Failed to decline request');
              return;
            }
            Alert.alert('Declined', data.message || 'Request declined');
            setPending((prev) => prev.filter((p) => p.id !== r.id));
          } catch {
            Alert.alert('Error', 'Network error');
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const customRequests = pending.filter((r) => r.request_type === 'custom');
  const directRequests = pending.filter((r) => r.request_type === 'direct');
  // Treat emergency as "broadcast" for shop owners (can adjust when broadcast type exists)
  const broadcastRequests = pending.filter(
    (r) => r.request_type === 'broadcast' || r.request_type === 'emergency'
  );

  const listToShow =
    activeTab === 'custom'
      ? customRequests
      : activeTab === 'direct'
      ? directRequests
      : broadcastRequests;

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={() => {}} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9500" />
        }
      >
        <View style={styles.header}>
          <ThemedText style={styles.title}>Requests</ThemedText>
          <ThemedText style={styles.subtitle}>Custom, Direct, Broadcast</ThemedText>
        </View>

        {/* Tabs like client Request (custom / direct / broadcast) */}
        <View style={styles.tabRow}>
          {(['custom', 'direct', 'broadcast'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && styles.tabActive,
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <ThemedText
                style={[
                  styles.tabLabel,
                  activeTab === tab && styles.tabLabelActive,
                ]}
              >
                {tab === 'custom'
                  ? 'Custom'
                  : tab === 'direct'
                  ? 'Direct'
                  : 'Broadcast'}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#FF9500" />
            <ThemedText style={styles.muted}>Loading requests...</ThemedText>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF3B30" />
            <ThemedText style={styles.error}>{error}</ThemedText>
          </View>
        ) : listToShow.length === 0 ? (
          <View style={styles.center}>
            <IconSymbol name="tray.fill" size={52} color="#888" />
            <ThemedText style={styles.muted}>
              {activeTab === 'custom'
                ? 'No custom requests'
                : activeTab === 'direct'
                ? 'No direct requests'
                : 'No broadcast requests'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {listToShow.map((r) => (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.badge}>
                    <IconSymbol name="envelope.fill" size={16} color="#FF9500" />
                    <ThemedText style={styles.badgeText}>
                      {r.request_type?.toUpperCase?.() || 'REQUEST'}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.date}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </ThemedText>
                </View>

                <View style={styles.row}>
                  <IconSymbol name="person.fill" size={16} color="#888" />
                  <ThemedText style={styles.rowText}>
                    {r.client
                      ? `${r.client.firstname || ''} ${r.client.lastname || ''}`.trim() || 'Client'
                      : 'Client'}
                  </ThemedText>
                </View>

                <View style={styles.row}>
                  <IconSymbol name="mappin.and.ellipse" size={16} color="#888" />
                  <ThemedText style={styles.rowText} numberOfLines={1}>
                    {r.service_location
                      ? `${r.service_location.barangay || ''} ${r.service_location.city_municipality ? `, ${r.service_location.city_municipality}` : ''}`.trim() ||
                        'Location'
                      : 'Location'}
                  </ThemedText>
                </View>

                {(r.request_type === 'direct' || r.request_type === 'custom') && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => handleDecline(r)}
                      disabled={actionLoading === r.id}
                    >
                      <ThemedText style={styles.declineBtnText}>Decline</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAccept(r)}
                      disabled={actionLoading === r.id}
                    >
                      {actionLoading === r.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <ThemedText style={styles.acceptBtnText}>Accept</ThemedText>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Assign Mechanics Modal ── */}
      <Modal visible={assignModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Assign Mechanics</ThemedText>
              <TouchableOpacity onPress={closeAssignModal}>
                <IconSymbol name="xmark.circle.fill" size={28} color="#888" />
              </TouchableOpacity>
            </View>

            {mechanicsLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color="#FF9500" />
              </View>
            ) : (
              <ScrollView style={styles.modalBody}>
                {/* Currently assigned */}
                {assignments.length > 0 && (
                  <>
                    <ThemedText style={styles.sectionLabel}>Assigned</ThemedText>
                    {assignments.map((a) => (
                      <View key={a.id} style={styles.mechanicRow}>
                        <View style={styles.mechanicInfo}>
                          <IconSymbol name="person.fill" size={18} color="#34C759" />
                          <ThemedText style={styles.mechanicName}>
                            {a.mechanic.firstname} {a.mechanic.lastname}
                          </ThemedText>
                          <View style={[styles.roleBadge, a.role === 'lead' ? styles.roleLead : styles.roleAssistant]}>
                            <ThemedText style={styles.roleText}>
                              {a.role === 'lead' ? 'Lead' : 'Assistant'}
                            </ThemedText>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => handleUnassign(a.id)}>
                          <IconSymbol name="minus.circle.fill" size={24} color="#FF3B30" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}

                {/* Available to assign */}
                <ThemedText style={[styles.sectionLabel, { marginTop: assignments.length > 0 ? 20 : 0 }]}>
                  Shop Mechanics {availableMechanics.length === 0 ? '(none available)' : ''}
                </ThemedText>
                {availableMechanics.map((m) => (
                  <View key={m.account_id} style={styles.mechanicRow}>
                    <View style={styles.mechanicInfo}>
                      <IconSymbol name="person.fill" size={18} color="#888" />
                      <ThemedText style={styles.mechanicName}>
                        {m.firstname} {m.lastname}
                      </ThemedText>
                    </View>
                    <View style={styles.assignActions}>
                      {assigningId === m.account_id ? (
                        <ActivityIndicator size="small" color="#FF9500" />
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.assignLeadBtn}
                            onPress={() => handleAssignMechanic(m.account_id, 'lead')}
                          >
                            <ThemedText style={styles.assignBtnText}>Lead</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.assignAsstBtn}
                            onPress={() => handleAssignMechanic(m.account_id, 'assistant')}
                          >
                            <ThemedText style={styles.assignBtnText}>Assist</ThemedText>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.doneBtn} onPress={closeAssignModal}>
              <ThemedText style={styles.doneBtnText}>Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151718' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#888' },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#FF9500',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  tabLabelActive: {
    color: '#fff',
  },
  center: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  muted: { color: '#888' },
  error: { color: '#FF3B30', textAlign: 'center' },
  list: { gap: 12 },
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FF950015',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#FF9500' },
  date: { fontSize: 12, color: '#888' },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1, fontSize: 13, color: '#ccc' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
  },
  acceptBtn: {
    backgroundColor: '#34C759',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  acceptBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  declineBtn: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  declineBtnText: {
    color: '#FF3B30',
    fontWeight: '700',
    fontSize: 14,
  },
  // ── Assign Modal styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  mechanicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  mechanicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  mechanicName: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleLead: {
    backgroundColor: '#FF950030',
  },
  roleAssistant: {
    backgroundColor: '#34C75930',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9500',
  },
  assignActions: {
    flexDirection: 'row',
    gap: 6,
  },
  assignLeadBtn: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assignAsstBtn: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assignBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  doneBtn: {
    backgroundColor: '#FF9500',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});

