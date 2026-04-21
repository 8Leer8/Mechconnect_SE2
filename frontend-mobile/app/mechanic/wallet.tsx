import React, { useEffect, useMemo, useState } from 'react';
<<<<<<< HEAD
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
=======
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
>>>>>>> ee528f494555be7021a90e3603d4723d1ee6af88
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { eventBus } from '@/utils/eventBus';
import { styles } from '@/style/mechanic/walletScreenStyles';
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

<<<<<<< HEAD
function paramIsTruthy(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '1' || v === 'true';
=======
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
>>>>>>> ee528f494555be7021a90e3603d4723d1ee6af88
}

export default function WalletScreen() {
  const router = useRouter();
  const { shop_owner: shopOwnerParam } = useLocalSearchParams<{ shop_owner?: string | string[] }>();
  const shopOwnerCreditsView = paramIsTruthy(shopOwnerParam);

  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topUpLoading, setTopUpLoading] = useState<number | null>(null);
  const [tokenPricing, setTokenPricing] = useState<TokenPricingData>(DEFAULT_TOKEN_PRICING);
  const [selectedPackage, setSelectedPackage] = useState<{ tokens: number; price: number } | null>(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);

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
  }, [shopOwnerCreditsView]);

  useEffect(() => {
    fetchTokenPricing();
    fetchTransactions();
  }, []);

  async function fetchBalance() {
    if (shopOwnerCreditsView) {
      setBalance(0);
      return;
    }
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

<<<<<<< HEAD
  async function topUp(pkg: { tokens: number; price: number }) {
    if (shopOwnerCreditsView) return;
=======
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
>>>>>>> ee528f494555be7021a90e3603d4723d1ee6af88
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

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Credits</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {shopOwnerCreditsView ? 'Shop owner credits (preview)' : 'Manage your credits'}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchBalance}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceIconCircle}>
            <FontAwesome name="database" size={28} color="#FF8C00" />
          </View>
          <ThemedText style={styles.balanceLabel}>Credit Balance</ThemedText>
          <ThemedText style={styles.balanceValue}>{balance === null ? '...' : balance}</ThemedText>
          <ThemedText style={styles.balanceSub}>
            {shopOwnerCreditsView ? 'Available shop credits' : 'Available credits'}
          </ThemedText>
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
<<<<<<< HEAD
                onPress={() => topUp(pkg)}
                disabled={topUpLoading !== null || shopOwnerCreditsView}
=======
                onPress={() => openPaymentMethodModal(pkg)}
                disabled={topUpLoading !== null}
>>>>>>> ee528f494555be7021a90e3603d4723d1ee6af88
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
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <CreditsEWalletModal
        visible={paymentModalVisible}
        amount={selectedPackage?.price || 0}
        onClose={() => {
          if (topUpLoading !== null) return;
          setPaymentModalVisible(false);
          setSelectedPackage(null);
        }}
        onConfirm={confirmWalletMethod}
      />
    </ThemedView>
  );
}
