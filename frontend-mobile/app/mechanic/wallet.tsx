import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, AppState } from 'react-native';
import { Stack, useLocalSearchParams, usePathname, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { eventBus } from '@/utils/eventBus';
import { fetchUnifiedWalletBalance } from '@/lib/walletBalance';
import { styles } from '@/style/mechanic/walletScreenStyles';
import CreditsEWalletModal from '@/components/payment/CreditsEWalletModal';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const MECHANIC_WALLET = {
  balance: () => `${API_URL}/users/mechanic/wallet/`,
  transactions: () => `${API_URL}/users/mechanic/wallet/transactions/`,
  topup: () => `${API_URL}/users/mechanic/wallet/topup/`,
  initiatePayment: () => `${API_URL}/users/wallet/initiate-payment/`,
};

const SHOP_OWNER_WALLET = {
  balance: () => `${API_URL}/users/shop-owner/wallet/`,
  transactions: () => `${API_URL}/users/shop-owner/wallet/transactions/`,
  topup: () => `${API_URL}/users/shop-owner/wallet/topup/`,
  initiatePayment: () => `${API_URL}/users/shop-owner/wallet/initiate-payment/`,
};

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

function paramIsTruthy(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '1' || v === 'true';
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

function formatCreditsDisplay(value: number | null) {
  if (value === null) return '…';
  return value.toLocaleString('en-US');
}

export default function WalletScreen() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const insets = useSafeAreaInsets();
  const { shop_owner: shopOwnerParam } = useLocalSearchParams<{ shop_owner?: string | string[] }>();
  const shopOwnerCreditsView =
    paramIsTruthy(shopOwnerParam) || pathname.includes('shopowner/wallet');
  const appStateRef = useRef(AppState.currentState);

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

  const fetchBalance = useCallback(async () => {
    try {
      const amount = await fetchUnifiedWalletBalance('mechanic');
      setBalance(amount ?? 0);
    } catch {
      setBalance(0);
    }
  }, [shopOwnerCreditsView]);

  const fetchTokenPricing = useCallback(async () => {
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
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(
        shopOwnerCreditsView ? SHOP_OWNER_WALLET.transactions() : MECHANIC_WALLET.transactions(),
        { credentials: 'include' }
      );
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
    } catch {
      /* ignore */
    }
  }, [shopOwnerCreditsView]);

  async function initiateTokenPurchase(pkg: { tokens: number; price: number }, method: 'gcash' | 'maya') {
    try {
      setTopUpLoading(pkg.tokens);

      // Use appropriate endpoint for mechanic or shop owner
      const initiateUrl = shopOwnerCreditsView
        ? SHOP_OWNER_WALLET.initiatePayment()
        : MECHANIC_WALLET.initiatePayment();

      const res = await fetch(initiateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tokens: pkg.tokens,
          price: pkg.price,
          payment_method: method,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String(err.error || 'Failed to initiate payment'));
      }

      const data = await res.json();
      const checkoutUrl = data.checkout_url;
      const purchaseId = data.purchase_id;

      if (!checkoutUrl) {
        throw new Error('No checkout URL received');
      }

      // Close modal before opening browser
      setPaymentModalVisible(false);

      // Open PayMongo checkout in browser
      await Linking.openURL(checkoutUrl);

      // Store pending purchase ID for status checking
      // (Optional: could poll for status when app comes back to foreground)
    } catch (e: any) {
      Alert.alert('Payment Error', String(e?.message || 'Unable to start e-wallet payment'));
    } finally {
      setTopUpLoading(null);
    }
  }

  function openPaymentMethodModal(pkg: { tokens: number; price: number }) {
    if (topUpLoading !== null) return;
    setSelectedPackage(pkg);
    setPaymentModalVisible(true);
  }

  async function handleSelectPaymentMethod(method: 'gcash' | 'maya') {
    if (!selectedPackage) return;
    await initiateTokenPurchase(selectedPackage, method);
    setSelectedPackage(null);
  }

  const syncAll = useCallback(async () => {
    await Promise.all([fetchBalance(), fetchTransactions(), fetchTokenPricing()]);
    try {
      eventBus.emit('walletChanged');
    } catch {
      /* ignore */
    }
  }, [fetchBalance, fetchTransactions, fetchTokenPricing]);

  // Refresh when returning from payment browser or switching apps
  useFocusEffect(
    useCallback(() => {
      syncAll();
    }, [syncAll])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        syncAll();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [syncAll]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.headerTitle}>Credits</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            {shopOwnerCreditsView ? 'Manage your shop credits' : 'Manage your credits'}
          </ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => void syncAll()}>
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
                {formatCreditsDisplay(balance)}
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

        {/* Buy Credits */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
            <ThemedText style={styles.sectionTitle}>Buy Credits</ThemedText>
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
                disabled={topUpLoading !== null}
                activeOpacity={0.7}
              >
                <View style={styles.packageIconCircle}>
                  <FontAwesome name="database" size={18} color="#FF8C00" />
                </View>
                <ThemedText style={styles.packageAmount}>{pkg.tokens.toLocaleString('en-US')}</ThemedText>
                <ThemedText style={styles.packageMeta}>credits</ThemedText>
                <ThemedText style={styles.packagePrice}>PHP {pkg.price.toFixed(2)}</ThemedText>
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
        onSelectMethod={handleSelectPaymentMethod}
      />
    </ThemedView>
  );
}
