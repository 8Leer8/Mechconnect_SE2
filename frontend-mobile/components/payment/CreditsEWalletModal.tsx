import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

type EWalletMethod = 'gcash' | 'maya';

type CreditsEWalletModalProps = {
  visible: boolean;
  tokens: number;
  amount: number;
  onClose: () => void;
  onSelectMethod: (method: EWalletMethod) => Promise<void>;
};

export default function CreditsEWalletModal({
  visible,
  tokens,
  amount,
  onClose,
  onSelectMethod,
}: CreditsEWalletModalProps) {
  const [loadingMethod, setLoadingMethod] = useState<EWalletMethod | null>(null);

  const handleSelect = async (method: EWalletMethod) => {
    try {
      setLoadingMethod(method);
      await onSelectMethod(method);
    } finally {
      setLoadingMethod(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Title - Large */}
          <ThemedText style={styles.title}>Purchase Credits</ThemedText>

          {/* Order Summary Card */}
          <View style={styles.orderCard}>
            <View style={styles.orderIconCircle}>
              <FontAwesome name="database" size={28} color="#FF8C00" />
            </View>
            <View style={styles.orderDetails}>
              <ThemedText style={styles.orderTokens}>{tokens} Credits</ThemedText>
              <ThemedText style={styles.orderSubtext}>Token package for mechanic services</ThemedText>
            </View>
          </View>

          {/* Price Section - Prominent */}
          <View style={styles.priceSection}>
            <ThemedText style={styles.priceLabel}>Total Amount</ThemedText>
            <View style={styles.priceRow}>
              <ThemedText style={styles.currency}>PHP</ThemedText>
              <ThemedText style={styles.priceValue}>{amount.toFixed(2)}</ThemedText>
            </View>
          </View>

          {/* Payment Methods Label */}
          <ThemedText style={styles.paymentLabel}>Pay with</ThemedText>

          {/* E-Wallet Options */}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.walletCard, loadingMethod === 'gcash' && styles.walletCardLoading]}
              onPress={() => handleSelect('gcash')}
              disabled={loadingMethod !== null}
              activeOpacity={0.8}
            >
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/images/payment/gcash.png')}
                  style={styles.walletLogo}
                  resizeMode="contain"
                />
              </View>
              {loadingMethod === 'gcash' ? (
                <ActivityIndicator size="small" color="#FF8C00" style={styles.loader} />
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.walletCard, loadingMethod === 'maya' && styles.walletCardLoading]}
              onPress={() => handleSelect('maya')}
              disabled={loadingMethod !== null}
              activeOpacity={0.8}
            >
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/images/payment/maya.png')}
                  style={styles.walletLogo}
                  resizeMode="contain"
                />
              </View>
              {loadingMethod === 'maya' ? (
                <ActivityIndicator size="small" color="#FF8C00" style={styles.loader} />
              ) : null}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loadingMethod !== null}>
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
    minHeight: 140,
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
    fontSize: 16,
  },
  // Order Summary Styles
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151718',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
    padding: 16,
    marginTop: 20,
    marginBottom: 16,
  },
  orderIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 140, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  orderDetails: {
    flex: 1,
  },
  orderTokens: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ECEDEE',
  },
  orderSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  // Price Section - Prominent
  priceSection: {
    alignItems: 'center',
    marginVertical: 24,
  },
  priceLabel: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 12,
    fontWeight: '500',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  currency: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FF8C00',
    marginRight: 6,
    marginTop: 6,
  },
  priceValue: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FF8C00',
  },
  // Payment Section
  paymentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    marginTop: 8,
  },
  walletCardLoading: {
    borderColor: '#FF8C00',
    borderWidth: 2,
  },
  loader: {
    marginTop: 8,
  },
});
