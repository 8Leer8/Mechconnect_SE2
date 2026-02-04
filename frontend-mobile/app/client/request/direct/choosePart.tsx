import React from 'react';
import { StyleSheet, View, TouchableOpacity, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TopNav } from '@/components/navigation';
import { router } from 'expo-router';

export default function ChoosePartScreen() {
  const handleNotificationPress = () => {
    console.log('Notification pressed');
  };

  const handleMechanicRequest = () => {
    router.push('/client/request/direct/mechanicdirectrequest' as any);
  };

  const handleShopRequest = () => {
    router.push('/client/request/direct/shopdirectrequest' as any);
  };

  return (
    <ThemedView style={styles.container}>
      <TopNav onNotificationPress={handleNotificationPress} />
      
      <View style={styles.content}>
        <ThemedText style={styles.title}>Choose Service Provider</ThemedText>
        <ThemedText style={styles.subtitle}>
          Select where you want to create your direct request
        </ThemedText>

        <View style={styles.buttonContainer}>
          {/* Mechanic Request Button */}
          <TouchableOpacity 
            style={styles.optionCard}
            onPress={handleMechanicRequest}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <ThemedText style={styles.iconText}>🔧</ThemedText>
            </View>
            <ThemedText style={styles.optionTitle}>Request from Mechanic</ThemedText>
            <ThemedText style={styles.optionDescription}>
              Get services from independent mechanics
            </ThemedText>
          </TouchableOpacity>

          {/* Shop Request Button */}
          <TouchableOpacity 
            style={styles.optionCard}
            onPress={handleShopRequest}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <ThemedText style={styles.iconText}>🏪</ThemedText>
            </View>
            <ThemedText style={styles.optionTitle}>Request from Shop</ThemedText>
            <ThemedText style={styles.optionDescription}>
              Get services from registered repair shops
            </ThemedText>
          </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
    textAlign: 'center',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 40,
    color: '#e0e0e0',
  },
  buttonContainer: {
    gap: 20,
  },
  optionCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#444',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0066cc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 40,
  },
  optionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#ffffff',
  },
  optionDescription: {
    fontSize: 14,
    opacity: 0.7,
    textAlign: 'center',
    color: '#e0e0e0',
  },
});
