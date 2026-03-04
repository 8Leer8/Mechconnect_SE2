import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import WalletSection from '@/components/wallet-section';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function WalletScreen() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);

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
      // simple local transaction entry
      setTransactions((t) => [{ id: Date.now(), type: 'topup', tokens: amount, time: new Date().toISOString() }, ...t]);
      try {
        const { eventBus } = await import('@/utils/eventBus');
        eventBus.emit('walletChanged', { tokens_balance: data.tokens_balance ?? balance });
      } catch (e) {}
    } catch (e) {}
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Tokens' }} />

      {/* Header similar to bookings */}
      <View style={styles.header}>
        <View>
          <ThemedText style={styles.headerTitle}>Tokens</ThemedText>
          <ThemedText style={styles.headerSubtitle}>Manage your credits</ThemedText>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchBalance}>
          <FontAwesome name="refresh" size={18} color="#FF8C00" />
        </TouchableOpacity>
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
      {/* Internal bottom navigation for Tokens page only */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(mechanicTabs)/main/bookings')}>
          <FontAwesome name="calendar-check-o" size={20} color="#fff" />
          <ThemedText style={styles.navLabel}>Bookings</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(mechanicTabs)/main/emergency')}>
          <FontAwesome name="exclamation-triangle" size={20} color="#fff" />
          <ThemedText style={styles.navLabel}>Emergency</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(mechanicTabs)/main/home')}>
          <FontAwesome name="home" size={20} color="#fff" />
          <ThemedText style={styles.navLabel}>Home</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(mechanicTabs)/main/map')}>
          <FontAwesome name="map-marker" size={20} color="#fff" />
          <ThemedText style={styles.navLabel}>Map</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/(mechanicTabs)/main/profile')}>
          <FontAwesome name="user" size={20} color="#fff" />
          <ThemedText style={styles.navLabel}>Profile</ThemedText>
        </TouchableOpacity>
      </View>
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
  bottomNav: {
    height: 64,
    backgroundColor: '#1E1E1E',
    borderTopColor: '#333',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: { alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 10, color: '#fff', marginTop: 4 },
});
