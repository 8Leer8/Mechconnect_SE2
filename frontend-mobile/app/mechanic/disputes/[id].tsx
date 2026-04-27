import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type DisputeStatus =
  | 'active'
  | 'under_admin_review'
  | 'waiting_for_mechanic_payment'
  | 'waiting_for_client_verification'
  | string;

interface DisputeDetails {
  id?: number;
  issue_description?: string;
  issue_pictures?: string[];
  mechanic_defense_description?: string | null;
  mechanic_defense_picture?: string | null;
  refund_receipt_image?: string | null;
  dispute_status?: DisputeStatus;
  amount_refunded?: number | null;
  refund_method?: string | null;
  refund_account_number?: string | null;
}

interface DisputeBookingPayload {
  id: number;
  amount_fee: number;
  dispute_status?: string;
  dispute_details?: DisputeDetails;
  client?: {
    firstname?: string;
    lastname?: string;
    username?: string;
  };
}

type BookingDetailResponse = {
  booking?: DisputeBookingPayload;
};

export default function DisputeResolutionCenterScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bookingId = id ? Number(id) : NaN;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<DisputeBookingPayload | null>(null);
  const [actionView, setActionView] = useState<'payment' | 'defend'>('payment');
  const [defenseDescription, setDefenseDescription] = useState('');
  const [selectedDefenseUri, setSelectedDefenseUri] = useState<string | null>(null);
  const [mechanicCredits, setMechanicCredits] = useState<number | null>(null);

  const dispute = booking?.dispute_details || null;
  const normalizedDisputeStatus = String(
    dispute?.dispute_status || booking?.dispute_status || 'active'
  ).toLowerCase();

  const clientName = useMemo(() => {
    const first = booking?.client?.firstname || '';
    const last = booking?.client?.lastname || '';
    const full = `${first} ${last}`.trim();
    return full || booking?.client?.username || 'Client';
  }, [booking?.client?.firstname, booking?.client?.lastname, booking?.client?.username]);

  const disputeAmount = useMemo(() => {
    const fromDispute = Number(dispute?.amount_refunded ?? 0);
    if (Number.isFinite(fromDispute) && fromDispute > 0) return fromDispute;
    const fromBooking = Number(booking?.amount_fee ?? 0);
    return Number.isFinite(fromBooking) ? Math.max(0, fromBooking) : 0;
  }, [dispute?.amount_refunded, booking?.amount_fee]);

  const fetchDispute = useCallback(async () => {
    try {
      setError(null);

      if (!Number.isFinite(bookingId) || bookingId <= 0) {
        throw new Error('Missing dispute booking ID');
      }

      const detailResponse = await fetch(`${API_URL}/bookings/mechanic/bookings/${bookingId}/`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!detailResponse.ok) {
        throw new Error('Unable to load dispute details');
      }

      const detailData = (await detailResponse.json()) as BookingDetailResponse;
      const bookingPayload = (detailData?.booking || detailData) as DisputeBookingPayload;
      setBooking(bookingPayload);

      // Fetch mechanic's current credits
      try {
        const walletResponse = await fetch(`${API_URL}/users/wallet/`, {
          credentials: 'include',
        });
        if (walletResponse.ok) {
          const walletData = await walletResponse.json();
          setMechanicCredits(walletData?.balance ?? null);
        }
      } catch {
        // Silently fail - credits display is optional
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load dispute');
      setBooking(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchDispute();
    }, [fetchDispute])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDispute();
  };

  const pickImageFromGallery = async (onSelected: (uri: string) => void) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Gallery permission is needed to upload an image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        onSelected(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Upload error', 'Unable to pick image. Please try again.');
    }
  };

  const pickDefenseImage = async () => {
    await pickImageFromGallery((uri) => setSelectedDefenseUri(uri));
  };

  const submitReceiptProof = async () => {
    if (!booking?.id) return;

    try {
      setSubmitting(true);

      // Simple POST without receipt image - credits are transferred directly
      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/disputes/upload-receipt/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as any)?.error || 'Failed to process credit payment');
      }

      const amount = payload?.dispute?.amount_refunded || disputeAmount;
      Alert.alert(
        'Dispute Resolved',
        `Credit payment of Php ${amount.toFixed(2)} completed. The dispute has been resolved.`,
        [{ text: 'OK', onPress: () => router.replace('/(mechanicTabs)/main/home') }]
      );
      fetchDispute();
    } catch (err: any) {
      Alert.alert('Payment failed', err?.message || 'Unable to process credit payment');
    } finally {
      setSubmitting(false);
    }
  };

  const submitDefenseToAdmin = async () => {
    if (!booking?.id) return;
    const description = defenseDescription.trim();
    if (!description) {
      Alert.alert('Missing details', 'Please enter your defense description.');
      return;
    }
    if (!selectedDefenseUri) {
      Alert.alert('Missing proof', 'Please upload a defense proof image.');
      return;
    }

    try {
      setSubmitting(true);

      const fileName = selectedDefenseUri.split('/').pop() || `defense-${booking.id}.jpg`;
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

      const formData = new FormData();
      formData.append('defense_description', description);
      formData.append('defense_picture', {
        uri: selectedDefenseUri,
        name: fileName,
        type: mimeType,
      } as any);

      const response = await fetch(`${API_URL}/bookings/mechanic/bookings/${booking.id}/disputes/submit-defense/`, {
        method: 'POST',
        credentials: 'include',
        body: formData as any,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as any)?.error || 'Failed to submit defense');
      }

      Alert.alert('Defense submitted', 'Your defense has been sent to Admin for review.');
      fetchDispute();
    } catch (err: any) {
      Alert.alert('Submit failed', err?.message || 'Unable to submit defense');
    } finally {
      setSubmitting(false);
    }
  };

  const renderActionBlock = () => {
    if (!booking || !dispute) return null;

    if (normalizedDisputeStatus === 'under_admin_review') {
      return (
        <View style={styles.actionCard}>
          <ThemedText style={styles.actionTitle}>Under Admin Review</ThemedText>
          <ThemedText style={styles.actionBody}>
            Your defense has been submitted. Our Admin team is currently reviewing the evidence. Your account will remain limited until a decision is made.
          </ThemedText>
          {dispute.mechanic_defense_description ? (
            <View style={styles.defenseSummaryCard}>
              <ThemedText style={styles.defenseSummaryLabel}>Your Defense</ThemedText>
              <ThemedText style={styles.defenseSummaryText}>{dispute.mechanic_defense_description}</ThemedText>
              {dispute.mechanic_defense_picture ? (
                <Image source={{ uri: dispute.mechanic_defense_picture }} style={styles.uploadPreview} />
              ) : null}
            </View>
          ) : null}
        </View>
      );
    }

    if (normalizedDisputeStatus === 'waiting_for_mechanic_payment') {
      const creditMessage = `A dispute has been filed against you. The amount of Php ${disputeAmount.toFixed(2)} will be deducted from your credits to resolve this dispute.`;

      if (actionView === 'defend') {
        return (
          <View style={styles.actionCard}>
            <ThemedText style={styles.actionTitle}>Submit Defense</ThemedText>
            <ThemedText style={styles.actionBody}>
              Explain why this claim is invalid and upload proof of your completed work.
            </ThemedText>

            <TextInput
              style={styles.defenseInput}
              placeholder="Enter your defense statement..."
              placeholderTextColor="#777"
              value={defenseDescription}
              onChangeText={setDefenseDescription}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity style={styles.uploadCard} onPress={pickDefenseImage} activeOpacity={0.8}>
              {selectedDefenseUri ? (
                <Image source={{ uri: selectedDefenseUri }} style={styles.uploadPreview} />
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <FontAwesome name="camera" size={24} color="#B3B3B3" />
                  <ThemedText style={styles.uploadPlaceholderText}>Tap to upload defense proof</ThemedText>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitButton, submitting ? styles.submitButtonDisabled : null]}
              onPress={submitDefenseToAdmin}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <FontAwesome name="gavel" size={14} color="#FFFFFF" />
                  <ThemedText style={styles.submitButtonText}>Submit Defense to Admin</ThemedText>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ghostActionButton}
              onPress={() => setActionView('payment')}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <ThemedText style={styles.ghostActionText}>Back to Credit Payment</ThemedText>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <View style={styles.actionCard}>
          <ThemedText style={styles.actionTitle}>Action Required</ThemedText>
          <ThemedText style={styles.actionBody}>{creditMessage}</ThemedText>

          <View style={[styles.creditInfoCard, { backgroundColor: '#1A2A1A', borderColor: '#34C759', borderWidth: 1, borderRadius: 10, padding: 14, marginVertical: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <FontAwesome name="credit-card" size={24} color="#34C759" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ color: '#34C759', fontSize: 14, fontWeight: '700' }}>
                  Credit Deduction
                </ThemedText>
                <ThemedText style={{ color: '#8E8E93', fontSize: 12, marginTop: 2, flexWrap: 'wrap' }}>
                  Php {disputeAmount.toFixed(2)} will be deducted from your available credits
                </ThemedText>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, submitting ? styles.submitButtonDisabled : null]}
            onPress={submitReceiptProof}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <FontAwesome name="check-circle" size={14} color="#FFFFFF" />
                <ThemedText style={styles.submitButtonText}>Confirm Credit Payment</ThemedText>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostActionButton}
            onPress={() => setActionView('defend')}
            disabled={submitting}
            activeOpacity={0.8}
          >
            <ThemedText style={styles.ghostActionText}>I disagree. Submit a defense.</ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    if (normalizedDisputeStatus === 'resolved') {
      return (
        <View style={styles.actionCard}>
          <ThemedText style={styles.actionTitle}>Dispute Resolved</ThemedText>
          <ThemedText style={styles.actionBody}>
            The dispute has been resolved. Php {disputeAmount.toFixed(2)} has been refunded to the client via credits.
          </ThemedText>

          <View style={[styles.creditInfoCard, { backgroundColor: '#1A2A1A', borderColor: '#34C759', borderWidth: 1, borderRadius: 10, padding: 14, marginVertical: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <FontAwesome name="check-circle" size={24} color="#34C759" />
              <View>
                <ThemedText style={{ color: '#34C759', fontSize: 14, fontWeight: '700' }}>
                  Refund Completed
                </ThemedText>
                <ThemedText style={{ color: '#8E8E93', fontSize: 12, marginTop: 2 }}>
                  Your account is now unlocked and you can accept new jobs
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.actionCard}>
        <ThemedText style={styles.actionTitle}>Admin Review</ThemedText>
        <ThemedText style={styles.actionBody}>
          This dispute is currently being reviewed by our Admin team. We will notify you of the next steps.
        </ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(18, insets.top + 8) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF8C00" />}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <FontAwesome name="arrow-left" size={16} color="#ECEDEE" />
            <ThemedText style={styles.backText}>Back</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.lockBanner}>
          <FontAwesome name="warning" size={18} color="#FFD9D9" />
          <ThemedText style={styles.lockBannerText}>
            Warning: Account Locked. You must resolve this dispute to accept new jobs.
          </ThemedText>
        </View>

        <View style={styles.headerRow}>
          <ThemedText style={styles.headerTitle}>Resolution Center</ThemedText>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color="#FF8C00" />
            <ThemedText style={styles.centerText}>Loading dispute details...</ThemedText>
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <FontAwesome name="exclamation-circle" size={38} color="#FF4D4D" />
            <ThemedText style={styles.centerText}>{error}</ThemedText>
          </View>
        ) : !booking || !dispute ? (
          <View style={styles.centerState}>
            <FontAwesome name="check-circle" size={38} color="#34C759" />
            <ThemedText style={styles.centerText}>No active dispute found.</ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.detailsCard}>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.detailLabel}>Booking ID</ThemedText>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => router.push({
                    pathname: '/mechanic/booking/booking_details',
                    params: { bookingId: String(booking.id) },
                  })}
                >
                  <ThemedText style={styles.detailValueLink}>#{booking.id}</ThemedText>
                </TouchableOpacity>
              </View>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.detailLabel}>Client</ThemedText>
                <ThemedText style={styles.detailValue}>{clientName}</ThemedText>
              </View>
              <View style={styles.rowBetween}>
                <ThemedText style={styles.detailLabel}>Amount Disputed</ThemedText>
                <ThemedText style={styles.detailValue}>Php {disputeAmount.toFixed(2)}</ThemedText>
              </View>

              {mechanicCredits !== null && (
                <View style={styles.rowBetween}>
                  <ThemedText style={styles.detailLabel}>Your Available Credits</ThemedText>
                  <ThemedText style={[styles.detailValue, { color: mechanicCredits >= disputeAmount ? '#34C759' : '#FF4D4D' }]}>
                    Php {mechanicCredits.toFixed(2)}
                  </ThemedText>
                </View>
              )}

              <View style={styles.complaintBlock}>
                <ThemedText style={styles.complaintTitle}>Client Complaint</ThemedText>
                <ThemedText style={styles.complaintText}>
                  {dispute.issue_description || 'No complaint description provided.'}
                </ThemedText>

                {dispute.issue_pictures && dispute.issue_pictures.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {dispute.issue_pictures.map((uri: string, index: number) => (
                      <Image key={index} source={{ uri }} style={[styles.complaintImage, { width: 100, height: 100 }]} />
                    ))}
                  </View>
                ) : (
                  <View style={styles.imageFallback}>
                    <FontAwesome name="image" size={18} color="#8E8E93" />
                    <ThemedText style={styles.imageFallbackText}>No complaint photos uploaded</ThemedText>
                  </View>
                )}
              </View>
            </View>

            {renderActionBlock()}

            <View style={styles.footerNotice}>
              <ThemedText style={styles.footerNoticeText}>
                Note: Your ability to accept new jobs is disabled until this is resolved.
              </ThemedText>
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111214',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  headerTopRow: {
    marginBottom: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  backText: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '700',
  },
  lockBanner: {
    backgroundColor: '#7A1212',
    borderWidth: 1,
    borderColor: '#FF4D4D',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  lockBannerText: {
    flex: 1,
    color: '#FFD9D9',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  headerRow: {
    marginBottom: 12,
  },
  headerTitle: {
    color: '#ECEDEE',
    fontSize: 24,
    fontWeight: '800',
  },
  centerState: {
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerText: {
    color: '#C7C8CA',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  detailsCard: {
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    color: '#A5A7AA',
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '700',
  },
  detailValueLink: {
    color: '#5DAEFF',
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  complaintBlock: {
    marginTop: 2,
    gap: 8,
  },
  complaintTitle: {
    color: '#ECEDEE',
    fontSize: 13,
    fontWeight: '700',
  },
  complaintText: {
    color: '#C7C8CA',
    fontSize: 13,
    lineHeight: 19,
  },
  complaintImage: {
    width: '100%',
    height: 170,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F3133',
  },
  imageFallback: {
    width: '100%',
    height: 120,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2F3133',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#151618',
  },
  imageFallbackText: {
    color: '#8E8E93',
    fontSize: 12,
  },
  actionCard: {
    backgroundColor: '#1A1C1E',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  creditInfoCard: {
    backgroundColor: '#1A2A1A',
    borderWidth: 1,
    borderColor: '#34C759',
    borderRadius: 10,
    padding: 14,
    marginVertical: 8,
  },
  actionTitle: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '800',
  },
  actionBody: {
    color: '#C7C8CA',
    fontSize: 13,
    lineHeight: 19,
  },
  defenseInput: {
    minHeight: 110,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#343638',
    backgroundColor: '#141517',
    color: '#ECEDEE',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  uploadCard: {
    borderWidth: 1,
    borderColor: '#343638',
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
    minHeight: 130,
    backgroundColor: '#141517',
  },
  uploadPreview: {
    width: '100%',
    height: 170,
  },
  uploadPlaceholder: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  uploadPlaceholderText: {
    color: '#B3B3B3',
    fontSize: 12,
    textAlign: 'center',
  },
  submitButton: {
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: '#FF8C00',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  ghostActionButton: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3C3E40',
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151618',
  },
  ghostActionText: {
    color: '#D3D5D8',
    fontSize: 12,
    fontWeight: '700',
  },
  defenseSummaryCard: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#2F3133',
    borderRadius: 10,
    backgroundColor: '#151618',
    padding: 10,
    gap: 8,
  },
  defenseSummaryLabel: {
    color: '#ECEDEE',
    fontSize: 12,
    fontWeight: '700',
  },
  defenseSummaryText: {
    color: '#C7C8CA',
    fontSize: 12,
    lineHeight: 17,
  },
  waitingText: {
    color: '#A9ABAE',
    fontSize: 12,
    lineHeight: 18,
  },
  footerNotice: {
    backgroundColor: '#191A1C',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  footerNoticeText: {
    color: '#A9ABAE',
    fontSize: 12,
    lineHeight: 17,
  },
});