import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface MyService {
  id: number;
  mechanic_service_id: number;
  name: string;
  description: string;
  price: number;
  category?: string;
}

interface AvailableService {
  id: number;
  name: string;
  description: string;
  price: number;
  category?: string;
}

export default function ProfileScreen() {
  const [name, setName] = useState<string>('Mechanic');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myServices, setMyServices] = useState<MyService[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [availableServices, setAvailableServices] = useState<AvailableService[]>([]);
  const [addingId, setAddingId] = useState<number | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.profile || data;
        const n = p?.full_name || `${p?.firstname || ''} ${p?.lastname || ''}`.trim();
        if (n) setName(n);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchMyServices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-services/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setMyServices(data.services || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      await Promise.all([fetchProfile(), fetchMyServices()]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchProfile, fetchMyServices]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openAddModal = useCallback(async () => {
    setAddModalVisible(true);
    setAvailableServices([]);
    try {
      const res = await fetch(`${API_URL}/services/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const all: AvailableService[] = data.services || [];
        const myIds = new Set(myServices.map((s) => s.id));
        setAvailableServices(all.filter((s) => !myIds.has(s.id)));
      }
    } catch (e) {
      console.error(e);
    }
  }, [myServices]);

  const addService = async (serviceId: number) => {
    setAddingId(serviceId);
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-services/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to add service');
        return;
      }
      await fetchMyServices();
      setAddModalVisible(false);
    } catch (e) {
      Alert.alert('Error', 'Failed to add service');
    } finally {
      setAddingId(null);
    }
  };

  const removeService = (svc: MyService) => {
    Alert.alert('Remove', `Remove "${svc.name}" from your services?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/services/mechanic/my-services/remove/`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ service_id: svc.id }),
            });
            if (res.ok) await fetchMyServices();
            else {
              const data = await res.json().catch(() => ({}));
              Alert.alert('Error', data.error || 'Failed to remove');
            }
          } catch (e) {
            Alert.alert('Error', 'Failed to remove');
          }
        },
      },
    ]);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/users/logout/`, { method: 'POST', credentials: 'include' });
      router.replace('/(auth)/login');
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#FF8C00" style={styles.loader} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAll(true)} tintColor="#FF8C00" />
        }
      >
        <View style={styles.header}>
          <View style={styles.avatarPlaceholder}>
            <FontAwesome name="user" size={36} color="#8E8E93" />
          </View>
          <ThemedText style={styles.name}>{name}</ThemedText>
          <ThemedText style={styles.subtitle}>Mechanic profile (temporary UI)</ThemedText>
        </View>

        {/* Services I offer - connected to backend */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <ThemedText style={styles.sectionTitle}>Services I offer</ThemedText>
            <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
              <FontAwesome name="plus" size={14} color="#FF8C00" />
              <ThemedText style={styles.addBtnText}>Add</ThemedText>
            </TouchableOpacity>
          </View>
          {myServices.length === 0 ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="wrench" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No services yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>Tap Add to offer services to clients</ThemedText>
            </View>
          ) : (
            myServices.map((svc) => (
              <View key={svc.mechanic_service_id} style={styles.serviceCard}>
                <View style={styles.serviceInfo}>
                  <ThemedText style={styles.serviceName}>{svc.name}</ThemedText>
                  <ThemedText style={styles.servicePrice}>₱{svc.price}</ThemedText>
                </View>
                <TouchableOpacity onPress={() => removeService(svc)} style={styles.removeBtn}>
                  <FontAwesome name="times-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(auth)/switchAccount/switchPage')}>
            <FontAwesome name="exchange" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Switch account</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
            <FontAwesome name="sign-out" size={20} color="#FF3B30" />
            <ThemedText style={[styles.menuText, styles.logoutText]}>Logout</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Add service modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Add service</ThemedText>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <FontAwesome name="times" size={22} color="#ECEDEE" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {availableServices.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>No more services to add</ThemedText>
              ) : (
                availableServices.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.availableRow}
                    onPress={() => addService(s.id)}
                    disabled={addingId === s.id}
                  >
                    <ThemedText style={styles.availableName}>{s.name}</ThemedText>
                    <ThemedText style={styles.availablePrice}>₱{s.price}</ThemedText>
                    {addingId === s.id ? (
                      <ActivityIndicator size="small" color="#FF8C00" />
                    ) : (
                      <FontAwesome name="plus-circle" size={20} color="#FF8C00" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#151718' },
  loader: { marginTop: 100 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  header: {
    backgroundColor: '#1E1E1E',
    paddingTop: 56,
    paddingBottom: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  name: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#8E8E93' },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF8C00',
  },
  addBtnText: { color: '#FF8C00', fontSize: 14, fontWeight: '600' },
  emptyCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  emptyText: { color: '#8E8E93', fontSize: 15, marginTop: 10 },
  emptySubtext: { color: '#555', fontSize: 13, marginTop: 4 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  servicePrice: { fontSize: 14, color: '#FF8C00', marginTop: 2 },
  removeBtn: { padding: 8 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E1E1E',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  menuText: { flex: 1, fontSize: 15, color: '#fff' },
  logoutItem: { borderColor: '#443' },
  logoutText: { color: '#FF3B30' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '65%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  modalScroll: { maxHeight: 320, padding: 16 },
  modalEmpty: { color: '#8E8E93', textAlign: 'center', padding: 24 },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: '#252628',
    borderWidth: 1,
    borderColor: '#333',
  },
  availableName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#ECEDEE' },
  availablePrice: { fontSize: 14, color: '#FF8C00', marginRight: 12 },
});
