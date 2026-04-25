import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

interface PaymentSuccessModalProps {
  visible: boolean;
  bookingId: number;
  amount: number;
  paymentMethod: 'cash' | 'gcash' | 'maya' | string;
  totalPaid?: number;
  remainingBalance?: number;
  paymentStatus?: string;
  installmentCount?: number;
  onClose: () => void;
}

export default function PaymentSuccessModal({
  visible,
  bookingId,
  amount,
  paymentMethod,
  totalPaid = 0,
  remainingBalance = 0,
  paymentStatus,
  installmentCount = 0,
  onClose,
}: PaymentSuccessModalProps) {
  const methodLabel =
    paymentMethod === 'gcash'
      ? 'GCash'
      : paymentMethod === 'maya'
        ? 'Maya'
        : paymentMethod === 'credits'
          ? 'Credits'
          : 'Cash';
  const normalizedStatus = String(paymentStatus || '').toLowerCase();
  const statusLabel =
    normalizedStatus === 'fully_paid'
      ? 'Fully Paid'
      : normalizedStatus === 'partially_paid'
        ? 'Partially Paid'
        : 'Payment Updated';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <FontAwesome name="check-circle" size={64} color="#34C759" />
          <ThemedText style={styles.title}>Payment Confirmed!</ThemedText>

          <ThemedText style={styles.detail}>Amount: PHP {Number(amount || 0).toFixed(2)}</ThemedText>
          <ThemedText style={styles.detail}>Method: {methodLabel}</ThemedText>
          <ThemedText style={styles.detail}>Booking #{bookingId}</ThemedText>

          <View style={styles.progressBox}>
            <View style={styles.progressRow}>
              <ThemedText style={styles.progressLabel}>Status</ThemedText>
              <ThemedText style={styles.progressValue}>{statusLabel}</ThemedText>
            </View>
            <View style={styles.progressRow}>
              <ThemedText style={styles.progressLabel}>Total Paid</ThemedText>
              <ThemedText style={[styles.progressValue, { color: '#34C759' }]}>PHP {Number(totalPaid || 0).toFixed(2)}</ThemedText>
            </View>
            <View style={styles.progressRow}>
              <ThemedText style={styles.progressLabel}>Remaining</ThemedText>
              <ThemedText style={[styles.progressValue, { color: Number(remainingBalance || 0) > 0 ? '#FFD60A' : '#34C759' }]}>
                PHP {Number(remainingBalance || 0).toFixed(2)}
              </ThemedText>
            </View>
            {installmentCount > 0 ? (
              <View style={styles.progressRow}>
                <ThemedText style={styles.progressLabel}>Installments</ThemedText>
                <ThemedText style={styles.progressValue}>{installmentCount}</ThemedText>
              </View>
            ) : null}
          </View>

          <TouchableOpacity style={styles.button} onPress={onClose}>
            <ThemedText style={styles.buttonText}>Done</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1A1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    alignItems: 'center',
    padding: 22,
  },
  title: {
    marginTop: 10,
    marginBottom: 14,
    color: '#ECEDEE',
    fontWeight: '800',
    fontSize: 22,
  },
  detail: {
    color: '#9BA1A6',
    marginTop: 4,
  },
  progressBox: {
    width: '100%',
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    backgroundColor: '#151718',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  progressValue: {
    color: '#ECEDEE',
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#FF8C00',
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  buttonText: {
    color: '#1A1C1E',
    fontWeight: '800',
  },
});