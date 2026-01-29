import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface TopNavProps {
  onNotificationPress?: () => void;
}

export function TopNav({ onNotificationPress }: TopNavProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MechConnect</Text>
      <TouchableOpacity 
        onPress={onNotificationPress}
        style={styles.notificationButton}
      >
        <MaterialIcons name="notifications" size={28} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 0) + 10,
    paddingBottom: 12,
    backgroundColor: '#FFB347',
    borderBottomWidth: 1,
    borderBottomColor: '#ff9900',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  notificationButton: {
    padding: 8,
  },
});
