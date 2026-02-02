import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  Alert,
  Text
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopNav } from '@/components/navigation';

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

export default function ProfileScreen() {
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<string>('client');

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
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
      
      const data = await response.json();
      setProfileData(data.profile);

      // Fetch active role
      const roleResponse = await fetch(`${API_URL}/users/profile/active-role/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (roleResponse.ok) {
        const roleData = await roleResponse.json();
        setActiveRole(roleData.active_role || 'client');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching profile data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchRole = () => {
    // Navigate to the switch role page
    router.push('/(auth)/switchAccount/switchPage');
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  const performLogout = async () => {
    try {
      const response = await fetch(`${API_URL}/users/logout/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        // Navigate to login screen
        router.replace('/(auth)/login');
      } else {
        throw new Error('Logout failed');
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Logout failed');
      console.error('Error logging out:', err);
    }
  };

  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  const formatAddress = (address?: Address): string => {
    if (!address) return 'No address provided';
    
    const parts = [
      address.house_building_number,
      address.street_name,
      address.subdivision_village,
      address.barangay,
      address.city_municipality,
      address.province,
      address.region,
    ].filter(Boolean);
    
    return parts.join(', ');
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0a7ea4" />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !profileData) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle" size={60} color="#f44336" />
          <ThemedText style={styles.errorText}>
            {error || 'Failed to load profile'}
          </ThemedText>
          {error === 'Please login to view your profile' ? (
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={() => {
                router.replace('/(auth)/login');
              }}
            >
              <ThemedText style={styles.retryButtonText}>Go to Login</ThemedText>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={fetchProfileData}
            >
              <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ThemedView>
    );
  }

  const currentProfile = getCurrentProfile();
  const currentRoleLabel = profileData.available_roles.find(r => r.value === activeRole)?.label || activeRole;

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>

        {/* Profile Header Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            {/* Profile Photo */}
            {currentProfile?.profile_photo ? (
              <Image 
                source={{ uri: currentProfile.profile_photo }} 
                style={styles.profilePhoto}
              />
            ) : (
              <View style={styles.profilePhotoPlaceholder}>
                <IconSymbol name="person.fill" size={36} color="#888" />
              </View>
            )}

            {/* User Info */}
            <View style={styles.userInfo}>
              <ThemedText style={styles.userName}>{profileData.full_name}</ThemedText>
              <ThemedText style={styles.userEmail}>{profileData.email}</ThemedText>
              <ThemedText style={styles.userPhone}>
                {currentProfile?.contact_number || 'No phone number'}
              </ThemedText>
              <ThemedText style={styles.userAddress} numberOfLines={2}>
                {formatAddress(profileData.address)}
              </ThemedText>
            </View>
          </View>

          {/* Edit Profile Button */}
          <TouchableOpacity style={styles.editButton}>
            <ThemedText style={styles.editButtonText}>Edit Profile</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Switch Role Button */}
        <TouchableOpacity 
          style={styles.switchRoleButton}
          onPress={handleSwitchRole}
        >
          <View style={styles.switchRoleLeft}>
            <IconSymbol name="arrow.2.squarepath" size={22} color="#fff" />
            <ThemedText style={styles.switchRoleText}>Switch Role</ThemedText>
          </View>
          <View style={styles.switchRoleRight}>
            <ThemedText style={styles.switchRoleValue}>{currentRoleLabel}</ThemedText>
            <IconSymbol name="chevron.right" size={18} color="#888" />
          </View>
        </TouchableOpacity>

        {/* Settings List */}
        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <IconSymbol name="heart.fill" size={22} color="#fff" />
              <ThemedText style={styles.settingText}>Favorites</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <IconSymbol name="gearshape.fill" size={22} color="#fff" />
              <ThemedText style={styles.settingText}>Settings</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <IconSymbol name="shield.fill" size={22} color="#fff" />
              <ThemedText style={styles.settingText}>Privacy & Security</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <IconSymbol name="doc.text.fill" size={22} color="#fff" />
              <ThemedText style={styles.settingText}>Terms & Regulation</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color="#888" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <IconSymbol name="info.circle.fill" size={22} color="#fff" />
              <ThemedText style={styles.settingText}>About</ThemedText>
            </View>
            <IconSymbol name="chevron.right" size={18} color="#888" />
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity 
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <ThemedText style={styles.logoutButtonText}>Log Out</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Bottom Padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: 'bold',
  },
  profileCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 20,
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
  },
  profileRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  profilePhoto: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  profilePhotoPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 2,
  },
  userPhone: {
    fontSize: 13,
    opacity: 0.6,
    marginBottom: 2,
  },
  userAddress: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 4,
  },
  editButton: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  switchRoleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1f1f1f',
    marginTop: 8,
    borderRadius: 12,
  },
  switchRoleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  switchRoleText: {
    fontSize: 16,
  },
  switchRoleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchRoleValue: {
    fontSize: 14,
    opacity: 0.6,
  },
  settingsSection: {
    marginTop: 8,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1f1f1f',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  settingText: {
    fontSize: 16,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    fontSize: 14,
    opacity: 0.6,
  },
  logoutContainer: {
    padding: 16,
    marginTop: 8,
  },
  logoutButton: {
    backgroundColor: '#f44336',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});
