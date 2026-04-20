import React, { useState, useEffect, useCallback } from 'react';
import {
  Image,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/mechanic/profileStyles';
import WalletSection from '@/components/wallet-section';
import { useNotification } from '@/hooks/useNotification';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { SkeletonProfile } from '@/components/skeletons/SkeletonLoaders';
import { getImageUrl } from '@/lib/imageUtils';

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
  status: string;
  source_type?: string | null;
  source_description?: string | null;
  rejection_reason?: string | null;
  requested_at?: string | null;
  approved_at?: string | null;
  proof_document_url?: string | null;
}

interface AvailableSpecialty {
  id: number;
  name: string;
  description: string;
}

interface MyAddon {
  id: number;
  service_id: number;
  name: string;
  description?: string;
  price: number;
}

const SOURCE_TYPE_OPTIONS = [
  { value: 'certification', label: 'Certification' },
  { value: 'license', label: 'License' },
  { value: 'training', label: 'Training' },
  { value: 'experience', label: 'Work Experience' },
  { value: 'other', label: 'Other' },
] as const;

type SourceTypeValue = (typeof SOURCE_TYPE_OPTIONS)[number]['value'];

export default function ProfileScreen() {
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [name, setName] = useState<string>('Mechanic');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myServices, setMyServices] = useState<MyService[]>([]);
  const [mySpecialties, setMySpecialties] = useState<MySpecialty[]>([]);
  const [mySpecialtyIds, setMySpecialtyIds] = useState<number[]>([]);
  const [specialtyModalVisible, setSpecialtyModalVisible] = useState(false);
  const [loadingAvailableSpecialties, setLoadingAvailableSpecialties] = useState(false);
  const [proofModalVisible, setProofModalVisible] = useState(false);
  const [availableSpecialties, setAvailableSpecialties] = useState<AvailableSpecialty[]>([]);
  const [selectedSpecialtyForProof, setSelectedSpecialtyForProof] = useState<AvailableSpecialty | null>(null);
  const [proofMode, setProofMode] = useState<'add' | 'resubmit'>('add');
  const [rejectedNote, setRejectedNote] = useState('');
  const [proofSourceType, setProofSourceType] = useState<SourceTypeValue>('other');
  const [proofDescription, setProofDescription] = useState('');
  const [proofDocument, setProofDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
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
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [serviceAddons, setServiceAddons] = useState<Record<number, MyAddon[]>>({});
  const [loadingServiceAddons, setLoadingServiceAddons] = useState(false);
  const [addonModalVisible, setAddonModalVisible] = useState(false);
  const [selectedAddonService, setSelectedAddonService] = useState<MyService | null>(null);
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState('');
  const [addonDescription, setAddonDescription] = useState('');
  const [submittingAddon, setSubmittingAddon] = useState(false);

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
        const mechanicProfile = p?.current_role_profile?.mechanic || null;
        if (n) setName(n);
        setProfilePhotoUrl(mechanicProfile?.profile_photo || mechanicProfile?.profile_photo_url || null);
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
        const allSpecialties: MySpecialty[] = data.specialties || [];
        setMySpecialtyIds(allSpecialties.map((specialty) => specialty.id));
        setMySpecialties(allSpecialties);
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

  useFocusEffect(
    useCallback(() => {
      fetchMyServices();
      fetchMySpecialties();
    }, [fetchMyServices, fetchMySpecialties]),
  );

  const fetchMyServiceAddons = useCallback(async () => {
    if (!myServices.length) {
      setServiceAddons({});
      return;
    }

    setLoadingServiceAddons(true);
    try {
      const results: Array<[number, MyAddon[]]> = await Promise.all(
        myServices.map(async (service) => {
          try {
            const res = await fetch(`${API_URL}/services/mechanic/my-addons/?service_id=${service.id}`, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) {
              return [service.id, []];
            }

            const data = await res.json();
            const addOns: MyAddon[] = (data.add_ons || []).map((addon: any) => ({
              id: addon.id,
              service_id: service.id,
              name: addon.name,
              description: addon.description || '',
              price: Number(addon.price || 0),
            }));

            return [service.id, addOns];
          } catch {
            return [service.id, []];
          }
        }),
      );

      const nextServiceAddons: Record<number, MyAddon[]> = {};
      results.forEach(([serviceId, addOns]) => {
        nextServiceAddons[serviceId] = addOns;
      });
      setServiceAddons(nextServiceAddons);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingServiceAddons(false);
    }
  }, [myServices]);

  useEffect(() => {
    fetchMyServiceAddons();
  }, [fetchMyServiceAddons]);

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

  const resetAddonForm = useCallback(() => {
    setAddonName('');
    setAddonPrice('');
    setAddonDescription('');
    setSubmittingAddon(false);
  }, []);

  const openAddAddonModal = useCallback(() => {
    resetAddonForm();
    setSelectedAddonService(null);
    setAddonModalVisible(true);
  }, [resetAddonForm]);

  const selectAddonService = useCallback((service: MyService) => {
    setSelectedAddonService(service);
    setAddonName('');
    setAddonPrice('');
    setAddonDescription('');
  }, []);

  const addAddon = async () => {
    if (!selectedAddonService) {
      showNotification({ type: 'error', message: 'Please select a service first.' });
      return;
    }

    const price = parseFloat(addonPrice || '0');
    if (!addonName.trim()) {
      showNotification({ type: 'error', message: 'Please enter an add-on name' });
      return;
    }
    if (isNaN(price) || price < 0) {
      showNotification({ type: 'error', message: 'Please enter a valid price' });
      return;
    }

    setSubmittingAddon(true);
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-addons/add/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: selectedAddonService.id,
          name: addonName.trim(),
          description: addonDescription.trim(),
          price,
        }),
      });

      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to add add-on' });
        return;
      }

      await fetchMyServiceAddons();
      setAddonName('');
      setAddonPrice('');
      setAddonDescription('');
      showNotification({ type: 'success', message: data.message || 'Add-on added' });
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to add add-on' });
    } finally {
      setSubmittingAddon(false);
    }
  };

  const removeAddon = async (addon: MyAddon) => {
    const ok = await confirm({
      type: 'danger',
      title: 'Remove Add-on',
      message: `Remove "${addon.name}" from your add-ons?`,
      confirmText: 'Remove',
      cancelText: 'Keep',
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_URL}/services/mechanic/my-addons/remove/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_add_on_id: addon.id }),
      });

      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to remove add-on' });
        return;
      }

      await fetchMyServiceAddons();
      showNotification({ type: 'success', message: data.message || 'Add-on removed' });
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to remove add-on' });
    }
  };

  const openAddSpecialtyModal = useCallback(async () => {
    setSpecialtyModalVisible(true);
    setLoadingAvailableSpecialties(true);
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
        const myIds = new Set(mySpecialtyIds);
        setAvailableSpecialties(all.filter((s) => !myIds.has(s.id)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAvailableSpecialties(false);
    }
  }, [mySpecialtyIds]);

  const toSourceTypeValue = (value: string | null | undefined): SourceTypeValue => {
    const fallback: SourceTypeValue = 'other';
    if (!value) return fallback;
    const normalized = String(value).toLowerCase() as SourceTypeValue;
    return SOURCE_TYPE_OPTIONS.some((option) => option.value === normalized) ? normalized : fallback;
  };

  const formatLabel = (value: string | null | undefined) => {
    if (!value) return 'Not specified';
    return String(value)
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  const formatSpecialtyStatus = (value: string | null | undefined) => {
    if (!value) return 'Pending';
    return formatLabel(value);
  };

  const getSpecialtyStatusStyle = (value: string | null | undefined) => {
    const normalized = String(value || '').toUpperCase();
    if (normalized === 'APPROVED') {
      return {
        badge: styles.approvedBadge,
        text: styles.approvedBadgeText,
      };
    }
    if (normalized === 'REJECTED') {
      return {
        badge: styles.rejectedBadge,
        text: styles.rejectedBadgeText,
      };
    }
    return {
      badge: styles.pendingBadge,
      text: styles.pendingBadgeText,
    };
  };

  const resetSpecialtyProofForm = useCallback(() => {
    setSelectedSpecialtyForProof(null);
    setProofMode('add');
    setRejectedNote('');
    setProofSourceType('other');
    setProofDescription('');
    setProofDocument(null);
    setSubmittingProof(false);
  }, []);

  const openSpecialtyProofModal = (specialty: AvailableSpecialty) => {
    setSelectedSpecialtyForProof(specialty);
    setProofMode('add');
    setRejectedNote('');
    setProofSourceType('other');
    setProofDescription('');
    setProofDocument(null);
    setSpecialtyModalVisible(false);
    setProofModalVisible(true);
  };

  const openRejectedSpecialtyForEdit = (specialty: MySpecialty) => {
    setSelectedSpecialtyForProof({
      id: specialty.id,
      name: specialty.name,
      description: specialty.description,
    });
    setProofMode('resubmit');
    setRejectedNote(specialty.rejection_reason || 'No rejection note provided.');
    setProofSourceType(toSourceTypeValue(specialty.source_type));
    setProofDescription(specialty.source_description || '');
    setProofDocument(null);
    setProofModalVisible(true);
  };

  const pickSpecialtyProofDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        setProofDocument(result.assets[0]);
      }
    } catch {
      showNotification({ type: 'error', message: 'Unable to select file right now.' });
    }
  };

  const submitSpecialtyRequest = async () => {
    if (!selectedSpecialtyForProof) {
      return;
    }

    if (!proofDocument && !proofDescription.trim()) {
      showNotification({ type: 'error', message: 'Please add a proof document or source description.' });
      return;
    }

    setSubmittingProof(true);
    try {
      const formData = new FormData();
      formData.append('specialty_id', String(selectedSpecialtyForProof.id));
      formData.append('source_type', proofSourceType);

      if (proofDescription.trim()) {
        formData.append('source_description', proofDescription.trim());
      }

      if (proofDocument) {
        const filename = proofDocument.name || proofDocument.uri.split('/').pop() || 'proof-document';
        const type = proofDocument.mimeType || 'application/octet-stream';

        formData.append('proof_document', {
          uri: proofDocument.uri,
          name: filename,
          type,
        } as any);
      }

      const res = await fetch(`${API_URL}/services/mechanic/my-specialties/add/`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json().catch(() => ({})) as any;
      if (!res.ok) {
        showNotification({ type: 'error', message: data.error || 'Failed to submit specialty request' });
        return;
      }

      await fetchMySpecialties();
      setProofModalVisible(false);
      resetSpecialtyProofForm();
      showNotification({
        type: 'success',
        message: data.message || (proofMode === 'resubmit' ? 'Specialty request resubmitted.' : 'Specialty request submitted.'),
      });
    } catch (e) {
      showNotification({ type: 'error', message: 'Failed to submit specialty request' });
    } finally {
      setSubmittingProof(false);
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
          {profilePhotoUrl ? (
            <Image
              source={{ uri: getImageUrl(profilePhotoUrl) || profilePhotoUrl }}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <FontAwesome name="user" size={36} color="#8E8E93" />
            </View>
          )}
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
            mySpecialties.map((specialty) => {
              const statusStyle = getSpecialtyStatusStyle(specialty.status);

              return (
                <View key={specialty.mechanic_specialty_id} style={styles.specialtyCard}>
                  <View style={styles.serviceInfo}>
                    <ThemedText style={styles.serviceName}>{specialty.name}</ThemedText>
                    <ThemedText style={styles.specialtyDesc}>
                      {specialty.description || 'No description'}
                    </ThemedText>
                    <View style={styles.specialtyMetaRow}>
                      <View style={statusStyle.badge}>
                        <ThemedText style={statusStyle.text}>{formatSpecialtyStatus(specialty.status)}</ThemedText>
                      </View>
                      <ThemedText style={styles.specialtyMetaText}>Source: {formatLabel(specialty.source_type)}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.serviceActions}>
                    {String(specialty.status || '').toUpperCase() === 'REJECTED' ? (
                      <TouchableOpacity onPress={() => openRejectedSpecialtyForEdit(specialty)} style={styles.editBtn}>
                        <FontAwesome name="edit" size={20} color="#FF8C00" />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={() => removeSpecialty(specialty)} style={styles.removeBtn}>
                      <FontAwesome name="times-circle" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                </View>

              );
            })
          )}
        </View>

        {/* Add-ons */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.menuItem} onPress={openAddAddonModal}>
            <FontAwesome name="tags" size={20} color="#FF8C00" />
            <View style={styles.serviceInfo}>
              <ThemedText style={styles.menuText}>My addons</ThemedText>
              <ThemedText style={styles.availableDesc}>Pick a service first, then add extras</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>
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
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => router.push('/mechanic/others/edit-profile' as never)}
          >
            <FontAwesome name="pencil" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Edit Profile</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>
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
              {loadingAvailableSpecialties ? (
                <ThemedText style={styles.modalEmpty}>Loading specialties...</ThemedText>
              ) : availableSpecialties.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>No more specialties to add</ThemedText>
              ) : (
                availableSpecialties.map((specialty) => (
                  <TouchableOpacity
                    key={specialty.id}
                    style={styles.availableRow}
                    onPress={() => openSpecialtyProofModal(specialty)}
                  >
                    <View style={styles.availableInfo}>
                      <ThemedText style={styles.availableName}>{specialty.name}</ThemedText>
                      <ThemedText style={styles.availableDesc} numberOfLines={2}>
                        {specialty.description || 'No description'}
                      </ThemedText>
                    </View>
                    <FontAwesome name="chevron-right" size={16} color="#FF8C00" />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* My addons modal */}
      <Modal
        visible={addonModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setAddonModalVisible(false);
          setSelectedAddonService(null);
          resetAddonForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { height: '92%', paddingBottom: 10 }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setAddonModalVisible(false);
                  setSelectedAddonService(null);
                  resetAddonForm();
                }}
                style={styles.backBtn}
              >
                <FontAwesome name="times" size={18} color="#FF8C00" />
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>My addons</ThemedText>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 64 }}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.proofSection}>
                <ThemedText style={styles.proofLabel}>Select a service first</ThemedText>
                {myServices.length === 0 ? (
                  <View style={styles.addonEmptyCard}>
                    <FontAwesome name="wrench" size={24} color="#555" />
                    <ThemedText style={styles.emptyText}>No services yet</ThemedText>
                    <ThemedText style={styles.emptySubtext}>
                      Add a service in Services I offer before creating add-ons.
                    </ThemedText>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {myServices.map((service) => {
                      const isSelected = selectedAddonService?.id === service.id;

                      return (
                        <TouchableOpacity
                          key={service.id}
                          style={[
                            styles.availableRow,
                            isSelected && { borderColor: '#FF8C00', backgroundColor: 'rgba(255, 140, 0, 0.12)' },
                          ]}
                          onPress={() => selectAddonService(service)}
                        >
                          <View style={styles.availableInfo}>
                            <ThemedText style={styles.availableName}>{service.name}</ThemedText>
                            <ThemedText style={styles.availableDesc} numberOfLines={2}>
                              {service.description || 'No description'}
                            </ThemedText>
                          </View>
                          <FontAwesome
                            name={isSelected ? 'check-circle' : 'chevron-right'}
                            size={16}
                            color={isSelected ? '#FF8C00' : '#8E8E93'}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {selectedAddonService ? (
                <View style={styles.serviceDetailCard}>
                  <ThemedText style={styles.serviceDetailName}>{selectedAddonService.name}</ThemedText>
                  <ThemedText style={styles.serviceDetailInfo}>
                    Add the extra details for this service below.
                  </ThemedText>
                </View>
              ) : null}

              {selectedAddonService ? (
                <>
                  <View style={styles.priceInputSection}>
                    <ThemedText style={styles.priceLabel}>Add-on name</ThemedText>
                    <TextInput
                      style={styles.addonTextInput}
                      value={addonName}
                      onChangeText={setAddonName}
                      placeholder="Add-on name"
                      placeholderTextColor="#8E8E93"
                    />
                  </View>

                  <View style={styles.priceInputSection}>
                    <ThemedText style={styles.priceLabel}>Price</ThemedText>
                    <View style={styles.priceInputWrapper}>
                      <ThemedText style={styles.currencySymbol}>₱</ThemedText>
                      <TextInput
                        style={styles.priceInput}
                        value={addonPrice}
                        onChangeText={setAddonPrice}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor="#555"
                      />
                    </View>
                  </View>

                  <View style={styles.priceInputSection}>
                    <ThemedText style={styles.priceLabel}>Description (optional)</ThemedText>
                    <TextInput
                      style={styles.addonTextArea}
                      value={addonDescription}
                      onChangeText={setAddonDescription}
                      placeholder="Short description"
                      placeholderTextColor="#8E8E93"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.addServiceBtn, submittingAddon && styles.addServiceBtnDisabled]}
                    onPress={addAddon}
                    disabled={submittingAddon}
                  >
                    {submittingAddon ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <ThemedText style={styles.addServiceBtnText}>Save Add-on</ThemedText>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.addonEmptyCard}>
                  <FontAwesome name="info-circle" size={24} color="#555" />
                  <ThemedText style={styles.emptyText}>Choose a service to continue</ThemedText>
                  <ThemedText style={styles.emptySubtext}>
                    Add-on name and price will appear after you select a service.
                  </ThemedText>
                </View>
              )}

              <View style={styles.proofSection}>
                <ThemedText style={styles.proofLabel}>Saved add-ons</ThemedText>
                {loadingServiceAddons ? (
                  <View style={styles.addonEmptyCard}>
                    <ActivityIndicator size="small" color="#FF8C00" />
                    <ThemedText style={styles.emptyText}>Loading add-ons...</ThemedText>
                  </View>
                ) : myServices.length === 0 ? (
                  <View style={styles.addonEmptyCard}>
                    <FontAwesome name="plus-square-o" size={24} color="#555" />
                    <ThemedText style={styles.emptyText}>No add-ons yet</ThemedText>
                    <ThemedText style={styles.emptySubtext}>
                      Your saved add-ons will appear here.
                    </ThemedText>
                  </View>
                ) : (
                  myServices.map((service) => {
                    const addOns = serviceAddons[service.id] || [];

                    return (
                      <View key={`service-addon-${service.id}`} style={styles.addonGroupCard}>
                        <View style={styles.addonGroupHeader}>
                          <View style={styles.addonGroupHeaderText}>
                            <ThemedText style={styles.addonGroupTitle}>{service.name}</ThemedText>
                            <ThemedText style={styles.addonGroupSubtitle}>Saved add-ons</ThemedText>
                          </View>
                        </View>

                        {addOns.length === 0 ? (
                          <View style={styles.addonEmptyCard}>
                            <FontAwesome name="plus-square-o" size={24} color="#555" />
                            <ThemedText style={styles.emptyText}>No add-ons yet</ThemedText>
                            <ThemedText style={styles.emptySubtext}>
                              Add one under {service.name.toLowerCase()}.
                            </ThemedText>
                          </View>
                        ) : (
                          addOns.map((addon) => (
                            <View key={addon.id} style={styles.addonItemCard}>
                              <View style={styles.serviceInfo}>
                                <ThemedText style={styles.serviceName}>{addon.name}</ThemedText>
                                <ThemedText style={styles.servicePrice}>₱{addon.price}</ThemedText>
                                {addon.description ? (
                                  <ThemedText style={styles.specialtyDesc}>{addon.description}</ThemedText>
                                ) : null}
                              </View>
                              <View style={styles.serviceActions}>
                                <TouchableOpacity onPress={() => removeAddon(addon)} style={styles.removeBtn}>
                                  <FontAwesome name="times-circle" size={20} color="#FF3B30" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Specialty proof modal */}
      <Modal
        visible={proofModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setProofModalVisible(false);
          resetSpecialtyProofForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setProofModalVisible(false);
                  if (proofMode === 'add') {
                    setSpecialtyModalVisible(true);
                  }
                }}
                style={styles.backBtn}
              >
                <FontAwesome name="chevron-left" size={18} color="#FF8C00" />
              </TouchableOpacity>
              <ThemedText style={styles.modalTitle}>{proofMode === 'resubmit' ? 'Resubmit Specialty Proof' : 'Specialty Proof'}</ThemedText>
              <TouchableOpacity
                onPress={() => {
                  setProofModalVisible(false);
                  resetSpecialtyProofForm();
                }}
              >
                <FontAwesome name="times" size={22} color="#ECEDEE" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.proofContent}>
              {selectedSpecialtyForProof ? (
                <View style={styles.serviceDetailCard}>
                  <ThemedText style={styles.serviceDetailName}>{selectedSpecialtyForProof.name}</ThemedText>
                  <ThemedText style={styles.serviceDetailInfo}>
                    {selectedSpecialtyForProof.description || 'No description'}
                  </ThemedText>
                </View>
              ) : null}

              {proofMode === 'resubmit' ? (
                <View style={styles.rejectedNoteCard}>
                  <ThemedText style={styles.rejectedNoteLabel}>Rejected Note</ThemedText>
                  <ThemedText style={styles.rejectedNoteText}>{rejectedNote}</ThemedText>
                </View>
              ) : null}

              <View style={styles.proofSection}>
                <ThemedText style={styles.proofLabel}>Proof Source</ThemedText>
                <View style={styles.sourceChipWrap}>
                  {SOURCE_TYPE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.sourceChip,
                        proofSourceType === option.value && styles.sourceChipActive,
                      ]}
                      onPress={() => setProofSourceType(option.value)}
                    >
                      <ThemedText
                        style={[
                          styles.sourceChipText,
                          proofSourceType === option.value && styles.sourceChipTextActive,
                        ]}
                      >
                        {option.label}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.proofSection}>
                <ThemedText style={styles.proofLabel}>Source Description (Optional)</ThemedText>
                <TextInput
                  style={styles.proofTextArea}
                  value={proofDescription}
                  onChangeText={setProofDescription}
                  placeholder="Describe your training, experience, or credentials"
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.proofSection}>
                <ThemedText style={styles.proofLabel}>Proof Document (Optional)</ThemedText>
                <TouchableOpacity style={styles.proofFileBtn} onPress={pickSpecialtyProofDocument}>
                  <FontAwesome name="paperclip" size={16} color="#FF8C00" />
                  <ThemedText style={styles.proofFileBtnText}>
                    {proofDocument ? 'Change Document' : 'Upload Document'}
                  </ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.proofFileMeta} numberOfLines={1}>
                  {proofDocument?.name || 'No file selected (image or PDF)'}
                </ThemedText>
              </View>

              <TouchableOpacity
                style={[styles.addServiceBtn, submittingProof && styles.addServiceBtnDisabled]}
                onPress={submitSpecialtyRequest}
                disabled={submittingProof}
              >
                {submittingProof ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.addServiceBtnText}>
                    {proofMode === 'resubmit' ? 'Resubmit Specialty Request' : 'Submit Specialty Request'}
                  </ThemedText>
                )}
              </TouchableOpacity>
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
