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
import Toast from '@/components/gen/Toast';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface LoginResponse {
  username?: string[];
  password?: string[];
  account?: { id?: number | string; [key: string]: any } | string[];
  message?: string;
  active_role?: string;
  token?: string;
  [key: string]: any;
}

interface ActiveRoleResponse {
  active_role: string;
  roles?: string[];
}

interface ProfileDetailsResponse {
  profile?: {
    current_role_profile?: {
      mechanic?: {
        is_working_for_shop?: boolean;
      };
    };
  };
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

  const [toast, setToast] = useState({ visible: false, message: '' });
  const showToast = (message: string) => setToast({ visible: true, message });
  const hideToast = () => setToast(t => ({ ...t, visible: false }));

  const handleLogin = async () => {
    if (!username && !password) {
      showToast('Please enter your username and password.');
      return;
    }
    if (!username) {
      showToast('Please enter your username.');
      return;
    }
    if (!password) {
      showToast('Please enter your password.');
      return;
    }
    if (!agreedToPolicies) {
      showToast('Please agree to the Terms & Conditions and Privacy Policy.');
      return;
    }
    if (!API_URL) {
      showToast('API URL is not configured. Check your .env file.');
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
        body: JSON.stringify({ username, password }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);
      const data = await response.json() as LoginResponse;

      if (response.ok) {
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
            const profileResponse = await fetch(`${API_URL}/users/profile/details/`, {
              method: 'GET',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            });
            if (profileResponse.ok) {
              const profileData = await profileResponse.json() as ProfileDetailsResponse;
              const mechanicProfile = profileData.profile?.current_role_profile?.mechanic;
              router.replace(mechanicProfile?.is_working_for_shop
                ? '/(mechanicShopTabs)/main/home'
                : '/(mechanicTabs)/main/home');
            } else {
              router.replace('/(mechanicTabs)/main/home');
            }
          } catch {
            router.replace('/(mechanicTabs)/main/home');
          }
        } else if (activeRole === 'shop_owner') {
          router.replace('/(shopownerTabs)/main/home');
        } else {
          router.replace('/(clientTabs)/main/home');
        }

        try {
          const accountPayload = data.account && !Array.isArray(data.account) ? data.account : null;
          const acctId = accountPayload?.id || null;
          if (acctId) await AsyncStorage.setItem('account_id', String(acctId));
          if (data?.token) await AsyncStorage.setItem('auth_token', data.token);
        } catch (e) {
          console.warn('Failed to persist account_id or token', e);
        }
      } else {
        const accountError = Array.isArray(data.account) ? data.account[0] : undefined;
        const errorMessage = data.username?.[0] || data.password?.[0] || accountError || 'Login failed. Please try again.';
        showToast(errorMessage);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        showToast('Request timed out. Server is not responding.');
      } else {
        showToast('Connection failed. Please check your network.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      <Toast message={toast.message} visible={toast.visible} onHide={hideToast} />

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