import React from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

interface PaymentSuccessModalProps {
  visible: boolean;
  bookingId: number;
  amount: number;
  paymentMethod: 'cash' | 'gcash' | 'maya' | string;
  onClose: () => void;
}

export default function PaymentSuccessModal({
  visible,
  bookingId,
  amount,
  paymentMethod,
  onClose,
}: PaymentSuccessModalProps) {
  const methodLabel =
    paymentMethod === 'gcash' ? 'GCash' : paymentMethod === 'maya' ? 'Maya' : 'Cash';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <FontAwesome name="check-circle" size={64} color="#34C759" />
          <ThemedText style={styles.title}>Payment Confirmed!</ThemedText>

          <ThemedText style={styles.detail}>Amount: PHP {Number(amount || 0).toFixed(2)}</ThemedText>
          <ThemedText style={styles.detail}>Method: {methodLabel}</ThemedText>
          <ThemedText style={styles.detail}>Booking #{bookingId}</ThemedText>

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