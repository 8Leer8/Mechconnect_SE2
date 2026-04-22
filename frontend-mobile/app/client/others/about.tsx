import React from 'react';
import {
  View,
  ScrollView,
  Text,
  Image,
  StyleSheet,
} from 'react-native';
import GenTopNav from '../../../components/gen/GenTopNav';

export const options = { headerShown: false } as const;

export default function AboutScreen() {
  return (
    <View style={styles.container}>
      <GenTopNav title="About MechConnect" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.logoRow}>
          <Image source={require('@/assets/images/logo_main.png')} style={styles.logo} />
          <Text style={styles.title}>About MechConnect</Text>
          <Text style={styles.tagline}>Learn more about our platform and mission.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Our Mission</Text>
          <Text style={styles.contentText}>
            MechConnect is dedicated to bridging the gap between vehicle owners and qualified mechanics, providing a seamless and transparent platform for automotive services.
          </Text>

          <Text style={styles.sectionTitle}>What We Do</Text>
          <Text style={styles.contentText}>
            We connect clients with trusted mechanics and shops, enabling quick service requests, real-time tracking, and quality assurance. Our platform makes finding reliable automotive services easy and convenient.
          </Text>

          <Text style={styles.sectionTitle}>Our Commitment</Text>
          <Text style={styles.contentText}>
            We are committed to maintaining high standards of service quality, ensuring user safety, and providing exceptional customer support. Your satisfaction is our priority.
          </Text>

          <Text style={styles.sectionTitle}>Version</Text>
          <Text style={styles.contentText}>
            MechConnect v1.0
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
