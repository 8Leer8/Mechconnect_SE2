import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { getImageUrl } from '@/lib/imageUtils';

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

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: performLogout },
    ]);
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
      Alert.alert('Error', err instanceof Error ? err.message : 'Logout failed');
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
    { icon: 'heart', label: 'Favorites' },
    { icon: 'cog', label: 'Settings' },
    { icon: 'shield', label: 'Privacy & Security' },
    { icon: 'file-text', label: 'Terms & Regulation' },
    { icon: 'info-circle', label: 'About' },
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
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Loading / Error
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    marginTop: 4,
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
  // Profile Card
  profileCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  profilePhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: '#FF8C00',
  },
  profilePhotoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 3,
    borderColor: '#FF8C0030',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 14,
  },
  infoChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C0015',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF8C00',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  addressText: {
    fontSize: 13,
    color: '#8E8E93',
    flex: 1,
    lineHeight: 18,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF8C0040',
    backgroundColor: '#FF8C0010',
  },
  editBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF8C00',
  },
  // Switch Role
  switchRoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  switchRoleInfo: {
    flex: 1,
  },
  switchRoleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  switchRoleValue: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  // Settings
  settingsCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2C2E',
  },
  settingText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF3B3015',
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#FF3B3030',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF3B30',
  },
});
