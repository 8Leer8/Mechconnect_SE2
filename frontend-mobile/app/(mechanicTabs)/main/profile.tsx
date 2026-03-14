import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/profileStyles';
import WalletSection from '@/components/wallet-section';
import { useNotification } from '@/hooks/useNotification';
import { useConfirmation } from '@/hooks/useConfirmation';
import { SkeletonProfile } from '@/components/skeletons/SkeletonLoaders';

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

interface MySpecialty {
  id: number;
  mechanic_specialty_id: number;
  name: string;
  description: string;
}

interface AvailableSpecialty {
  id: number;
  name: string;
  description: string;
}

export default function ProfileScreen() {
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [name, setName] = useState<string>('Mechanic');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myServices, setMyServices] = useState<MyService[]>([]);
  const [mySpecialties, setMySpecialties] = useState<MySpecialty[]>([]);
  const [specialtyModalVisible, setSpecialtyModalVisible] = useState(false);
  const [availableSpecialties, setAvailableSpecialties] = useState<AvailableSpecialty[]>([]);
  const [addingSpecialtyId, setAddingSpecialtyId] = useState<number | null>(null);
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

  const fetchMySpecialties = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-specialties/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setMySpecialties(data.specialties || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      await Promise.all([fetchProfile(), fetchMyServices(), fetchMySpecialties()]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchProfile, fetchMyServices, fetchMySpecialties]);

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

  const openAddSpecialtyModal = useCallback(async () => {
    setSpecialtyModalVisible(true);
    setAvailableSpecialties([]);
    try {
      const res = await fetch(`${API_URL}/services/specialties/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const all: AvailableSpecialty[] = data.specialties || [];
        const myIds = new Set(mySpecialties.map((s) => s.id));
        setAvailableSpecialties(all.filter((s) => !myIds.has(s.id)));
      }
    } catch (e) {
      console.error(e);
    }
  }, [mySpecialties]);

  const addSpecialty = async (specialty: AvailableSpecialty) => {
    setAddingSpecialtyId(specialty.id);
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-specialties/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialty_id: specialty.id }),
      });
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to add specialty' });
        return;
      }

      await fetchMySpecialties();
      setSpecialtyModalVisible(false);
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to add specialty' });
    } finally {
      setAddingSpecialtyId(null);
    }
  };

  const removeSpecialty = async (specialty: MySpecialty) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Remove Specialty',
      message: `Remove "${specialty.name}" from your specialties?`,
      confirmText: 'Remove',
      cancelText: 'Keep',
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-specialties/remove/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialty_id: specialty.id }),
      });
      if (res.ok) await fetchMySpecialties();
      else {
        const data = await res.json().catch(() => ({})) as any;
        showNotification({ type: 'error', message: data.error || 'Failed to remove' });
      }
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to remove' });
    }
  };

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
      showNotification({ type: 'error', title: 'Invalid Price', message: 'Please enter a valid price' });
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
        showNotification({ type: 'error', message: data.error || 'Failed to add service' });
        return;
      }
      await fetchMyServices();
      setPriceModalVisible(false);
      setSelectedService(null);
      setCustomPrice('');
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to add service' });
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
      showNotification({ type: 'error', title: 'Invalid Price', message: 'Please enter a valid price' });
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
        showNotification({ type: 'error', message: data.error || 'Failed to update price' });
        return;
      }
      await fetchMyServices();
      setEditModalVisible(false);
      setEditingService(null);
      setEditPrice('');
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to update price' });
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelEditPrice = () => {
    setEditModalVisible(false);
    setEditingService(null);
    setEditPrice('');
  };

  const removeService = async (svc: MyService) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Remove Service',
      message: `Remove "${svc.name}" from your services?`,
      confirmText: 'Remove',
      cancelText: 'Keep',
    });
    if (!ok) return;
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
        showNotification({ type: 'error', message: data.error || 'Failed to remove' });
      }
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to remove' });
    }
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
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SkeletonProfile />
        </ScrollView>
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

        {/* Specialties */}
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <ThemedText style={styles.sectionTitle}>Specialties</ThemedText>
            <TouchableOpacity style={styles.addBtn} onPress={openAddSpecialtyModal}>
              <FontAwesome name="plus" size={14} color="#FF8C00" />
              <ThemedText style={styles.addBtnText}>Add</ThemedText>
            </TouchableOpacity>
          </View>
          {mySpecialties.length === 0 ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="star" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No specialties yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>Tap Add to highlight your expertise</ThemedText>
            </View>
          ) : (
            mySpecialties.map((specialty) => (
              <View key={specialty.mechanic_specialty_id} style={styles.specialtyCard}>
                <View style={styles.serviceInfo}>
                  <ThemedText style={styles.serviceName}>{specialty.name}</ThemedText>
                  <ThemedText style={styles.specialtyDesc}>
                    {specialty.description || 'No description'}
                  </ThemedText>
                </View>
                <TouchableOpacity onPress={() => removeSpecialty(specialty)} style={styles.removeBtn}>
                  <FontAwesome name="times-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))
          )}
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

      {/* Add specialty modal */}
      <Modal
        visible={specialtyModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSpecialtyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select a specialty</ThemedText>
              <TouchableOpacity onPress={() => setSpecialtyModalVisible(false)}>
                <FontAwesome name="times" size={22} color="#ECEDEE" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {availableSpecialties.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>No more specialties to add</ThemedText>
              ) : (
                availableSpecialties.map((specialty) => (
                  <TouchableOpacity
                    key={specialty.id}
                    style={styles.availableRow}
                    onPress={() => addSpecialty(specialty)}
                    disabled={addingSpecialtyId === specialty.id}
                  >
                    <View style={styles.availableInfo}>
                      <ThemedText style={styles.availableName}>{specialty.name}</ThemedText>
                      <ThemedText style={styles.availableDesc} numberOfLines={2}>
                        {specialty.description || 'No description'}
                      </ThemedText>
                    </View>
                    {addingSpecialtyId === specialty.id ? (
                      <ActivityIndicator size="small" color="#FF8C00" />
                    ) : (
                      <FontAwesome name="plus" size={16} color="#FF8C00" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
