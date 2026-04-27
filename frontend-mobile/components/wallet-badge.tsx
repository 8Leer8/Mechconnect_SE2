import React, { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { FontAwesome } from '@expo/vector-icons';
import { eventBus } from '@/utils/eventBus';
import { fetchUnifiedWalletBalance } from '@/lib/walletBalance';

export type CreditsSource = 'mechanic' | 'shop-owner';

type WalletBadgeProps = {
  onPress?: () => void;
  creditsSource?: CreditsSource;
};

export default function WalletBadge({ onPress, creditsSource = 'mechanic' }: WalletBadgeProps) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load(forceRefresh = false) {
      try {
        const data = await fetchUnifiedWalletBalance(creditsSource, forceRefresh);
        if (!mounted) return;
        setBalance(data ?? 0);
      } catch (e) {
        // ignore
      }
    }
    load();
    const off = eventBus.on('walletChanged', () => load(true));
    return () => {
      mounted = false;
      off();
    };
  }, [creditsSource]);

  return (
    <TouchableOpacity style={styles.badge} onPress={onPress} activeOpacity={0.7}>
      <FontAwesome name="database" size={12} color="#FF8C00" />
      <ThemedText style={styles.amount}>{balance ?? 0}</ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF8C0015',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FF8C0030',
    marginLeft: 8,
  },
  amount: {
    color: '#FF8C00',
    fontSize: 14,
    fontWeight: '700',
  },
});
