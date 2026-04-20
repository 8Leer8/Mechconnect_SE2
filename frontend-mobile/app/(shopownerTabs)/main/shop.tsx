import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';
import WalletBadge from '@/components/wallet-badge';

/** Tab route stays `main/shop`; label in tabs is Map. Placeholder until real map is wired. */
export default function ShopOwnerMapPlaceholder() {
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 12) + 8;

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerLeft}>
          <ThemedText style={styles.title}>Map</ThemedText>
          <ThemedText style={styles.subtitle}>Find shops and jobs on the map — coming soon</ThemedText>
        </View>
        <WalletBadge
          creditsSource="shop-owner"
        />
      </View>

      <View style={styles.mapCard}>
        <View style={styles.mapBadge}>
          <ThemedText style={styles.mapBadgeText}>Preview</ThemedText>
        </View>

        {/* Fake map grid */}
        <View style={styles.gridWrap}>
          {Array.from({ length: 8 }).map((_, row) => (
            <View key={`r${row}`} style={styles.gridRow}>
              {Array.from({ length: 6 }).map((_, col) => (
                <View key={`c${col}`} style={styles.gridCell} />
              ))}
            </View>
          ))}
        </View>

        <View style={styles.roads}>
          <View style={styles.roadH} />
          <View style={styles.roadV} />
        </View>

        <View style={styles.pinWrap} pointerEvents="none">
          <View style={styles.pinCircle}>
            <FontAwesome name="map-marker" size={28} color="#FF8C00" />
          </View>
        </View>

        <View style={styles.mapFooter}>
          <View style={styles.chip}>
            <FontAwesome name="search" size={12} color="#8E8E93" />
            <ThemedText style={styles.chipText}>Search area</ThemedText>
          </View>
          <View style={styles.chip}>
            <FontAwesome name="location-arrow" size={12} color="#8E8E93" />
            <ThemedText style={styles.chipText}>My location</ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.hintCard}>
        <FontAwesome name="info-circle" size={16} color="#FF8C00" style={styles.hintIcon} />
        <ThemedText style={styles.hintText}>
          Live map, pins, and routing will appear here in a future update.
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  mapCard: {
    flex: 1,
    minHeight: 320,
    maxHeight: 440,
    borderRadius: 20,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#252525',
    overflow: 'hidden',
    position: 'relative',
  },
  mapBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FF8C0020',
    borderWidth: 1,
    borderColor: '#FF8C0040',
  },
  mapBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF8C00',
    letterSpacing: 0.5,
  },
  gridWrap: {
    ...StyleSheet.absoluteFillObject,
    padding: 12,
    opacity: 0.35,
  },
  gridRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gridCell: {
    flex: 1,
    margin: 1,
    borderRadius: 2,
    backgroundColor: '#1E1E1E',
  },
  roads: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  roadH: {
    position: 'absolute',
    top: '48%',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#2A2A2A',
  },
  roadV: {
    position: 'absolute',
    left: '42%',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#2A2A2A',
  },
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF8C0018',
    borderWidth: 2,
    borderColor: '#FF8C0044',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  mapFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(13,13,13,0.92)',
    borderTopWidth: 1,
    borderTopColor: '#252525',
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    marginBottom: 24,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#252525',
  },
  hintIcon: {
    marginTop: 2,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: '#AEAEB2',
    lineHeight: 19,
  },
});
