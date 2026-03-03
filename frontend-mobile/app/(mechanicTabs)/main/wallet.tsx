import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import WalletSection from '@/components/wallet-section';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function TokensScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const router = useRouter();

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
      const res = await fetch(`${API_URL}/users/mechanic/wallet/topup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokens: amount, price: 0 })
      });
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.tokens_balance ?? balance);
      setTransactions((t) => [{ id: Date.now(), type: 'topup', tokens: amount, time: new Date().toISOString() }, ...t]);
    } catch (e) {}
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <FontAwesome name="chevron-left" size={16} color="#FF8C00" />
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Tokens</ThemedText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity style={styles.refreshBtn} onPress={fetchBalance}>
            <FontAwesome name="refresh" size={18} color="#FF8C00" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <WalletSection />

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Top up</ThemedText>
          <View style={styles.topupRow}>
            <TouchableOpacity style={styles.topupBtn} onPress={() => topUp(10)}>
              <ThemedText style={styles.topupText}>10 Tokens</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.topupBtn} onPress={() => topUp(25)}>
              <ThemedText style={styles.topupText}>25 Tokens</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.topupBtn} onPress={() => topUp(50)}>
              <ThemedText style={styles.topupText}>50 Tokens</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Transactions</ThemedText>
          {transactions.length === 0 ? (
            <ThemedText style={styles.emptyText}>No transactions yet</ThemedText>
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={(i) => String(i.id)}
              renderItem={({ item }) => (
                <View style={styles.txRow}>
                  <View>
                    <ThemedText style={styles.txType}>{item.type === 'topup' ? 'Top up' : item.type}</ThemedText>
                    <ThemedText style={styles.txTime}>{new Date(item.time).toLocaleString()}</ThemedText>
                  </View>
                  <ThemedText style={styles.txAmount}>+{item.tokens}</ThemedText>
                </View>
              )}
            />
          )}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111214' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1A1C1E',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: { paddingTop: 16 },
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  topupRow: { flexDirection: 'row', gap: 12 },
  topupBtn: { backgroundColor: '#FF8C00', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, marginRight: 12 },
  topupText: { color: '#fff', fontWeight: '700' },
  emptyText: { color: '#8E8E93' },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222426' },
  txType: { fontSize: 14, fontWeight: '600', color: '#fff' },
  txTime: { fontSize: 12, color: '#8E8E93' },
  txAmount: { fontSize: 14, fontWeight: '700', color: '#34C759' },
});
