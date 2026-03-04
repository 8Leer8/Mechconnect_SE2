import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { eventBus } from '@/utils/eventBus';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function WalletBadge({ onPress }: { onPress?: () => void }) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/users/mechanic/wallet/`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;
        setBalance(data.tokens_balance ?? 0);
      } catch (e) {
        // ignore
      }
    }
    load();
    const off = eventBus.on('walletChanged', () => {
      load();
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <ThemedText style={styles.label} type="defaultSemiBold">
        Tokens
      </ThemedText>
      <View style={styles.pill}>
        <ThemedText style={styles.amount}>{balance === null ? '...' : balance}</ThemedText>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    marginRight: 8,
    fontSize: 14,
  },
  pill: {
    backgroundColor: '#0a7ea4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  amount: {
    color: '#fff',
    fontWeight: '600',
  },
});
