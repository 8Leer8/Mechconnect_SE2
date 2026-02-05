import React, { useState, useEffect } from 'react';
import { 
  View, 
  ScrollView, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { TopNav } from '@/components/navigation';
import { styles } from '../../../style/client/profileStyles';

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
          <ActivityIndicator size="large" color="#FF8C00" />
          <ThemedText style={styles.loadingText}>Loading profile...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error || !profileData) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={60} color="#FF4500" />
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
                <FontAwesome name="user" size={36} color="#FF8C00" />
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
            <FontAwesome name="exchange" size={22} color="#FF8C00" />
            <ThemedText style={styles.switchRoleText}>Switch Role</ThemedText>
          </View>
          <View style={styles.switchRoleRight}>
            <ThemedText style={styles.switchRoleValue}>{currentRoleLabel}</ThemedText>
            <FontAwesome name="chevron-right" size={18} color="#999" />
          </View>
        </TouchableOpacity>

        {/* Settings List */}
        <View style={styles.settingsSection}>
          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <FontAwesome name="heart" size={22} color="#FF8C00" />
              <ThemedText style={styles.settingText}>Favorites</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <FontAwesome name="cog" size={22} color="#FF8C00" />
              <ThemedText style={styles.settingText}>Settings</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <FontAwesome name="shield" size={22} color="#FF8C00" />
              <ThemedText style={styles.settingText}>Privacy & Security</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <FontAwesome name="file-text" size={22} color="#FF8C00" />
              <ThemedText style={styles.settingText}>Terms & Regulation</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={18} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <FontAwesome name="info-circle" size={22} color="#FF8C00" />
              <ThemedText style={styles.settingText}>About</ThemedText>
            </View>
            <FontAwesome name="chevron-right" size={18} color="#999" />
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
