import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { useNotification } from '@/hooks/useNotification';
import { SkeletonProfile } from '@/components/skeletons/SkeletonLoaders';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { styles as clientProfileStyles } from '@/style/client/profileStyles';
import { ShopProductsPanel } from '@/components/shopowner/ShopProductsPanel';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface Address {
  house_building_number?: string;
  street_name: string;
  subdivision_village?: string;
  barangay: string;
  city_municipality: string;
  province: string;
  region: string;
  postal_code?: string;
}

interface RoleProfile {
  profile_photo?: string | null;
  contact_number?: string;
  bio?: string | null;
}

interface ProfileData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  firstname: string;
  lastname: string;
  middlename?: string;
  is_verified: boolean;
  user_type: string[];
  available_roles: { value: string; label: string }[];
  current_role_profile: {
    client?: RoleProfile;
    mechanic?: RoleProfile;
    shop_owner?: RoleProfile;
  };
  address?: Address;
}

interface ProfileResponse {
  profile: ProfileData;
}

interface ActiveRoleResponse {
  active_role: string;
}

interface MyShopService {
  id: number;
  shop_service_id: number;
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

export default function ShopOwnerProfileScreen() {
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('shop_owner');

  // Service management state
  const [myServices, setMyServices] = useState<MyShopService[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [availableServices, setAvailableServices] = useState<AvailableService[]>([]);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [selectedService, setSelectedService] = useState<AvailableService | null>(null);
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [customPrice, setCustomPrice] = useState<string>('');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<MyShopService | null>(null);
  const [editPrice, setEditPrice] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [shopProductsModalVisible, setShopProductsModalVisible] = useState(false);

  const fetchProfileData = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.status === 403 || response.status === 401) {
        setError('Please login to view your profile');
        setLoading(false);
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch profile data');

      const data = (await response.json()) as ProfileResponse;
      setProfileData(data.profile);

      // Fetch active role so we know which role profile to emphasize
      const roleResponse = await fetch(`${API_URL}/users/profile/active-role/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (roleResponse.ok) {
        const roleData = (await roleResponse.json()) as ActiveRoleResponse;
        setActiveRole(roleData.active_role || 'shop_owner');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchMyServices = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/services/shop/my-services/`, {
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

  useEffect(() => {
    fetchProfileData();
    fetchMyServices();
  }, [fetchProfileData, fetchMyServices]);

  const onRefresh = () => {
    setRefreshing(true);
    Promise.all([fetchProfileData(), fetchMyServices()]).finally(() => setRefreshing(false));
  };

  // ── Service management handlers ──

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
      const res = await fetch(`${API_URL}/services/shop/my-services/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: selectedService.id, price }),
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

  const openEditModal = (service: MyShopService) => {
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
    setUpdatingId(editingService.shop_service_id);
    try {
      const res = await fetch(`${API_URL}/services/shop/my-services/update-price/`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_service_id: editingService.shop_service_id, price }),
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

  const removeService = async (svc: MyShopService) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Remove Service',
      message: `Remove "${svc.name}" from your shop services?`,
      confirmText: 'Remove',
      cancelText: 'Keep',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_URL}/services/shop/my-services/remove/`, {
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

  // ── End service management handlers ──

  const handleSwitchRole = () => {
    router.push('/(auth)/switchAccount/switchPage');
  };

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const performLogout = async () => {
    setLogoutLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/logout/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        router.replace('/(auth)/login');
      } else {
        throw new Error('Logout failed');
      }
    } catch (err) {
      showNotification({ type: 'error', message: err instanceof Error ? err.message : 'Logout failed' });
    } finally {
      setLogoutLoading(false);
      setLogoutModalVisible(false);
    }
  };

  const formatAddress = (address?: Address): string => {
    if (!address) return 'No address provided';
    return [
      address.house_building_number,
      address.street_name,
      address.subdivision_village,
      address.barangay,
      address.city_municipality,
      address.province,
      address.region,
    ]
      .filter(Boolean)
      .join(', ');
  };

  const getCurrentProfile = (): RoleProfile | null => {
    if (!profileData) return null;
    const profiles = profileData.current_role_profile;
    if (activeRole === 'client' && profiles.client) return profiles.client;
    if (activeRole === 'mechanic' && profiles.mechanic) return profiles.mechanic;
    if (profiles.shop_owner) return profiles.shop_owner;
    return null;
  };

  const roleLabel = (role: string) => {
    if (role === 'shop_owner') return 'Shop Owner';
    if (role === 'mechanic') return 'Mechanic';
    if (role === 'client') return 'Client';
    return role;
  };

  if (loading) {
    return (
      <ThemedView style={clientProfileStyles.container}>
        <View style={clientProfileStyles.header}>
          <ThemedText style={clientProfileStyles.headerTitle}>Profile</ThemedText>
        </View>
        <ScrollView
          style={clientProfileStyles.scrollView}
          contentContainerStyle={clientProfileStyles.scrollContent}
        >
          <SkeletonProfile />
        </ScrollView>
      </ThemedView>
    );
  }

  if (error || !profileData) {
    return (
      <ThemedView style={clientProfileStyles.container}>
        <View style={clientProfileStyles.header}>
          <ThemedText style={clientProfileStyles.headerTitle}>Profile</ThemedText>
        </View>
        <View style={clientProfileStyles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={clientProfileStyles.errorText}>{error || 'Failed to load profile'}</ThemedText>
          {error === 'Please login to view your profile' ? (
            <TouchableOpacity
              style={clientProfileStyles.retryBtn}
              onPress={() => router.replace('/(auth)/login')}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.actionButtonText}>Go to Login</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={fetchProfileData}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.actionButtonText}>Retry</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>
    );
  }

  const currentProfile = getCurrentProfile();
  const currentRoleLabel =
    profileData.available_roles.find((r) => r.value === activeRole)?.label || 'Shop Owner';

  return (
    <ThemedView style={clientProfileStyles.container}>
      <ScrollView
        style={clientProfileStyles.scrollView}
        contentContainerStyle={clientProfileStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Profile Card copied from client profile, with shop-owner data */}
        <View style={clientProfileStyles.profileCard}>
          {currentProfile?.profile_photo ? (
            <Image source={{ uri: currentProfile.profile_photo }} style={clientProfileStyles.profilePhoto} />
          ) : (
            <View style={clientProfileStyles.profilePhotoPlaceholder}>
              <FontAwesome name="user" size={36} color="#FF8C00" />
            </View>
          )}

          <ThemedText style={clientProfileStyles.userName}>
            {profileData.full_name || `${profileData.firstname} ${profileData.lastname}`}
          </ThemedText>
          <ThemedText style={clientProfileStyles.userEmail}>{profileData.email}</ThemedText>

          {/* Info chips */}
          <View style={clientProfileStyles.infoChips}>
            {currentProfile?.contact_number && (
              <View style={clientProfileStyles.chip}>
                <FontAwesome name="phone" size={12} color="#FF8C00" />
                <ThemedText style={clientProfileStyles.chipText}>
                  {currentProfile.contact_number}
                </ThemedText>
              </View>
            )}
            <View style={clientProfileStyles.chip}>
              <FontAwesome name="id-badge" size={12} color="#FF8C00" />
              <ThemedText style={clientProfileStyles.chipText}>{currentRoleLabel}</ThemedText>
            </View>
            {profileData.is_verified && (
              <View style={[clientProfileStyles.chip, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="check-circle" size={12} color="#34C759" />
                <ThemedText style={[clientProfileStyles.chipText, { color: '#34C759' }]}>
                  Verified
                </ThemedText>
              </View>
            )}
          </View>

          {/* Address */}
          <View style={clientProfileStyles.addressRow}>
            <FontAwesome name="map-marker" size={14} color="#8E8E93" />
            <ThemedText style={clientProfileStyles.addressText} numberOfLines={2}>
              {formatAddress(profileData.address)}
            </ThemedText>
          </View>

          {/* Edit profile */}
          <TouchableOpacity
            style={clientProfileStyles.editBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/shopowner/others/edit-profile')}
          >
            <FontAwesome name="pencil" size={14} color="#FF8C00" />
            <ThemedText style={clientProfileStyles.editBtnText}>Edit Shop Profile</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Shop services displayed like a settings card */}
        <View style={clientProfileStyles.settingsCard}>
          <TouchableOpacity
            style={clientProfileStyles.settingRow}
            activeOpacity={0.7}
            onPress={openAddModal}
          >
            <View style={[clientProfileStyles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="plus" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={clientProfileStyles.settingText}>Add Shop Service</ThemedText>
            <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
          </TouchableOpacity>

          {myServices.map((svc) => (
            <View
              key={svc.shop_service_id}
              style={[clientProfileStyles.settingRow, { paddingVertical: 10 }]}
            >
              <View style={[clientProfileStyles.sectionIcon, { backgroundColor: '#1E1E1E' }]}>
                <FontAwesome name="wrench" size={16} color="#FF8C00" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={clientProfileStyles.settingText}>{svc.name}</ThemedText>
                <ThemedText style={{ fontSize: 12, color: '#8E8E93' }} numberOfLines={1}>
                  {svc.description || 'No description'}
                </ThemedText>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <ThemedText style={{ color: '#FF8C00', fontWeight: '600', fontSize: 13 }}>
                  ₱{svc.price.toFixed(2)}
                </ThemedText>
                <TouchableOpacity
                  style={{ marginTop: 4, padding: 4 }}
                  onPress={() => openEditModal(svc)}
                >
                  <FontAwesome name="pencil" size={12} color="#FF8C00" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* Shop products — same settings card pattern as Add Shop Service */}
        <View style={clientProfileStyles.settingsCard}>
          <TouchableOpacity
            style={clientProfileStyles.settingRow}
            activeOpacity={0.7}
            onPress={() => setShopProductsModalVisible(true)}
          >
            <View style={[clientProfileStyles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="shopping-bag" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={clientProfileStyles.settingText}>Shop products</ThemedText>
            <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Switch Role card */}
        <View style={clientProfileStyles.settingsCard}>
          <TouchableOpacity
            style={clientProfileStyles.settingRow}
            activeOpacity={0.7}
            onPress={handleSwitchRole}
          >
            <View style={[clientProfileStyles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
              <FontAwesome name="exchange" size={16} color="#FF8C00" />
            </View>
            <ThemedText style={clientProfileStyles.settingText}>Switch Role</ThemedText>
            <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Logout button, separated */}
        <TouchableOpacity
          style={[clientProfileStyles.logoutBtn, { marginTop: 16 }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <FontAwesome name="sign-out" size={16} color="#FF3B30" />
          <ThemedText style={clientProfileStyles.logoutText}>Log Out</ThemedText>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add service modal - Step 1: Select service */}
      <Modal visible={addModalVisible} animationType="slide" transparent onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Select a service</ThemedText>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <FontAwesome name="times" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {availableServices.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>No more services to add</ThemedText>
              ) : (
                availableServices.map((s) => (
                  <TouchableOpacity key={s.id} style={styles.availableRow} onPress={() => selectServiceForPricing(s)}>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.availableName}>{s.name}</ThemedText>
                      <ThemedText style={styles.availableDesc}>Suggested: ₱{s.minimum_price}</ThemedText>
                    </View>
                    <FontAwesome name="chevron-right" size={16} color="#FF9500" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Price input modal - Step 2: Set price */}
      <Modal visible={priceModalVisible} animationType="slide" transparent onRequestClose={cancelPriceInput}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={cancelPriceInput}>
                <FontAwesome name="chevron-left" size={18} color="#FF9500" />
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>Set your price</ThemedText>
              <View style={{ width: 22 }} />
            </View>
            {selectedService && (
              <View style={styles.priceContent}>
                <View style={styles.serviceDetailCard}>
                  <ThemedText style={styles.serviceDetailName}>{selectedService.name}</ThemedText>
                  <ThemedText style={styles.serviceDetailInfo}>Suggested minimum: ₱{selectedService.minimum_price}</ThemedText>
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
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, addingId === selectedService.id && styles.confirmBtnDisabled]}
                  onPress={addServiceWithPrice}
                  disabled={addingId === selectedService.id}
                >
                  {addingId === selectedService.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.confirmBtnText}>Add Service</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit price modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={cancelEditPrice}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={cancelEditPrice}>
                <FontAwesome name="times" size={18} color="#FF9500" />
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>Edit price</ThemedText>
              <View style={{ width: 22 }} />
            </View>
            {editingService && (
              <View style={styles.priceContent}>
                <View style={styles.serviceDetailCard}>
                  <ThemedText style={styles.serviceDetailName}>{editingService.name}</ThemedText>
                  <ThemedText style={styles.serviceDetailInfo}>Current price: ₱{editingService.price}</ThemedText>
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
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, updatingId === editingService.shop_service_id && styles.confirmBtnDisabled]}
                  onPress={updateServicePrice}
                  disabled={updatingId === editingService.shop_service_id}
                >
                  {updatingId === editingService.shop_service_id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.confirmBtnText}>Update Price</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={shopProductsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setShopProductsModalVisible(false)}
      >
        <View style={styles.shopProductsModalOverlay}>
          <View style={styles.shopProductsModalBox}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Shop products</ThemedText>
              <TouchableOpacity
                onPress={() => setShopProductsModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <FontAwesome name="times" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
            <ShopProductsPanel />
          </View>
        </View>
      </Modal>

      <ConfirmationModal
        visible={logoutModalVisible}
        type="danger"
        title="Logout"
        message="Are you sure you want to logout?"
        confirmText="Logout"
        cancelText="Cancel"
        loading={logoutLoading}
        onCancel={() => {
          if (!logoutLoading) setLogoutModalVisible(false);
        }}
        onConfirm={performLogout}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#888',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingTop: 80,
  },
  loadingText: {
    fontSize: 15,
    color: '#888',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  actionButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FF9500',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  topCard: {
    flexDirection: 'row',
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#252525',
    marginBottom: 20,
  },
  avatarWrapper: {
    marginRight: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#222',
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#151515',
  },
  topCardText: {
    flex: 1,
    justifyContent: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  username: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  email: {
    fontSize: 13,
    color: '#ccc',
    marginTop: 4,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FF950018',
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF9500',
  },
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  sectionBody: {
    borderRadius: 14,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#252525',
    padding: 14,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowText: {
    flex: 1,
    fontSize: 13,
    color: '#ccc',
  },
  bioText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  logoutItem: {
    marginTop: 4,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  // Service management styles
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FF950018',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF9500',
  },
  emptyServices: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  emptyServicesText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
  },
  emptyServicesSubtext: {
    fontSize: 12,
    color: '#666',
  },
  serviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  servicePrice: {
    fontSize: 13,
    color: '#FF9500',
    marginTop: 2,
  },
  serviceActions: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceActionBtn: {
    padding: 4,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalEmpty: {
    textAlign: 'center',
    color: '#888',
    paddingVertical: 24,
    fontSize: 14,
  },
  availableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  availableName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  availableDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  priceContent: {
    paddingVertical: 8,
    gap: 16,
  },
  serviceDetailCard: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 14,
  },
  serviceDetailName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  serviceDetailInfo: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  priceInputSection: {
    gap: 8,
  },
  priceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF9500',
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    fontSize: 18,
    color: '#fff',
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: '#FF9500',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  shopProductsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  shopProductsModalBox: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '90%',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
});

