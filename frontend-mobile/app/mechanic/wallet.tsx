import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, ScrollView, FlatList } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import WalletSection from '@/components/wallet-section';
import { styles } from '@/style/mechanic/walletScreenStyles';

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
