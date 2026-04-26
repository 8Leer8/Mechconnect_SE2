import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useFocusEffect } from '@react-navigation/native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

interface WalletButtonProps {
  iconColor?: string;
  showBadge?: boolean;
}

export default function WalletButton({ iconColor = '#FF8C00', showBadge = true }: WalletButtonProps) {
  const [balance, setBalance] = useState<number | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/users/client/wallet/`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.tokens_balance ?? 0);
    } catch (e) {
      // Silently fail - user can see balance on wallet page
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchBalance();
    }, [fetchBalance])
  );

  const handlePress = () => {
    router.push('/client/wallet/walletPage' as never);
  };

  // Format balance for display (show max 99+)
  const displayBalance = balance !== null && balance > 0
    ? balance > 99 ? '99+' : String(balance)
    : null;

  return (
    <TouchableOpacity style={styles.trigger} onPress={handlePress} activeOpacity={0.85}>
      <View style={styles.triggerInner}>
        <FontAwesome name="database" size={16} color={iconColor} />
      </View>
      {showBadge && displayBalance && (
        <View style={styles.badge}>
          <ThemedText style={styles.badgeText}>{displayBalance}</ThemedText>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  trigger: {
    position: 'relative',
  },
  triggerInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 140, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.18)',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#111',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: '#FFF',
  },
});
