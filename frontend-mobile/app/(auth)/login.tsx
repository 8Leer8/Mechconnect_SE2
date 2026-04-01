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
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '../../style/auth/loginStyles';
import { useNotification } from '@/hooks/useNotification';

// For Android Emulator use: http://10.0.2.2:8000/api/users
// For iOS Simulator use: http://localhost:8000/api/users
// For Real Device: Get your IP with 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)
const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface LoginResponse {
  username?: string[];
  password?: string[];
  account?: {
    id?: number | string;
    [key: string]: any;
  } | string[];
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
  const { showNotification } = useNotification();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      showNotification({ type: 'error', message: 'Please fill in all fields' });
      return;
    }

    // Check if API_URL is defined
    if (!API_URL) {
      showNotification({ type: 'error', title: 'Configuration Error', message: 'API URL is not configured. Please check your .env file.' });
      return;
    }

    setLoading(true);
    try {
      console.log('Attempting login to:', `${API_URL}/users/login/`);
      console.log('Login data:', { username });
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); 
      
      const response = await fetch(`${API_URL}/users/login/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          username,
          password,
        }),
        signal: controller.signal as any,
      });

      clearTimeout(timeout);
      const data = await response.json() as LoginResponse;

      if (response.ok) {
        console.log('Login successful');
        
        // Get active role from login response or fetch it
        let activeRole = data.active_role;
        
        if (!activeRole) {
          // Fallback: fetch the active role if not included in login response
          console.log('Active role not in response, fetching...');
          try {
            const roleResponse = await fetch(`${API_URL}/users/profile/active-role/`, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            });

            if (roleResponse.ok) {
              const roleData = await roleResponse.json() as ActiveRoleResponse;
              activeRole = roleData.active_role;
            }
          } catch (roleError) {
            console.error('Error fetching role:', roleError);
          }
        }
        
        console.log('Active role:', activeRole);
        
        // Navigate based on active role
        if (activeRole === 'mechanic') {
          // Check if mechanic is working for a shop
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
              const profileData = await profileResponse.json() as ProfileDetailsResponse;
              const mechanicProfile = profileData.profile?.current_role_profile?.mechanic;
              
              if (mechanicProfile?.is_working_for_shop) {
                showNotification({ type: 'success', message: 'Login successful!' });
                router.replace('/(mechanicShopTabs)/main/home');
              } else {
                showNotification({ type: 'success', message: 'Login successful!' });
                router.replace('/(mechanicTabs)/main/home');
              }
            } else {
              // Fallback to regular mechanic tabs if can't get profile
              showNotification({ type: 'success', message: 'Login successful!' });
              router.replace('/(mechanicTabs)/main/home');
            }
          } catch (profileError) {
            console.error('Error fetching profile:', profileError);
            // Fallback to regular mechanic tabs
            showNotification({ type: 'success', message: 'Login successful!' });
            router.replace('/(mechanicTabs)/main/home');
          }
        } else if (activeRole === 'shop_owner') {
          showNotification({ type: 'success', message: 'Login successful!' });
          router.replace('/(shopownerTabs)/main/home');
        } else {
          // Default to client
          showNotification({ type: 'success', message: 'Login successful!' });
          router.replace('/(clientTabs)/main/home');
        }
        // Persist account id locally for development flow (used by chat fallback)
        try {
          const accountPayload = data.account && !Array.isArray(data.account) ? data.account : null;
          const acctId = accountPayload?.id || null;
          if (acctId) {
            await AsyncStorage.setItem('account_id', String(acctId));
          }
          if (activeRole) {
            await AsyncStorage.multiSet([
              ['user_role', activeRole],
              ['last_active_role', activeRole],
            ]);
          }
          // If backend included token in login response, persist it for API calls
          const token = data?.token || null;
          if (token) {
            await AsyncStorage.setItem('auth_token', token);
          }
        } catch (e) {
          console.warn('Failed to persist account_id or token', e);
        }
      } else {
        const accountError = Array.isArray(data.account) ? data.account[0] : undefined;
        const errorMessage = data.username?.[0] || data.password?.[0] || data.non_field_errors?.[0] || accountError || data.message || 'Login failed';
        showNotification({ type: 'error', message: errorMessage });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Connection failed. Please check your network.';
      
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout. The server is taking too long to respond.';
      } else if (error.message) {
        errorMessage = `Connection failed: ${error.message}`;
      }
      
      showNotification({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/logo_main.png')}
            style={{ width: 100, height: 100, resizeMode: 'contain', marginBottom: 8 }}
          />
          <Text style={styles.title}>MechConnect</Text>
          <Text style={styles.tagline}>Connect to your mechanical world</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Username</Text>
            <View style={[
              styles.inputWrapper,
              usernameFocused && styles.inputWrapperFocused
            ]}>
              <TextInput
                style={styles.input}
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
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <View style={[
              styles.inputWrapper,
              passwordFocused && styles.inputWrapperFocused
            ]}>
              <TextInput
                style={styles.input}
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
              <TouchableOpacity 
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <FontAwesome 
                  name={showPassword ? "eye-slash" : "eye"} 
                  size={16} 
                  color="#8E8E93" 
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotPasswordContainer}
            onPress={() => router.push('/(auth)/forgot-password')}
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('../(auth)/register' as any)}>
              <Text style={styles.linkText}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.bottomFooter}>
          <Text style={styles.copyrightText}>© 2025 MechConnect. All rights reserved.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
