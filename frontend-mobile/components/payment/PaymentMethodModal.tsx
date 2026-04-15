import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';

interface PaymentMethodModalProps {
  visible: boolean;
  bookingId: number;
  totalAmount: number;
  onClose: () => void;
  onPaymentInitiated: (method: string) => void;
}

export default function PaymentMethodModal({
  visible,
  bookingId,
  totalAmount,
  onClose,
  onPaymentInitiated,
}: PaymentMethodModalProps) {
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);

  const initiateCash = async () => {
    try {
      setLoadingMethod('cash');
      const response = await fetch(`${API_URL}/bookings/payments/initiate/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, payment_method: 'cash' }),
      });

      const rawPayload: unknown = await response.json().catch(() => ({}));
      const payload: Record<string, unknown> =
        typeof rawPayload === 'object' && rawPayload !== null
          ? (rawPayload as Record<string, unknown>)
          : {};
      const errorMessage =
        typeof payload.error === 'string' ? payload.error : 'Unable to start cash payment';
      if (!response.ok) {
        throw new Error(errorMessage);
      }

      onPaymentInitiated('cash');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start cash payment';
      Alert.alert('Payment Error', message);
    } finally {
      setLoadingMethod(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ThemedText style={styles.title}>How will you pay?</ThemedText>
          <ThemedText style={styles.subtitle}>Booking #{bookingId} - PHP {Number(totalAmount || 0).toFixed(2)}</ThemedText>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={initiateCash}
            disabled={loadingMethod !== null}
            activeOpacity={0.85}
          >
            <View style={styles.optionHeader}>
              <FontAwesome name="money" size={18} color="#FF8C00" />
              <ThemedText style={styles.optionTitle}>Cash</ThemedText>
            </View>
            <ThemedText style={styles.optionDescription}>Pay your mechanic directly</ThemedText>
            {loadingMethod === 'cash' ? <ActivityIndicator color="#FF8C00" style={styles.loadingIcon} /> : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.optionCard}
            onPress={() => onPaymentInitiated('ewallet')}
            disabled={loadingMethod !== null}
            activeOpacity={0.85}
          >
            <View style={styles.optionHeader}>
              <FontAwesome name="mobile" size={18} color="#FF8C00" />
              <ThemedText style={styles.optionTitle}>E-Wallet</ThemedText>
            </View>
            <ThemedText style={styles.optionDescription}>GCash or Maya</ThemedText>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <ThemedText style={styles.cancelText}>Close</ThemedText>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ECEDEE',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 14,
    color: '#8E8E93',
  },
  optionCard: {
    backgroundColor: '#151718',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 14,
    marginBottom: 10,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    fontWeight: '800',
    color: '#ECEDEE',
    fontSize: 16,
  },
  optionDescription: {
    marginTop: 6,
    color: '#9BA1A6',
  },
  loadingIcon: {
    marginTop: 10,
  },
  cancelButton: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#2A2C2E',
    paddingVertical: 12,
  },
  cancelText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
});