import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { FontAwesome } from '@expo/vector-icons';

interface ErrorRetryProps {
  message: string;
  onRetry?: () => void;
  /** Accent color for retry button, defaults to orange */
  retryColor?: string;
}

export function ErrorRetry({
  message,
  onRetry,
  retryColor = '#FF8C00',
}: ErrorRetryProps) {
  return (
    <View style={styles.errorContainer}>
      <FontAwesome name="exclamation-circle" size={48} color="#FF3B30" />
      <ThemedText style={styles.errorText}>{message}</ThemedText>
      {onRetry ? (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: retryColor }]}
          onPress={onRetry}
        >
          <ThemedText style={styles.retryText}>Retry</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    marginTop: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
