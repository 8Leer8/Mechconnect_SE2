import React from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import GenTopNav from '../../../components/gen/GenTopNav';

export const options = { headerShown: false } as const;

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <GenTopNav title="Privacy Policy" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logoRow}>
          <Image source={require('@/assets/images/logo_main.png')} style={styles.logo} />
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.tagline}>Learn how we collect, use, and protect your information.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Information We Collect</Text>
          <Text style={styles.contentText}>
            We collect information you provide directly, such as account details, and data generated from your use of the app to deliver a safe and personalized experience.
          </Text>

          <Text style={styles.sectionTitle}>2. How We Use Your Data</Text>
          <Text style={styles.contentText}>
            We use collected information to provide services, process transactions, communicate with you, and improve the MechConnect platform.
          </Text>

          <Text style={styles.sectionTitle}>3. Sharing and Disclosure</Text>
          <Text style={styles.contentText}>
            We do not sell your personal information. We may share it with service providers, mechanics, and partners only as needed to fulfill service requests.
          </Text>

          <Text style={styles.sectionTitle}>4. Security</Text>
          <Text style={styles.contentText}>
            We implement reasonable safeguards to protect your data, but no system is completely secure. Please keep your account credentials safe.
          </Text>

          <Text style={styles.sectionTitle}>5. Changes to This Policy</Text>
          <Text style={styles.contentText}>
            We may update this policy periodically. Continued use of the app after changes means you accept the revised privacy policy.
          </Text>
        </View>
      </ScrollView>
    </View>
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
    paddingTop: 24,
    paddingBottom: 24,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 6,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '300',
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
    fontSize: 16,
    fontWeight: '600',
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
});
