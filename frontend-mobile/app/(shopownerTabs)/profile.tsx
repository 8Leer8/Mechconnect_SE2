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

export default function ShopOwnerProfileScreen() {
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('shop_owner');

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
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Manage your shop owner account</ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF9500" />
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
          <ThemedText style={styles.headerSubtitle}>Manage your shop owner account</ThemedText>
        </View>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error || 'Failed to load profile'}</ThemedText>
          {error === 'Please login to view your profile' ? (
            <TouchableOpacity
              style={styles.actionButton}
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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF9500" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>Profile</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Shop Owner</ThemedText>
        </View>

        {/* Top Card */}
        <View style={styles.topCard}>
          <View style={styles.avatarWrapper}>
            {currentProfile?.profile_photo ? (
              <Image source={{ uri: currentProfile.profile_photo }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <FontAwesome name="user" size={32} color="#999" />
              </View>
            )}
            {profileData.is_verified && (
              <View style={styles.verifiedBadge}>
                <FontAwesome name="check" size={10} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.topCardText}>
            <ThemedText style={styles.name}>{profileData.full_name || `${profileData.firstname} ${profileData.lastname}`}</ThemedText>
            <ThemedText style={styles.username}>@{profileData.username}</ThemedText>
            <ThemedText style={styles.email}>{profileData.email}</ThemedText>
            <View style={styles.rolePill}>
              <FontAwesome name="briefcase" size={12} color="#FF9500" />
              <ThemedText style={styles.rolePillText}>{roleLabel(activeRole)}</ThemedText>
            </View>
          </View>
        </View>

        {/* Info Sections */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Contact</ThemedText>
          </View>
          <View style={styles.sectionBody}>
            <View style={styles.row}>
              <FontAwesome name="phone" size={14} color="#888" />
              <ThemedText style={styles.rowText}>
                {currentProfile?.contact_number || 'No contact number set'}
              </ThemedText>
            </View>
            <View style={styles.row}>
              <FontAwesome name="envelope" size={14} color="#888" />
              <ThemedText style={styles.rowText}>{profileData.email}</ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Address</ThemedText>
          </View>
          <View style={styles.sectionBody}>
            <View style={styles.row}>
              <FontAwesome name="map-marker" size={16} color="#888" />
              <ThemedText style={styles.rowText}>{formatAddress(profileData.address)}</ThemedText>
            </View>
          </View>
        </View>

        {currentProfile?.bio ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>About</ThemedText>
            </View>
            <View style={styles.sectionBody}>
              <ThemedText style={styles.bioText}>{currentProfile.bio}</ThemedText>
            </View>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Account</ThemedText>
          </View>
          <View style={styles.sectionBody}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleSwitchRole}
              activeOpacity={0.8}
            >
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#FF950018' }]}>
                  <FontAwesome name="exchange" size={16} color="#FF9500" />
                </View>
                <View>
                  <ThemedText style={styles.menuTitle}>Switch Role</ThemedText>
                  <ThemedText style={styles.menuSubtitle}>
                    Change between client, mechanic, and shop owner
                  </ThemedText>
                </View>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#555" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.logoutItem]}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <View style={styles.menuLeft}>
                <View style={[styles.menuIcon, { backgroundColor: '#FF3B3018' }]}>
                  <FontAwesome name="sign-out" size={16} color="#FF3B30" />
                </View>
                <View>
                  <ThemedText style={[styles.menuTitle, { color: '#FF3B30' }]}>
                    Logout
                  </ThemedText>
                  <ThemedText style={styles.menuSubtitle}>
                    Sign out from this account
                  </ThemedText>
                </View>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#555" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
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
});

