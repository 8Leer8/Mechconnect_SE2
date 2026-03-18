import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { useNotification } from '@/hooks/useNotification';
import { useFocusEffect } from '@react-navigation/native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface UserRoleData {
  activeRole: string;
  isMechanic: boolean;
  isShopOwner: boolean;
  isClient: boolean;
  mechanicVerificationStatus: VerificationStatus;
  shopOwnerVerificationStatus: VerificationStatus;
  mechanicRejectionNote: string | null;
  shopOwnerRejectionNote: string | null;
  canSwitchMechanic: boolean;
  canSwitchShopOwner: boolean;
  pendingApprovals: string[];
  availableRoles: { value: string; label: string }[];
}

type VerificationStatus = 'pending' | 'approved' | 'rejected' | null;

interface RoleStatusResponse {
  active_role: string;
  is_mechanic: boolean;
  is_shop_owner: boolean;
  is_client: boolean;
  mechanic_verification_status?: VerificationStatus;
  shop_owner_verification_status?: VerificationStatus;
  mechanic_rejection_note?: string | null;
  shop_owner_rejection_note?: string | null;
  can_switch_mechanic?: boolean;
  can_switch_shop_owner?: boolean;
  pending_approvals?: string[];
  registered_roles: string[];
}

interface SwitchRoleResponse {
  error?: string;
  message?: string;
  [key: string]: unknown;
}

type RoleValue = 'client' | 'mechanic' | 'shop_owner';

interface RoleVisual {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  accent: string;
}

const ROLE_VISUALS: Record<RoleValue, RoleVisual> = {
  client: { label: 'Client', icon: 'user', accent: '#5E9CFF' },
  mechanic: { label: 'Mechanic', icon: 'wrench', accent: '#FF8C00' },
  shop_owner: { label: 'Shop Owner', icon: 'building', accent: '#3ECF8E' },
};

export default function SwitchRolePage() {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [switchingRole, setSwitchingRole] = useState<RoleValue | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingRole, setPendingRole] = useState<RoleValue | null>(null);
  const [reasonVisible, setReasonVisible] = useState(false);
  const [reasonRole, setReasonRole] = useState<'mechanic' | 'shop_owner' | null>(null);
  const [roleData, setRoleData] = useState<UserRoleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRoleStatus = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      // Fetch role status from the dedicated endpoint
      const response = await fetch(`${API_URL}/users/profile/role-status/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch role status');
      }

      const data = await response.json() as RoleStatusResponse;

      setRoleData({
        activeRole: data.active_role || 'client',
        isMechanic: data.is_mechanic || false,
        isShopOwner: data.is_shop_owner || false,
        isClient: data.is_client || false,
        mechanicVerificationStatus: data.mechanic_verification_status || null,
        shopOwnerVerificationStatus: data.shop_owner_verification_status || null,
        mechanicRejectionNote: data.mechanic_rejection_note || null,
        shopOwnerRejectionNote: data.shop_owner_rejection_note || null,
        canSwitchMechanic: Boolean(data.can_switch_mechanic),
        canSwitchShopOwner: Boolean(data.can_switch_shop_owner),
        pendingApprovals: data.pending_approvals || [],
        availableRoles: data.registered_roles.map((role: string) => ({
          value: role,
          label: role === 'shop_owner' ? 'Shop Owner' : 
                 role.charAt(0).toUpperCase() + role.slice(1)
        })) || [],
      });
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load role information');
      }
      console.error('Error fetching role status:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchRoleStatus();

      const intervalId = setInterval(() => {
        fetchRoleStatus(true);
      }, 5000);

      return () => {
        clearInterval(intervalId);
      };
    }, [fetchRoleStatus])
  );

  const handleMechanicAction = async () => {
    if (!roleData) return;

    if (!roleData.isMechanic) {
      // Navigate to mechanic registration page
      router.push('/(auth)/switchAccount/mechanicRegister');
      return;
    }

    if (!roleData.canSwitchMechanic) {
      if (roleData.mechanicVerificationStatus === 'pending') {
        showNotification({
          type: 'warning',
          title: 'Pending Approval',
          message: 'Your mechanic application is still waiting for admin approval.',
        });
      } else if (roleData.mechanicVerificationStatus === 'rejected') {
        openReasonModal('mechanic');
      }
      return;
    }

    openSwitchConfirm('mechanic');
  };

  const handleClientAction = async () => {
    if (!roleData) return;
    openSwitchConfirm('client');
  };

  const handleShopOwnerAction = async () => {
    if (!roleData) return;

    if (!roleData.isShopOwner) {
      // Navigate to shop owner registration page
      router.push('/(auth)/switchAccount/shopOwnerRegister');
      return;
    }

    if (!roleData.canSwitchShopOwner) {
      if (roleData.shopOwnerVerificationStatus === 'pending') {
        showNotification({
          type: 'warning',
          title: 'Pending Approval',
          message: 'Your shop owner application is still waiting for admin approval.',
        });
      } else if (roleData.shopOwnerVerificationStatus === 'rejected') {
        openReasonModal('shop_owner');
      }
      return;
    }

    openSwitchConfirm('shop_owner');
  };

  const openSwitchConfirm = (role: RoleValue) => {
    setPendingRole(role);
    setConfirmVisible(true);
  };

  const openReasonModal = (role: 'mechanic' | 'shop_owner') => {
    setReasonRole(role);
    setReasonVisible(true);
  };

  const closeSwitchConfirm = () => {
    if (switchingRole) return;
    setConfirmVisible(false);
    setPendingRole(null);
  };

  const closeReasonModal = () => {
    setReasonVisible(false);
    setReasonRole(null);
  };

  const handleRegisterAgain = () => {
    const role = reasonRole;
    closeReasonModal();
    if (role === 'mechanic') {
      router.push('/(auth)/switchAccount/mechanicRegister');
      return;
    }
    if (role === 'shop_owner') {
      router.push('/(auth)/switchAccount/shopOwnerRegister');
    }
  };

  const getReasonText = () => {
    if (!roleData || !reasonRole) return 'No rejection reason provided by admin.';
    if (reasonRole === 'mechanic') {
      return roleData.mechanicRejectionNote || 'No rejection reason provided by admin.';
    }
    return roleData.shopOwnerRejectionNote || 'No rejection reason provided by admin.';
  };

  const confirmSwitchRole = async () => {
    if (!pendingRole) return;
    await switchRole(pendingRole);
  };

  const switchRole = async (newRole: RoleValue) => {
    try {
      setSwitchingRole(newRole);
      const response = await fetch(`${API_URL}/users/profile/switch-role/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to switch role';
        try {
          const errorData = await response.json() as SwitchRoleResponse;
          if (typeof errorData.error === 'string' && errorData.error.trim()) {
            errorMessage = errorData.error;
          }
        } catch {
          // Fallback to generic message when response body is not JSON.
        }
        throw new Error(errorMessage);
      }

      const data = await response.json() as SwitchRoleResponse;
      
      // For mechanic role, check if they're working for a shop
      let mechanicRoute = '/(mechanicTabs)/main/home';
      if (newRole === 'mechanic') {
        try {
          const profileResponse = await fetch(`${API_URL}/users/profile/details/`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          });

          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            const mechanicProfile = profileData.profile?.current_role_profile?.mechanic;
            
            if (mechanicProfile?.is_working_for_shop) {
              mechanicRoute = '/(mechanicShopTabs)/main/home';
            }
          }
        } catch (profileError) {
          console.error('Error fetching profile for shop check:', profileError);
          // Fallback to regular mechanic tabs if error
        }
      }
      
      showNotification({ type: 'success', message: data.message || 'Role switched successfully!' });
      setConfirmVisible(false);
      setPendingRole(null);

      // Navigate to appropriate home page based on role
      if (newRole === 'mechanic') {
        router.replace(mechanicRoute as any);
      } else if (newRole === 'shop_owner') {
        router.replace('/(shopownerTabs)/main/home');
      } else if (newRole === 'client') {
        router.replace('/(clientTabs)/main/home');
      } else {
        router.back();
      }
    } catch (err) {
      showNotification({ type: 'error', message: err instanceof Error ? err.message : 'Failed to switch role' });
      console.error('Error switching role:', err);
    } finally {
      setSwitchingRole(null);
    }
  };

  const isRoleActive = (role: string): boolean => {
    return roleData?.activeRole === role;
  };

  const getCurrentRoleLabel = (): string => {
    const activeRole = roleData?.activeRole as RoleValue | undefined;
    if (!activeRole) return 'Client';
    return ROLE_VISUALS[activeRole]?.label || 'Client';
  };

  const getCurrentRoleVisual = (): RoleVisual => {
    const activeRole = roleData?.activeRole as RoleValue | undefined;
    return ROLE_VISUALS[activeRole || 'client'];
  };

  const handleBackToProfile = async () => {
    let activeRole = roleData?.activeRole as RoleValue | undefined;

    try {
      const roleStatusResponse = await fetch(`${API_URL}/users/profile/role-status/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (roleStatusResponse.ok) {
        const roleStatusData = await roleStatusResponse.json() as RoleStatusResponse;
        if (roleStatusData.active_role) {
          activeRole = roleStatusData.active_role as RoleValue;
        }
      }
    } catch (err) {
      console.error('Failed to resolve active role for back navigation:', err);
    }

    if (activeRole === 'mechanic') {
      let profileRoute: string = '/(mechanicTabs)/main/profile';
      try {
        const response = await fetch(`${API_URL}/users/profile/details/`, {
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          const isWorkingForShop = Boolean(data?.profile?.current_role_profile?.mechanic?.is_working_for_shop);
          if (isWorkingForShop) {
            profileRoute = '/(mechanicShopTabs)/main/profile';
          }
        }
      } catch (err) {
        console.error('Failed to resolve mechanic profile route:', err);
      }

      router.replace(profileRoute as any);
      return;
    }

    if (activeRole === 'shop_owner') {
      router.replace('/(shopownerTabs)/profile');
      return;
    }

    router.replace('/(clientTabs)/main/profile');
  };

  const renderRoleCard = (
    role: RoleValue,
    options: {
      isRegistered: boolean;
      onPress: () => void;
      subtitle: string;
      actionText: string;
      badgeLabel?: string;
      badgeColor?: string;
      disableAction?: boolean;
    }
  ) => {
    const roleVisual = ROLE_VISUALS[role];
    const isBusy = Boolean(switchingRole);
    const isDisabled = isBusy || Boolean(options.disableAction);

    return (
      <TouchableOpacity
        key={role}
        style={styles.roleCard}
        onPress={options.onPress}
        activeOpacity={0.9}
        disabled={isDisabled}
      >
        <View style={styles.roleCardHeader}>
          <View style={[styles.roleIconContainer, { backgroundColor: `${roleVisual.accent}1F` }]}> 
            <FontAwesome name={roleVisual.icon} size={20} color={roleVisual.accent} />
          </View>
          <View style={styles.roleInfo}>
            <ThemedText style={styles.roleTitle}>{roleVisual.label}</ThemedText>
            <ThemedText style={styles.roleSubtitle}>{options.subtitle}</ThemedText>
          </View>
          <View style={styles.badgeWrap}>
            <ThemedText style={[styles.badgeText, { color: options.badgeColor || (options.isRegistered ? '#34C759' : '#FF8C00') }]}>
              {options.badgeLabel || (options.isRegistered ? 'Registered' : 'Setup required')}
            </ThemedText>
          </View>
        </View>

        <View style={styles.roleCardFooter}>
          <View style={[styles.actionButton, options.disableAction && styles.actionButtonDisabled]}>
            <ThemedText style={[styles.actionButtonText, options.disableAction && styles.actionButtonTextDisabled]}>{options.actionText}</ThemedText>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF8C00" />
          <ThemedText style={styles.loadingText}>Loading role information...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <FontAwesome name="exclamation-triangle" size={42} color="#FF3B30" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchRoleStatus()}>
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
          <TouchableOpacity onPress={handleBackToProfile} style={styles.backButton}>
            <FontAwesome name="chevron-left" size={20} color="#ECEDEE" />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <ThemedText style={styles.headerTitle}>Switch Role</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Choose how you want to use the app</ThemedText>
          </View>
        </View>

        {/* Current Role Info */}
        <View style={styles.currentRoleSection}>
          <ThemedText style={styles.currentRoleLabel}>Current active role</ThemedText>
          <View style={styles.currentRoleRow}>
            <View style={[styles.currentRoleIcon, { backgroundColor: `${getCurrentRoleVisual().accent}1F` }]}> 
              <FontAwesome name={getCurrentRoleVisual().icon} size={18} color={getCurrentRoleVisual().accent} />
            </View>
            <View>
              <ThemedText style={styles.currentRoleValue}>{getCurrentRoleLabel()}</ThemedText>
              <ThemedText style={styles.currentRoleHint}>You can switch roles anytime</ThemedText>
            </View>
          </View>
        </View>

        {!!roleData?.pendingApprovals?.length && (
          <View style={styles.pendingApprovalCard}>
            <FontAwesome name="clock-o" size={16} color="#FF8C00" />
            <ThemedText style={styles.pendingApprovalText}>
              Waiting for admin approval: {roleData.pendingApprovals.map((role) => role.replace('_', ' ')).join(', ')}
            </ThemedText>
          </View>
        )}

        {/* Role Cards */}
        <View style={styles.rolesContainer}>
          <ThemedText style={styles.sectionTitle}>Available Roles</ThemedText>

          {/* Client Role Card - Only show if not currently client */}
          {!isRoleActive('client') && (
            renderRoleCard('client', {
              isRegistered: true,
              onPress: handleClientAction,
              subtitle: 'Default role for booking and tracking services',
              actionText: 'Switch to Client',
              badgeLabel: 'Available',
              badgeColor: '#34C759',
            })
          )}

          {/* Mechanic Role Card - Only show if not currently mechanic */}
          {!isRoleActive('mechanic') && (
            renderRoleCard('mechanic', {
              isRegistered: Boolean(roleData?.isMechanic),
              onPress: handleMechanicAction,
              subtitle: !roleData?.isMechanic
                ? 'Register first to enable mechanic features'
                : roleData.mechanicVerificationStatus === 'pending'
                  ? 'Application submitted. Waiting for admin approval'
                  : roleData.mechanicVerificationStatus === 'rejected'
                    ? 'Application rejected. Tap to view reason'
                    : 'Approved and ready for mechanic tools',
              actionText: !roleData?.isMechanic
                ? 'Register as Mechanic'
                : roleData.mechanicVerificationStatus === 'pending'
                  ? 'Waiting for Admin Approval'
                  : roleData.mechanicVerificationStatus === 'rejected'
                    ? 'View Reason'
                    : 'Switch to Mechanic',
              badgeLabel: !roleData?.isMechanic
                ? 'Setup required'
                : roleData.mechanicVerificationStatus === 'pending'
                  ? 'Pending Approval'
                  : roleData.mechanicVerificationStatus === 'rejected'
                    ? 'Rejected'
                    : 'Verified',
              badgeColor: !roleData?.isMechanic
                ? '#FF8C00'
                : roleData.mechanicVerificationStatus === 'pending'
                  ? '#FF8C00'
                  : roleData.mechanicVerificationStatus === 'rejected'
                    ? '#FF3B30'
                    : '#34C759',
              disableAction: Boolean(roleData?.isMechanic && roleData?.mechanicVerificationStatus === 'pending'),
            })
          )}

          {/* Shop Owner Role Card - Only show if not currently shop owner */}
          {!isRoleActive('shop_owner') && (
            renderRoleCard('shop_owner', {
              isRegistered: Boolean(roleData?.isShopOwner),
              onPress: handleShopOwnerAction,
              subtitle: !roleData?.isShopOwner
                ? 'Register your shop owner account first'
                : roleData.shopOwnerVerificationStatus === 'pending'
                  ? 'Application submitted. Waiting for admin approval'
                  : roleData.shopOwnerVerificationStatus === 'rejected'
                    ? 'Application rejected. Tap to view reason'
                    : 'Approved and ready for business tools',
              actionText: !roleData?.isShopOwner
                ? 'Register as Shop Owner'
                : roleData.shopOwnerVerificationStatus === 'pending'
                  ? 'Waiting for Admin Approval'
                  : roleData.shopOwnerVerificationStatus === 'rejected'
                    ? 'View Reason'
                    : 'Switch to Shop Owner',
              badgeLabel: !roleData?.isShopOwner
                ? 'Setup required'
                : roleData.shopOwnerVerificationStatus === 'pending'
                  ? 'Pending Approval'
                  : roleData.shopOwnerVerificationStatus === 'rejected'
                    ? 'Rejected'
                    : 'Verified',
              badgeColor: !roleData?.isShopOwner
                ? '#FF8C00'
                : roleData.shopOwnerVerificationStatus === 'pending'
                  ? '#FF8C00'
                  : roleData.shopOwnerVerificationStatus === 'rejected'
                    ? '#FF3B30'
                    : '#34C759',
              disableAction: Boolean(roleData?.isShopOwner && roleData?.shopOwnerVerificationStatus === 'pending'),
            })
          )}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <FontAwesome name="shield" size={16} color="#FF8C00" />
          <ThemedText style={styles.infoText}>
            Switching roles updates your home dashboard and permissions immediately.
          </ThemedText>
        </View>
      </ScrollView>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSwitchConfirm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIconWrap, { backgroundColor: pendingRole ? `${ROLE_VISUALS[pendingRole].accent}1F` : '#FF8C001F' }]}>
              <FontAwesome
                name={pendingRole ? ROLE_VISUALS[pendingRole].icon : 'exchange'}
                size={18}
                color={pendingRole ? ROLE_VISUALS[pendingRole].accent : '#FF8C00'}
              />
            </View>
            <ThemedText style={styles.confirmTitle}>Confirm Role Switch</ThemedText>
            <ThemedText style={styles.confirmMessage}>
              Switch to {pendingRole ? ROLE_VISUALS[pendingRole].label : 'this role'} now?
            </ThemedText>

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeSwitchConfirm}
                disabled={Boolean(switchingRole)}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, Boolean(switchingRole) && styles.confirmButtonDisabled]}
                onPress={confirmSwitchRole}
                disabled={Boolean(switchingRole)}
              >
                {switchingRole ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.confirmButtonText}>Switch Role</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reasonVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReasonModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIconWrap, { backgroundColor: '#FF3B301A' }]}>
              <FontAwesome name="info-circle" size={18} color="#FF3B30" />
            </View>
            <ThemedText style={styles.confirmTitle}>Application Rejected</ThemedText>
            <ThemedText style={styles.confirmMessage}>Reason from admin:</ThemedText>
            <View style={styles.reasonBodyCard}>
              <ThemedText style={styles.reasonBodyText}>{getReasonText()}</ThemedText>
            </View>

            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeReasonModal}
              >
                <ThemedText style={styles.cancelButtonText}>Close</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleRegisterAgain}
              >
                <ThemedText style={styles.confirmButtonText}>Register Again</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  scrollContent: {
    paddingBottom: 42,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 14,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 18,
  },
  backButton: {
    position: 'absolute',
    left: 20,
    top: 60,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  headerTextWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#8E8E93',
  },
  currentRoleSection: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  currentRoleLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
  },
  currentRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentRoleIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  currentRoleValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  currentRoleHint: {
    marginTop: 2,
    fontSize: 13,
    color: '#8E8E93',
  },
  rolesContainer: {
    paddingHorizontal: 20,
  },
  pendingApprovalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A2D1F',
  },
  pendingApprovalText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: '#D7B58E',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 14,
  },
  roleCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    position: 'relative',
    marginBottom: 12,
  },
  roleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  roleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleInfo: {
    flex: 1,
    marginLeft: 12,
  },
  roleTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 3,
  },
  roleSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  badgeWrap: {
    backgroundColor: '#202224',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  roleCardFooter: {
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: '#232527',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F3133',
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  actionButtonTextDisabled: {
    color: '#A0A4AA',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 20,
    marginTop: 18,
    padding: 16,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginLeft: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000A6',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  confirmCard: {
    width: '100%',
    backgroundColor: '#17191B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 18,
    alignItems: 'center',
  },
  confirmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ECEDEE',
  },
  confirmMessage: {
    marginTop: 8,
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  reasonBodyCard: {
    width: '100%',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#202224',
  },
  reasonBodyText: {
    fontSize: 13,
    color: '#C8CDD2',
    lineHeight: 19,
    textAlign: 'left',
  },
  confirmButtonsRow: {
    width: '100%',
    flexDirection: 'row',
    marginTop: 18,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#252729',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F3133',
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.7,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
