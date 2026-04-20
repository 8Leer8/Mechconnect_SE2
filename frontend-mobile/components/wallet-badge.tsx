import React, { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from './themed-text';
import { FontAwesome } from '@expo/vector-icons';
import { eventBus } from '@/utils/eventBus';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export type CreditsSource = 'mechanic' | 'shop-owner';

function walletUrl(source: CreditsSource) {
  return source === 'shop-owner'
    ? `${API_URL}/users/shop-owner/wallet/`
    : `${API_URL}/users/mechanic/wallet/`;
}

type WalletBadgeProps = {
  onPress?: () => void;
  creditsSource?: CreditsSource;
};

export default function WalletBadge({ onPress, creditsSource = 'mechanic' }: WalletBadgeProps) {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(walletUrl(creditsSource), {
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
    const off = eventBus.on('walletChanged', () => load());
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
