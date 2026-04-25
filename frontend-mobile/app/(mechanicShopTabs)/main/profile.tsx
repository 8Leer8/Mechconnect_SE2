import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { SkeletonProfile } from '@/components/skeletons/SkeletonLoaders';
import { useNotification } from '@/hooks/useNotification';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { fetchProfileDetailsCached } from '@/lib/profileCache';
import { useFocusEffect } from '@react-navigation/native';
import { getImageUrl } from '@/lib/imageUtils';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface ProfileData {
  full_name: string;
  email: string;
  username: string;
  current_role_profile: {
    mechanic?: {
      contact_number?: string;
      average_rating: number;
      status: string;
      is_working_for_shop: boolean;
      shop_id: number | null;
      shop_name: string | null;
      profile_photo?: string | null;
      profile_photo_url?: string | null;
    };
  };
}

interface ShopInfo {
  shop_id: number | null;
  shop_name: string | null;
}

export default function MechanicShopProfileScreen() {
  const { showNotification } = useNotification();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [shopInfo, setShopInfo] = useState<ShopInfo>({ shop_id: null, shop_name: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const fetchProfileData = useCallback(async () => {
    try {
      const profile = await fetchProfileDetailsCached(true);
      if (profile) {
        setProfileData(profile as ProfileData);

        // Set shop info from profile
        const mechanicProfile = profile?.current_role_profile?.mechanic;
        if (mechanicProfile?.is_working_for_shop && mechanicProfile.shop_name) {
          setShopInfo({
            shop_id: mechanicProfile.shop_id,
            shop_name: mechanicProfile.shop_name,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
    }, [fetchProfileData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
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
        <View style={styles.pageHeader}>
          <View>
            <ThemedText style={styles.pageTitle}>Profile</ThemedText>
            <ThemedText style={styles.pageSubtitle}>Mechanic shop account</ThemedText>
          </View>
          <TouchableOpacity style={styles.headerRefreshButton} onPress={onRefresh}>
            <FontAwesome name="refresh" size={18} color="#FF8C00" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <SkeletonProfile />
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.pageHeader}>
        <View>
          <ThemedText style={styles.pageTitle}>Profile</ThemedText>
          <ThemedText style={styles.pageSubtitle}>Manage your account details</ThemedText>
        </View>
        <TouchableOpacity style={styles.headerRefreshButton} onPress={onRefresh}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />
        }
      >
        {/* Profile Header */}
        <View style={styles.header}>
          {profileData?.current_role_profile?.mechanic?.profile_photo || profileData?.current_role_profile?.mechanic?.profile_photo_url ? (
            <Image
              source={{
                uri:
                  getImageUrl(
                    profileData.current_role_profile.mechanic.profile_photo ||
                      profileData.current_role_profile.mechanic.profile_photo_url ||
                      ''
                  ) ||
                  profileData.current_role_profile.mechanic.profile_photo ||
                  profileData.current_role_profile.mechanic.profile_photo_url ||
                  undefined,
              }}
              style={{ width: 72, height: 72, borderRadius: 36, marginBottom: 12 }}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <FontAwesome name="user" size={36} color="#8E8E93" />
            </View>
          )}
          <ThemedText style={styles.name}>{profileData?.full_name || 'Mechanic'}</ThemedText>
          <ThemedText style={styles.subtitle}>@{profileData?.username || 'username'}</ThemedText>
          
          {/* Shop Badge */}
          {shopInfo.shop_name && (
            <View style={styles.shopBadge}>
              <FontAwesome name="building" size={14} color="#FF8C00" />
              <ThemedText style={styles.shopBadgeText}>{shopInfo.shop_name}</ThemedText>
            </View>
          )}
        </View>

        {/* Profile Info */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Profile Information</ThemedText>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <FontAwesome name="envelope" size={16} color="#8E8E93" />
              <View style={styles.infoContent}>
                <ThemedText style={styles.infoLabel}>Email</ThemedText>
                <ThemedText style={styles.infoValue}>{profileData?.email || 'N/A'}</ThemedText>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <FontAwesome name="star" size={16} color="#FFD700" />
              <View style={styles.infoContent}>
                <ThemedText style={styles.infoLabel}>Rating</ThemedText>
                <ThemedText style={styles.infoValue}>
                  {Number(profileData?.current_role_profile?.mechanic?.average_rating || 0).toFixed(1)} / 5.0
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* Shop Information */}
        {shopInfo.shop_name && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Shop Information</ThemedText>
            <View style={styles.shopCard}>
              <FontAwesome name="building" size={28} color="#FF8C00" />
              <View style={styles.shopCardInfo}>
                <ThemedText style={styles.shopCardTitle}>{shopInfo.shop_name}</ThemedText>
                <ThemedText style={styles.shopCardSubtitle}>Current workplace</ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => router.push('/mechanic/others/edit-profile')}
          >
            <FontAwesome name="pencil" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Edit Profile</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => router.push('/(auth)/switchAccount/switchPage')}
          >
            <FontAwesome name="exchange" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Switch Role</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => router.push('/mechanic/others/privacy')}
          >
            <FontAwesome name="shield" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Privacy & Security</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => router.push('/mechanic/others/terms')}
          >
            <FontAwesome name="file-text" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Terms & Regulation</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem} 
            onPress={() => router.push('/mechanic/others/about')}
          >
            <FontAwesome name="info-circle" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>About</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.menuItem, styles.logoutItem]} 
            onPress={handleLogout}
          >
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerRefreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 12,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#242628',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FF8C00',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  shopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginTop: 8,
  },
  shopBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF8C00',
    marginLeft: 8,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2C2E',
    marginVertical: 8,
  },
  shopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  shopCardInfo: {
    marginLeft: 16,
    flex: 1,
  },
  shopCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  shopCardSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1C1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginLeft: 12,
  },
  logoutItem: {
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  logoutText: {
    color: '#FF3B30',
  },
});
