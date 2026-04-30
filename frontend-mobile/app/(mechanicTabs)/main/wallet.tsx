import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, TextInput, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { eventBus } from '@/utils/eventBus';
import { styles } from '@/style/mechanic/walletStyles';
import CreditsEWalletModal from '@/components/payment/CreditsEWalletModal';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type TokenPricingData = {
  base_token_price: number;
  min_token_purchase: number;
  max_token_purchase: number;
  token_packages: { tokens: number; price: number }[];
};

type WalletTransaction = {
  id: number;
  tokens: number;
  price: number;
  payment_method: 'gcash' | 'maya' | null;
  status: string;
  time: string;
};

const DEFAULT_TOKEN_PRICING: TokenPricingData = {
  base_token_price: 1,
  min_token_purchase: 1,
  max_token_purchase: 1000,
  token_packages: [],
};

function buildFallbackTokenPackages(minTokens: number, maxTokens: number, baseTokenPrice: number) {
  const minSafe = Math.max(1, Math.floor(minTokens || 1));
  const maxSafe = Math.max(minSafe, Math.floor(maxTokens || minSafe));
  const candidates = [minSafe, minSafe * 5, minSafe * 10, minSafe * 25, maxSafe];

  const uniqueSorted = Array.from(
    new Set(candidates.map((value) => Math.min(maxSafe, value)).filter((value) => value >= minSafe))
  ).sort((a, b) => a - b);

  return uniqueSorted.slice(0, 5).map((tokens) => ({
    tokens,
    price: Number((tokens * baseTokenPrice).toFixed(2)),
  }));
}

function getMethodMeta(method: WalletTransaction['payment_method']) {
  if (method === 'gcash') return { icon: 'mobile', color: '#4DA3FF', label: 'GCASH' };
  if (method === 'maya') return { icon: 'credit-card', color: '#21D4A0', label: 'MAYA' };
  return { icon: 'exchange', color: '#8E8E93', label: 'E-CASH' };
}

function getStatusMeta(rawStatus: string) {
  const status = String(rawStatus || '').toLowerCase();
  if (status === 'completed') return { label: 'Completed', style: styles.statusCompleted, textStyle: styles.statusCompletedText };
  if (status === 'pending') return { label: 'Pending', style: styles.statusPending, textStyle: styles.statusPendingText };
  if (status === 'failed') return { label: 'Failed', style: styles.statusFailed, textStyle: styles.statusFailedText };
  return { label: status || 'Unknown', style: styles.statusPending, textStyle: styles.statusPendingText };
}

export default function TokensScreen() {
  const { paymentStatus } = useLocalSearchParams<{ paymentStatus?: string }>();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topUpLoading, setTopUpLoading] = useState<number | null>(null);
  const [tokenPricing, setTokenPricing] = useState<TokenPricingData>(DEFAULT_TOKEN_PRICING);
  const [selectedPackage, setSelectedPackage] = useState<{ tokens: number; price: number } | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);

  // Cash out states
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [cashOutLoading, setCashOutLoading] = useState(false);
  const [showCashOutSuccessModal, setShowCashOutSuccessModal] = useState(false);
  const [cashOutPhoneNumber, setCashOutPhoneNumber] = useState('09XXXXXXXXX');

  // Handle payment status from deep link
  useEffect(() => {
    if (paymentStatus === 'success') {
      setShowSuccessModal(true);
      // Refresh balance after successful payment
      fetchBalance();
    } else if (paymentStatus === 'failed') {
      setShowFailedModal(true);
    }
  }, [paymentStatus]);

  const tokenPackages = useMemo(() => {
    if (tokenPricing.token_packages.length > 0) {
      return [...tokenPricing.token_packages].sort((a, b) => a.tokens - b.tokens);
    }
    return buildFallbackTokenPackages(
      tokenPricing.min_token_purchase,
      tokenPricing.max_token_purchase,
      tokenPricing.base_token_price
    );
  }, [tokenPricing]);

  useEffect(() => {
    fetchBalance();
    fetchTokenPricing();
    fetchTransactions();
  }, []);

  async function fetchBalance() {
    try {
      const res = await fetch(`${API_URL}/users/mechanic/wallet/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.tokens_balance ?? 0);
    } catch (e) {}
  }

  async function fetchTokenPricing() {
    try {
      const res = await fetch(`${API_URL}/users/mechanic/wallet/token-pricing/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setTokenPricing({
        base_token_price: Number(data.base_token_price ?? DEFAULT_TOKEN_PRICING.base_token_price),
        min_token_purchase: Number(data.min_token_purchase ?? DEFAULT_TOKEN_PRICING.min_token_purchase),
        max_token_purchase: Number(data.max_token_purchase ?? DEFAULT_TOKEN_PRICING.max_token_purchase),
        token_packages: Array.isArray(data.token_packages)
          ? data.token_packages
              .map((item: any) => ({
                tokens: Number(item?.tokens),
                price: Number(item?.price),
              }))
              .filter((item: { tokens: number; price: number }) => item.tokens > 0 && item.price >= 0)
          : [],
      });
    } catch (e) {}
  }

  async function fetchTransactions() {
    try {
      const res = await fetch(`${API_URL}/users/mechanic/wallet/transactions/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const normalized = Array.isArray(data.transactions)
        ? data.transactions.map((item: any) => ({
            id: Number(item.id),
            tokens: Number(item.tokens),
            price: Number(item.price),
            payment_method: (String(item.payment_method || '').toLowerCase() || null) as 'gcash' | 'maya' | null,
            status: String(item.status || 'completed'),
            time: String(item.time || new Date().toISOString()),
          }))
        : [];
      setTransactions(normalized);
    } catch (e) {}
  }

  async function topUp(pkg: { tokens: number; price: number }, method: 'gcash' | 'maya') {
    try {
      setTopUpLoading(pkg.tokens);
      const res = await fetch(`${API_URL}/users/mechanic/wallet/topup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokens: pkg.tokens, price: pkg.price, payment_method: method }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String(err.error || 'Failed to buy credits'));
      }
      const data = await res.json();
      setBalance(data.tokens_balance ?? balance);
      await fetchTransactions();
      eventBus.emit('walletChanged', { tokens_balance: data.tokens_balance });
    } catch (e: any) {
      Alert.alert('Top-up failed', String(e?.message || 'Unable to process e-cash payment'));
    } finally {
      setTopUpLoading(null);
    }
  }

  function openPaymentMethodModal(pkg: { tokens: number; price: number }) {
    if (topUpLoading !== null) return;
    setSelectedPackage(pkg);
    setPaymentModalVisible(true);
  }

  async function confirmWalletMethod(method: 'gcash' | 'maya') {
    if (!selectedPackage) return;
    await topUp(selectedPackage, method);
    setPaymentModalVisible(false);
    setSelectedPackage(null);
  }

  // Cash out function (test simulation)
  async function handleCashOut() {
    const amount = Number(cashOutAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to withdraw.');
      return;
    }
    if (amount > (balance ?? 0)) {
      Alert.alert('Insufficient Balance', 'You do not have enough credits to withdraw this amount.');
      return;
    }

    setCashOutLoading(true);

    // Simulate API call delay (test mode - no external API)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate successful cash out - deduct from balance
    const newBalance = (balance ?? 0) - amount;
    setBalance(newBalance);
    setCashOutAmount('');
    setCashOutLoading(false);
    setShowCashOutSuccessModal(true);

    // Emit wallet change event
    eventBus.emit('walletChanged', { tokens_balance: newBalance });
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Credits</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Manage your credits</ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchBalance}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceIconCircle}>
            <FontAwesome name="database" size={24} color="#FF8C00" />
          </View>
          <View style={styles.balanceContent}>
            <ThemedText style={styles.balanceLabel}>Credit Balance</ThemedText>
            <View style={styles.balanceValueContainer}>
              <ThemedText
                style={(balance ?? 0) >= 1000 ? styles.balanceValueLarge : styles.balanceValue}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
              >
                {balance === null ? '...' : balance}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Info note about shared wallet */}
        <View style={styles.sharedWalletNote}>
          <FontAwesome name="info-circle" size={12} color="#FF8C00" />
          <ThemedText style={styles.sharedWalletNoteText}>
            Shared across all your roles (Client, Mechanic, Shop Owner)
          </ThemedText>
        </View>

        {/* Cash Out */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#EF4444' }]} />
            <ThemedText style={styles.sectionTitle}>Cash Out</ThemedText>
          </View>
          <ThemedText style={styles.balanceSub}>Withdraw credits to your e-wallet</ThemedText>

          <View style={cashOutStyles.container}>
            <View style={cashOutStyles.inputContainer}>
              <ThemedText style={cashOutStyles.inputLabel}>Amount to Withdraw</ThemedText>
              <View style={cashOutStyles.inputWrapper}>
                <FontAwesome name="database" size={16} color="#FF8C00" style={cashOutStyles.inputIcon} />
                <TextInput
                  style={cashOutStyles.input}
                  placeholder="Enter amount"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  value={cashOutAmount}
                  onChangeText={setCashOutAmount}
                  editable={!cashOutLoading}
                />
              </View>
              <ThemedText style={cashOutStyles.balanceHint}>
                Available: {balance ?? 0} credits
              </ThemedText>
            </View>

            <TouchableOpacity
              style={[
                cashOutStyles.confirmButton,
                (cashOutLoading || !cashOutAmount || Number(cashOutAmount) <= 0) && cashOutStyles.confirmButtonDisabled,
              ]}
              onPress={handleCashOut}
              disabled={cashOutLoading || !cashOutAmount || Number(cashOutAmount) <= 0}
              activeOpacity={0.7}
            >
              {cashOutLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <FontAwesome name="money" size={16} color="#fff" style={cashOutStyles.buttonIcon} />
                  <ThemedText style={cashOutStyles.confirmButtonText}>Confirm Cash Out</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Buy Credits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
            <ThemedText style={styles.sectionTitle}>Buy Credits</ThemedText>
          </View>
          <ThemedText style={styles.balanceSub}>
            {tokenPricing.token_packages.length > 0
              ? 'Select from configured credit packages'
              : `Min ${tokenPricing.min_token_purchase} • Max ${tokenPricing.max_token_purchase} • ₱${tokenPricing.base_token_price.toFixed(2)} / credit`}
          </ThemedText>
          <View style={styles.packagesGrid}>
            {tokenPackages.map((pkg) => (
              <TouchableOpacity
                key={pkg.tokens}
                style={styles.packageCard}
                onPress={() => openPaymentMethodModal(pkg)}
                disabled={topUpLoading !== null}
                activeOpacity={0.7}
              >
                <View style={styles.packageIconCircle}>
                  <FontAwesome name="database" size={20} color="#FF8C00" />
                </View>
                <ThemedText style={styles.packageAmount}>{pkg.tokens}</ThemedText>
                <ThemedText style={styles.packageLabel}>credits • ₱{pkg.price.toFixed(2)}</ThemedText>
                <View style={styles.packageBuyBtn}>
                  {topUpLoading === pkg.tokens ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.packageBuyText}>Buy</ThemedText>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#34C759' }]} />
            <ThemedText style={styles.sectionTitle}>Recent Transactions</ThemedText>
          </View>
          {transactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <FontAwesome name="exchange" size={28} color="#555" />
              <ThemedText style={styles.emptyTitle}>No Transactions Yet</ThemedText>
              <ThemedText style={styles.emptySubtext}>Purchase credits to see your history</ThemedText>
            </View>
          ) : (
            <View style={styles.txListContainer}>
              <ScrollView nestedScrollEnabled={true} showsVerticalScrollIndicator={true}>
                <View style={styles.txList}>
                  {transactions.map((item) => (
                    <View key={String(item.id)} style={styles.txRow}>
                      <View style={styles.txIconCircle}>
                        <FontAwesome name={getMethodMeta(item.payment_method).icon as any} size={14} color={getMethodMeta(item.payment_method).color} />
                      </View>
                      <View style={styles.txInfo}>
                        <ThemedText style={styles.txType}>
                          Top up • {getMethodMeta(item.payment_method).label}
                        </ThemedText>
                        <ThemedText style={styles.txTime}>
                          {new Date(item.time).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </ThemedText>
                      </View>
                      <View style={styles.txRight}>
                        <ThemedText style={styles.txAmount}>+{item.tokens}</ThemedText>
                        <View style={[styles.statusBadge, getStatusMeta(item.status).style]}>
                          <ThemedText style={[styles.statusBadgeText, getStatusMeta(item.status).textStyle]}>
                            {getStatusMeta(item.status).label}
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <CreditsEWalletModal
        visible={paymentModalVisible}
        tokens={selectedPackage?.tokens || 0}
        amount={selectedPackage?.price || 0}
        onClose={() => {
          if (topUpLoading !== null) return;
          setPaymentModalVisible(false);
          setSelectedPackage(null);
        }}
        onSelectMethod={confirmWalletMethod}
      />

      {/* Payment Success Modal */}
      {showSuccessModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FontAwesome name="check-circle" size={64} color="#22c55e" />
            <ThemedText style={styles.modalTitle}>Payment Successful!</ThemedText>
            <ThemedText style={styles.modalText}>Your wallet has been topped up successfully.</ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Payment Failed Modal */}
      {showFailedModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FontAwesome name="times-circle" size={64} color="#ef4444" />
            <ThemedText style={styles.modalTitle}>Payment Failed</ThemedText>
            <ThemedText style={styles.modalText}>There was an issue with your payment. Please try again.</ThemedText>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: '#ef4444' }]}
              onPress={() => setShowFailedModal(false)}
            >
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Cash Out Success Modal */}
      {showCashOutSuccessModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <FontAwesome name="check-circle" size={64} color="#22c55e" />
            <ThemedText style={styles.modalTitle}>Cash Out Successful!</ThemedText>
            <ThemedText style={styles.modalText}>
              Cash sent out to {cashOutPhoneNumber}
            </ThemedText>
            <ThemedText style={[styles.modalText, { marginTop: 8, fontWeight: '600' }]}>
              Amount: {cashOutAmount} credits
            </ThemedText>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowCashOutSuccessModal(false)}
            >
              <ThemedText style={styles.modalButtonText}>OK</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const cashOutStyles = StyleSheet.create({
  container: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252729',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3A3C3E',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 48,
    color: '#fff',
    fontSize: 16,
  },
  balanceHint: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  confirmButtonDisabled: {
    backgroundColor: '#666',
    opacity: 0.6,
  },
  buttonIcon: {
    marginRight: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
