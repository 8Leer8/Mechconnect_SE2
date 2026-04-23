import React, { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import Toast, { type ToastVariant } from '@/components/gen/Toast';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { clearProfileDetailsCache, fetchProfileDetailsCached } from '@/lib/profileCache';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface LoginResponse {
  username?: string[] | string;
  password?: string[] | string;
  account?: { id?: number | string; [key: string]: any } | string[];
  message?: string;
  error?: string;
  active_role?: string;
  token?: string;
  requires_reactivation_confirmation?: boolean;
  reactivate_by?: string;
  retry_after_seconds?: number;
  non_field_errors?: string[] | string;
  [key: string]: any;
}

function pickFieldMessage(value: string[] | string | undefined): string | undefined {
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  if (typeof value === 'string' && value) return value;
  return undefined;
}

function loginErrorMessage(data: LoginResponse): string {
  if (typeof data.error === 'string' && data.error) return data.error;
  if (typeof data.message === 'string' && data.message) return data.message;
  const nfe = data.non_field_errors;
  if (Array.isArray(nfe) && nfe.length) return String(nfe[0]);
  if (typeof nfe === 'string' && nfe) return nfe;

  const accountError = Array.isArray(data.account) ? data.account[0] : undefined;
  return (
    pickFieldMessage(data.username) ||
    pickFieldMessage(data.password) ||
    (typeof accountError === 'string' ? accountError : undefined) ||
    'Login failed. Please try again.'
  );
}

function formatRetryWait(seconds: number): string {
  if (seconds <= 0) return 'a short time';
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

interface ActiveRoleResponse {
  active_role: string;
  roles?: string[];
}

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername]       = useState('');
  const [password, setPassword]       = useState('');
  const [loading, setLoading]         = useState(false);
  const [agreedToPolicies, setAgreedToPolicies] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [reactivationModalVisible, setReactivationModalVisible] = useState(false);

  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    variant: ToastVariant;
    duration?: number;
  }>({ visible: false, message: '', variant: 'default' });

  const showToast = (message: string, variant: ToastVariant = 'default', duration?: number) =>
    setToast({ visible: true, message, variant, duration });

  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  const submitLogin = async (reactivateAccount = false) => {
    if (!username && !password) {
      showToast('Please enter your username and password.', 'warning');
      return;
    }
    if (!username) {
      showToast('Please enter your username.', 'warning');
      return;
    }
    if (!password) {
      showToast('Please enter your password.', 'warning');
      return;
    }
    if (!agreedToPolicies) {
      showToast('Please agree to the Terms & Conditions and Privacy Policy.', 'warning');
      return;
    }
    if (!API_URL) {
      showToast('API URL is not configured. Check your .env file.', 'error');
      return;
    }

    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/users/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, reactivate_account: reactivateAccount }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);
      let data: LoginResponse = {};
      try {
        data = (await response.json()) as LoginResponse;
      } catch {
        showToast('Something went wrong. Please try again.', 'error');
        return;
      }

      if (response.status === 429) {
        const wait = typeof data.retry_after_seconds === 'number' ? data.retry_after_seconds : 900;
        const msg =
          (typeof data.error === 'string' && data.error) ||
          `Too many login attempts. Try again in ${formatRetryWait(wait)}.`;
        showToast(msg, 'error', 5500);
        return;
      }

      if (response.status === 409 && data.requires_reactivation_confirmation) {
        setReactivationModalVisible(true);
        return;
      }

      if (response.ok) {
        setReactivationModalVisible(false);
        try {
          const accountPayload = data.account && !Array.isArray(data.account) ? data.account : null;
          const acctId = accountPayload?.id || null;
          if (acctId) await AsyncStorage.setItem('account_id', String(acctId));
          if (data?.token) await AsyncStorage.setItem('auth_token', data.token);
          await clearProfileDetailsCache();
        } catch (e) {
          console.warn('Failed to persist account_id or token', e);
        }

        let activeRole = data.active_role;

        if (!activeRole) {
          try {
            const roleResponse = await fetch(`${API_URL}/users/profile/active-role/`, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            });
            if (roleResponse.ok) {
              const roleData = await roleResponse.json() as ActiveRoleResponse;
              activeRole = roleData.active_role;
            }
          } catch (roleError) {
            console.error('Error fetching role:', roleError);
          }
        }

        if (activeRole === 'mechanic') {
          try {
            const profile = await fetchProfileDetailsCached(false);
            const mechanicProfile = profile?.current_role_profile?.mechanic;
            router.replace(mechanicProfile?.is_working_for_shop
              ? '/(mechanicShopTabs)/main/home'
              : '/(mechanicTabs)/main/home');
          } catch {
            router.replace('/(mechanicTabs)/main/home');
          }
        } else if (activeRole === 'shop_owner') {
          router.replace('/(shopownerTabs)/main/home');
        } else {
          router.replace('/(clientTabs)/main/home');
        }

      } else {
        showToast(loginErrorMessage(data), 'error');
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        showToast('Request timed out. Server is not responding.', 'error');
      } else {
        showToast('Connection failed. Please check your network.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    void submitLogin(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      <Toast
        message={toast.message}
        visible={toast.visible}
        onHide={hideToast}
        variant={toast.variant}
        duration={toast.duration}
      />
      <ConfirmationModal
        visible={reactivationModalVisible}
        type="warning"
        title="Reactivate Account"
        message="You have recently deactivated your account. Logging in will reactivate it again. Do you want to continue?"
        confirmText="Reactivate & Login"
        cancelText="Cancel"
        loading={loading}
        onCancel={() => {
          if (!loading) setReactivationModalVisible(false);
        }}
        onConfirm={() => {
          setReactivationModalVisible(false);
          void submitLogin(true);
        }}
      />

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={s.logoRow}>
          <Image source={require('@/assets/images/logo_main.png')} style={s.logo} />
          <Text style={s.appName}>MechConnect</Text>
          <Text style={s.tagline}>Connect to your mechanic world</Text>
        </View>

        {/* Form */}
        <View style={s.form}>

          <Text style={s.label}>Username</Text>
          <View style={[s.inputWrapper, usernameFocused && s.inputFocused]}>
            <TextInput
              style={s.input}
              placeholder="Enter your username"
              placeholderTextColor="#999"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              onFocus={() => setUsernameFocused(true)}
              onBlur={() => setUsernameFocused(false)}
            />
          </View>

          <Text style={[s.label, { marginTop: 12 }]}>Password</Text>
          <View style={[s.inputWrapper, passwordFocused && s.inputFocused]}>
            <TextInput
              style={s.input}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eye}>
              <Feather name={showPassword ? 'eye' : 'eye-off'} size={16} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.forgotRow}
            onPress={() => router.push('/(auth)/forgot-password')}
            disabled={loading}
          >
            <Text style={s.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <View style={s.termsWrap}>
            <TouchableOpacity
              style={s.checkboxButton}
              onPress={() => setAgreedToPolicies(prev => !prev)}
              disabled={loading}
            >
              <Feather
                name={agreedToPolicies ? 'check-square' : 'square'}
                size={16}
                color={agreedToPolicies ? ORANGE : MUTED}
              />
            </TouchableOpacity>
            <View style={s.termsTextWrap}>
              <Text style={s.termsText}>I agree to the </Text>
              <TouchableOpacity disabled={loading} onPress={() => router.push('./terms' as any)}>
                <Text style={s.termsLink}>Terms &amp; Conditions</Text>
              </TouchableOpacity>
              <Text style={s.termsText}> and the </Text>
              <TouchableOpacity disabled={loading} onPress={() => router.push('./privacy' as any)}>
                <Text style={s.termsLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[s.button, (loading || !agreedToPolicies) && s.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || !agreedToPolicies}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.buttonText}>Login</Text>
            }
          </TouchableOpacity>

          <View style={s.registerRow}>
            <Text style={s.registerBase}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('../(auth)/register' as any)}>
              <Text style={s.registerLink}>Register</Text>
            </TouchableOpacity>
          </View>

        </View>

        <Text style={s.copyright}>© 2025 MechConnect. All rights reserved.</Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const ORANGE  = '#F97316';
const BG      = '#121212';
const SURFACE = '#1E1E1E';
const BORDER  = '#2C2C2C';
const TEXT    = '#F5F5F5';
const MUTED   = '#9A9A9A';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24 },

  logoRow: { alignItems: 'flex-start', marginBottom: 32 },
  logo: { width: 60, height: 60, resizeMode: 'contain', marginBottom: 8 },
  appName: { fontSize: 16, fontWeight: '600', color: TEXT },
  tagline: { fontSize: 14, fontWeight: '400', color: MUTED, marginTop: 2 },

  form: { flex: 1 },
  label: { fontSize: 12, fontWeight: '400', color: MUTED, marginBottom: 6 },
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
  inputFocused: { borderColor: ORANGE },
  input: { flex: 1, fontSize: 14, fontWeight: '400', color: TEXT },
  eye: { paddingLeft: 8 },

  forgotRow: { alignItems: 'flex-end', marginTop: 8, marginBottom: 20 },
  forgotText: { fontSize: 12, fontWeight: '400', color: ORANGE },

  termsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkboxButton: {
    marginTop: 1,
    marginRight: 8,
  },
  termsTextWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  termsText: {
    fontSize: 12,
    fontWeight: '400',
    color: MUTED,
  },
  termsLink: {
    fontSize: 12,
    fontWeight: '600',
    color: ORANGE,
  },

  button: {
    height: 42,
    backgroundColor: ORANGE,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 14, fontWeight: '400', color: '#fff' },

  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  registerBase: { fontSize: 12, fontWeight: '400', color: MUTED },
  registerLink: { fontSize: 12, fontWeight: '600', color: ORANGE },

  copyright: { fontSize: 12, fontWeight: '300', color: MUTED, textAlign: 'center', marginTop: 32 },
});