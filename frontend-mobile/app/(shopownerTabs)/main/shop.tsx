import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TopNav } from '@/components/navigation';

export default function ShopOwnerShop() {
  const handleNotificationPress = () => {
    console.log('Notification pressed');
    // Add notification navigation here later
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      <View style={styles.content}>
        <IconSymbol name="building.2.fill" size={60} color="#007AFF" />
        <ThemedText style={styles.title}>Shop</ThemedText>
        <ThemedText style={styles.subtitle}>This is the shop</ThemedText>
        
        <TouchableOpacity 
          style={styles.switchButton}
          onPress={() => router.push('/(auth)/switchAccount/switchPage')}
        >
          <IconSymbol name="arrow.left.arrow.right.circle.fill" size={20} color="#fff" />
          <ThemedText style={styles.switchButtonText}>Switch Role</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 12,
  },
  switchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
