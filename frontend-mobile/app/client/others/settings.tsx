import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNotification } from '@/hooks/useNotification';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const RESEND_COOLDOWN_SECONDS = 60;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SettingsApiError = {
  error?: string;
  message?: string;
  blockers?: Array<{ role?: string; code?: string; message?: string }>;
  current_password?: string[];
  old_password?: string[];
  new_password?: string[];
  confirm_password?: string[];
  password?: string[];
  new_email?: string[];
  non_field_errors?: string[];
  requires_reactivation_confirmation?: boolean;
  reactivate_by?: string;
  [key: string]: any;
};

type FlowStep = 'password' | 'email' | 'otp' | 'done';
type DeactivationStep = 'password' | 'email' | 'otp';
type SettingsViewMode = 'menu' | 'change-email' | 'change-password' | 'deactivate-account';

const stepOrder: FlowStep[] = ['password', 'email', 'otp', 'done'];

export default function SettingsScreen() {
  const { showNotification } = useNotification();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';

  const palette = {
    pageBg: isDark ? '#0F1112' : '#F4F5F7',
    surface: isDark ? '#1B1E20' : '#FFFFFF',
    surfaceMuted: isDark ? '#16191B' : '#F7F8FA',
    border: isDark ? '#2A2E31' : '#ECECEC',
    textPrimary: isDark ? '#ECEDEE' : '#111214',
    textSecondary: isDark ? '#A8ADB3' : '#666A70',
    textMuted: isDark ? '#9298A0' : '#757A83',
    inputBg: isDark ? '#121416' : '#FAFAFA',
    inputBorder: isDark ? '#34393D' : '#DDDFE3',
    inputText: isDark ? '#ECEDEE' : '#111214',
    backButtonBg: isDark ? '#33271A' : '#FFF4E9',
    optionIconPrimaryBg: isDark ? '#3A2A17' : '#FFF2E3',
    optionIconMutedBg: isDark ? '#252A2F' : '#ECEEF2',
    chevron: isDark ? '#808791' : '#A1A4AA',
    iconMuted: isDark ? '#8A9098' : '#8E8E93',
    wipBg: isDark ? '#2A2F35' : '#ECEEF2',
    wipText: isDark ? '#BAC0C8' : '#6C7078',
    stepBase: isDark ? '#2F3438' : '#ECECEC',
    secondaryBtnBg: isDark ? '#2E2418' : '#FFF4E9',
    secondaryBtnBorder: isDark ? '#5E4630' : '#FFD5A6',
    secondaryBtnText: isDark ? '#FFCA8A' : '#A55500',
    doneIconBg: isDark ? '#1E3123' : '#ECF9EF',
  };

  const [viewMode, setViewMode] = useState<SettingsViewMode>('menu');
  const [step, setStep] = useState<FlowStep>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordEmail, setPasswordEmail] = useState('');
  const [passwordOtpCode, setPasswordOtpCode] = useState('');
  const [passwordEmailVerified, setPasswordEmailVerified] = useState(false);
  const [deactivationModalVisible, setDeactivationModalVisible] = useState(false);
  const [deactivationStep, setDeactivationStep] = useState<DeactivationStep>('password');
  const [deactivationPassword, setDeactivationPassword] = useState('');
  const [deactivationOtpCode, setDeactivationOtpCode] = useState('');
  const [deactivationEmail, setDeactivationEmail] = useState('');
  const [deactivationBlockers, setDeactivationBlockers] = useState<string[]>([]);

  const [passwordVerified, setPasswordVerified] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [updatedEmail, setUpdatedEmail] = useState<string | null>(null);

  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [sendingPasswordVerification, setSendingPasswordVerification] = useState(false);
  const [verifyingPasswordOtp, setVerifyingPasswordOtp] = useState(false);
  const [loadingPasswordEmail, setLoadingPasswordEmail] = useState(false);
  const [verifyingDeactivationPassword, setVerifyingDeactivationPassword] = useState(false);
  const [requestingDeactivationCode, setRequestingDeactivationCode] = useState(false);
  const [confirmingDeactivation, setConfirmingDeactivation] = useState(false);

  const [resendCountdown, setResendCountdown] = useState(0);
  const [passwordResendCountdown, setPasswordResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  useEffect(() => {
    if (passwordResendCountdown <= 0) return;
    const timer = setInterval(() => {
      setPasswordResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [passwordResendCountdown]);

  const isBusy =
    verifyingPassword ||
    sendingOtp ||
    verifyingOtp ||
    updatingEmail ||
    changingPassword ||
    sendingPasswordVerification ||
    verifyingPasswordOtp ||
    loadingPasswordEmail ||
    verifyingDeactivationPassword ||
    requestingDeactivationCode ||
    confirmingDeactivation;

  const canVerifyPassword = useMemo(() => {
    return currentPassword.trim().length > 0 && !isBusy;
  }, [currentPassword, isBusy]);

  const canSendOtp = useMemo(() => {
    return emailPattern.test(newEmail.trim()) && !isBusy;
  }, [newEmail, isBusy]);

  const canVerifyOtp = useMemo(() => {
    return otpCode.trim().length === 6 && !isBusy;
  }, [otpCode, isBusy]);

  const canUpdateEmail = useMemo(() => {
    return passwordVerified && otpVerified && !isBusy;
  }, [passwordVerified, otpVerified, isBusy]);

  const canChangePassword = useMemo(() => {
    return (
      passwordEmailVerified &&
      oldPassword.trim().length > 0 &&
      newPassword.trim().length >= 8 &&
      confirmPassword.trim().length >= 8 &&
      !isBusy
    );
  }, [passwordEmailVerified, oldPassword, newPassword, confirmPassword, isBusy]);

  const canVerifyPasswordOtp = useMemo(() => {
    return passwordOtpCode.trim().length === 6 && !isBusy;
  }, [passwordOtpCode, isBusy]);

  const canContinueDeactivation = useMemo(() => {
    return deactivationPassword.trim().length > 0 && !isBusy;
  }, [deactivationPassword, isBusy]);

  const canRequestDeactivationCode = useMemo(() => {
    return deactivationPassword.trim().length > 0 && !isBusy;
  }, [deactivationPassword, isBusy]);

  const canConfirmDeactivation = useMemo(() => {
    return deactivationOtpCode.trim().length === 6 && !isBusy;
  }, [deactivationOtpCode, isBusy]);

  const extractErrorMessage = (data: SettingsApiError, fallback: string) => {
    return (
      data?.current_password?.[0] ||
      data?.old_password?.[0] ||
      data?.new_password?.[0] ||
      data?.confirm_password?.[0] ||
      data?.password?.[0] ||
      data?.new_email?.[0] ||
      data?.non_field_errors?.[0] ||
      data?.blockers?.[0]?.message ||
      data?.error ||
      data?.message ||
      fallback
    );
  };

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });

  const ensureApiUrl = () => {
    if (API_URL) return true;
    showNotification({
      type: 'error',
      title: 'Configuration Error',
      message: 'API URL is not configured.',
    });
    return false;
  };

  const resetDeactivateFlow = () => {
    setDeactivationStep('password');
    setDeactivationPassword('');
    setDeactivationOtpCode('');
    setDeactivationEmail('');
    setDeactivationBlockers([]);
    setDeactivationModalVisible(false);
  };

  const startDeactivateFlow = () => {
    resetDeactivateFlow();
    setDeactivationModalVisible(true);
  };

  const handleVerifyPassword = async () => {
    if (!ensureApiUrl()) return;
    if (!currentPassword.trim()) {
      showNotification({ type: 'error', message: 'Please enter your current password.' });
      return;
    }

    setVerifyingPassword(true);
    try {
      const response = await fetch(`${API_URL}/users/profile/verify-password/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ current_password: currentPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Password verification failed.'),
        });
        return;
      }

      setPasswordVerified(true);
      setStep('email');
      showNotification({ type: 'success', message: 'Password verified. Continue to change email.' });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleSendOtp = async () => {
    if (!ensureApiUrl()) return;
    const normalizedEmail = newEmail.trim().toLowerCase();

    if (!emailPattern.test(normalizedEmail)) {
      showNotification({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setSendingOtp(true);
    try {
      const response = await fetch(`${API_URL}/users/send-verification-code/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Failed to send verification code.'),
        });
        return;
      }

      setOtpCode('');
      setOtpVerified(false);
      setNewEmail(normalizedEmail);
      setResendCountdown(RESEND_COOLDOWN_SECONDS);
      setStep('otp');
      showNotification({ type: 'success', message: 'Verification code sent to your new email.' });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!ensureApiUrl()) return;
    const code = otpCode.trim();

    if (code.length !== 6) {
      showNotification({ type: 'error', message: 'Please enter the 6-digit OTP code.' });
      return;
    }

    setVerifyingOtp(true);
    try {
      const response = await fetch(`${API_URL}/users/verify-code/`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ email: newEmail.trim().toLowerCase(), code }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Invalid or expired OTP code.'),
        });
        return;
      }

      setOtpVerified(true);
      showNotification({ type: 'success', message: 'New email verified. You can now update it.' });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!ensureApiUrl()) return;
    if (!canUpdateEmail) return;

    setUpdatingEmail(true);
    try {
      const response = await fetch(`${API_URL}/users/profile/change-email/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          current_password: currentPassword,
          new_email: newEmail.trim().toLowerCase(),
          update_shop_email: true,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Failed to update email.'),
        });
        return;
      }

      const account = (data as any)?.account;
      const savedEmail = typeof account?.email === 'string' ? account.email : newEmail.trim().toLowerCase();
      setUpdatedEmail(savedEmail);
      setStep('done');
      showNotification({ type: 'success', message: 'Email updated successfully.' });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCountdown > 0 || sendingOtp) return;
    await handleSendOtp();
  };

  const handleChangePassword = async () => {
    if (!ensureApiUrl()) return;

    if (!passwordEmailVerified) {
      showNotification({ type: 'error', message: 'Please verify using Gmail first.' });
      return;
    }

    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      showNotification({ type: 'error', message: 'Please complete all password fields.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch(`${API_URL}/users/password/change/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Failed to change password.'),
        });
        return;
      }

      resetChangePasswordFlow();
      setViewMode('menu');
      showNotification({
        type: 'success',
        message: (data as any)?.message || 'Password changed successfully. Please log in again.',
      });

      router.replace('/(auth)/login');
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setChangingPassword(false);
    }
  };

  const loadPasswordEmail = async () => {
    if (!ensureApiUrl()) return;

    setLoadingPasswordEmail(true);
    try {
      const response = await fetch(`${API_URL}/users/profile/details/`, {
        method: 'GET',
        credentials: 'include',
        headers: getHeaders(),
      });

      const data = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Failed to load account email.'),
        });
        return;
      }

      const email = typeof data?.profile?.email === 'string' ? data.profile.email.trim().toLowerCase() : '';
      if (!email) {
        showNotification({ type: 'error', message: 'No account email found for verification.' });
        return;
      }

      setPasswordEmail(email);
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setLoadingPasswordEmail(false);
    }
  };

  const handleSendPasswordVerification = async () => {
    if (!ensureApiUrl()) return;
    if (!passwordEmail) {
      showNotification({ type: 'error', message: 'Unable to load account email for verification.' });
      return;
    }

    setSendingPasswordVerification(true);
    try {
      const response = await fetch(`${API_URL}/users/password/change/verify-gmail/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Failed to send Gmail verification.'),
        });
        return;
      }

      setPasswordOtpCode('');
      setPasswordEmailVerified(false);
      setPasswordResendCountdown(RESEND_COOLDOWN_SECONDS);
      showNotification({
        type: 'success',
        message: (data as any)?.message || 'Verification code sent to your Gmail.',
      });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setSendingPasswordVerification(false);
    }
  };

  const handleVerifyPasswordGmailCode = async () => {
    if (!ensureApiUrl()) return;

    const code = passwordOtpCode.trim();
    if (code.length !== 6) {
      showNotification({ type: 'error', message: 'Please enter the 6-digit verification code.' });
      return;
    }

    setVerifyingPasswordOtp(true);
    try {
      const response = await fetch(`${API_URL}/users/password/change/verify-gmail/confirm/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ code }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Invalid or expired verification code.'),
        });
        return;
      }

      setPasswordEmailVerified(true);
      showNotification({ type: 'success', message: 'Gmail verification completed. You can now change password.' });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setVerifyingPasswordOtp(false);
    }
  };

  const handleRequestDeactivationCode = async () => {
    if (!ensureApiUrl()) return;

    if (!deactivationPassword.trim()) {
      showNotification({ type: 'error', message: 'Please enter your password to continue.' });
      return;
    }

    setDeactivationBlockers([]);
    setRequestingDeactivationCode(true);
    try {
      const response = await fetch(`${API_URL}/users/profile/deactivate/request/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ current_password: deactivationPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        const blockerMessages = Array.isArray(data.blockers)
          ? data.blockers.map((item) => item?.message).filter(Boolean) as string[]
          : [];
        if (blockerMessages.length > 0) {
          setDeactivationBlockers(blockerMessages);
        }
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Unable to send the deactivation verification code.'),
        });
        return;
      }

      setDeactivationEmail(typeof data?.email === 'string' ? data.email : '');
      setDeactivationOtpCode('');
      setDeactivationStep('otp');
      setDeactivationBlockers([]);
      showNotification({
        type: 'success',
        message: (data as any)?.message || 'Verification code sent to your email.',
      });
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setRequestingDeactivationCode(false);
    }
  };

  const handleVerifyDeactivationPassword = async () => {
    if (!ensureApiUrl()) return;

    if (!deactivationPassword.trim()) {
      showNotification({ type: 'error', message: 'Please enter your current password.' });
      return;
    }

    setVerifyingDeactivationPassword(true);
    try {
      const response = await fetch(`${API_URL}/users/profile/verify-password/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ current_password: deactivationPassword }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Incorrect password.'),
        });
        return;
      }

      setDeactivationStep('email');
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setVerifyingDeactivationPassword(false);
    }
  };

  const handleConfirmAccountDeactivation = async () => {
    if (!ensureApiUrl()) return;

    const code = deactivationOtpCode.trim();
    if (code.length !== 6) {
      showNotification({ type: 'error', message: 'Please enter the 6-digit code sent to your email.' });
      return;
    }

    setConfirmingDeactivation(true);
    try {
      const response = await fetch(`${API_URL}/users/profile/deactivate/confirm/`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          current_password: deactivationPassword,
          code,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as SettingsApiError;

      if (!response.ok) {
        showNotification({
          type: 'error',
          message: extractErrorMessage(data, 'Unable to deactivate your account.'),
        });
        return;
      }

      try {
        await AsyncStorage.multiRemove(['auth_token', 'account_id']);
      } catch {
        // Ignore local storage cleanup failures and continue to login.
      }

      resetDeactivateFlow();
      setViewMode('menu');
      showNotification({
        type: 'success',
        message: (data as any)?.message || 'Account deactivated successfully.',
      });
      router.replace('/(auth)/login');
    } catch {
      showNotification({ type: 'error', message: 'Connection failed. Please check your network.' });
    } finally {
      setConfirmingDeactivation(false);
    }
  };

  const resetChangeEmailFlow = () => {
    setStep('password');
    setCurrentPassword('');
    setNewEmail('');
    setOtpCode('');
    setPasswordVerified(false);
    setOtpVerified(false);
    setUpdatedEmail(null);
    setResendCountdown(0);
  };

  const resetChangePasswordFlow = () => {
    setPasswordEmail('');
    setPasswordOtpCode('');
    setPasswordEmailVerified(false);
    setPasswordResendCountdown(0);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const startChangeEmail = () => {
    resetChangeEmailFlow();
    setViewMode('change-email');
  };

  const startChangePassword = () => {
    resetChangePasswordFlow();
    setViewMode('change-password');
    void loadPasswordEmail();
  };

  const goBackStep = () => {
    if (viewMode === 'menu') {
      router.back();
      return;
    }

    if (viewMode === 'deactivate-account') {
      if (!isBusy) {
        setViewMode('menu');
        resetDeactivateFlow();
      }
      return;
    }

    if (viewMode === 'change-password') {
      if (!isBusy) {
        setViewMode('menu');
        resetChangePasswordFlow();
      }
      return;
    }

    const idx = stepOrder.indexOf(step);
    if (idx <= 0) {
      setViewMode('menu');
      resetChangeEmailFlow();
      return;
    }

    if (step === 'done') {
      setViewMode('menu');
      resetChangeEmailFlow();
      return;
    }

    setStep(stepOrder[idx - 1]);
  };

  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const rem = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${rem}`;
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: palette.pageBg }]}>
      <View style={[styles.header, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}> 
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: palette.backButtonBg }]}
          onPress={goBackStep}
          disabled={isBusy}
        >
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={[styles.headerTitle, { color: palette.textPrimary }]}>Settings</ThemedText>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {viewMode === 'menu' ? (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>Account Settings</Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}> 
                Manage account-level actions below.
              </Text>

              <TouchableOpacity
                style={[styles.optionCard, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={startChangeEmail}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIconWrap, styles.optionIconPrimary, { backgroundColor: palette.optionIconPrimaryBg }]}> 
                  <FontAwesome name="envelope" size={15} color="#FF8C00" />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionTitle, { color: palette.textPrimary }]}>Change Email</Text>
                  <Text style={[styles.optionDescription, { color: palette.textMuted }]}>Update your account email with OTP verification.</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={palette.chevron} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionCard, { borderColor: palette.border, backgroundColor: palette.surface }]}
                onPress={startChangePassword}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIconWrap, styles.optionIconPrimary, { backgroundColor: palette.optionIconPrimaryBg }]}> 
                  <FontAwesome name="lock" size={15} color="#FF8C00" />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionTitle, { color: palette.textPrimary }]}>Change Password</Text>
                  <Text style={[styles.optionDescription, { color: palette.textMuted }]}>Update your password using your current credentials.</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={palette.chevron} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.optionCard,
                  styles.optionCardDanger,
                  { borderColor: '#FF3B3030', backgroundColor: palette.surfaceMuted },
                ]}
                onPress={startDeactivateFlow}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIconWrap, styles.optionIconDanger, { backgroundColor: '#FF3B3015' }]}> 
                  <FontAwesome name="power-off" size={15} color="#FF3B30" />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionTitle, styles.optionTitleDanger, { color: '#FF3B30' }]}>Deactivate Account</Text>
                  <Text style={[styles.optionDescription, { color: palette.textMuted }]}>Hide your account and keep a 30-day reactivation window.</Text>
                </View>
                <View style={[styles.wipBadge, { backgroundColor: '#FF3B3015' }]}> 
                  <Text style={[styles.wipBadgeText, { color: '#FF3B30' }]}>Danger</Text>
                </View>
              </TouchableOpacity>
            </>
          ) : viewMode === 'change-email' ? (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>Change Email</Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}> 
                For security, verify your password first, verify the new email using OTP, then update your account email.
              </Text>

              <View style={styles.stepRow}>
                <StepDot label="1" active={step === 'password'} done={passwordVerified} baseColor={palette.stepBase} />
                <StepLine color={palette.stepBase} />
                <StepDot label="2" active={step === 'email'} done={step === 'otp' || step === 'done'} baseColor={palette.stepBase} />
                <StepLine color={palette.stepBase} />
                <StepDot label="3" active={step === 'otp'} done={otpVerified || step === 'done'} baseColor={palette.stepBase} />
                <StepLine color={palette.stepBase} />
                <StepDot label="4" active={step === 'done'} done={step === 'done'} baseColor={palette.stepBase} />
              </View>

              {step === 'password' && (
                <View style={styles.section}>
                  <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Step 1: Verify Password</ThemedText>
                  <TextInput
                    style={[styles.input, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg, color: palette.inputText }]}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder="Enter current password"
                    placeholderTextColor="#8E8E93"
                    editable={!isBusy}
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, !canVerifyPassword && styles.disabledButton]}
                    onPress={handleVerifyPassword}
                    disabled={!canVerifyPassword}
                  >
                    {verifyingPassword ? <ActivityIndicator color="#111214" /> : <Text style={[styles.primaryButtonText, { color: palette.textPrimary }]}>Continue</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {step === 'email' && (
                <View style={styles.section}>
                  <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Step 2: Enter New Email</ThemedText>
                  <TextInput
                    style={[styles.input, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg, color: palette.inputText }]}
                    value={newEmail}
                    onChangeText={(text) => {
                      setNewEmail(text);
                      setOtpVerified(false);
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="Enter new email"
                    placeholderTextColor="#8E8E93"
                    editable={!isBusy}
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, !canSendOtp && styles.disabledButton]}
                    onPress={handleSendOtp}
                    disabled={!canSendOtp}
                  >
                    {sendingOtp ? <ActivityIndicator color="#111214" /> : <Text style={[styles.primaryButtonText, { color: palette.textPrimary }]}>Send OTP</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {step === 'otp' && (
                <View style={styles.section}>
                  <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Step 3: Verify OTP</ThemedText>
                  <ThemedText style={[styles.metaText, { color: palette.textSecondary }]}>Code sent to {newEmail}</ThemedText>
                  <TextInput
                    style={[styles.input, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg, color: palette.inputText }]}
                    value={otpCode}
                    onChangeText={setOtpCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor="#8E8E93"
                    editable={!isBusy}
                  />

                  <TouchableOpacity
                    style={[styles.primaryButton, !canVerifyOtp && styles.disabledButton]}
                    onPress={handleVerifyOtp}
                    disabled={!canVerifyOtp}
                  >
                    {verifyingOtp ? <ActivityIndicator color="#111214" /> : <Text style={[styles.primaryButtonText, { color: palette.textPrimary }]}>Verify OTP</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.secondaryButton,
                      { backgroundColor: palette.secondaryBtnBg, borderColor: palette.secondaryBtnBorder },
                      resendCountdown > 0 && styles.disabledButton,
                    ]}
                    onPress={handleResendOtp}
                    disabled={resendCountdown > 0 || isBusy}
                  >
                    <Text style={[styles.secondaryButtonText, { color: palette.secondaryBtnText }]}> 
                      {resendCountdown > 0 ? `Resend in ${formatCountdown(resendCountdown)}` : 'Resend OTP'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.successButton, !canUpdateEmail && styles.disabledButton]}
                    onPress={handleUpdateEmail}
                    disabled={!canUpdateEmail}
                  >
                    {updatingEmail ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.successButtonText}>Update Email</Text>}
                  </TouchableOpacity>
                </View>
              )}

              {step === 'done' && (
                <View style={styles.section}>
                  <View style={[styles.doneIconWrap, { backgroundColor: palette.doneIconBg }]}> 
                    <FontAwesome name="check" size={20} color="#34C759" />
                  </View>
                  <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Email Updated</ThemedText>
                  <ThemedText style={[styles.metaText, { color: palette.textSecondary }]}>{updatedEmail || newEmail}</ThemedText>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={() => {
                      setViewMode('menu');
                      resetChangeEmailFlow();
                    }}
                  >
                    <Text style={[styles.primaryButtonText, { color: palette.textPrimary }]}>Back to Settings</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : viewMode === 'deactivate-account' ? (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>Deactivate Account</Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}> 
                Your account will be hidden immediately. You can reactivate it by logging back in within 30 days, otherwise it will be deleted permanently.
              </Text>

              {deactivationBlockers.length > 0 ? (
                <View style={[styles.deactivationWarningBox, { backgroundColor: isDark ? '#2A1515' : '#FFF2F2', borderColor: '#FF3B3030' }]}>
                  <Text style={[styles.deactivationWarningTitle, { color: '#FF3B30' }]}>Resolve these first</Text>
                  {deactivationBlockers.map((item) => (
                    <View key={item} style={styles.deactivationWarningRow}>
                      <FontAwesome name="exclamation-circle" size={13} color="#FF3B30" />
                      <Text style={[styles.deactivationWarningText, { color: palette.textPrimary }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.section}>
                {deactivationStep === 'password' ? (
                  <>
                    <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Step 1: Confirm Password</ThemedText>
                    <TextInput
                      style={[styles.input, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg, color: palette.inputText }]}
                      value={deactivationPassword}
                      onChangeText={setDeactivationPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholder="Enter current password"
                      placeholderTextColor="#8E8E93"
                      editable={!isBusy}
                    />
                    <TouchableOpacity
                      style={[styles.primaryButton, !canContinueDeactivation && styles.disabledButton]}
                      onPress={handleVerifyDeactivationPassword}
                      disabled={!canContinueDeactivation}
                    >
                      {verifyingDeactivationPassword ? (
                        <ActivityIndicator color="#111214" />
                      ) : (
                        <Text style={[styles.primaryButtonText, { color: palette.textPrimary }]}>Continue</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : deactivationStep === 'email' ? (
                  <>
                    <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Step 2: Send Verification Code</ThemedText>
                    <ThemedText style={[styles.metaText, { color: palette.textSecondary }]}>We’ll send a code to {deactivationEmail || 'your registered email'}.</ThemedText>
                    <TouchableOpacity
                      style={[styles.primaryButton, styles.dangerButton, !canRequestDeactivationCode && styles.disabledButton]}
                      onPress={handleRequestDeactivationCode}
                      disabled={!canRequestDeactivationCode}
                    >
                      {requestingDeactivationCode ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.primaryButtonText, styles.dangerButtonText]}>Send Verification Code</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Step 3: Verify Email Code</ThemedText>
                    <ThemedText style={[styles.metaText, { color: palette.textSecondary }]}>Code sent to {deactivationEmail || 'your registered email'}</ThemedText>
                    <TextInput
                      style={[styles.input, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg, color: palette.inputText }]}
                      value={deactivationOtpCode}
                      onChangeText={setDeactivationOtpCode}
                      keyboardType="number-pad"
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      placeholderTextColor="#8E8E93"
                      editable={!isBusy}
                    />
                    <TouchableOpacity
                      style={[styles.successButton, styles.dangerButton, !canConfirmDeactivation && styles.disabledButton]}
                      onPress={handleConfirmAccountDeactivation}
                      disabled={!canConfirmDeactivation}
                    >
                      {confirmingDeactivation ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.successButtonText, styles.dangerButtonText]}>Deactivate Account</Text>}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: palette.secondaryBtnBg, borderColor: palette.secondaryBtnBorder }]}
                  onPress={() => {
                    if (!isBusy) {
                      setViewMode('menu');
                      resetDeactivateFlow();
                    }
                  }}
                  disabled={isBusy}
                >
                  <Text style={[styles.secondaryButtonText, { color: palette.secondaryBtnText }]}>Back to Settings</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: palette.textPrimary }]}>Change Password</Text>
              <Text style={[styles.subtitle, { color: palette.textSecondary }]}> 
                Verify using Gmail first. Once verified, you can change your password.
              </Text>

              <View style={styles.section}>
                <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Verify using Gmail</ThemedText>
                <ThemedText style={[styles.metaText, { color: palette.textSecondary }]}> 
                  {loadingPasswordEmail
                    ? 'Loading your account email...'
                    : passwordEmail
                      ? `Code will be sent to ${passwordEmail}`
                      : 'Unable to load account email'}
                </ThemedText>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (!passwordEmail || loadingPasswordEmail || isBusy || passwordResendCountdown > 0) && styles.disabledButton,
                  ]}
                  onPress={handleSendPasswordVerification}
                  disabled={!passwordEmail || loadingPasswordEmail || isBusy || passwordResendCountdown > 0}
                >
                  {sendingPasswordVerification ? (
                    <ActivityIndicator color="#111214" />
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: palette.textPrimary }]}>
                      {passwordResendCountdown > 0 ? `Resend in ${formatCountdown(passwordResendCountdown)}` : 'Verify using Gmail'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TextInput
                  style={[styles.input, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg, color: palette.inputText, marginTop: 10 }]}
                  value={passwordOtpCode}
                  onChangeText={setPasswordOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Enter 6-digit Gmail code"
                  placeholderTextColor="#8E8E93"
                  editable={!isBusy && !passwordEmailVerified}
                />

                <TouchableOpacity
                  style={[styles.secondaryButton, !canVerifyPasswordOtp && styles.disabledButton]}
                  onPress={handleVerifyPasswordGmailCode}
                  disabled={!canVerifyPasswordOtp || passwordEmailVerified}
                >
                  {verifyingPasswordOtp ? (
                    <ActivityIndicator color="#A55500" />
                  ) : (
                    <Text style={[styles.secondaryButtonText, { color: palette.secondaryBtnText }]}>
                      {passwordEmailVerified ? 'Gmail Verified' : 'Confirm Gmail Verification'}
                    </Text>
                  )}
                </TouchableOpacity>

                {passwordEmailVerified && (
                  <>
                    <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Current Password</ThemedText>
                    <View style={[styles.passwordInputWrap, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg }]}>
                      <TextInput
                        style={[styles.passwordInput, { color: palette.inputText }]}
                        value={oldPassword}
                        onChangeText={setOldPassword}
                        secureTextEntry={!showOldPassword}
                        autoCapitalize="none"
                        placeholder="Enter current password"
                        placeholderTextColor="#8E8E93"
                        editable={!isBusy}
                      />
                      <TouchableOpacity
                        style={styles.passwordToggle}
                        onPress={() => setShowOldPassword((prev) => !prev)}
                        disabled={isBusy}
                      >
                        <FontAwesome
                          name={showOldPassword ? 'eye-slash' : 'eye'}
                          size={16}
                          color={palette.iconMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>New Password</ThemedText>
                    <View style={[styles.passwordInputWrap, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg }]}>
                      <TextInput
                        style={[styles.passwordInput, { color: palette.inputText }]}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry={!showNewPassword}
                        autoCapitalize="none"
                        placeholder="Enter new password"
                        placeholderTextColor="#8E8E93"
                        editable={!isBusy}
                      />
                      <TouchableOpacity
                        style={styles.passwordToggle}
                        onPress={() => setShowNewPassword((prev) => !prev)}
                        disabled={isBusy}
                      >
                        <FontAwesome
                          name={showNewPassword ? 'eye-slash' : 'eye'}
                          size={16}
                          color={palette.iconMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    <ThemedText style={[styles.metaText, { color: palette.textSecondary }]}>At least 8 characters with uppercase, lowercase, and a number.</ThemedText>

                    <ThemedText style={[styles.sectionTitle, { color: palette.textPrimary }]}>Confirm New Password</ThemedText>
                    <View style={[styles.passwordInputWrap, { borderColor: palette.inputBorder, backgroundColor: palette.inputBg }]}>
                      <TextInput
                        style={[styles.passwordInput, { color: palette.inputText }]}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                        autoCapitalize="none"
                        placeholder="Confirm new password"
                        placeholderTextColor="#8E8E93"
                        editable={!isBusy}
                      />
                      <TouchableOpacity
                        style={styles.passwordToggle}
                        onPress={() => setShowConfirmPassword((prev) => !prev)}
                        disabled={isBusy}
                      >
                        <FontAwesome
                          name={showConfirmPassword ? 'eye-slash' : 'eye'}
                          size={16}
                          color={palette.iconMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={[styles.successButton, !canChangePassword && styles.disabledButton]}
                      onPress={handleChangePassword}
                      disabled={!canChangePassword}
                    >
                      {changingPassword ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.successButtonText}>Change Password</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmationModal
        visible={deactivationModalVisible}
        type="danger"
        title="Deactivate Account"
        message="Are you sure you want to deactivate? Your account will be hidden but can be reactivated by logging back in. If you do not log back in within 30 days, the account will be permanently deleted."
        confirmText="Continue"
        cancelText="Cancel"
        onCancel={() => {
          if (!requestingDeactivationCode && !confirmingDeactivation) {
            resetDeactivateFlow();
            setViewMode('menu');
          }
        }}
        onConfirm={() => {
          setDeactivationModalVisible(false);
          setViewMode('deactivate-account');
        }}
      />
    </ThemedView>
  );
}

function StepDot({
  label,
  active,
  done,
  baseColor,
}: {
  label: string;
  active: boolean;
  done: boolean;
  baseColor: string;
}) {
  return (
    <View style={[styles.stepDot, { backgroundColor: baseColor }, active && styles.stepDotActive, done && styles.stepDotDone]}>
      <ThemedText style={[styles.stepDotText, (active || done) && styles.stepDotTextActive]}>{label}</ThemedText>
    </View>
  );
}

function StepLine({ color }: { color: string }) {
  return <View style={[styles.stepLine, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 58,
    paddingBottom: 14,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4E9',
  },
  backButtonPlaceholder: {
    width: 32,
    height: 32,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111214',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111214',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: '#666A70',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ECECEC',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
  },
  optionCardMuted: {
    backgroundColor: '#F7F8FA',
  },
  optionCardDanger: {
    borderColor: '#FF3B3030',
    backgroundColor: '#FFF6F6',
  },
  optionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  optionIconPrimary: {
    backgroundColor: '#FFF2E3',
  },
  optionIconMuted: {
    backgroundColor: '#ECEEF2',
  },
  optionIconDanger: {
    backgroundColor: '#FF3B3015',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111214',
  },
  optionTitleMuted: {
    color: '#5A5E66',
  },
  optionTitleDanger: {
    fontWeight: '700',
  },
  optionDescription: {
    marginTop: 2,
    fontSize: 12,
    color: '#757A83',
  },
  wipBadge: {
    backgroundColor: '#ECEEF2',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  wipBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6C7078',
  },
  deactivationWarningBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
  },
  deactivationWarningTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  deactivationWarningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  deactivationWarningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECECEC',
  },
  stepDotActive: {
    backgroundColor: '#FF8C00',
  },
  stepDotDone: {
    backgroundColor: '#34C759',
  },
  stepDotText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7A7E85',
  },
  stepDotTextActive: {
    color: '#FFFFFF',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#ECECEC',
    marginHorizontal: 6,
  },
  section: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111214',
    marginBottom: 10,
  },
  metaText: {
    fontSize: 13,
    color: '#666A70',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDDFE3',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111214',
    marginBottom: 10,
  },
  passwordInputWrap: {
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    marginBottom: 10,
    position: 'relative',
  },
  passwordInput: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingRight: 42,
    fontSize: 15,
    color: '#111214',
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#FFB347',
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  primaryButtonText: {
    color: '#111214',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#FFF4E9',
    minHeight: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFD5A6',
  },
  secondaryButtonText: {
    color: '#A55500',
    fontSize: 14,
    fontWeight: '600',
  },
  successButton: {
    backgroundColor: '#34C759',
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
    borderColor: '#FF3B30',
  },
  dangerButtonText: {
    color: '#FFFFFF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  doneIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECF9EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
});
