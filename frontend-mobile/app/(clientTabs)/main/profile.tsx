import React, { useState, useEffect, useCallback } from 'react';
import {View, ScrollView, TouchableOpacity, Image, ActivityIndicator, RefreshControl, } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '@/style/client/profileStyles';
import { getImageUrl } from '@/lib/imageUtils';
import { useNotification } from '@/hooks/useNotification';
import { useConfirmation } from '@/hooks/useConfirmation';

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

interface Profile {
  profile_photo?: string | null;
  contact_number?: string;
}

interface ProfileData {
  id: number;
  username: string;
  email: string;
  full_name: string;
  firstname: string;
  lastname: string;
  middlename?: string;
  date_of_birth?: string;
  gender?: string;
  is_verified: boolean;
  user_type: string[];
  available_roles: { value: string; label: string }[];
  current_role_profile: {
    client?: Profile;
    mechanic?: Profile;
    shop_owner?: Profile;
  };
  address?: Address;
}

interface ProfileResponse {
  profile: ProfileData;
}

interface ActiveRoleResponse {
  active_role: string;
}

export default function ProfileScreen() {
  const { showNotification } = useNotification();
  const { confirm } = useConfirmation();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('client');

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

      const data = await response.json() as ProfileResponse;
      setProfileData(data.profile);

      // Fetch active role
      const roleResponse = await fetch(`${API_URL}/users/profile/active-role/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (roleResponse.ok) {
        const roleData = await roleResponse.json() as ActiveRoleResponse;
        setActiveRole(roleData.active_role || 'client');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const handleSwitchRole = () => {
    router.push('/(auth)/switchAccount/switchPage');
  };

  const handleLogout = async () => {
    const ok = await confirm({
      type: 'danger',
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
    });
    if (ok) performLogout();
  };

  const performLogout = async () => {
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
    ].filter(Boolean).join(', ');
  };

  const getCurrentProfile = (): Profile | null => {
    if (!profileData) return null;
    const profiles = profileData.current_role_profile;
    if (activeRole === 'client' && profiles.client) return profiles.client;
    if (activeRole === 'mechanic' && profiles.mechanic) return profiles.mechanic;
    if (activeRole === 'shop_owner' && profiles.shop_owner) return profiles.shop_owner;
    return null;
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !profileData) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        </View>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'Failed to load profile'}</ThemedText>
          {error === 'Please login to view your profile' ? (
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.replace('/(auth)/login')}>
              <ThemedText style={styles.retryBtnText}>Go to Login</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.retryBtn} onPress={fetchProfileData}>
              <ThemedText style={styles.retryBtnText}>Retry</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>
    );
  }

  const currentProfile = getCurrentProfile();
  const currentRoleLabel = profileData.available_roles.find(r => r.value === activeRole)?.label || activeRole;

  const settingsItems = [
    { icon: 'heart', label: 'Favorites', route: null },
    { icon: 'cog', label: 'Settings', route: null },
    { icon: 'shield', label: 'Privacy & Security', route: '/client/others/privacysecurity' },
    { icon: 'file-text', label: 'Terms & Regulation', route: null },
    { icon: 'info-circle', label: 'About', route: null },
  ];

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Profile</ThemedText>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <FontAwesome name="refresh" size={16} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Photo */}
          {currentProfile?.profile_photo ? (
            <Image source={{ uri: getImageUrl(currentProfile.profile_photo) || '' }} style={styles.profilePhoto} />
          ) : (
            <View style={styles.profilePhotoPlaceholder}>
              <FontAwesome name="user" size={36} color="#FF8C00" />
            </View>
          )}

          {/* Name & Details */}
          <ThemedText style={styles.userName}>{profileData.full_name}</ThemedText>
          <ThemedText style={styles.userEmail}>{profileData.email}</ThemedText>

          {/* Info Chips */}
          <View style={styles.infoChips}>
            {currentProfile?.contact_number && (
              <View style={styles.chip}>
                <FontAwesome name="phone" size={12} color="#FF8C00" />
                <ThemedText style={styles.chipText}>{currentProfile.contact_number}</ThemedText>
              </View>
            )}
            <View style={styles.chip}>
              <FontAwesome name="id-badge" size={12} color="#FF8C00" />
              <ThemedText style={styles.chipText}>{currentRoleLabel}</ThemedText>
            </View>
            {profileData.is_verified && (
              <View style={[styles.chip, { backgroundColor: '#34C75915' }]}>
                <FontAwesome name="check-circle" size={12} color="#34C759" />
                <ThemedText style={[styles.chipText, { color: '#34C759' }]}>Verified</ThemedText>
              </View>
            )}
          </View>

          {/* Address */}
          <View style={styles.addressRow}>
            <FontAwesome name="map-marker" size={14} color="#8E8E93" />
            <ThemedText style={styles.addressText} numberOfLines={2}>
              {formatAddress(profileData.address)}
            </ThemedText>
          </View>

          {/* Edit Button */}
          <TouchableOpacity style={styles.editBtn} activeOpacity={0.7}>
            <FontAwesome name="pencil" size={14} color="#FF8C00" />
            <ThemedText style={styles.editBtnText}>Edit Profile</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Switch Role */}
        <TouchableOpacity style={styles.switchRoleCard} onPress={handleSwitchRole} activeOpacity={0.7}>
          <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
            <FontAwesome name="exchange" size={16} color="#FF8C00" />
          </View>
          <View style={styles.switchRoleInfo}>
            <ThemedText style={styles.switchRoleTitle}>Switch Role</ThemedText>
            <ThemedText style={styles.switchRoleValue}>{currentRoleLabel}</ThemedText>
          </View>
          <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
        </TouchableOpacity>

        {/* Settings */}
        <View style={styles.settingsCard}>
          {settingsItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.settingRow, index < settingsItems.length - 1 && styles.settingRowBorder]}
              activeOpacity={0.7}
              onPress={() => item.route && router.push(item.route as any)}
            >
              <View style={[styles.sectionIcon, { backgroundColor: '#FF8C0015' }]}>
                <FontAwesome name={item.icon as any} size={16} color="#FF8C00" />
              </View>
              <ThemedText style={styles.settingText}>{item.label}</ThemedText>
              <FontAwesome name="chevron-right" size={14} color="#8E8E93" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <FontAwesome name="sign-out" size={16} color="#FF3B30" />
          <ThemedText style={styles.logoutText}>Log Out</ThemedText>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

