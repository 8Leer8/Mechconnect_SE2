import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { styles } from '../../style/auth/loginStyles';

// For Android Emulator use: http://10.0.2.2:8000/api/users
// For iOS Simulator use: http://localhost:8000/api/users
// For Real Device: Get your IP with 'ipconfig' (Windows) or 'ifconfig' (Mac/Linux)
const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    // Check if API_URL is defined
    if (!API_URL) {
      Alert.alert(
        'Configuration Error', 
        'API URL is not configured. Please check your .env file.'
      );
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
        body: JSON.stringify({
          username,
          password,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await response.json();

      if (response.ok) {
        Alert.alert('Success', 'Login successful!');
        // Navigate to main app
        router.replace('/(clientTabs)/main/home');
      } else {
        const errorMessage = data.username?.[0] || data.password?.[0] || data.account?.[0] || 'Login failed';
        Alert.alert('Error', errorMessage);
      }
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = 'Connection failed. Please check your network.';
      
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout. The server is taking too long to respond.';
      } else if (error.message) {
        errorMessage = `Connection failed: ${error.message}`;
      }
      
      Alert.alert('Error', errorMessage);
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
          <Text style={styles.title}>MechConnect</Text>
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
                  size={20} 
                  color="#FF8C00" 
                />
              </TouchableOpacity>
            </View>
          </View>

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

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('../(auth)/register' as any)}>
              <Text style={styles.linkText}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
