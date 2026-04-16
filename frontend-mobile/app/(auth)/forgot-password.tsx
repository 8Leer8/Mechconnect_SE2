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
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Toast from '@/components/gen/Toast';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Theme ────────────────────────────────────────────────────────────────────
const ORANGE  = '#F97316';
const BG      = '#121212';
const SURFACE = '#1E1E1E';
const BORDER  = '#2C2C2C';
const TEXT    = '#F5F5F5';
const MUTED   = '#9A9A9A';

const STAGE_LABELS: Record<number, string> = {
  1: '1/3 Email',
  2: '2/3 Verification',
  3: '3/3 New Password',
};

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

  // ── Toast (replaces useNotification) ──────────────────────────────────────
  const [toast, setToast] = useState({ visible: false, message: '' });
  const showToast = (msg: string) => setToast({ visible: true, message: msg });
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  // ── Step state ─────────────────────────────────────────────────────────────
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

  // ── Error extractor ────────────────────────────────────────────────────────
  const extractErrorMessage = (data: ErrorPayload, fallback: string) => {
    const firstSerializerError =
      data?.email?.[0] ||
      data?.reset_token?.[0] ||
      data?.new_password?.[0] ||
      data?.password?.[0];
    return firstSerializerError || data?.error || data?.message || fallback;
  };

  // ── Stage 1: Send code ─────────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (!email.trim()) {
      showToast('Please enter your Gmail address.');
      return;
    }
    if (!API_URL) {
      showToast('API URL is not configured. Please check your .env file.');
      return;
    }

    setSendingCode(true);
    try {
      const response = await fetch(`${API_URL}/users/password/reset/request/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = (await response.json()) as ErrorPayload;

      if (response.ok) {
        setCodeSent(true);
        setStep(2);
        setVerifiedToken('');
        setResetCode('');
        showToast('Reset code sent. Please check your Gmail.');
      } else {
        const msg = extractErrorMessage(data, 'Failed to send reset code.');
        showToast(msg.toLowerCase().includes('no account found') ? 'This Gmail is not registered.' : msg);
      }
    } catch (error) {
      console.error('Send reset code error:', error);
      showToast('Connection failed. Please check your network.');
    } finally {
      setSendingCode(false);
    }
  };

  // ── Stage 2: Verify code ───────────────────────────────────────────────────
  const handleVerifyCode = async () => {
    if (!resetCode.trim()) {
      showToast('Please enter the verification code.');
      return;
    }
    if (resetCode.trim().length !== 6) {
      showToast('Verification code must be 6 digits.');
      return;
    }
    if (!API_URL) {
      showToast('API URL is not configured. Please check your .env file.');
      return;
    }

    setVerifyingCode(true);
    try {
      const response = await fetch(`${API_URL}/users/password/reset/verify/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reset_token: resetCode.trim() }),
      });

      const data = (await response.json()) as ErrorPayload;

      if (response.ok) {
        setVerifiedToken(resetCode.trim());
        setStep(3);
        showToast('Code verified. Set your new password.');
      } else {
        const msg = extractErrorMessage(data, 'Invalid or expired verification code.');
        showToast(msg);
      }
    } catch (error) {
      console.error('Verify reset code error:', error);
      showToast('Connection failed. Please check your network.');
    } finally {
      setVerifyingCode(false);
    }
  };

  // ── Stage 3: Reset password ────────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!verifiedToken || !newPassword || !confirmPassword) {
      showToast('Please fill in all reset fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.');
      return;
    }

    setResettingPassword(true);
    try {
      const response = await fetch(`${API_URL}/users/password/reset/confirm/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          reset_token: verifiedToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = (await response.json()) as ErrorPayload;

      if (response.ok) {
        showToast('Password reset successful. Please login.');
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
        const msg = extractErrorMessage(data, 'Password reset failed.');
        showToast(msg);
      }
    } catch (error) {
      console.error('Reset password error:', error);
      showToast('Connection failed. Please check your network.');
    } finally {
      setResettingPassword(false);
    }
  };

  // ── Render stages ──────────────────────────────────────────────────────────
  const renderStage = () => {
    switch (step) {
      case 1:
        return (
          <>
            <Text style={s.label}>Gmail Address</Text>
            <View style={s.inputWrapper}>
              <TextInput
                style={s.input}
                placeholder="Enter your Gmail"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!sendingCode}
              />
            </View>

            <TouchableOpacity
              style={[s.button, !canSendCode && s.btnDisabled, { marginTop: 20 }]}
              onPress={handleSendCode}
              disabled={!canSendCode}
            >
              {sendingCode ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>{codeSent ? 'Resend Code' : 'Send Code'}</Text>
              )}
            </TouchableOpacity>
          </>
        );

      case 2:
        return (
          <>
            <Text style={s.label}>Verification Code</Text>
            <View style={s.inputWrapper}>
              <TextInput
                style={s.input}
                placeholder="Enter 6-digit code"
                placeholderTextColor={MUTED}
                keyboardType="number-pad"
                maxLength={6}
                value={resetCode}
                onChangeText={setResetCode}
                editable={!verifyingCode}
              />
            </View>

            <TouchableOpacity
              style={[s.button, verifyingCode && s.btnDisabled, { marginTop: 20 }]}
              onPress={handleVerifyCode}
              disabled={verifyingCode}
            >
              {verifyingCode ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.buttonOutline, { marginTop: 12 }, verifyingCode && s.btnDisabled]}
              onPress={() => setStep(1)}
              disabled={verifyingCode}
            >
              <Text style={s.btnOutlineText}>Back to Email</Text>
            </TouchableOpacity>
          </>
        );

      case 3:
        return (
          <>
            <Text style={s.label}>New Password</Text>
            <View style={s.inputWrapper}>
              <TextInput
                style={s.input}
                placeholder="Enter new password"
                placeholderTextColor={MUTED}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!resettingPassword}
              />
              <TouchableOpacity
                style={s.eyeButton}
                onPress={() => setShowNewPassword(v => !v)}
              >
                <FontAwesome
                  name={showNewPassword ? 'eye-slash' : 'eye'}
                  size={16}
                  color={MUTED}
                />
              </TouchableOpacity>
            </View>

            <Text style={[s.label, { marginTop: 12 }]}>Confirm New Password</Text>
            <View style={s.inputWrapper}>
              <TextInput
                style={s.input}
                placeholder="Re-enter new password"
                placeholderTextColor={MUTED}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!resettingPassword}
              />
              <TouchableOpacity
                style={s.eyeButton}
                onPress={() => setShowConfirmPassword(v => !v)}
              >
                <FontAwesome
                  name={showConfirmPassword ? 'eye-slash' : 'eye'}
                  size={16}
                  color={MUTED}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.button, resettingPassword && s.btnDisabled, { marginTop: 20 }]}
              onPress={handleResetPassword}
              disabled={resettingPassword}
            >
              {resettingPassword ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>Reset Password</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.buttonOutline, { marginTop: 12 }, resettingPassword && s.btnDisabled]}
              onPress={() => setStep(2)}
              disabled={resettingPassword}
            >
              <Text style={s.btnOutlineText}>Back to Verification</Text>
            </TouchableOpacity>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      <Toast message={toast.message} visible={toast.visible} onHide={hideToast} />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={s.headerRow}>
          <Text style={s.title}>Forgot Password</Text>
          <Text style={s.subtitle}>Ohh no, you forgot your password? Don't worry.</Text>
        </View>

        {/* Stage label */}
        <Text style={s.stageLabel}>{STAGE_LABELS[step]}</Text>

        {/* Form */}
        <View style={s.form}>
          {renderStage()}

          {/* Back to Login */}
          <View style={s.loginRow}>
            <Text style={s.loginBase}>Remember the password? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={s.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.copyright}>© 2025 MechConnect. All rights reserved.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: BG },
  scroll:     { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 },

  headerRow:  { marginBottom: 24 },
  title:      { fontSize: 16, fontWeight: '600', color: TEXT, marginBottom: 6 },
  subtitle:   { fontSize: 14, fontWeight: '400', color: MUTED },

  stageLabel: { fontSize: 14, fontWeight: '600', color: TEXT, marginBottom: 20 },

  form:       { flex: 1 },
  label:      { fontSize: 12, fontWeight: '400', color: MUTED, marginBottom: 6 },
  hint:       { fontSize: 11, fontWeight: '300', color: MUTED, marginTop: 4 },

  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: SURFACE,
  },
  input:          { flex: 1, fontSize: 14, fontWeight: '400', color: TEXT },
  eyeButton:      { paddingLeft: 8 },

  button: {
    height: 42,
    backgroundColor: ORANGE,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled:    { opacity: 0.6 },
  btnText:        { fontSize: 14, fontWeight: '400', color: '#fff' },

  buttonOutline: {
    height: 42,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnOutlineText: { fontSize: 14, fontWeight: '400', color: TEXT },

  loginRow:   { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  loginBase:  { fontSize: 12, fontWeight: '400', color: MUTED },
  loginLink:  { fontSize: 12, fontWeight: '600', color: ORANGE },

  copyright:  { fontSize: 12, fontWeight: '300', color: MUTED, textAlign: 'center', marginTop: 32 },
});