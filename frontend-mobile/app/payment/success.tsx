import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

export default function PaymentSuccessScreen() {
  return (
    <View style={styles.container}>
      <FontAwesome name="check-circle" size={70} color="#34C759" />
      <ThemedText style={styles.title}>Payment Successful</ThemedText>
      <ThemedText style={styles.subtitle}>Your payment was completed and booking is now marked completed.</ThemedText>

      <TouchableOpacity style={styles.button} onPress={() => router.back()}>
        <ThemedText style={styles.buttonText}>Back</ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    marginTop: 16,
    color: '#ECEDEE',
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    color: '#9BA1A6',
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#FF8C00',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#1A1C1E',
    fontWeight: '800',
  },
});