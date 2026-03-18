import React, { useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, Modal,
  ActivityIndicator, TextInput, Image,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useNotification } from '@/hooks/useNotification';
import { StyleSheet } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Types ────────────────────────────────────────────────────
interface AIRecommendation {
  specialty: string;
  confidence: number;
}

interface MatchedShop {
  id: number;
  shop_name: string;
  service_banner: string | null;
  is_verified: boolean;
  status: string;
  matched_specialties: string[];
}

interface MatchedMechanic {
  id: number;
  full_name: string;
  profile_photo: string | null;
  average_rating: number;
  status: string;
  matched_specialties: string[];
}

// ─── Main Component ───────────────────────────────────────────
export default function RecommendProviderScreen() {
  const { showNotification } = useNotification();
  const params = useLocalSearchParams();

  const description = params.description as string || '';
  const concern_picture = params.concern_picture as string || '';
  const ai_recommendations: AIRecommendation[] = JSON.parse(params.ai_recommendations as string || '[]');
  const matched_shops: MatchedShop[] = JSON.parse(params.matched_shops as string || '[]');
  const matched_mechanics: MatchedMechanic[] = JSON.parse(params.matched_mechanics as string || '[]');

  // ─── Location Modal State ──────────────────────────────────
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<{ type: 'shop' | 'mechanic'; id: number; name: string } | null>(null);
  const [streetName, setStreetName] = useState('');
  const [barangay, setBarangay] = useState('');
  const [cityMunicipality, setCityMunicipality] = useState('');
  const [landmark, setLandmark] = useState('');
  const [sending, setSending] = useState(false);

  // ─── Send Request ──────────────────────────────────────────
  const handleSend = (type: 'shop' | 'mechanic', id: number, name: string) => {
    setSelectedProvider({ type, id, name });
    setLocationModalVisible(true);
  };

  const handleConfirmSend = async () => {
    if (!streetName.trim() || !barangay.trim() || !cityMunicipality.trim()) {
      showNotification({ type: 'error', message: 'Please fill in all required location fields' });
      return;
    }

    if (!selectedProvider) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append('description', description);

      if (selectedProvider.type === 'shop') {
        formData.append('shop_id', selectedProvider.id.toString());
      } else {
        formData.append('provider_id', selectedProvider.id.toString());
      }

      formData.append('service_location', JSON.stringify({
        street_name: streetName,
        barangay,
        city_municipality: cityMunicipality,
        landmark: landmark || undefined,
      }));

      if (concern_picture) {
        const filename = concern_picture.split('/').pop() || 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('concern_picture', { uri: concern_picture, name: filename, type } as any);
      }

      const response = await fetch(`${API_URL}/bookings/requests/custom/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json();

      if (response.ok) {
        setLocationModalVisible(false);
        showNotification({ type: 'success', message: `Request sent to ${selectedProvider.name}!` });
        router.push('/client/request' as any);
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to send request' });
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'An error occurred while sending the request' });
    } finally {
      setSending(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>AI Recommendations</ThemedText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Problem Description */}
        <View style={styles.descriptionBox}>
          <FontAwesome name="comment" size={14} color="#FF8C00" />
          <ThemedText style={styles.descriptionText} numberOfLines={3}>{description}</ThemedText>
        </View>

        {/* AI Specialties */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="magic" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Detected Specialties</ThemedText>
          </View>
          <View style={styles.specialtiesRow}>
            {ai_recommendations.map((rec, i) => (
              <View key={i} style={styles.specialtyChip}>
                <ThemedText style={styles.specialtyName}>{rec.specialty}</ThemedText>
                <ThemedText style={styles.specialtyConfidence}>{rec.confidence}%</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* Matched Shops */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="building" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Matched Shops ({matched_shops.length})</ThemedText>
          </View>

          {matched_shops.length === 0 ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="inbox" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No shops found for these specialties</ThemedText>
            </View>
          ) : (
            matched_shops.map((shop) => (
              <View key={shop.id} style={styles.card}>
                {/* Banner */}
                {shop.service_banner ? (
                  <Image source={{ uri: shop.service_banner }} style={styles.banner} resizeMode="cover" />
                ) : (
                  <View style={styles.bannerPlaceholder}>
                    <FontAwesome name="building" size={28} color="#555" />
                  </View>
                )}

                <View style={styles.cardBody}>
                  {/* Name + Verified */}
                  <View style={styles.cardTitleRow}>
                    <ThemedText style={styles.cardTitle}>{shop.shop_name}</ThemedText>
                    {shop.is_verified && (
                      <View style={styles.verifiedBadge}>
                        <FontAwesome name="check-circle" size={12} color="#34C759" />
                        <ThemedText style={styles.verifiedText}>Verified</ThemedText>
                      </View>
                    )}
                  </View>

                  {/* Status */}
                  <View style={styles.detailRow}>
                    <View style={[styles.statusDot, { backgroundColor: shop.status === 'active' ? '#34C759' : '#8E8E93' }]} />
                    <ThemedText style={styles.detailText}>{shop.status.charAt(0).toUpperCase() + shop.status.slice(1)}</ThemedText>
                  </View>

                  {/* Matched Specialties */}
                  <View style={styles.specialtiesRow}>
                    {shop.matched_specialties.map((s, i) => (
                      <View key={i} style={styles.matchedChip}>
                        <ThemedText style={styles.matchedChipText}>{s}</ThemedText>
                      </View>
                    ))}
                  </View>

                  {/* Send Button */}
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={() => handleSend('shop', shop.id, shop.shop_name)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name="paper-plane" size={13} color="#fff" />
                    <ThemedText style={styles.sendBtnText}>Send Request</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Matched Mechanics */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="wrench" size={14} color="#FF8C00" />
            <ThemedText style={styles.sectionTitle}>Matched Mechanics ({matched_mechanics.length})</ThemedText>
          </View>

          {matched_mechanics.length === 0 ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="inbox" size={28} color="#555" />
              <ThemedText style={styles.emptyText}>No mechanics found for these specialties</ThemedText>
            </View>
          ) : (
            matched_mechanics.map((mechanic) => (
              <View key={mechanic.id} style={styles.card}>
                <View style={styles.cardBody}>
                  <View style={styles.mechanicRow}>
                    {/* Profile Photo */}
                    {mechanic.profile_photo ? (
                      <Image source={{ uri: mechanic.profile_photo }} style={styles.profilePhoto} />
                    ) : (
                      <View style={styles.profilePhotoPlaceholder}>
                        <FontAwesome name="user" size={22} color="#555" />
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      {/* Name */}
                      <ThemedText style={styles.cardTitle}>{mechanic.full_name}</ThemedText>

                      {/* Rating + Status */}
                      <View style={styles.ratingRow}>
                        <FontAwesome name="star" size={12} color="#FF8C00" />
                        <ThemedText style={styles.ratingText}>{mechanic.average_rating.toFixed(1)}</ThemedText>
                        <View style={[styles.statusDot, { backgroundColor: mechanic.status === 'available' ? '#34C759' : '#8E8E93' }]} />
                        <ThemedText style={styles.detailText}>{mechanic.status.charAt(0).toUpperCase() + mechanic.status.slice(1)}</ThemedText>
                      </View>
                    </View>
                  </View>

                  {/* Matched Specialties */}
                  <View style={[styles.specialtiesRow, { marginTop: 10 }]}>
                    {mechanic.matched_specialties.map((s, i) => (
                      <View key={i} style={styles.matchedChip}>
                        <ThemedText style={styles.matchedChipText}>{s}</ThemedText>
                      </View>
                    ))}
                  </View>

                  {/* Send Button */}
                  <TouchableOpacity
                    style={styles.sendBtn}
                    onPress={() => handleSend('mechanic', mechanic.id, mechanic.full_name)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name="paper-plane" size={13} color="#fff" />
                    <ThemedText style={styles.sendBtnText}>Send Request</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Location Modal */}
      <Modal visible={locationModalVisible} transparent animationType="slide" onRequestClose={() => setLocationModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Where are you?</ThemedText>
              <TouchableOpacity onPress={() => setLocationModalVisible(false)}>
                <FontAwesome name="times" size={18} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ThemedText style={styles.modalSubtitle}>
              Sending to <ThemedText style={{ color: '#FF8C00', fontWeight: '700' }}>{selectedProvider?.name}</ThemedText>
            </ThemedText>

            <TextInput
              style={styles.input}
              placeholder="Street Name *"
              placeholderTextColor="#555"
              value={streetName}
              onChangeText={setStreetName}
            />
            <TextInput
              style={styles.input}
              placeholder="Barangay *"
              placeholderTextColor="#555"
              value={barangay}
              onChangeText={setBarangay}
            />
            <TextInput
              style={styles.input}
              placeholder="City / Municipality *"
              placeholderTextColor="#555"
              value={cityMunicipality}
              onChangeText={setCityMunicipality}
            />
            <TextInput
              style={styles.input}
              placeholder="Landmark (Optional)"
              placeholderTextColor="#555"
              value={landmark}
              onChangeText={setLandmark}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setLocationModalVisible(false)} activeOpacity={0.7}>
                <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleConfirmSend} disabled={sending} activeOpacity={0.7}>
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="paper-plane" size={13} color="#fff" />
                    <ThemedText style={styles.modalConfirmText}>Send</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, backgroundColor: '#1A1C1E',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FF8C0015', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },

  // Description
  descriptionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#1A1C1E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2A2C2E', marginBottom: 16,
  },
  descriptionText: { flex: 1, fontSize: 13, color: '#ccc', lineHeight: 20 },

  // Section
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Specialties
  specialtiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specialtyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF8C0020', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FF8C0040',
  },
  specialtyName: { fontSize: 12, fontWeight: '600', color: '#FF8C00' },
  specialtyConfidence: { fontSize: 11, color: '#FF8C00', opacity: 0.8 },

  // Card
  card: {
    backgroundColor: '#1A1C1E', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#2A2C2E', overflow: 'hidden',
  },
  banner: { width: '100%', height: 120 },
  bannerPlaceholder: {
    width: '100%', height: 120, backgroundColor: '#222426',
    justifyContent: 'center', alignItems: 'center',
  },
  cardBody: { padding: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff', flex: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 11, color: '#34C759', fontWeight: '600' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  detailText: { fontSize: 13, color: '#8E8E93' },

  // Mechanic
  mechanicRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  profilePhoto: { width: 52, height: 52, borderRadius: 26 },
  profilePhotoPlaceholder: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#222426', justifyContent: 'center', alignItems: 'center',
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingText: { fontSize: 13, fontWeight: '600', color: '#FF8C00' },

  // Matched chips
  matchedChip: {
    backgroundColor: '#007AFF20', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#007AFF40',
  },
  matchedChipText: { fontSize: 11, color: '#007AFF', fontWeight: '600' },

  // Send button
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF8C00', borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13, color: '#555' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1A1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, borderWidth: 1, borderColor: '#2A2C2E',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  modalSubtitle: { fontSize: 13, color: '#8E8E93', marginBottom: 16 },
  input: {
    backgroundColor: '#222426', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#fff', marginBottom: 10, borderWidth: 1, borderColor: '#2A2C2E',
  },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalCancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    borderRadius: 12, backgroundColor: '#222426',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  modalConfirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FF8C00',
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});