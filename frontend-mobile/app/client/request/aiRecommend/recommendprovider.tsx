import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useNotification } from '@/hooks/useNotification';
import { StyleSheet } from 'react-native';
import { getImageUrl } from '@/lib/imageUtils';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface AIRecommendation { specialty: string; confidence: number; }
interface MatchedShop {
  id: number; shop_name: string; service_banner: string | null;
  is_verified: boolean; status: string; matched_specialties: string[];
}
interface MatchedMechanic {
  id: number; full_name: string; profile_photo: string | null;
  average_rating: number; status: string; matched_specialties: string[];
}

interface CreateCustomRequestResponse {
  message?: string;
  error?: string;
}

export default function RecommendProviderScreen() {
  const { showNotification } = useNotification();
  const params = useLocalSearchParams();

  // ─── Params ───────────────────────────────────────────────
  const description = params.description as string || '';
  const concern_picture = params.concern_picture as string || '';
  const street_name = params.street_name as string || '';
  const barangay = params.barangay as string || '';
  const city_municipality = params.city_municipality as string || '';
  const landmark = params.landmark as string || '';
  const ai_recommendations: AIRecommendation[] = JSON.parse(params.ai_recommendations as string || '[]');
  const matched_shops: MatchedShop[] = JSON.parse(params.matched_shops as string || '[]');
  const matched_mechanics: MatchedMechanic[] = JSON.parse(params.matched_mechanics as string || '[]');
  const vehicle_type = params.vehicle_type as string || '';
  const vehicle_brand = params.vehicle_brand as string || '';
  const vehicle_model = params.vehicle_model as string || '';

  // ─── State ────────────────────────────────────────────────
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [lastSentName, setLastSentName] = useState('');

  // ─── Send Request ─────────────────────────────────────────
  const handleSend = async (type: 'shop' | 'mechanic', id: number, name: string) => {
    const key = `${type}-${id}`;
    if (sentIds.has(key)) return;

    setSending(key);
    try {
      const formData = new FormData();
      formData.append('description', description);
      formData.append('vehicle_type', vehicle_type);
      formData.append('vehicle_brand', vehicle_brand);
      formData.append('vehicle_model', vehicle_model);

      if (type === 'shop') {
        formData.append('shop_id', id.toString());
      } else {
        formData.append('provider_id', id.toString());
      }

      formData.append('service_location', JSON.stringify({
        street_name,
        barangay,
        city_municipality,
        landmark: landmark || undefined,
      }));

      if (concern_picture) {
        const filename = concern_picture.split('/').pop() || 'image.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const mimeType = match ? `image/${match[1]}` : 'image/jpeg';
        formData.append('concern_picture', { uri: concern_picture, name: filename, type: mimeType } as any);
      }

      const response = await fetch(`${API_URL}/bookings/requests/custom/create/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const data = await response.json() as CreateCustomRequestResponse;

      if (response.ok) {
        setSentIds(prev => new Set(prev).add(key));
        setLastSentName(name);
        setSuccessModalVisible(true);
      } else {
        showNotification({ type: 'error', message: data.error || 'Failed to send request' });
      }
    } catch (error) {
      showNotification({ type: 'error', message: 'An error occurred while sending the request' });
    } finally {
      setSending(null);
    }
  };

  const handleDone = () => {
    router.push('/(clientTabs)/main/request' as any);
  };

  // ─── Render ───────────────────────────────────────────────
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
            matched_shops.map((shop) => {
              const key = `shop-${shop.id}`;
              const isSent = sentIds.has(key);
              const isSending = sending === key;
              return (
                <View key={shop.id} style={[styles.card, isSent && styles.cardSent]}>
                  {shop.service_banner ? (
                    <Image source={{ uri: getImageUrl(shop.service_banner) || '' }} style={styles.banner} resizeMode="cover" />
                  ) : (
                    <View style={styles.bannerPlaceholder}>
                      <FontAwesome name="building" size={28} color="#555" />
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <View style={styles.cardTitleRow}>
                      <ThemedText style={styles.cardTitle}>{shop.shop_name}</ThemedText>
                      {shop.is_verified && (
                        <View style={styles.verifiedBadge}>
                          <FontAwesome name="check-circle" size={12} color="#34C759" />
                          <ThemedText style={styles.verifiedText}>Verified</ThemedText>
                        </View>
                      )}
                    </View>
                    <View style={styles.detailRow}>
                      <View style={[styles.statusDot, { backgroundColor: shop.status === 'active' ? '#34C759' : '#8E8E93' }]} />
                      <ThemedText style={styles.detailText}>{shop.status.charAt(0).toUpperCase() + shop.status.slice(1)}</ThemedText>
                    </View>
                    <View style={styles.specialtiesRow}>
                      {shop.matched_specialties.map((s, i) => (
                        <View key={i} style={styles.matchedChip}>
                          <ThemedText style={styles.matchedChipText}>{s}</ThemedText>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.sendBtn, isSent && styles.sentBtn]}
                      onPress={() => handleSend('shop', shop.id, shop.shop_name)}
                      disabled={isSent || !!sending}
                      activeOpacity={0.7}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isSent ? (
                        <>
                          <FontAwesome name="check" size={13} color="#fff" />
                          <ThemedText style={styles.sendBtnText}>Request Sent</ThemedText>
                        </>
                      ) : (
                        <>
                          <FontAwesome name="paper-plane" size={13} color="#fff" />
                          <ThemedText style={styles.sendBtnText}>Send Request</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
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
            matched_mechanics.map((mechanic) => {
              const key = `mechanic-${mechanic.id}`;
              const isSent = sentIds.has(key);
              const isSending = sending === key;
              return (
                <View key={mechanic.id} style={[styles.card, isSent && styles.cardSent]}>
                  <View style={styles.cardBody}>
                    <View style={styles.mechanicRow}>
                      {mechanic.profile_photo ? (
                        <Image source={{ uri: getImageUrl(mechanic.profile_photo) || '' }} style={styles.profilePhoto} />
                      ) : (
                        <View style={styles.profilePhotoPlaceholder}>
                          <FontAwesome name="user" size={22} color="#555" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.cardTitle}>{mechanic.full_name}</ThemedText>
                        <View style={styles.ratingRow}>
                          <FontAwesome name="star" size={12} color="#FF8C00" />
                          <ThemedText style={styles.ratingText}>{mechanic.average_rating.toFixed(1)}</ThemedText>
                          <View style={[styles.statusDot, { backgroundColor: mechanic.status === 'available' ? '#34C759' : '#8E8E93' }]} />
                          <ThemedText style={styles.detailText}>{mechanic.status.charAt(0).toUpperCase() + mechanic.status.slice(1)}</ThemedText>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.specialtiesRow, { marginTop: 10 }]}>
                      {mechanic.matched_specialties.map((s, i) => (
                        <View key={i} style={styles.matchedChip}>
                          <ThemedText style={styles.matchedChipText}>{s}</ThemedText>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.sendBtn, isSent && styles.sentBtn]}
                      onPress={() => handleSend('mechanic', mechanic.id, mechanic.full_name)}
                      disabled={isSent || !!sending}
                      activeOpacity={0.7}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isSent ? (
                        <>
                          <FontAwesome name="check" size={13} color="#fff" />
                          <ThemedText style={styles.sendBtnText}>Request Sent</ThemedText>
                        </>
                      ) : (
                        <>
                          <FontAwesome name="paper-plane" size={13} color="#fff" />
                          <ThemedText style={styles.sendBtnText}>Send Request</ThemedText>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Done Button */}
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.7}>
          <FontAwesome name="check-circle" size={16} color="#fff" />
          <ThemedText style={styles.doneBtnText}>Done</ThemedText>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="fade" onRequestClose={() => setSuccessModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.successIconCircle}>
              <FontAwesome name="check" size={32} color="#34C759" />
            </View>
            <ThemedText style={styles.modalTitle}>Request Sent!</ThemedText>
            <ThemedText style={styles.modalSubtitle}>
              Your request has been successfully sent to{' '}
              <ThemedText style={{ color: '#FF8C00', fontWeight: '700' }}>{lastSentName}</ThemedText>.
              {'\n'}They will review and respond shortly.
            </ThemedText>
            <ThemedText style={styles.modalHint}>
              You can still send to other mechanics or shops.
            </ThemedText>
            <TouchableOpacity
              style={styles.modalOkBtn}
              onPress={() => setSuccessModalVisible(false)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.modalOkText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

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
  descriptionBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#1A1C1E', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2A2C2E', marginBottom: 16,
  },
  descriptionText: { flex: 1, fontSize: 13, color: '#ccc', lineHeight: 20 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  specialtiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  specialtyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FF8C0020', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FF8C0040',
  },
  specialtyName: { fontSize: 12, fontWeight: '600', color: '#FF8C00' },
  specialtyConfidence: { fontSize: 11, color: '#FF8C00', opacity: 0.8 },
  card: {
    backgroundColor: '#1A1C1E', borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#2A2C2E', overflow: 'hidden',
  },
  cardSent: { borderColor: '#34C75940', opacity: 0.85 },
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
  mechanicRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  profilePhoto: { width: 52, height: 52, borderRadius: 26 },
  profilePhotoPlaceholder: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#222426', justifyContent: 'center', alignItems: 'center',
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  ratingText: { fontSize: 13, fontWeight: '600', color: '#FF8C00' },
  matchedChip: {
    backgroundColor: '#007AFF20', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#007AFF40',
  },
  matchedChipText: { fontSize: 11, color: '#007AFF', fontWeight: '600' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FF8C00', borderRadius: 12, paddingVertical: 12, marginTop: 12,
  },
  sentBtn: { backgroundColor: '#34C759' },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  emptyCard: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 13, color: '#555' },

  // Done Button
  doneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#222426', borderRadius: 12, paddingVertical: 14,
    borderWidth: 1, borderColor: '#2A2C2E', marginTop: 8,
  },
  doneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Success Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#1A1C1E', borderRadius: 20,
    padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2A2C2E',
  },
  successIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#34C75920', justifyContent: 'center',
    alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#ccc', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  modalHint: { fontSize: 12, color: '#8E8E93', textAlign: 'center', marginBottom: 24 },
  modalOkBtn: {
    width: '100%', backgroundColor: '#FF8C00',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  modalOkText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});