import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

interface LoadingViewProps {
  /** Spinner color, defaults to orange */
  color?: string;
  size?: 'small' | 'large';
  /** 'inline' = just the spinner with margin, 'full' = centered in flex container */
  variant?: 'inline' | 'full';
}

export function LoadingView({
  color = '#FF8C00',
  size = 'large',
  variant = 'inline',
}: LoadingViewProps) {
  if (variant === 'full') {
    return (
      <View style={styles.fullContainer}>
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }

  return <ActivityIndicator size={size} color={color} style={styles.inline} />;
}

const styles = StyleSheet.create({
  inline: {
    marginTop: 40,
  },
  fullContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
