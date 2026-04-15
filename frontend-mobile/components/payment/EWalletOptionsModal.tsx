import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';

import { API_URL } from '@/config';
import { ThemedText } from '@/components/themed-text';

interface EWalletOptionsModalProps {
  visible: boolean;
  bookingId: number;
  totalAmount: number;
  onClose: () => void;
  onPaymentInitiated: () => void;
}

export default function EWalletOptionsModal({
  visible,
  bookingId,
  totalAmount,
  onClose,
  onPaymentInitiated,
}: EWalletOptionsModalProps) {
  const [loadingMethod, setLoadingMethod] = useState<string | null>(null);

  const initiate = async (method: 'gcash' | 'maya') => {
    try {
      setLoadingMethod(method);
      const response = await fetch(`${API_URL}/bookings/payments/initiate/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, payment_method: method }),
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
          <ThemedText style={styles.subtitle}>PHP {Number(totalAmount || 0).toFixed(2)}</ThemedText>

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