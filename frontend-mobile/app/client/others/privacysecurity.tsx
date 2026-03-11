import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

interface SubSection {
  title: string;
  items: string[];
}

interface PolicySection {
  id: string;
  icon: string;
  title: string;
  intro?: string;
  body?: string;
  subsections?: SubSection[];
  items?: string[];
  contact?: { label: string; value: string }[];
}

const policySections: PolicySection[] = [
  {
    id: '1',
    icon: 'database',
    title: '1. Information We Collect',
    subsections: [
      {
        title: '1.1 Personal Information',
        items: [
          'Full name, email address, username, and password',
          'Date of birth and gender',
          'Phone number and contact information',
          'Home address and service location addresses',
          'Profile photographs',
          'Government-issued identification documents (for mechanics and shop owners)',
          'Professional licenses and certifications (for service providers)',
          'Payment information and transaction history',
        ],
      },
      {
        title: '1.2 Location Information',
        items: [
          'Real-time GPS location when using the app',
          'Service location addresses',
          'Location data for matching clients with nearby mechanics',
          'Route and travel information during active bookings',
        ],
      },
      {
        title: '1.3 Usage Information',
        items: [
          'App usage patterns and interactions',
          'Service requests and booking history',
          'Search queries and preferences',
          'Device information (device type, operating system, unique device identifiers)',
          'IP address and browser information',
        ],
      },
      {
        title: '1.4 User-Generated Content',
        items: [
          'Service reviews and ratings',
          'Photos of vehicle issues, before/after service pictures',
          'Messages and communications through the app',
          'Custom service request descriptions',
        ],
      },
      {
        title: '1.5 Payment Information',
        items: [
          'Payment method details (securely processed through third-party providers)',
          'Transaction history and receipts',
          'Billing addresses',
        ],
      },
    ],
  },
  {
    id: '2',
    icon: 'cogs',
    title: '2. How We Use Your Information',
    subsections: [
      {
        title: '2.1 Service Delivery',
        items: [
          'Connecting clients with mechanics and shops',
          'Processing service requests and bookings',
          'Facilitating communication between users',
          'Navigation and location-based matching',
          'Processing payments and generating receipts',
        ],
      },
      {
        title: '2.2 Account Management',
        items: [
          'Creating and managing user accounts',
          'Verifying user identities and credentials',
          'Managing multi-role accounts (client, mechanic, shop owner)',
          'Processing registration and verification requests',
        ],
      },
      {
        title: '2.3 Service Improvement',
        items: [
          'Analyzing usage patterns to improve user experience',
          'Developing new features and services',
          'Conducting research and analytics',
          'Testing and troubleshooting technical issues',
        ],
      },
      {
        title: '2.4 Safety and Security',
        items: [
          'Preventing fraud and unauthorized access',
          'Monitoring for suspicious activities',
          'Enforcing our Terms and Conditions',
          'Resolving disputes and customer support issues',
          'Maintaining platform integrity',
        ],
      },
      {
        title: '2.5 Communication',
        items: [
          'Sending booking confirmations and updates',
          'Providing customer support',
          'Sending notifications about service status',
          'Sending promotional offers (with your consent)',
          'Responding to inquiries and requests',
        ],
      },
      {
        title: '2.6 Legal Compliance',
        items: [
          'Complying with legal obligations',
          'Responding to legal requests and preventing harm',
          'Protecting our rights and property',
        ],
      },
    ],
  },
  {
    id: '3',
    icon: 'share-alt',
    title: '3. Information Sharing and Disclosure',
    subsections: [
      {
        title: '3.1 With Other Users',
        items: [
          'Service providers can see client names, locations, and service details',
          'Clients can see mechanic/shop profiles, ratings, and contact information',
          'Public reviews and ratings are visible to all users',
        ],
      },
      {
        title: '3.2 With Service Providers',
        items: [
          'Payment processors (for secure transactions)',
          'Cloud storage providers (for data hosting)',
          'Map and location services',
          'Communication service providers',
        ],
      },
      {
        title: '3.3 For Legal Reasons',
        items: [
          'When required by law or legal process',
          'To protect rights, property, or safety',
          'In connection with fraud prevention',
          'During business transactions (mergers, acquisitions)',
        ],
      },
      {
        title: '3.4 With Your Consent',
        items: [
          'We may share information with third parties when you provide explicit consent',
        ],
      },
    ],
    body: 'We do NOT sell your personal information to third parties for marketing purposes.',
  },
  {
    id: '4',
    icon: 'lock',
    title: '4. Data Security',
    items: [
      'Encryption of sensitive data during transmission',
      'Secure storage of personal information',
      'Regular security assessments and updates',
      'Access controls and authentication',
      'Employee training on data protection',
    ],
    body: 'No method of transmission over the internet is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.',
  },
  {
    id: '5',
    icon: 'clock-o',
    title: '5. Data Retention',
    body: 'We retain your information for as long as your account remains active, as necessary to provide services, as required by law or for legal purposes, or as needed to resolve disputes. You may request deletion of your account and personal data at any time, subject to legal retention requirements.',
  },
  {
    id: '6',
    icon: 'user-secret',
    title: '6. Your Privacy Rights',
    subsections: [
      {
        title: '6.1 Access and Portability',
        items: [
          'Request a copy of your personal information',
          'Download your data in a portable format',
        ],
      },
      {
        title: '6.2 Correction',
        items: [
          'Update or correct inaccurate information',
          'Modify your profile and preferences',
        ],
      },
      {
        title: '6.3 Deletion',
        items: [
          'Request deletion of your personal information',
          'Close your account permanently',
        ],
      },
      {
        title: '6.4 Opt-Out',
        items: [
          'Unsubscribe from marketing communications',
          'Disable location services (may limit app functionality)',
          'Withdraw consent for data processing',
        ],
      },
      {
        title: '6.5 Object and Restrict',
        items: [
          'Object to certain data processing activities',
          'Request restriction of data processing',
        ],
      },
    ],
    body: 'To exercise these rights, contact us at privacy@mechconnect.com',
  },
  {
    id: '7',
    icon: 'child',
    title: "7. Children's Privacy",
    body: "MechConnect is not intended for users under 18 years of age. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.",
  },
  {
    id: '8',
    icon: 'map-marker',
    title: '8. Location-Based Services',
    intro: 'MechConnect uses location services to:',
    items: [
      'Match clients with nearby mechanics',
      'Calculate distances and estimated arrival times',
      'Provide navigation assistance',
      'Calculate distance-based pricing',
    ],
    body: 'You can disable location services in your device settings, but this will significantly limit app functionality.',
  },
  {
    id: '9',
    icon: 'chrome',
    title: '9. Cookies and Tracking Technologies',
    intro: 'We may use cookies, pixels, and similar technologies to:',
    items: [
      'Maintain user sessions',
      'Remember preferences and settings',
      'Analyze app usage and performance',
      'Provide personalized experiences',
    ],
  },
  {
    id: '10',
    icon: 'globe',
    title: '10. International Data Transfers',
    body: 'Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data in accordance with this Privacy Policy.',
  },
  {
    id: '11',
    icon: 'refresh',
    title: '11. Changes to This Privacy Policy',
    intro: 'We may update this Privacy Policy from time to time. We will notify you of material changes by:',
    items: [
      'Posting the new policy in the app',
      'Sending an email notification',
      'Displaying an in-app notice',
    ],
    body: 'Continued use of the app after changes constitutes acceptance of the updated policy.',
  },
  {
    id: '12',
    icon: 'envelope',
    title: '12. Contact Us',
    body: 'If you have questions or concerns about this Privacy Policy:',
    contact: [
      { label: 'Email', value: 'privacy@mechconnect.com' },
      { label: 'Support', value: 'Available 24/7 through the app' },
      { label: 'Data Protection', value: 'dpo@mechconnect.com' },
    ],
  },
];

export default function PrivacySecurityScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <FontAwesome name="arrow-left" size={18} color="#fff" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Privacy & Security</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro Banner */}
        <View style={styles.introBanner}>
          <View style={styles.introIconWrap}>
            <FontAwesome name="shield" size={28} color="#FF8C00" />
          </View>
          <ThemedText style={styles.introTitle}>Your Privacy Matters</ThemedText>
          <ThemedText style={styles.introSubtitle}>
            This Privacy Policy explains how MechConnect collects, uses, and protects your information.
          </ThemedText>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <FontAwesome name="calendar" size={11} color="#FF8C00" />
              <ThemedText style={styles.badgeText}>Effective: March 4, 2026</ThemedText>
            </View>
          </View>
        </View>

        {/* Sections */}
        {policySections.map((section) => {
          const isExpanded = expandedId === section.id;
          return (
            <View key={section.id} style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleSection(section.id)}
                activeOpacity={0.75}
              >
                <View style={styles.sectionIconWrap}>
                  <FontAwesome name={section.icon as any} size={15} color="#FF8C00" />
                </View>
                <ThemedText style={styles.sectionTitle} numberOfLines={2}>{section.title}</ThemedText>
                <FontAwesome
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color="#8E8E93"
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.sectionBody}>
                  {section.intro && (
                    <ThemedText style={styles.bodyIntro}>{section.intro}</ThemedText>
                  )}

                  {/* Top-level bullet items */}
                  {section.items && section.items.map((item, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <View style={styles.bullet} />
                      <ThemedText style={styles.bulletText}>{item}</ThemedText>
                    </View>
                  ))}

                  {/* Subsections */}
                  {section.subsections && section.subsections.map((sub, si) => (
                    <View key={si} style={styles.subsection}>
                      <ThemedText style={styles.subsectionTitle}>{sub.title}</ThemedText>
                      {sub.items.map((item, ii) => (
                        <View key={ii} style={styles.bulletRow}>
                          <View style={styles.bullet} />
                          <ThemedText style={styles.bulletText}>{item}</ThemedText>
                        </View>
                      ))}
                    </View>
                  ))}

                  {/* Body/Note text */}
                  {section.body && (
                    <View style={styles.noteBox}>
                      <ThemedText style={styles.noteText}>{section.body}</ThemedText>
                    </View>
                  )}

                  {/* Contact info */}
                  {section.contact && section.contact.map((c, ci) => (
                    <View key={ci} style={styles.contactRow}>
                      <ThemedText style={styles.contactLabel}>{c.label}:</ThemedText>
                      <ThemedText style={styles.contactValue}>{c.value}</ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Footer Note */}
        <View style={styles.footerNote}>
          <FontAwesome name="info-circle" size={14} color="#8E8E93" />
          <ThemedText style={styles.footerText}>
            By using MechConnect, you agree to this Privacy Policy. For questions, contact{' '}
            <ThemedText style={styles.footerLink}>privacy@mechconnect.com</ThemedText>
          </ThemedText>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2C2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },

  // Intro Banner
  introBanner: {
    backgroundColor: '#1A1C1E',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  introIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FF8C0030',
  },
  introTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  introSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF8C0015',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    color: '#FF8C00',
    fontWeight: '600',
  },

  // Section Card
  sectionCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 20,
  },

  // Section Body
  sectionBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
    paddingTop: 14,
  },
  bodyIntro: {
    fontSize: 13,
    color: '#C0C0C0',
    marginBottom: 10,
    lineHeight: 20,
  },

  // Subsection
  subsection: {
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF8C00',
    marginBottom: 8,
  },

  // Bullets
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 10,
    paddingLeft: 4,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF8C00',
    marginTop: 7,
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: '#C0C0C0',
    lineHeight: 20,
  },

  // Note Box
  noteBox: {
    backgroundColor: '#FF8C0010',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#FF8C00',
  },
  noteText: {
    fontSize: 13,
    color: '#C0C0C0',
    lineHeight: 20,
  },

  // Contact
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  contactLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF8C00',
    minWidth: 90,
  },
  contactValue: {
    flex: 1,
    fontSize: 13,
    color: '#C0C0C0',
    lineHeight: 20,
  },

  // Footer
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  footerText: {
    flex: 1,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 18,
  },
  footerLink: {
    color: '#FF8C00',
    fontWeight: '600',
  },
});
