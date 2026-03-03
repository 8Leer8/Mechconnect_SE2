import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/profileStyles';
import WalletSection from '@/components/wallet-section';

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
  minimum_price: number;
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
  const [selectedService, setSelectedService] = useState<AvailableService | null>(null);
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<MyService | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json() as any;
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
        const data = await res.json() as any;
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
        const data = await res.json() as any;
        const all: AvailableService[] = data.services || [];
        const myIds = new Set(myServices.map((s) => s.id));
        setAvailableServices(all.filter((s) => !myIds.has(s.id)));
      }
    } catch (e) {
      console.error(e);
    }
  }, [myServices]);

  const selectServiceForPricing = (service: AvailableService) => {
    setSelectedService(service);
    setCustomPrice(service.minimum_price?.toString() || '0');
    setAddModalVisible(false);
    setPriceModalVisible(true);
  };

  const addServiceWithPrice = async () => {
    if (!selectedService) return;
    
    const price = parseFloat(customPrice);
    if (isNaN(price) || price < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price');
      return;
    }

    setAddingId(selectedService.id);
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-services/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          service_id: selectedService.id,
          price: price 
        }),
      });
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to add service');
        return;
      }
      await fetchMyServices();
      setPriceModalVisible(false);
      setSelectedService(null);
      setCustomPrice('');
    } catch (e) {
      Alert.alert('Error', 'Failed to add service');
    } finally {
      setAddingId(null);
    }
  };

  const cancelPriceInput = () => {
    setPriceModalVisible(false);
    setSelectedService(null);
    setCustomPrice('');
    setAddModalVisible(true);
  };

  const openEditModal = (service: MyService) => {
    setEditingService(service);
    setEditPrice(service.price.toString());
    setEditModalVisible(true);
  };

  const updateServicePrice = async () => {
    if (!editingService) return;
    
    const price = parseFloat(editPrice);
    if (isNaN(price) || price < 0) {
      Alert.alert('Invalid Price', 'Please enter a valid price');
      return;
    }

    setUpdatingId(editingService.mechanic_service_id);
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-services/update-price/`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mechanic_service_id: editingService.mechanic_service_id,
          price: price 
        }),
      });
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to update price');
        return;
      }
      await fetchMyServices();
      setEditModalVisible(false);
      setEditingService(null);
      setEditPrice('');
    } catch (e) {
      Alert.alert('Error', 'Failed to update price');
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelEditPrice = () => {
    setEditModalVisible(false);
    setEditingService(null);
    setEditPrice('');
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
              const data = await res.json().catch(() => ({})) as any;
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
          <ThemedText style={styles.subtitle}>Mechanic profile</ThemedText>
        </View>

        {/* Wallet Section */}
        <WalletSection />

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
                <View style={styles.serviceActions}>
                  <TouchableOpacity onPress={() => openEditModal(svc)} style={styles.editBtn}>
                    <FontAwesome name="edit" size={20} color="#FF8C00" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeService(svc)} style={styles.removeBtn}>
                    <FontAwesome name="times-circle" size={20} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/(auth)/switchAccount/switchPage')}>
            <FontAwesome name="exchange" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Switch Role</ThemedText>
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

      {/* Add service modal - Step 1: Select service */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select a service</ThemedText>
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
                    onPress={() => selectServiceForPricing(s)}
                  >
                    <View style={styles.availableInfo}>
                      <ThemedText style={styles.availableName}>{s.name}</ThemedText>
                      <ThemedText style={styles.availableDesc}>Suggested: ₱{s.minimum_price}</ThemedText>
                    </View>
                    <FontAwesome name="chevron-right" size={16} color="#FF8C00" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Price input modal - Step 2: Set your price */}
      <Modal
        visible={priceModalVisible}
        animationType="slide"
        transparent
        onRequestClose={cancelPriceInput}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={cancelPriceInput} style={styles.backBtn}>
                <FontAwesome name="chevron-left" size={18} color="#FF8C00" />
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>Set your price</ThemedText>
              <View style={{ width: 22 }} />
            </View>
            <View style={styles.priceContent}>
              {selectedService && (
                <>
                  <View style={styles.serviceDetailCard}>
                    <ThemedText style={styles.serviceDetailName}>{selectedService.name}</ThemedText>
                    <ThemedText style={styles.serviceDetailInfo}>
                      Suggested minimum: ₱{selectedService.minimum_price}
                    </ThemedText>
                  </View>
                  
                  <View style={styles.priceInputSection}>
                    <ThemedText style={styles.priceLabel}>Your price</ThemedText>
                    <View style={styles.priceInputWrapper}>
                      <ThemedText style={styles.currencySymbol}>₱</ThemedText>
                      <TextInput
                        style={styles.priceInput}
                        value={customPrice}
                        onChangeText={setCustomPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#555"
                        autoFocus
                      />
                    </View>
                    <ThemedText style={styles.priceHint}>
                      Set a competitive price for your service
                    </ThemedText>
                  </View>

                  <TouchableOpacity
                    style={[styles.addServiceBtn, addingId === selectedService.id && styles.addServiceBtnDisabled]}
                    onPress={addServiceWithPrice}
                    disabled={addingId === selectedService.id}
                  >
                    {addingId === selectedService.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.addServiceBtnText}>Add Service</ThemedText>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit price modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={cancelEditPrice}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={cancelEditPrice} style={styles.backBtn}>
                <FontAwesome name="times" size={18} color="#FF8C00" />
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>Edit price</ThemedText>
              <View style={{ width: 22 }} />
            </View>
            <View style={styles.priceContent}>
              {editingService && (
                <>
                  <View style={styles.serviceDetailCard}>
                    <ThemedText style={styles.serviceDetailName}>{editingService.name}</ThemedText>
                    <ThemedText style={styles.serviceDetailInfo}>
                      Current price: ₱{editingService.price}
                    </ThemedText>
                  </View>
                  
                  <View style={styles.priceInputSection}>
                    <ThemedText style={styles.priceLabel}>New price</ThemedText>
                    <View style={styles.priceInputWrapper}>
                      <ThemedText style={styles.currencySymbol}>₱</ThemedText>
                      <TextInput
                        style={styles.priceInput}
                        value={editPrice}
                        onChangeText={setEditPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#555"
                        autoFocus
                      />
                    </View>
                    <ThemedText style={styles.priceHint}>
                      Update the price for this service
                    </ThemedText>
                  </View>

                  <TouchableOpacity
                    style={[styles.addServiceBtn, updatingId === editingService.mechanic_service_id && styles.addServiceBtnDisabled]}
                    onPress={updateServicePrice}
                    disabled={updatingId === editingService.mechanic_service_id}
                  >
                    {updatingId === editingService.mechanic_service_id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.addServiceBtnText}>Update Price</ThemedText>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
