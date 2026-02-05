import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

interface BottomNavProps {
  activeTab: 'booking' | 'request' | 'home' | 'discover' | 'profile';
  onTabPress: (tab: 'booking' | 'request' | 'home' | 'discover' | 'profile') => void;
}

export function ClientBottomNav({ activeTab, onTabPress }: BottomNavProps) {
  const activeColor = '#FF8C00';
  const inactiveColor = '#999';

  const tabs = [
    { name: 'booking', label: 'Booking', icon: 'calendar' },
    { name: 'request', label: 'Request', icon: 'file-text' },
    { name: 'home', label: 'Home', icon: 'home' },
    { name: 'discover', label: 'Discover', icon: 'search' },
    { name: 'profile', label: 'Profile', icon: 'user' },
  ] as const;

  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;
        return (
          <TouchableOpacity
            key={tab.name}
            style={styles.tab}
            onPress={() => onTabPress(tab.name)}
          >
            <FontAwesome
              size={20}
              name={tab.icon}
              color={isActive ? activeColor : inactiveColor}
            />
            <ThemedText
              style={[
                styles.label,
                { color: isActive ? activeColor : inactiveColor },
              ]}
            >
              {tab.label}
            </ThemedText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: 60,
    borderTopWidth: 1,
    borderTopColor: '#FFE4B3',
    backgroundColor: '#FFF5E6',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 5,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 5,
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
});
