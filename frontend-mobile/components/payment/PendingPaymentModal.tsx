import React, { useEffect } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';
import { useWebSocketContext } from '@/context/WebSocketContext';
import { buildAuthHeaders } from '@/lib/authHeaders';

interface PendingPaymentModalProps {
  visible: boolean;
  bookingId: number;
  amount: number;
  onClose: () => void;
  onPaymentReceived: () => void;
  onCashSelected?: () => void;
}

export default function PendingPaymentModal({
  visible,
  bookingId,
  amount,
  onClose,
  onPaymentReceived,
  onCashSelected,
}: PendingPaymentModalProps) {
  const { lastMessage } = useWebSocketContext();

  useEffect(() => {
    if (!visible || !onCashSelected) return;

    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const checkCashQrReady = async () => {
      try {
        const headers = await buildAuthHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_URL}/bookings/payments/qr/${bookingId}/`, {
          method: 'GET',
          credentials: 'include',
          headers,
        });

        if (!mounted) return;
        if (response.ok) {
          onCashSelected();
        }
      } catch {
        // Keep waiting modal active when network check fails.
      }
    };

    checkCashQrReady();
    timer = setInterval(checkCashQrReady, 2500);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [visible, bookingId, onCashSelected]);

  useEffect(() => {
    if (!visible || !lastMessage) return;
    const action = String(lastMessage.action || '').toLowerCase();
    const bid = Number(lastMessage.booking_id);
    if (bid !== bookingId) return;

    if (action === 'payment.cash_selected' && onCashSelected) {
      onCashSelected();
    }

    if (action === 'payment.completed') {
      onPaymentReceived();
    }
  }, [lastMessage, bookingId, visible, onPaymentReceived, onCashSelected]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <FontAwesome name="credit-card" size={24} color="#FF8C00" />
          <ThemedText style={styles.title}>Waiting for Payment</ThemedText>
          <ThemedText style={styles.amount}>PHP {Number(amount || 0).toFixed(2)}</ThemedText>
          <ThemedText style={styles.meta}>Booking #{bookingId}</ThemedText>
          <ThemedText style={styles.message}>Waiting for client payment method...</ThemedText>

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
    alignItems: 'center',
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3D40',
    marginBottom: 14,
  },
  title: {
    marginTop: 6,
    color: '#ECEDEE',
    fontWeight: '800',
    fontSize: 20,
  },
  amount: {
    marginTop: 6,
    color: '#FF8C00',
    fontWeight: '800',
    fontSize: 18,
  },
  meta: {
    marginTop: 4,
    color: '#ECEDEE',
  },
  message: {
    marginTop: 12,
    color: '#8E8E93',
  },
  closeButton: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3D40',
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeText: {
    color: '#ECEDEE',
    fontWeight: '700',
  },
});