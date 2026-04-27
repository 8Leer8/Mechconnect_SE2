import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';

interface CreditsPaymentModalProps {
  visible: boolean;
  bookingId: number;
  totalAmount: number;
  onClose: () => void;
  onPaymentSuccess: (data?: any) => void;
}

export default function CreditsPaymentModal({
  visible,
  bookingId,
  totalAmount,
  onClose,
  onPaymentSuccess,
}: CreditsPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(true);
  const [creditsBalance, setCreditsBalance] = useState<number>(0);

  // Required credits (1:1 ratio with PHP)
  const requiredCredits = Math.ceil(totalAmount);
  const hasEnoughCredits = creditsBalance >= requiredCredits;

  useEffect(() => {
    if (visible) {
      fetchCreditsBalance();
    }
  }, [visible]);

  const fetchCreditsBalance = async () => {
    setCheckingBalance(true);
    try {
      const res = await fetch(`${API_URL}/users/client/wallet/`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data?.error || data?.detail || `HTTP ${res.status}`;
        throw new Error(`Failed to fetch balance (${detail})`);
      }
      setCreditsBalance(data.tokens_balance ?? 0);
    } catch (e) {
      console.error('Error fetching credits:', e);
      setCreditsBalance(0);
    } finally {
      setCheckingBalance(false);
    }
  };

  const handlePayWithCredits = async () => {
    if (!hasEnoughCredits) {
      Alert.alert('Insufficient Credits', 'You do not have enough credits to complete this payment.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/bookings/payments/pay-with-credits/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          amount: totalAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Payment failed');
      }

      onPaymentSuccess(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Payment failed';
      Alert.alert('Payment Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyCredits = () => {
    onClose();
    router.push('/client/wallet/walletPage' as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ThemedText style={styles.title}>Pay with Credits</ThemedText>
          <ThemedText style={styles.subtitle}>Booking #{bookingId}</ThemedText>

          {/* Amount to pay */}
          <View style={styles.amountCard}>
            <ThemedText style={styles.amountLabel}>Amount to Pay</ThemedText>
            <ThemedText style={styles.amountValue}>₱{totalAmount.toFixed(2)}</ThemedText>
            <ThemedText style={styles.amountNote}>({requiredCredits} credits required)</ThemedText>
          </View>

          {/* Credits balance */}
          <View style={[styles.balanceCard, hasEnoughCredits ? styles.balanceCardSuccess : styles.balanceCardError]}>
            <View style={styles.balanceRow}>
              <FontAwesome name="database" size={20} color={hasEnoughCredits ? '#34C759' : '#FF3B30'} />
              <ThemedText style={styles.balanceLabel}>Your Credits</ThemedText>
            </View>
            {checkingBalance ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={[styles.balanceValue, hasEnoughCredits ? styles.balanceValueSuccess : styles.balanceValueError]}>
                {creditsBalance} credits
              </ThemedText>
            )}
            {!hasEnoughCredits && !checkingBalance && (
              <ThemedText style={styles.insufficientText}>
                Insufficient credits. Need {requiredCredits - creditsBalance} more.
              </ThemedText>
            )}
          </View>

          {/* Action buttons */}
          {hasEnoughCredits ? (
            <TouchableOpacity
              style={[styles.payButton, loading && styles.payButtonDisabled]}
              onPress={handlePayWithCredits}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <FontAwesome name="check-circle" size={18} color="#fff" style={styles.buttonIcon} />
                  <ThemedText style={styles.payButtonText}>Confirm Payment</ThemedText>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.buyCreditsButton}
              onPress={handleBuyCredits}
              activeOpacity={0.85}
            >
              <FontAwesome name="plus-circle" size={18} color="#fff" style={styles.buttonIcon} />
              <ThemedText style={styles.buyCreditsButtonText}>Buy Credits</ThemedText>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 30,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#3A3A3C',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 20,
  },
  amountCard: {
    backgroundColor: '#2C2C2E',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FF8C00',
  },
  amountNote: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  balanceCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  balanceCardSuccess: {
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
  },
  balanceCardError: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#8E8E93',
  },
  balanceValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  balanceValueSuccess: {
    color: '#34C759',
  },
  balanceValueError: {
    color: '#FF3B30',
  },
  insufficientText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 8,
  },
  payButton: {
    backgroundColor: '#34C759',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buyCreditsButton: {
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buyCreditsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#3A3A3C',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#fff',
    fontSize: 16,
  },
});
