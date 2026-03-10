import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';

interface SectionHeaderProps {
  title: string;
  /** Color of the dot indicator before title */
  dotColor?: string;
  /** Callback for "See All" link; if omitted, no link shown */
  onSeeAll?: () => void;
  seeAllText?: string;
}

export function SectionHeader({
  title,
  dotColor,
  onSeeAll,
  seeAllText = 'See All →',
}: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {dotColor ? (
          <View style={[styles.sectionDot, { backgroundColor: dotColor }]} />
        ) : null}
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      </View>
      {onSeeAll ? (
        <TouchableOpacity onPress={onSeeAll}>
          <ThemedText style={styles.seeAll}>{seeAllText}</ThemedText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  seeAll: {
    fontSize: 13,
    color: '#FF8C00',
    fontWeight: '600',
  },
});
