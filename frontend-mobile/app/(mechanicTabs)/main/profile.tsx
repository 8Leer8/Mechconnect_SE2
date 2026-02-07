import React, { useState, useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface ProfileData {
  name: string;
  email: string;
  phone?: string;
  bio?: string;
  rating: number;
  completedJobs: number;
  totalEarnings: number;
  profilePhoto?: string;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        setProfile({
          name: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
          email: data.email || '',
          phone: data.phone_number || '',
          bio: data.mechanic?.bio || '',
          rating: data.mechanic?.average_rating || 0,
          completedJobs: 0, // Would come from backend
          totalEarnings: 0, // Would come from backend
          profilePhoto: data.mechanic?.profile_photo || undefined,
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchAccount = () => {
    router.push('/(auth)/switchAccount/switchPage');
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/users/logout/`, {
        method: 'POST',
        credentials: 'include',
      });
      router.replace('/(auth)/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#FF8C00" style={{ marginTop: 100 }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              {profile?.profilePhoto ? (
                <Image source={{ uri: profile.profilePhoto }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <FontAwesome name="user" size={40} color="#8E8E93" />
                </View>
              )}
              <TouchableOpacity style={styles.editAvatarButton}>
                <FontAwesome name="camera" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
            <ThemedText style={styles.name}>{profile?.name || 'Mechanic'}</ThemedText>
            <ThemedText style={styles.email}>{profile?.email}</ThemedText>
            <View style={styles.ratingContainer}>
              <FontAwesome name="star" size={16} color="#FFD60A" />
              <ThemedText style={styles.rating}>{profile?.rating.toFixed(1) || '0.0'}</ThemedText>
              <ThemedText style={styles.ratingLabel}>({profile?.completedJobs || 0} jobs)</ThemedText>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <ThemedText style={styles.statValue}>{profile?.completedJobs || 0}</ThemedText>
            <ThemedText style={styles.statLabel}>Completed</ThemedText>
          </View>
          <View style={[styles.statBox, styles.statBoxMiddle]}>
            <ThemedText style={styles.statValue}>₱{profile?.totalEarnings.toFixed(0) || '0'}</ThemedText>
            <ThemedText style={styles.statLabel}>Earnings</ThemedText>
          </View>
          <View style={styles.statBox}>
            <ThemedText style={styles.statValue}>{profile?.rating.toFixed(1) || '0.0'}</ThemedText>
            <ThemedText style={styles.statLabel}>Rating</ThemedText>
          </View>
        </View>

        {/* Bio */}
        {profile?.bio && (
          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>About</ThemedText>
            <View style={styles.bioCard}>
              <ThemedText style={styles.bioText}>{profile.bio}</ThemedText>
            </View>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.menuItem}>
            <FontAwesome name="user-circle" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Edit Profile</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <FontAwesome name="cog" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Settings</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <FontAwesome name="history" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Work History</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <FontAwesome name="star" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Reviews & Ratings</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <FontAwesome name="dollar" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Earnings & Payments</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleSwitchAccount}>
            <FontAwesome name="exchange" size={20} color="#FF8C00" />
            <ThemedText style={styles.menuText}>Switch Account Role</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <TouchableOpacity style={[styles.menuItem, styles.dangerItem]} onPress={handleLogout}>
            <FontAwesome name="sign-out" size={20} color="#FF3B30" />
            <ThemedText style={[styles.menuText, styles.dangerText]}>Logout</ThemedText>
            <FontAwesome name="chevron-right" size={16} color="#FF3B30" />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  header: {
    backgroundColor: '#1E1E1E',
    paddingTop: 60,
    paddingBottom: 30,
  },
  profileSection: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#FF8C00',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FF8C00',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FF8C00',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1E1E1E',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rating: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  ratingLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statBox: {
    flex: 1,
    paddingVertical: 20,
    alignItems: 'center',
  },
  statBoxMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#2A2A2A',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FF8C00',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  bioCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  bioText: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
  },
  dangerItem: {
    borderColor: '#FF3B30',
  },
  dangerText: {
    color: '#FF3B30',
  },
});
