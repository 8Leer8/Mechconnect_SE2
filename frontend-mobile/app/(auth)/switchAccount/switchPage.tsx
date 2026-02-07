import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface RoleStatus {
  isRegistered: boolean;
  isActive: boolean;
}

interface UserRoleData {
  activeRole: string;
  isMechanic: boolean;
  isShopOwner: boolean;
  isClient: boolean;
  availableRoles: { value: string; label: string }[];
}

export default function SwitchRolePage() {
  const [loading, setLoading] = useState(true);
  const [roleData, setRoleData] = useState<UserRoleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoleStatus();
  }, []);

  const fetchRoleStatus = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch role status from the dedicated endpoint
      const response = await fetch(`${API_URL}/users/profile/role-status/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch role status');
      }

      const data = await response.json();

      setRoleData({
        activeRole: data.active_role || 'client',
        isMechanic: data.is_mechanic || false,
        isShopOwner: data.is_shop_owner || false,
        isClient: data.is_client || false,
        availableRoles: data.registered_roles.map((role: string) => ({
          value: role,
          label: role === 'shop_owner' ? 'Shop Owner' : 
                 role.charAt(0).toUpperCase() + role.slice(1)
        })) || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load role information');
      console.error('Error fetching role status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMechanicAction = async () => {
    if (!roleData) return;

    if (!roleData.isMechanic) {
      // Navigate to mechanic registration page
      router.push('/(auth)/switchAccount/mechanicRegister');
    } else {
      // Switch to mechanic role
      await switchRole('mechanic');
    }
  };

  const handleClientAction = async () => {
    if (!roleData) return;
    // All users have client role by default, just switch to it
    await switchRole('client');
  };

  const handleShopOwnerAction = async () => {
    if (!roleData) return;

    if (!roleData.isShopOwner) {
      // Navigate to shop owner registration page
      router.push('/(auth)/register'); // Update this path to your actual shop owner registration route
      Alert.alert('Registration', 'Redirecting to shop owner registration...');
    } else {
      // Switch to shop owner role
      await switchRole('shop_owner');
    }
  };

  const switchRole = async (newRole: string) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/users/profile/switch-role/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        throw new Error('Failed to switch role');
      }

      const data = await response.json();
      Alert.alert('Success', data.message || 'Role switched successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Navigate to appropriate home page based on role
            if (newRole === 'mechanic') {
              router.replace('/(mechanicTabs)/main/home');
            } else if (newRole === 'shop_owner') {
              router.replace('/(shopownerTabs)/main/home');
            } else if (newRole === 'client') {
              router.replace('/(clientTabs)/main/home');
            } else {
              // Default to go back
              router.back();
            }
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to switch role');
      console.error('Error switching role:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRoleButtonText = (role: 'mechanic' | 'shop_owner'): string => {
    if (!roleData) return 'Loading...';
    
    const isRegistered = role === 'mechanic' ? roleData.isMechanic : roleData.isShopOwner;
    const roleLabel = role === 'mechanic' ? 'Mechanic' : 'Shop Owner';
    
    return isRegistered ? `Switch to ${roleLabel}` : `Register as ${roleLabel}`;
  };

  const isRoleActive = (role: string): boolean => {
    return roleData?.activeRole === role;
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <ThemedText style={styles.loadingText}>Loading role information...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={48} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={fetchRoleStatus}>
            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>Switch Role</ThemedText>
          <View style={styles.headerPlaceholder} />
        </View>

        {/* Current Role Info */}
        <View style={styles.currentRoleSection}>
          <ThemedText style={styles.currentRoleLabel}>Current Role</ThemedText>
          <ThemedText style={styles.currentRoleValue}>
            {roleData?.availableRoles.find(r => r.value === roleData.activeRole)?.label || 'Client'}
          </ThemedText>
        </View>

        {/* Role Cards */}
        <View style={styles.rolesContainer}>
          <ThemedText style={styles.sectionTitle}>Available Roles</ThemedText>

          {/* Client Role Card - Only show if not currently client */}
          {!isRoleActive('client') && (
            <TouchableOpacity
              style={styles.roleCard}
              onPress={handleClientAction}
              activeOpacity={0.7}
            >
              <View style={styles.roleCardHeader}>
                <View style={styles.roleIconContainer}>
                  <IconSymbol name="person.fill" size={28} color="#fff" />
                </View>
                <View style={styles.roleInfo}>
                  <ThemedText style={styles.roleTitle}>Client</ThemedText>
                  <ThemedText style={styles.roleSubtitle}>
                    Default role • Available to switch
                  </ThemedText>
                </View>
              </View>

              <View style={styles.roleCardFooter}>
                <View style={styles.actionButton}>
                  <ThemedText style={styles.actionButtonText}>
                    Switch to Client
                  </ThemedText>
                  <IconSymbol 
                    name="arrow.right.circle.fill" 
                    size={20} 
                    color="#007AFF" 
                  />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Mechanic Role Card - Only show if not currently mechanic */}
          {!isRoleActive('mechanic') && (
            <TouchableOpacity
              style={styles.roleCard}
              onPress={handleMechanicAction}
              activeOpacity={0.7}
            >
              <View style={styles.roleCardHeader}>
                <View style={styles.roleIconContainer}>
                  <IconSymbol name="wrench.fill" size={28} color="#fff" />
                </View>
                <View style={styles.roleInfo}>
                  <ThemedText style={styles.roleTitle}>Mechanic</ThemedText>
                  <ThemedText style={styles.roleSubtitle}>
                    {roleData?.isMechanic
                      ? 'Registered • Available to switch'
                      : 'Not registered yet'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.roleCardFooter}>
                <View style={styles.actionButton}>
                  <ThemedText style={styles.actionButtonText}>
                    {getRoleButtonText('mechanic')}
                  </ThemedText>
                  <IconSymbol 
                    name={roleData?.isMechanic ? "arrow.right.circle.fill" : "plus.circle.fill"} 
                    size={20} 
                    color={roleData?.isMechanic ? "#007AFF" : "#34C759"} 
                  />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Shop Owner Role Card - Only show if not currently shop owner */}
          {!isRoleActive('shop_owner') && (
            <TouchableOpacity
              style={styles.roleCard}
              onPress={handleShopOwnerAction}
              activeOpacity={0.7}
            >
              <View style={styles.roleCardHeader}>
                <View style={styles.roleIconContainer}>
                  <IconSymbol name="building.2.fill" size={28} color="#fff" />
                </View>
                <View style={styles.roleInfo}>
                  <ThemedText style={styles.roleTitle}>Shop Owner</ThemedText>
                  <ThemedText style={styles.roleSubtitle}>
                    {roleData?.isShopOwner
                      ? 'Registered • Available to switch'
                      : 'Not registered yet'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.roleCardFooter}>
                <View style={styles.actionButton}>
                  <ThemedText style={styles.actionButtonText}>
                    {getRoleButtonText('shop_owner')}
                  </ThemedText>
                  <IconSymbol 
                    name={roleData?.isShopOwner ? "arrow.right.circle.fill" : "plus.circle.fill"} 
                    size={20} 
                    color={roleData?.isShopOwner ? "#007AFF" : "#34C759"} 
                  />
                </View>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <IconSymbol name="info.circle.fill" size={20} color="#888" />
          <ThemedText style={styles.infoText}>
            You can switch between roles anytime. Register for new roles to access additional features.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#888',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerPlaceholder: {
    width: 40,
  },
  currentRoleSection: {
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  currentRoleLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  currentRoleValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  rolesContainer: {
    paddingHorizontal: 20,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  roleCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  roleCardActive: {
    borderColor: '#34C759',
    backgroundColor: '#1A2E1F',
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  roleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleIconContainerActive: {
    backgroundColor: '#34C759',
  },
  roleInfo: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  roleSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  roleCardFooter: {
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
  },
  actionButtonActive: {
    backgroundColor: '#34C75920',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonTextActive: {
    color: '#34C759',
  },
  activeIndicator: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 20,
    marginTop: 32,
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
});
