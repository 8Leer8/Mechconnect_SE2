import React from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export const options = { headerShown: false } as const;

export default function TermsScreen() {
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color="#FF8C00" />
          </TouchableOpacity>
        </View>

        <View style={styles.logoRow}>
          <Image source={require('@/assets/images/logo_main.png')} style={styles.logo} />
          <Text style={styles.title}>Terms and Conditions</Text>
          <Text style={styles.tagline}>Please review the basic terms before continuing.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.contentText}>
            By accessing or using MechConnect, you agree to be bound by these terms and conditions. If you do not agree, please do not use the app.
          </Text>

          <Text style={styles.sectionTitle}>2. Service Use</Text>
          <Text style={styles.contentText}>
            MechConnect provides a platform to connect clients with mechanics. You are responsible for your account and any activity that occurs while logged in.
          </Text>

          <Text style={styles.sectionTitle}>3. User Conduct</Text>
          <Text style={styles.contentText}>
            Users must act responsibly, provide accurate information, and not misuse the service. Harassment, fraud, and abusive behavior are prohibited.
          </Text>

          <Text style={styles.sectionTitle}>4. Privacy and Data</Text>
          <Text style={styles.contentText}>
            Your use of the app is also governed by our privacy policy. We collect and process information to provide the service and improve your experience.
          </Text>

          <Text style={styles.sectionTitle}>5. Changes</Text>
          <Text style={styles.contentText}>
            We may update these terms from time to time. Continued use of MechConnect after changes means you accept the revised terms.
          </Text>
        </View>

        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Agree and Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 24,
  },
  headerRow: {
    marginBottom: 18,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16171A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoRow: {
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  logo: {
    width: 60,
    height: 60,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 18,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ECEDEE',
    marginBottom: 8,
  },
  contentText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#D1D1D8',
    lineHeight: 22,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#FF8C00',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
