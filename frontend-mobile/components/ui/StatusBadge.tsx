import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

interface StatusBadgeProps {
  label: string;
  color: string;
  /** 'badge' = colored pill with text, 'dot' = small colored circle */
  variant?: 'badge' | 'dot';
}

export function StatusBadge({ label, color, variant = 'badge' }: StatusBadgeProps) {
  if (variant === 'dot') {
    return <View style={[styles.dot, { backgroundColor: color }]} />;
  }

  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <ThemedText style={styles.badgeText}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
