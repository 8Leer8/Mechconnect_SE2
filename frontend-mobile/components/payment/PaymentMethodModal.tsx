import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';

interface PaymentMethodModalProps {
  visible: boolean;
  bookingId: number;
  totalAmount: number;
  allowInitialPayment?: boolean;
  useInitialPayment?: boolean;
  onToggleInitialPayment?: (value: boolean) => void;
  selectedPercentage?: 0.3 | 0.5;
  onSelectPercentage?: (value: 0.3 | 0.5) => void;
  onClose: () => void;
  onPaymentInitiated: (method: string) => void;
}

export default function PaymentMethodModal({
  visible,
  bookingId,
  totalAmount,
  allowInitialPayment = false,
  useInitialPayment = false,
  onToggleInitialPayment,
  selectedPercentage = 0.3,
  onSelectPercentage,
  onClose,
  onPaymentInitiated,
}: PaymentMethodModalProps) {
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);
  const safeTotalAmount = Math.max(0, Number(totalAmount || 0));
  const computedInitialAmount = safeTotalAmount * selectedPercentage;
  const computedRemaining = Math.max(0, safeTotalAmount - computedInitialAmount);
  const effectiveInitialPayment = allowInitialPayment && useInitialPayment;
  const amountToPay = effectiveInitialPayment ? computedInitialAmount : safeTotalAmount;

  const initiateCash = async () => {
    try {
      setLoadingMethod('cash');
      const response = await fetch(`${API_URL}/bookings/payments/initiate/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => {
          const payload: Record<string, unknown> = {
            booking_id: bookingId,
            payment_method: 'cash',
          };
          if (effectiveInitialPayment) {
            payload.use_initial_payment = true;
            payload.initial_payment_amount = Number(computedInitialAmount.toFixed(2));
          }
          return payload;
        })()),
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
          <ThemedText style={styles.subtitle}>Booking #{bookingId} - PHP {amountToPay.toFixed(2)}</ThemedText>

          {allowInitialPayment ? (
            <View style={styles.installmentPanel}>
              <TouchableOpacity
                style={styles.toggleRow}
                activeOpacity={0.8}
                onPress={() => onToggleInitialPayment && onToggleInitialPayment(!useInitialPayment)}
              >
                <View style={styles.toggleIconWrap}>
                  <FontAwesome
                    name={useInitialPayment ? 'check-square-o' : 'square-o'}
                    size={18}
                    color={useInitialPayment ? '#34C759' : '#8E8E93'}
                  />
                </View>
                <ThemedText style={styles.toggleText}>Pay initial payment now (recommended)</ThemedText>
              </TouchableOpacity>
              {effectiveInitialPayment ? (
                <View style={styles.breakdownBlock}>
                  <View style={styles.percentageSelector}>
                    <TouchableOpacity
                      style={[styles.percentageOption, selectedPercentage === 0.3 ? styles.percentageOptionActive : null]}
                      onPress={() => onSelectPercentage && onSelectPercentage(0.3)}
                    >
                      <ThemedText style={[styles.percentageText, selectedPercentage === 0.3 ? styles.percentageTextActive : null]}>30%</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.percentageOption, selectedPercentage === 0.5 ? styles.percentageOptionActive : null]}
                      onPress={() => onSelectPercentage && onSelectPercentage(0.5)}
                    >
                      <ThemedText style={[styles.percentageText, selectedPercentage === 0.5 ? styles.percentageTextActive : null]}>50%</ThemedText>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.breakdownRow}>
                    <ThemedText style={styles.breakdownLabel}>Initial Payment</ThemedText>
                    <ThemedText style={styles.breakdownValue}>PHP {computedInitialAmount.toFixed(2)}</ThemedText>
                  </View>
                  <View style={styles.breakdownRow}>
                    <ThemedText style={styles.breakdownLabel}>Balance Remaining</ThemedText>
                    <ThemedText style={styles.breakdownValue}>PHP {computedRemaining.toFixed(2)}</ThemedText>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

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
            onPress={() => onPaymentInitiated('credits')}
            disabled={loadingMethod !== null}
            activeOpacity={0.85}
          >
            <View style={styles.optionHeader}>
              <FontAwesome name="database" size={18} color="#FF8C00" />
              <ThemedText style={styles.optionTitle}>Credits</ThemedText>
            </View>
            <ThemedText style={styles.optionDescription}>Pay using your credits (1:1 ratio)</ThemedText>
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
  installmentPanel: {
    backgroundColor: '#151718',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 12,
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleIconWrap: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    color: '#ECEDEE',
    fontWeight: '700',
    marginLeft: 6,
    flex: 1,
  },
  breakdownBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2C2E',
    paddingTop: 10,
    gap: 6,
  },
  percentageSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  percentageOption: {
    backgroundColor: '#1A1C1E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  percentageOptionActive: {
    borderColor: '#34C759',
    backgroundColor: '#34C75920',
  },
  percentageText: {
    color: '#9BA1A6',
    fontWeight: '700',
    fontSize: 12,
  },
  percentageTextActive: {
    color: '#34C759',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  breakdownValue: {
    color: '#ECEDEE',
    fontWeight: '700',
    fontSize: 13,
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