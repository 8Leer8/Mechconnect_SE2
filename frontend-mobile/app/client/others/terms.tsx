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

export default function TermsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <GenTopNav title="Terms of Service" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logoRow}>
          <Image source={require('@/assets/images/logo_main.png')} style={styles.logo} />
          <Text style={styles.title}>Terms of Service</Text>
          <Text style={styles.tagline}>Please read our terms and conditions carefully.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.contentText}>
            By accessing and using MechConnect, you accept and agree to be bound by the terms and provision of this agreement.
          </Text>

          <Text style={styles.sectionTitle}>2. Use License</Text>
          <Text style={styles.contentText}>
            Permission is granted to temporarily download one copy of the materials (information or software) on MechConnect for personal, non-commercial transitory viewing only.
          </Text>

          <Text style={styles.sectionTitle}>3. Disclaimer</Text>
          <Text style={styles.contentText}>
            The materials on MechConnect are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties.
          </Text>

          <Text style={styles.sectionTitle}>4. Limitations</Text>
          <Text style={styles.contentText}>
            In no event shall MechConnect or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit) arising out of the use or inability to use the materials on MechConnect.
          </Text>

          <Text style={styles.sectionTitle}>5. Revisions</Text>
          <Text style={styles.contentText}>
            The materials appearing on MechConnect could include technical, typographical, or photographic errors. MechConnect does not warrant that any of the materials on our website are accurate, complete or current.
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
