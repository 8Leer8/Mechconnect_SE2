import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import ThemedSelectModal from '@/components/ThemedSelectModal';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useNotification } from '@/hooks/useNotification';
import { getImageUrl } from '@/lib/imageUtils';
import { ensureForegroundLocationAccess } from '@/lib/locationPermission';
import { reverseGeocodeAddress, type ParsedLocationAddress } from '@/lib/locationAddress';
import { fetchProfileDetailsCached } from '@/lib/profileCache';
import { geocodeAddressFields } from '@/utils/geocodeAddress';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const PSGC_API_BASE = 'https://psgc.gitlab.io/api';

const MONTH_ITEMS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({
  label,
  value: String(index + 1).padStart(2, '0'),
}));

const DAY_ITEMS = Array.from({ length: 31 }, (_, index) => {
  const value = String(index + 1).padStart(2, '0');
  return { label: value, value };
});

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_ITEMS = Array.from({ length: CURRENT_YEAR - 1940 + 1 }, (_, index) => {
  const value = String(CURRENT_YEAR - index);
  return { label: value, value };
});

const GENDER_ITEMS = ['Male', 'Female', 'Others'].map((label) => ({
  label,
  value: label,
}));

const MANILA_REGION: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

type ActiveRole = 'client' | 'mechanic' | 'shop_owner' | 'admin';

interface PSGCLocation {
  code: string;
  name: string;
}

interface Address {
  house_building_number?: string;
  street_name?: string;
  subdivision_village?: string;
  barangay?: string;
  city_municipality?: string;
  province?: string;
  region?: string;
  postal_code?: string;
}

interface ShopProfile {
  shop_name?: string;
  contact_number?: string;
  email?: string;
  website?: string;
  description?: string;
  service_banner?: string;
}

interface RoleProfile {
  profile_photo?: string | null;
  contact_number?: string;
  bio?: string | null;
  shop?: ShopProfile | null;
}

interface ProfileData {
  firstname?: string;
  lastname?: string;
  middlename?: string;
  date_of_birth?: string;
  gender?: string;
  current_role_profile?: {
    client?: RoleProfile;
    mechanic?: RoleProfile;
    shop_owner?: RoleProfile;
    admin?: RoleProfile;
  };
  address?: Address;
}

interface ActiveRoleResponse {
  active_role: ActiveRole;
}

interface FormState {
  firstname: string;
  lastname: string;
  middlename: string;
  date_of_birth: string;
  gender: string;
  contact_number: string;
  house_building_number: string;
  street_name: string;
  subdivision_village: string;
  barangay: string;
  city_municipality: string;
  province: string;
  region: string;
  postal_code: string;
  bio: string;
  shop_name: string;
  shop_contact_number: string;
  shop_email: string;
  website: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  firstname: '',
  lastname: '',
  middlename: '',
  date_of_birth: '',
  gender: '',
  contact_number: '',
  house_building_number: '',
  street_name: '',
  subdivision_village: '',
  barangay: '',
  city_municipality: '',
  province: '',
  region: '',
  postal_code: '',
  bio: '',
  shop_name: '',
  shop_contact_number: '',
  shop_email: '',
  website: '',
  description: '',
};

export default function EditProfileScreen() {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeRole, setActiveRole] = useState<ActiveRole>('client');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [serviceBannerUri, setServiceBannerUri] = useState<string | null>(null);

  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [showMonthModal, setShowMonthModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showYearModal, setShowYearModal] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);

  const [regions, setRegions] = useState<PSGCLocation[]>([]);
  const [provinces, setProvinces] = useState<PSGCLocation[]>([]);
  const [cities, setCities] = useState<PSGCLocation[]>([]);
  const [barangays, setBarangays] = useState<PSGCLocation[]>([]);

  const [selectedRegionCode, setSelectedRegionCode] = useState('');
  const [selectedProvinceCode, setSelectedProvinceCode] = useState('');
  const [selectedCityCode, setSelectedCityCode] = useState('');

  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showProvinceModal, setShowProvinceModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showBarangayModal, setShowBarangayModal] = useState(false);

  const mapRef = useRef<MapView | null>(null);
  const geocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState<Region>(MANILA_REGION);
  const [mapAddressPreview, setMapAddressPreview] = useState<ParsedLocationAddress | null>(null);
  const [mapLocating, setMapLocating] = useState(false);
  const [mapGeocoding, setMapGeocoding] = useState(false);

  const normalize = (value: string) => value.trim().toLowerCase();

  const findByName = (list: PSGCLocation[], value: string) =>
    list.find((item) => normalize(item.name) === normalize(value));

  const fetchRegions = useCallback(async () => {
    setLoadingRegions(true);
    try {
      const response = await fetch(`${PSGC_API_BASE}/regions`);
      const payload = (await response.json()) as PSGCLocation[];
      setRegions((payload || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      showNotification({ type: 'warning', message: 'Failed to load regions.' });
    } finally {
      setLoadingRegions(false);
    }
  }, [showNotification]);

  const fetchProvinces = useCallback(
    async (regionCode: string) => {
      if (!regionCode) return;
      setLoadingProvinces(true);
      try {
        const response = await fetch(`${PSGC_API_BASE}/regions/${regionCode}/provinces`);
        const payload = (await response.json()) as PSGCLocation[];
        setProvinces((payload || []).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        showNotification({ type: 'warning', message: 'Failed to load provinces.' });
      } finally {
        setLoadingProvinces(false);
      }
    },
    [showNotification]
  );

  const fetchCities = useCallback(
    async (provinceCode: string) => {
      if (!provinceCode) return;
      setLoadingCities(true);
      try {
        const response = await fetch(`${PSGC_API_BASE}/provinces/${provinceCode}/cities-municipalities`);
        const payload = (await response.json()) as PSGCLocation[];
        setCities((payload || []).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        showNotification({ type: 'warning', message: 'Failed to load cities.' });
      } finally {
        setLoadingCities(false);
      }
    },
    [showNotification]
  );

  const fetchBarangays = useCallback(
    async (cityCode: string) => {
      if (!cityCode) return;
      setLoadingBarangays(true);
      try {
        const response = await fetch(`${PSGC_API_BASE}/cities-municipalities/${cityCode}/barangays`);
        const payload = (await response.json()) as PSGCLocation[];
        setBarangays((payload || []).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        showNotification({ type: 'warning', message: 'Failed to load barangays.' });
      } finally {
        setLoadingBarangays(false);
      }
    },
    [showNotification]
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [profile, roleRes] = await Promise.all([
        fetchProfileDetailsCached(false),
        fetch(`${API_URL}/users/profile/active-role/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      if (!profile) {
        throw new Error('Failed to load profile details');
      }

      const roleJson = roleRes.ok ? ((await roleRes.json()) as ActiveRoleResponse) : { active_role: 'client' as ActiveRole };
      const role = roleJson.active_role || 'client';

      setActiveRole(role);

      const profileData = profile as ProfileData;
      const address = profileData.address || {};
      const roleProfiles = profileData.current_role_profile || {};
      const currentRoleProfile =
        role === 'mechanic'
          ? roleProfiles.mechanic
          : role === 'shop_owner'
            ? roleProfiles.shop_owner
            : role === 'admin'
              ? roleProfiles.admin
              : roleProfiles.client;

      const shop = roleProfiles.shop_owner?.shop || null;

      setProfilePhotoUri(currentRoleProfile?.profile_photo || null);
      setServiceBannerUri(shop?.service_banner || null);

      setForm({
        firstname: profileData.firstname || '',
        lastname: profileData.lastname || '',
        middlename: profileData.middlename || '',
        date_of_birth: profileData.date_of_birth || '',
        gender: profileData.gender || '',
        contact_number: currentRoleProfile?.contact_number || '',
        house_building_number: address.house_building_number || '',
        street_name: address.street_name || '',
        subdivision_village: address.subdivision_village || '',
        barangay: address.barangay || '',
        city_municipality: address.city_municipality || '',
        province: address.province || '',
        region: address.region || '',
        postal_code: address.postal_code || '',
        bio: roleProfiles.mechanic?.bio || '',
        shop_name: shop?.shop_name || '',
        shop_contact_number: shop?.contact_number || '',
        shop_email: shop?.email || '',
        website: shop?.website || '',
        description: shop?.description || '',
      });

      const dob = (profileData.date_of_birth || '').split('-');
      if (dob.length === 3) {
        setDobYear(dob[0]);
        setDobMonth(dob[1]);
        setDobDay(dob[2]);
      } else {
        setDobYear('');
        setDobMonth('');
        setDobDay('');
      }
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Load Failed',
        message: error instanceof Error ? error.message : 'Failed to load profile',
      });
      router.back();
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    fetchRegions();
  }, [fetchRegions]);

  useEffect(() => {
    if (dobMonth && dobDay && dobYear) {
      setField('date_of_birth', `${dobYear}-${dobMonth}-${dobDay}`);
      return;
    }
    if (!dobMonth && !dobDay && !dobYear) {
      setField('date_of_birth', '');
    }
  }, [dobMonth, dobDay, dobYear]);

  useEffect(() => {
    if (!regions.length || !form.region) return;
    const region = findByName(regions, form.region);
    if (region && region.code !== selectedRegionCode) {
      setSelectedRegionCode(region.code);
    }
  }, [regions, form.region, selectedRegionCode]);

  useEffect(() => {
    if (!selectedRegionCode) return;
    fetchProvinces(selectedRegionCode);
  }, [selectedRegionCode, fetchProvinces]);

  useEffect(() => {
    if (!provinces.length || !form.province) return;
    const province = findByName(provinces, form.province);
    if (province && province.code !== selectedProvinceCode) {
      setSelectedProvinceCode(province.code);
    }
  }, [provinces, form.province, selectedProvinceCode]);

  useEffect(() => {
    if (!selectedProvinceCode) return;
    fetchCities(selectedProvinceCode);
  }, [selectedProvinceCode, fetchCities]);

  useEffect(() => {
    if (!cities.length || !form.city_municipality) return;
    const city = findByName(cities, form.city_municipality);
    if (city && city.code !== selectedCityCode) {
      setSelectedCityCode(city.code);
    }
  }, [cities, form.city_municipality, selectedCityCode]);

  useEffect(() => {
    if (!selectedCityCode) return;
    fetchBarangays(selectedCityCode);
  }, [selectedCityCode, fetchBarangays]);

  useEffect(() => {
    if (!barangays.length || !form.barangay) return;
    const barangay = findByName(barangays, form.barangay);
    if (barangay && barangay.name !== form.barangay) {
      setField('barangay', barangay.name);
    }
  }, [barangays, form.barangay]);

  useEffect(() => {
    return () => {
      if (geocodeTimeoutRef.current) {
        clearTimeout(geocodeTimeoutRef.current);
      }
    };
  }, []);

  const roleLabel = useMemo(() => {
    if (activeRole === 'shop_owner') return 'Shop Owner';
    if (activeRole === 'mechanic') return 'Mechanic';
    if (activeRole === 'admin') return 'Admin';
    return 'Client';
  }, [activeRole]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const displayDob = useMemo(() => {
    if (!dobMonth && !dobDay && !dobYear) return 'Not set';
    const monthLabel = MONTH_ITEMS.find((item) => item.value === dobMonth)?.label || 'Month';
    return `${monthLabel} ${dobDay || '--'}, ${dobYear || '----'}`;
  }, [dobMonth, dobDay, dobYear]);

  const pickImage = async (target: 'profile' | 'banner') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const uri = result.assets[0].uri;
    if (target === 'profile') {
      setProfilePhotoUri(uri);
      return;
    }
    setServiceBannerUri(uri);
  };

  const reverseGeocodeMapCenter = useCallback(async (region: Region) => {
    setMapGeocoding(true);
    try {
      const parsed = await reverseGeocodeAddress(region.latitude, region.longitude);
      setMapAddressPreview(parsed);
    } catch {
      setMapAddressPreview(null);
    } finally {
      setMapGeocoding(false);
    }
  }, []);

  const openMapPicker = async () => {
    setMapVisible(true);
    setMapLocating(true);

    try {
      const permission = await ensureForegroundLocationAccess();
      if (permission.granted) {
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const nextRegion: Region = {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
          latitudeDelta: 0.014,
          longitudeDelta: 0.014,
        };
        setMapRegion(nextRegion);
        mapRef.current?.animateToRegion(nextRegion, 300);
        await reverseGeocodeMapCenter(nextRegion);
        return;
      }

      showNotification({
        type: 'error',
        title: 'Location Not Found',
        message: 'Location permission denied. Unable to get device location.',
      });

      const geocoded = await geocodeAddressFields({
        street_name: form.street_name,
        subdivision_village: form.subdivision_village,
        barangay: form.barangay,
        city_municipality: form.city_municipality,
        province: form.province,
        region: form.region,
      });

      if (geocoded) {
        const nextRegion: Region = {
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
          latitudeDelta: 0.014,
          longitudeDelta: 0.014,
        };
        setMapRegion(nextRegion);
        mapRef.current?.animateToRegion(nextRegion, 300);
        await reverseGeocodeMapCenter(nextRegion);
        return;
      }

      showNotification({
        type: 'error',
        title: 'Location Not Found',
        message: 'Could not determine location from your device or saved address.',
      });

      await reverseGeocodeMapCenter(MANILA_REGION);
    } catch {
      showNotification({
        type: 'error',
        title: 'Location Not Found',
        message: 'Unable to get current location. Please enable location services and try again.',
      });
      await reverseGeocodeMapCenter(MANILA_REGION);
    } finally {
      setMapLocating(false);
    }
  };

  const onMapRegionChangeComplete = (nextRegion: Region) => {
    setMapRegion(nextRegion);
    if (geocodeTimeoutRef.current) {
      clearTimeout(geocodeTimeoutRef.current);
    }
    geocodeTimeoutRef.current = setTimeout(() => {
      reverseGeocodeMapCenter(nextRegion);
    }, 400);
  };

  const applyMapAddress = () => {
    if (!mapAddressPreview) {
      showNotification({
        type: 'error',
        title: 'Location Not Found',
        message: 'No valid address was detected for this map position.',
      });
      setMapVisible(false);
      return;
    }

    setField('street_name', mapAddressPreview.streetName || form.street_name);
    setField('subdivision_village', mapAddressPreview.subdivision || form.subdivision_village);
    setField('barangay', mapAddressPreview.barangay || form.barangay);
    setField('city_municipality', mapAddressPreview.city || form.city_municipality);
    setField('region', mapAddressPreview.region || form.region);

    setSelectedRegionCode('');
    setSelectedProvinceCode('');
    setSelectedCityCode('');
    setMapVisible(false);
  };

  const buildFile = (uri: string, fallbackName: string) => {
    const fileName = uri.split('/').pop() || fallbackName;
    const extension = fileName.includes('.') ? fileName.split('.').pop() : 'jpg';
    const mime = `image/${extension === 'jpg' ? 'jpeg' : extension}`;
    return {
      uri,
      name: fileName,
      type: mime,
    } as any;
  };

  const handleSave = async () => {
    if (!form.firstname.trim() || !form.lastname.trim()) {
      showNotification({ type: 'error', title: 'Validation', message: 'First and last name are required.' });
      return;
    }

    if (!form.street_name.trim() || !form.barangay.trim() || !form.city_municipality.trim() || !form.province.trim() || !form.region.trim()) {
      showNotification({
        type: 'error',
        title: 'Validation',
        message: 'Street, barangay, city, province, and region are required.',
      });
      return;
    }

    if (activeRole === 'shop_owner' && !form.shop_name.trim()) {
      showNotification({ type: 'error', title: 'Validation', message: 'Shop name is required for shop owners.' });
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();

      data.append('firstname', form.firstname.trim());
      data.append('lastname', form.lastname.trim());
      data.append('middlename', form.middlename.trim());
      data.append('gender', form.gender.trim());
      data.append('contact_number', form.contact_number.trim());
      data.append('house_building_number', form.house_building_number.trim());
      data.append('street_name', form.street_name.trim());
      data.append('subdivision_village', form.subdivision_village.trim());
      data.append('barangay', form.barangay.trim());
      data.append('city_municipality', form.city_municipality.trim());
      data.append('province', form.province.trim());
      data.append('region', form.region.trim());
      data.append('postal_code', form.postal_code.trim());

      if (form.date_of_birth.trim()) {
        data.append('date_of_birth', form.date_of_birth.trim());
      }

      if (activeRole === 'mechanic') {
        data.append('bio', form.bio.trim());
      }

      if (activeRole === 'shop_owner') {
        data.append('shop_name', form.shop_name.trim());
        data.append('shop_contact_number', form.shop_contact_number.trim());
        data.append('shop_email', form.shop_email.trim());
        data.append('website', form.website.trim());
        data.append('description', form.description.trim());
      }

      if (profilePhotoUri?.startsWith('file://')) {
        data.append('profile_photo', buildFile(profilePhotoUri, 'profile.jpg'));
      }

      if (activeRole === 'shop_owner' && serviceBannerUri?.startsWith('file://')) {
        data.append('service_banner', buildFile(serviceBannerUri, 'service-banner.jpg'));
      }

      const response = await fetch(`${API_URL}/users/profile/settings/`, {
        method: 'PUT',
        credentials: 'include',
        body: data,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errMsg = payload?.error || payload?.shop_name?.[0] || 'Failed to update profile';
        throw new Error(errMsg);
      }

      const updatedProfile = payload?.profile as ProfileData | undefined;
      if (updatedProfile) {
        const roleProfiles = updatedProfile.current_role_profile || {};
        const currentRoleProfile =
          activeRole === 'mechanic'
            ? roleProfiles.mechanic
            : activeRole === 'shop_owner'
              ? roleProfiles.shop_owner
              : activeRole === 'admin'
                ? roleProfiles.admin
                : roleProfiles.client;

        setProfilePhotoUri(currentRoleProfile?.profile_photo || null);
        setServiceBannerUri(roleProfiles.shop_owner?.shop?.service_banner || null);
      }

      showNotification({ type: 'success', message: 'Profile updated successfully.' });
      router.back();
    } catch (error) {
      showNotification({
        type: 'error',
        title: 'Update Failed',
        message: error instanceof Error ? error.message : 'Failed to update profile',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" color="#FF8C00" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Edit Profile</ThemedText>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.roleTag}>{roleLabel}</ThemedText>

        <View style={styles.photoRow}>
          <TouchableOpacity style={styles.photoBox} onPress={() => pickImage('profile')}>
            {profilePhotoUri ? (
              <Image
                source={{
                  uri:
                    profilePhotoUri?.startsWith('file://') || profilePhotoUri?.startsWith('content://')
                      ? profilePhotoUri
                      : getImageUrl(profilePhotoUri) ?? undefined,
                }}
                style={styles.photo}
              />
            ) : (
              <View style={styles.photoPlaceholder}>
                <FontAwesome name="user" size={24} color="#FF8C00" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage('profile')}>
            <ThemedText style={styles.photoBtnText}>Change Photo</ThemedText>
          </TouchableOpacity>
        </View>

        <SectionTitle title="Basic Info" />
        <Field label="First Name" value={form.firstname} onChangeText={(v) => setField('firstname', v)} autoCapitalize="words" />
        <Field label="Last Name" value={form.lastname} onChangeText={(v) => setField('lastname', v)} autoCapitalize="words" />
        <Field label="Middle Name" value={form.middlename} onChangeText={(v) => setField('middlename', v)} autoCapitalize="words" />

        <ThemedText style={styles.fieldLabel}>Date of Birth</ThemedText>
        <View style={styles.row3}>
          <SelectField
            value={MONTH_ITEMS.find((item) => item.value === dobMonth)?.label || 'Month'}
            onPress={() => setShowMonthModal(true)}
            style={styles.colMonth}
          />
          <SelectField value={dobDay || 'Day'} onPress={() => setShowDayModal(true)} style={styles.colDay} />
          <SelectField value={dobYear || 'Year'} onPress={() => setShowYearModal(true)} style={styles.colYear} />
        </View>
        <ThemedText style={styles.inlineHint}>{displayDob}</ThemedText>

        <SelectField
          label="Gender"
          value={form.gender || 'Select Gender'}
          onPress={() => setShowGenderModal(true)}
        />
        <Field label="Contact Number" value={form.contact_number} onChangeText={(v) => setField('contact_number', v)} keyboardType="phone-pad" />

        <SectionTitle title="Address" />
        <Field label="House / Building Number" value={form.house_building_number} onChangeText={(v) => setField('house_building_number', v)} />
        <Field label="Street Name" value={form.street_name} onChangeText={(v) => setField('street_name', v)} autoCapitalize="words" />
        <Field label="Subdivision / Village" value={form.subdivision_village} onChangeText={(v) => setField('subdivision_village', v)} />

        <TouchableOpacity style={styles.mapBtn} onPress={openMapPicker}>
          <FontAwesome name="map-marker" size={14} color="#FF8C00" />
          <ThemedText style={styles.mapBtnText}>Pick Address on Map</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.inlineHint}>Map fills street, barangay, city, and region automatically.</ThemedText>

        <SelectField
          label="Region"
          value={loadingRegions ? 'Loading regions...' : (form.region || 'Select Region')}
          onPress={() => setShowRegionModal(true)}
          disabled={loadingRegions}
        />
        <SelectField
          label="Province"
          value={loadingProvinces ? 'Loading provinces...' : (form.province || (selectedRegionCode ? 'Select Province' : 'Select region first'))}
          onPress={() => setShowProvinceModal(true)}
          disabled={!selectedRegionCode || loadingProvinces}
        />
        <SelectField
          label="City / Municipality"
          value={loadingCities ? 'Loading cities...' : (form.city_municipality || (selectedProvinceCode ? 'Select City / Municipality' : 'Select province first'))}
          onPress={() => setShowCityModal(true)}
          disabled={!selectedProvinceCode || loadingCities}
        />
        <SelectField
          label="Barangay"
          value={loadingBarangays ? 'Loading barangays...' : (form.barangay || (selectedCityCode ? 'Select Barangay' : 'Select city first'))}
          onPress={() => setShowBarangayModal(true)}
          disabled={!selectedCityCode || loadingBarangays}
        />
        <Field label="Postal Code" value={form.postal_code} onChangeText={(v) => setField('postal_code', v)} keyboardType="number-pad" />

        {activeRole === 'mechanic' && (
          <>
            <SectionTitle title="Mechanic Details" />
            <Field
              label="Bio"
              value={form.bio}
              onChangeText={(v) => setField('bio', v)}
              multiline
              numberOfLines={4}
            />
          </>
        )}

        {activeRole === 'shop_owner' && (
          <>
            <SectionTitle title="Shop Details" />
            <Field label="Shop Name" value={form.shop_name} onChangeText={(v) => setField('shop_name', v)} />
            <Field
              label="Shop Contact Number"
              value={form.shop_contact_number}
              onChangeText={(v) => setField('shop_contact_number', v)}
              keyboardType="phone-pad"
            />
            <Field
              label="Shop Email"
              value={form.shop_email}
              onChangeText={(v) => setField('shop_email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field label="Website" value={form.website} onChangeText={(v) => setField('website', v)} autoCapitalize="none" />
            <Field
              label="Description"
              value={form.description}
              onChangeText={(v) => setField('description', v)}
              multiline
              numberOfLines={4}
            />

            <ThemedText style={styles.bannerLabel}>Service Banner</ThemedText>
            <TouchableOpacity style={styles.bannerBox} onPress={() => pickImage('banner')}>
              {serviceBannerUri ? (
                <Image
                  source={{
                    uri:
                      serviceBannerUri?.startsWith('file://') || serviceBannerUri?.startsWith('content://')
                        ? serviceBannerUri
                        : getImageUrl(serviceBannerUri) ?? undefined,
                  }}
                  style={styles.banner}
                />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <FontAwesome name="image" size={24} color="#FF8C00" />
                </View>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#121212" /> : <ThemedText style={styles.saveBtnText}>Save Changes</ThemedText>}
        </TouchableOpacity>
      </ScrollView>

      <ThemedSelectModal
        visible={showMonthModal}
        title="Select Month"
        options={MONTH_ITEMS}
        selectedValue={dobMonth}
        onClose={() => setShowMonthModal(false)}
        onSelect={(item) => setDobMonth(item.value)}
      />

      <ThemedSelectModal
        visible={showDayModal}
        title="Select Day"
        options={DAY_ITEMS}
        selectedValue={dobDay}
        onClose={() => setShowDayModal(false)}
        onSelect={(item) => setDobDay(item.value)}
      />

      <ThemedSelectModal
        visible={showYearModal}
        title="Select Year"
        options={YEAR_ITEMS}
        selectedValue={dobYear}
        onClose={() => setShowYearModal(false)}
        onSelect={(item) => setDobYear(item.value)}
      />

      <ThemedSelectModal
        visible={showGenderModal}
        title="Select Gender"
        options={GENDER_ITEMS}
        selectedValue={form.gender}
        onClose={() => setShowGenderModal(false)}
        onSelect={(item) => setField('gender', item.value)}
      />

      <ThemedSelectModal
        visible={showRegionModal}
        title="Select Region"
        options={regions.map((item) => ({ label: item.name, value: item.code }))}
        selectedValue={selectedRegionCode}
        loading={loadingRegions}
        onClose={() => setShowRegionModal(false)}
        onSelect={(item) => {
          setSelectedRegionCode(item.value);
          setSelectedProvinceCode('');
          setSelectedCityCode('');
          setProvinces([]);
          setCities([]);
          setBarangays([]);
          setField('region', item.label);
          setField('province', '');
          setField('city_municipality', '');
          setField('barangay', '');
        }}
      />

      <ThemedSelectModal
        visible={showProvinceModal}
        title="Select Province"
        options={provinces.map((item) => ({ label: item.name, value: item.code }))}
        selectedValue={selectedProvinceCode}
        loading={loadingProvinces}
        emptyMessage={selectedRegionCode ? 'No provinces found' : 'Select a region first'}
        onClose={() => setShowProvinceModal(false)}
        onSelect={(item) => {
          setSelectedProvinceCode(item.value);
          setSelectedCityCode('');
          setCities([]);
          setBarangays([]);
          setField('province', item.label);
          setField('city_municipality', '');
          setField('barangay', '');
        }}
      />

      <ThemedSelectModal
        visible={showCityModal}
        title="Select City / Municipality"
        options={cities.map((item) => ({ label: item.name, value: item.code }))}
        selectedValue={selectedCityCode}
        loading={loadingCities}
        emptyMessage={selectedProvinceCode ? 'No cities found' : 'Select a province first'}
        onClose={() => setShowCityModal(false)}
        onSelect={(item) => {
          setSelectedCityCode(item.value);
          setBarangays([]);
          setField('city_municipality', item.label);
          setField('barangay', '');
        }}
      />

      <ThemedSelectModal
        visible={showBarangayModal}
        title="Select Barangay"
        options={barangays.map((item) => ({ label: item.name, value: item.name }))}
        selectedValue={form.barangay}
        loading={loadingBarangays}
        emptyMessage={selectedCityCode ? 'No barangays found' : 'Select a city first'}
        onClose={() => setShowBarangayModal(false)}
        onSelect={(item) => setField('barangay', item.label)}
      />

      <Modal visible={mapVisible} animationType="slide" onRequestClose={() => setMapVisible(false)}>
        <View style={styles.mapContainer}>
          <View style={styles.mapHeader}>
            <TouchableOpacity style={styles.mapHeaderBtn} onPress={() => setMapVisible(false)}>
              <FontAwesome name="arrow-left" size={16} color="#FF8C00" />
            </TouchableOpacity>
            <ThemedText style={styles.mapHeaderTitle}>Pick Address</ThemedText>
            <TouchableOpacity style={styles.mapHeaderBtn} onPress={openMapPicker}>
              {mapLocating ? <ActivityIndicator size="small" color="#FF8C00" /> : <FontAwesome name="crosshairs" size={16} color="#FF8C00" />}
            </TouchableOpacity>
          </View>

          <MapView
            ref={mapRef}
            style={styles.mapView}
            provider={PROVIDER_GOOGLE}
            initialRegion={mapRegion}
            region={mapRegion}
            onRegionChangeComplete={onMapRegionChangeComplete}
          />

          <View pointerEvents="none" style={styles.mapPinWrap}>
            <FontAwesome name="map-pin" size={34} color="#FF8C00" />
          </View>

          <View style={styles.mapFooter}>
            {mapGeocoding ? (
              <View style={styles.mapStatusRow}>
                <ActivityIndicator size="small" color="#FF8C00" />
                <ThemedText style={styles.mapAddressText}>Resolving address...</ThemedText>
              </View>
            ) : (
              <ThemedText style={styles.mapAddressText}>
                {mapAddressPreview?.address || 'Move map to your address'}
              </ThemedText>
            )}

            <TouchableOpacity style={styles.mapApplyBtn} onPress={applyMapAddress}>
              <ThemedText style={styles.mapApplyBtnText}>Use This Address</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <ThemedText style={styles.sectionTitle}>{title}</ThemedText>;
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  numberOfLines,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  numberOfLines?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.fieldWrap}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#8E8E93"
        multiline={multiline}
        numberOfLines={numberOfLines}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'sentences'}
      />
    </View>
  );
}

function SelectField({
  label,
  value,
  onPress,
  disabled,
  style,
}: {
  label?: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  style?: any;
}) {
  return (
    <View style={[styles.fieldWrap, style]}>
      {!!label && <ThemedText style={styles.fieldLabel}>{label}</ThemedText>}
      <TouchableOpacity style={[styles.selectInput, disabled && styles.selectInputDisabled]} onPress={onPress} disabled={disabled}>
        <ThemedText style={[styles.selectText, !value && styles.selectPlaceholder]}>{value}</ThemedText>
        <FontAwesome name="chevron-down" size={13} color="#8E8E93" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F10',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F10',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#242426',
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 36,
  },
  roleTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FF8C001A',
    color: '#FF8C00',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  photoBox: {
    width: 86,
    height: 86,
    borderRadius: 43,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#3A3A3C',
    backgroundColor: '#1C1C1E',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
  },
  photoBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2A2A2C',
  },
  photoBtnText: {
    color: '#FF8C00',
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 2,
    fontSize: 16,
    fontWeight: '700',
  },
  fieldWrap: {
    marginBottom: 10,
  },
  row3: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  colMonth: {
    flex: 1.55,
  },
  colDay: {
    flex: 1,
  },
  colYear: {
    flex: 1.25,
  },
  fieldLabel: {
    marginBottom: 6,
    color: '#C7C7CC',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
    color: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  selectInput: {
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputDisabled: {
    opacity: 0.6,
  },
  selectText: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
  },
  selectPlaceholder: {
    color: '#8E8E93',
  },
  inlineHint: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
  },
  mapBtn: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapBtnText: {
    color: '#FF8C00',
    fontWeight: '700',
  },
  bannerLabel: {
    marginTop: 4,
    marginBottom: 6,
    color: '#C7C7CC',
    fontSize: 12,
    fontWeight: '600',
  },
  bannerBox: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
    marginBottom: 10,
  },
  banner: {
    width: '100%',
    height: '100%',
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: '#121212',
    fontWeight: '700',
    fontSize: 15,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#0F0F10',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 54,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#242426',
  },
  mapHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  mapHeaderTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  mapView: {
    flex: 1,
  },
  mapPinWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '48%',
    alignItems: 'center',
  },
  mapFooter: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: '#242426',
    backgroundColor: '#111214',
    gap: 10,
  },
  mapStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapAddressText: {
    color: '#E6E7E8',
    fontSize: 13,
  },
  mapApplyBtn: {
    borderRadius: 11,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  mapApplyBtnText: {
    color: '#121212',
    fontWeight: '700',
    fontSize: 14,
  },
});
