import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '../../style/auth/forgotPasswordStyles';
import { useNotification } from '@/hooks/useNotification';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type ErrorPayload = {
  error?: string;
  message?: string;
  email?: string[];
  reset_token?: string[];
  new_password?: string[];
  password?: string[];
  [key: string]: any;
};

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { showNotification } = useNotification();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [verifiedToken, setVerifiedToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const canSendCode = useMemo(() => !!email.trim() && !sendingCode, [email, sendingCode]);

  const extractErrorMessage = (data: ErrorPayload, fallback: string) => {
    const firstSerializerError =
      data?.email?.[0] ||
      data?.reset_token?.[0] ||
      data?.new_password?.[0] ||
      data?.password?.[0];

    return firstSerializerError || data?.error || data?.message || fallback;
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      showNotification({ type: 'error', message: 'Please enter your Gmail address' });
      return;
    }

    if (!API_URL) {
      showNotification({
        type: 'error',
        title: 'Configuration Error',
        message: 'API URL is not configured. Please check your .env file.',
      });
      return;
    }

    setSendingCode(true);
    try {
      const response = await fetch(`${API_URL}/users/password/reset/request/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json()) as ErrorPayload;

      if (response.ok) {
        setCodeSent(true);
        setStep(2);
        setVerifiedToken('');
        setResetCode('');
        showNotification({
          type: 'success',
          message: 'Reset code sent. Please check your Gmail.',
        });
      } else {
        const msg = extractErrorMessage(data, 'Failed to send reset code');
        if (msg.toLowerCase().includes('no account found')) {
          showNotification({ type: 'error', message: 'This Gmail is not registered' });
        } else {
          showNotification({ type: 'error', message: msg });
        }
      }
    } catch (error) {
      console.error('Send reset code error:', error);
      showNotification({
        type: 'error',
        message: 'Connection failed. Please check your network.',
      });
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!resetCode.trim()) {
      showNotification({ type: 'error', message: 'Please enter the verification code' });
      return;
    }

    if (resetCode.trim().length !== 6) {
      showNotification({ type: 'error', message: 'Verification code must be 6 digits' });
      return;
    }

    if (!API_URL) {
      showNotification({
        type: 'error',
        title: 'Configuration Error',
        message: 'API URL is not configured. Please check your .env file.',
      });
      return;
    }

    setVerifyingCode(true);
    try {
      const response = await fetch(`${API_URL}/users/password/reset/verify/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ reset_token: resetCode.trim() }),
      });

      const data = (await response.json()) as ErrorPayload;

      if (response.ok) {
        setVerifiedToken(resetCode.trim());
        setStep(3);
        showNotification({ type: 'success', message: 'Code verified. Set your new password.' });
      } else {
        const msg = extractErrorMessage(data, 'Invalid or expired verification code');
        showNotification({ type: 'error', message: msg });
      }
    } catch (error) {
      console.error('Verify reset code error:', error);
      showNotification({
        type: 'error',
        message: 'Connection failed. Please check your network.',
      });
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleResetPassword = async () => {
    if (!verifiedToken || !newPassword || !confirmPassword) {
      showNotification({ type: 'error', message: 'Please fill in all reset fields' });
      return;
    }

    if (newPassword !== confirmPassword) {
      showNotification({ type: 'error', message: 'Passwords do not match' });
      return;
    }

    setResettingPassword(true);
    try {
      const response = await fetch(`${API_URL}/users/password/reset/confirm/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          reset_token: verifiedToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = (await response.json()) as ErrorPayload;

      if (response.ok) {
        showNotification({
          type: 'success',
          message: 'Password reset successful. Please login.',
        });
        setStep(1);
        setCodeSent(false);
        setVerifiedToken('');
        setResetCode('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          router.replace('/(auth)/login');
        }, 900);
      } else {
        const msg = extractErrorMessage(data, 'Password reset failed');
        showNotification({ type: 'error', message: msg });
      }
    } catch (error) {
      console.error('Reset password error:', error);
      showNotification({
        type: 'error',
        message: 'Connection failed. Please check your network.',
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const stepTitle = step === 1 ? '1/3 Email' : step === 2 ? '2/3 Verification' : '3/3 New Password';
  const stepSubtitle =
    step === 1
      ? 'Enter your Gmail to receive a reset code.'
      : step === 2
      ? 'Enter the 6-digit verification code from your email.'
      : 'Create and confirm your new password.';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>{stepTitle}</Text>
          <Text style={styles.subtitleSecondary}>{stepSubtitle}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.stepIndicatorRow}>
            <View style={[styles.stepBadge, step >= 1 && styles.stepBadgeActive]}>
              <Text style={[styles.stepBadgeText, step >= 1 && styles.stepBadgeTextActive]}>1</Text>
            </View>
            <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
            <View style={[styles.stepBadge, step >= 2 && styles.stepBadgeActive]}>
              <Text style={[styles.stepBadgeText, step >= 2 && styles.stepBadgeTextActive]}>2</Text>
            </View>
            <View style={[styles.stepLine, step >= 3 && styles.stepLineActive]} />
            <View style={[styles.stepBadge, step >= 3 && styles.stepBadgeActive]}>
              <Text style={[styles.stepBadgeText, step >= 3 && styles.stepBadgeTextActive]}>3</Text>
            </View>
          </View>

          {step === 1 && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Gmail Address</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your Gmail"
                    placeholderTextColor="#8E8E93"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={email}
                    onChangeText={setEmail}
                    editable={!sendingCode && !resettingPassword}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.buttonPrimary, !canSendCode && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={!canSendCode}
              >
                {sendingCode ? (
                  <ActivityIndicator color="#111214" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>{codeSent ? 'Resend Code' : 'Send Code'}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 2 && (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Verification Code</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor="#8E8E93"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={resetCode}
                    onChangeText={setResetCode}
                    editable={!verifyingCode}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.buttonPrimary, verifyingCode && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={verifyingCode}
              >
                {verifyingCode ? (
                  <ActivityIndicator color="#111214" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Verify Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={() => setStep(1)}
                disabled={verifyingCode}
              >
                <Text style={styles.buttonSecondaryText}>Back to Email</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 3 && (
            <>
              <View style={styles.verifiedCodeRow}>
                <Text style={styles.verifiedCodeLabel}>Verified Code</Text>
                <Text style={styles.verifiedCodeValue}>{verifiedToken}</Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new password"
                    placeholderTextColor="#8E8E93"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    editable={!resettingPassword}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowNewPassword((v) => !v)}>
                    <FontAwesome name={showNewPassword ? 'eye-slash' : 'eye'} size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm New Password</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#8E8E93"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    editable={!resettingPassword}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={() => setShowConfirmPassword((v) => !v)}>
                    <FontAwesome name={showConfirmPassword ? 'eye-slash' : 'eye'} size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.buttonPrimary, resettingPassword && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={resettingPassword}
              >
                {resettingPassword ? (
                  <ActivityIndicator color="#111214" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>Reset Password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.buttonSecondary}
                onPress={() => setStep(2)}
                disabled={resettingPassword}
              >
                <Text style={styles.buttonSecondaryText}>Back to Verification</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.backToLogin} onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.backToLoginText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
