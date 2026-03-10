import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import { eventBus } from '@/utils/eventBus';
import { styles } from '@/style/mechanic/walletStyles';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

const TOKEN_PACKAGES = [
  { tokens: 10, label: '10' },
  { tokens: 25, label: '25' },
  { tokens: 50, label: '50' },
  { tokens: 100, label: '100' },
];

export default function TokensScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [topUpLoading, setTopUpLoading] = useState<number | null>(null);

  useEffect(() => {
    fetchBalance();
  }, []);

  async function fetchBalance() {
    try {
      const res = await fetch(`${API_URL}/users/mechanic/wallet/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.tokens_balance ?? 0);
    } catch (e) {}
  }

  async function topUp(amount: number) {
    try {
      setTopUpLoading(amount);
      const res = await fetch(`${API_URL}/users/mechanic/wallet/topup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokens: amount, price: 0 }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.tokens_balance ?? balance);
      setTransactions((prev) => [
        { id: Date.now(), type: 'topup', tokens: amount, time: new Date().toISOString() },
        ...prev,
      ]);
      eventBus.emit('walletChanged', { tokens_balance: data.tokens_balance });
    } catch (e) {} finally {
      setTopUpLoading(null);
    }
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Tokens</ThemedText>
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
            <FontAwesome name="database" size={28} color="#FF8C00" />
          </View>
          <ThemedText style={styles.balanceLabel}>Token Balance</ThemedText>
          <ThemedText style={styles.balanceValue}>{balance === null ? '...' : balance}</ThemedText>
          <ThemedText style={styles.balanceSub}>Available tokens</ThemedText>
        </View>

        {/* Buy Tokens */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#FF8C00' }]} />
            <ThemedText style={styles.sectionTitle}>Buy Tokens</ThemedText>
          </View>
          <View style={styles.packagesGrid}>
            {TOKEN_PACKAGES.map((pkg) => (
              <TouchableOpacity
                key={pkg.tokens}
                style={styles.packageCard}
                onPress={() => topUp(pkg.tokens)}
                disabled={topUpLoading !== null}
                activeOpacity={0.7}
              >
                <View style={styles.packageIconCircle}>
                  <FontAwesome name="database" size={20} color="#FF8C00" />
                </View>
                <ThemedText style={styles.packageAmount}>{pkg.label}</ThemedText>
                <ThemedText style={styles.packageLabel}>tokens</ThemedText>
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
              <ThemedText style={styles.emptySubtext}>Purchase tokens to see your history</ThemedText>
            </View>
          ) : (
            <View style={styles.txList}>
              {transactions.map((item) => (
                <View key={String(item.id)} style={styles.txRow}>
                  <View style={styles.txIconCircle}>
                    <FontAwesome name="arrow-up" size={14} color="#34C759" />
                  </View>
                  <View style={styles.txInfo}>
                    <ThemedText style={styles.txType}>Top up</ThemedText>
                    <ThemedText style={styles.txTime}>
                      {new Date(item.time).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.txAmount}>+{item.tokens}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}
