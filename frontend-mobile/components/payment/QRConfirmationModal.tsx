import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';
import { buildAuthHeaders } from '@/lib/authHeaders';

const ORANGE = '#FF8C00';

interface QRConfirmationData {
  booking_id: number;
  amount: string;
  mechanic_name: string;
  booking_number: string;
}

interface QRConfirmationModalProps {
  visible: boolean;
  scanData: QRConfirmationData | null;
  token: string;
  onConfirm: () => void;
  onClose: () => void;
  onCancel: () => void;
}

export default function QRConfirmationModal({
  visible,
  scanData,
  token,
  onConfirm,
  onClose,
  onCancel,
}: QRConfirmationModalProps) {
  const [loading, setLoading] = useState(false);

  const confirmPayment = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch(`${API_URL}/bookings/payments/qr/confirm/`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ token }),
      });

      const rawPayload: unknown = await response.json().catch(() => ({}));
      const payload: Record<string, unknown> =
        typeof rawPayload === 'object' && rawPayload !== null
          ? (rawPayload as Record<string, unknown>)
          : {};
      const errorMessage =
        typeof payload.error === 'string' ? payload.error : 'Unable to confirm payment';
      if (!response.ok) {
        throw new Error(errorMessage);
      }
      onConfirm();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to confirm payment';
      Alert.alert('Payment Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ThemedText style={styles.title}>QR Verified</ThemedText>

          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Mechanic</ThemedText>
            <ThemedText style={styles.infoValue}>{scanData?.mechanic_name || '-'}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Booking</ThemedText>
            <ThemedText style={styles.infoValue}>{scanData?.booking_number || '-'}</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText style={styles.infoLabel}>Amount</ThemedText>
            <ThemedText style={styles.infoValue}>PHP {Number(scanData?.amount || 0).toFixed(2)}</ThemedText>
          </View>

          <TouchableOpacity style={styles.confirmButton} onPress={confirmPayment} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.confirmText}>Confirm Payment</ThemedText>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <FontAwesome name="refresh" size={14} color="#ECEDEE" />
            <ThemedText style={styles.cancelText}>Scan Again</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <ThemedText style={styles.closeText}>Close</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    backgroundColor: '#1A1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3D40',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    color: '#ECEDEE',
    fontWeight: '800',
    fontSize: 24,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoLabel: {
    color: '#8E8E93',
  },
  infoValue: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
  confirmButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: ORANGE,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  confirmText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3D40',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  cancelText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
  closeButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3D40',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  closeText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
});