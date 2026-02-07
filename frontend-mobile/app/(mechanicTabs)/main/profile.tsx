import React from 'react';
import { StyleSheet, View, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome } from '@expo/vector-icons';

export default function ProfileScreen() {
  const handleSwitchAccount = () => {
    router.push('/(auth)/switchAccount/switchPage');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.letterContainer}>
          <ThemedText style={styles.letter}>P</ThemedText>
          <ThemedText style={styles.label}>Profile Page</ThemedText>
        </View>

        {/* Switch Account Button */}
        <TouchableOpacity 
          style={styles.switchButton}
          onPress={handleSwitchAccount}
          activeOpacity={0.7}
        >
          <FontAwesome name="exchange" size={20} color="#fff" />
          <ThemedText style={styles.switchButtonText}>Switch Account Role</ThemedText>
          <FontAwesome name="chevron-right" size={16} color="#888" />
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#151718',
  },
  content: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  letterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letter: {
    fontSize: 120,
    fontWeight: 'bold',
    color: '#5856D6',
  },
  label: {
    fontSize: 24,
    marginTop: 20,
    color: '#fff',
  },
  switchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  switchButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
