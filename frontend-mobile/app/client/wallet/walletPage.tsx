import React, { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { styles } from '@/style/client/walletStyles';
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

export default function ClientWalletScreen() {
  const { paymentStatus } = useLocalSearchParams<{ paymentStatus?: string }>();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [tokenPricing, setTokenPricing] = useState<TokenPricingData>(DEFAULT_TOKEN_PRICING);
  const [loading, setLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showFailedModal, setShowFailedModal] = useState(false);
  // Payment modal state
  const [topUpLoading, setTopUpLoading] = useState<number | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<{ tokens: number; price: number } | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

  // Handle payment status from deep link
  useEffect(() => {
    if (paymentStatus === 'success') {
      setShowSuccessModal(true);
      loadWalletData();
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
    loadWalletData();
  }, []);

  async function loadWalletData() {
    setLoading(true);
    await Promise.all([fetchBalance(), fetchTokenPricing(), fetchTransactions()]);
    setLoading(false);
  }

  async function fetchBalance() {
    try {
      const res = await fetch(`${API_URL}/users/client/wallet/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.tokens_balance ?? 0);
    } catch (e) {}
  }

  async function fetchTokenPricing() {
    try {
      const res = await fetch(`${API_URL}/users/client/wallet/token-pricing/`, { credentials: 'include' });
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
      const res = await fetch(`${API_URL}/users/client/wallet/transactions/`, { credentials: 'include' });
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

  // Payment modal functions
  function openPaymentMethodModal(pkg: { tokens: number; price: number }) {
    setSelectedPackage(pkg);
    setPaymentModalVisible(true);
  }

  async function confirmWalletMethod(method: 'gcash' | 'maya') {
    if (!selectedPackage || topUpLoading !== null) return;
    setTopUpLoading(selectedPackage.tokens);
    setPaymentModalVisible(false);
    await topUp(selectedPackage, method);
    setTopUpLoading(null);
    setSelectedPackage(null);
  }

  async function topUp(pkg: { tokens: number; price: number }, method: 'gcash' | 'maya') {
    try {
      const res = await fetch(`${API_URL}/users/client/wallet/initiate-payment/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: pkg.price,
          tokens: pkg.tokens,
          payment_method: method,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Payment initiation failed');
        return;
      }
      if (data.checkout_url) {
        await Linking.openURL(data.checkout_url);
      } else {
        alert('No checkout URL returned');
      }
    } catch (e: any) {
      alert(e?.message || 'Network error');
    }
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <FontAwesome name="arrow-left" size={20} color="#FF8C00" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>My Wallet</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Manage your credits</ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadWalletData}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF8C00" />
            <ThemedText style={styles.loadingText}>Loading wallet...</ThemedText>
          </View>
        ) : (
          <>
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

            {/* Available Packages */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
                <ThemedText style={styles.sectionTitle}>Available Packages</ThemedText>
              </View>
              <ThemedText style={styles.sectionSubtitle}>
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
                    disabled={topUpLoading === pkg.tokens}
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
          </>
        )}
      </ScrollView>

      {/* Payment Method Modal */}
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
    </ThemedView>
  );
}
