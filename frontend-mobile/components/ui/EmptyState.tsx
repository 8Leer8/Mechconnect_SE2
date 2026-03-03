import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';

interface EmptyStateProps {
  icon?: string;
  iconSize?: number;
  iconColor?: string;
  title: string;
  subtitle?: string;
  /** 'card' = compact card style, 'full' = centered full area */
  variant?: 'card' | 'full';
  /** Optional extra icon circle around the icon (used in 'full' variant) */
  showIconCircle?: boolean;
}

export function EmptyState({
  icon = 'inbox',
  iconSize = 36,
  iconColor = '#555',
  title,
  subtitle,
  variant = 'card',
  showIconCircle = false,
}: EmptyStateProps) {
  const isCard = variant === 'card';

  return (
    <View style={isCard ? styles.emptyCard : styles.emptyContainer}>
      {showIconCircle ? (
        <View style={styles.iconCircle}>
          <FontAwesome name={icon as any} size={iconSize} color={iconColor} />
        </View>
      ) : (
        <FontAwesome name={icon as any} size={iconSize} color={iconColor} />
      )}
      <ThemedText style={isCard ? styles.emptyTitle : styles.emptyText}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText style={isCard ? styles.emptySubtext : styles.emptySubtextFull}>
          {subtitle}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCard: {
    backgroundColor: '#1A1C1E',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginTop: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1A1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2C2E',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#888',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#888',
  },
  emptySubtext: {
    fontSize: 12,
    color: '#555',
    marginTop: 4,
  },
  emptySubtextFull: {
    fontSize: 13,
    color: '#555',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
