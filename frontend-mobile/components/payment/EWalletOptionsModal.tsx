import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';

interface EWalletOptionsModalProps {
  visible: boolean;
  bookingId: number;
  totalAmount: number;
  allowInitialPayment?: boolean;
  useInitialPayment?: boolean;
  onToggleInitialPayment?: (value: boolean) => void;
  selectedPercentage?: 0.3 | 0.5;
  onSelectPercentage?: (value: 0.3 | 0.5) => void;
  onClose: () => void;
  onPaymentInitiated: () => void;
}

export default function EWalletOptionsModal({
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
}: EWalletOptionsModalProps) {
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);
  const safeTotalAmount = Math.max(0, Number(totalAmount || 0));
  const computedInitialAmount = safeTotalAmount * selectedPercentage;
  const computedRemaining = Math.max(0, safeTotalAmount - computedInitialAmount);
  const effectiveInitialPayment = allowInitialPayment && useInitialPayment;
  const amountToPay = effectiveInitialPayment ? computedInitialAmount : safeTotalAmount;

  const initiate = async (method: 'gcash' | 'maya') => {
    try {
      setLoadingMethod(method);
      const response = await fetch(`${API_URL}/bookings/payments/initiate/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify((() => {
          const payload: Record<string, unknown> = {
            booking_id: bookingId,
            payment_method: method,
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
      const checkoutUrl = typeof payload.checkout_url === 'string' ? payload.checkout_url : '';
      const errorMessage =
        typeof payload.error === 'string' ? payload.error : 'Unable to start e-wallet payment';

      if (!response.ok || !checkoutUrl) {
        throw new Error(errorMessage);
      }

      await Linking.openURL(checkoutUrl);
      onPaymentInitiated();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start e-wallet payment';
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
          <ThemedText style={styles.title}>Choose E-Wallet</ThemedText>
          <ThemedText style={styles.subtitle}>PHP {amountToPay.toFixed(2)}</ThemedText>

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

          <View style={styles.row}>
            <TouchableOpacity
              style={styles.walletCard}
              onPress={() => initiate('gcash')}
              disabled={loadingMethod !== null}
            >
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/images/payment/gcash.png')}
                  style={styles.walletLogo}
                  resizeMode="contain"
                />
              </View>
              {loadingMethod === 'gcash' ? <ActivityIndicator color="#FF8C00" /> : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.walletCard}
              onPress={() => initiate('maya')}
              disabled={loadingMethod !== null}
            >
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/images/payment/maya.png')}
                  style={styles.walletLogo}
                  resizeMode="contain"
                />
              </View>
              {loadingMethod === 'maya' ? <ActivityIndicator color="#FF8C00" /> : null}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <ThemedText style={styles.cancelText}>Back</ThemedText>
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
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  walletCard: {
    flex: 1,
    backgroundColor: '#151718',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    minHeight: 144,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  logoWrap: {
    width: '100%',
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  walletLogo: {
    width: '96%',
    height: '100%',
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
    justifyContent: 'center',
    alignItems: 'center',
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
  cancelButton: {
    marginTop: 14,
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