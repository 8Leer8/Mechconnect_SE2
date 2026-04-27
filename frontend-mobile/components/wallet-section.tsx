import React, { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { eventBus } from '@/utils/eventBus';
import { fetchUnifiedWalletBalance } from '@/lib/walletBalance';

export type CreditsSource = 'mechanic' | 'shop-owner';

type WalletSectionProps = {
  /** Which backend wallet to read (default: mechanic). */
  creditsSource?: CreditsSource;
  /** Route when tapping Add (default: mechanic credits screen). */
  addHref?: Href;
  /** Show Add button (defaults to hidden for shop-owner). */
  showAddButton?: boolean;
};

export default function WalletSection({
  creditsSource = 'mechanic',
  addHref = '/mechanic/wallet',
  showAddButton,
}: WalletSectionProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const router = useRouter();
  const canShowAdd = showAddButton ?? creditsSource !== 'shop-owner';
  const [refreshTick, setRefreshTick] = useState(0);

  const loadBalance = useCallback(async (forceRefresh = false) => {
    const data = await fetchUnifiedWalletBalance(creditsSource, forceRefresh);
    setBalance(data ?? 0);
  }, [creditsSource]);

  useEffect(() => {
    let mounted = true;
    loadBalance().catch(() => {});
    const off = eventBus.on('walletChanged', () => {
      if (!mounted) return;
      setRefreshTick((v) => v + 1);
    });
    return () => { mounted = false; off(); };
  }, [loadBalance]);

  useEffect(() => {
    loadBalance(refreshTick > 0).catch(() => {});
  }, [loadBalance, refreshTick]);

  useFocusEffect(
    useCallback(() => {
      loadBalance().catch(() => {});
    }, [loadBalance])
  );

  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <FontAwesome name="database" size={18} color="#FF8C00" />
      </View>
      <View style={styles.info}>
        <ThemedText style={styles.label}>Credit Balance</ThemedText>
        <ThemedText style={styles.amount}>{`${balance ?? 0} credits`}</ThemedText>
      </View>
      {canShowAdd && (
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push(addHref)} activeOpacity={0.7}>
          <FontAwesome name="plus" size={11} color="#fff" />
          <ThemedText style={styles.addBtnText}>Add</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
    marginBottom: 16,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FF8C0015',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: { flex: 1 },
  label: { fontSize: 12, color: '#8E8E93' },
  amount: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF8C00',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
