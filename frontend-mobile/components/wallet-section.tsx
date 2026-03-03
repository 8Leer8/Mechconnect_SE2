import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function WalletSection() {
  const [balance, setBalance] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/users/mechanic/wallet/`, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setBalance(data.tokens_balance ?? 0);
      } catch (e) {
        // ignore
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <ThemedText style={styles.label}>Wallet Balance</ThemedText>
        <ThemedText style={styles.amount}>{balance === null ? '...' : `${balance} tokens`}</ThemedText>
      </View>
      <View style={styles.right}>
        <TouchableOpacity style={styles.topUpBtn} onPress={() => router.push('/mechanic/wallet')}>
          <ThemedText style={styles.topUpText}>Add Tokens</ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 12,
  },
  left: { flex: 1 },
  label: { fontSize: 13, color: '#8E8E93' },
  amount: { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 6 },
  right: { marginLeft: 12 },
  topUpBtn: {
    backgroundColor: '#FF8C00',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  topUpText: { color: '#fff', fontWeight: '700' },
});
