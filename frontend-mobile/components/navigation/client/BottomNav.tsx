import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';

interface BottomNavProps {
  activeTab: 'booking' | 'request' | 'home' | 'discover' | 'profile';
  onTabPress: (tab: 'booking' | 'request' | 'home' | 'discover' | 'profile') => void;
}

export function ClientBottomNav({ activeTab, onTabPress }: BottomNavProps) {
  const activeColor = '#FF6B35';
  const inactiveColor = '#6c757d';

  const tabs = [
    { name: 'booking', label: 'Booking', icon: 'calendar-alt' },
    { name: 'request', label: 'Request', icon: 'hand-paper-o' },
    { name: 'home', label: 'Home', icon: 'home' },
    { name: 'discover', label: 'Discover', icon: 'compass' },
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
            <View style={[
              styles.iconCircle,
              isActive && styles.iconCircleActive,
              isActive && styles.iconCircleRaised
            ]}>
              <FontAwesome
                size={18}
                name={tab.icon}
                color={isActive ? '#ffffff' : inactiveColor}
              />
            </View>
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
    height: 70,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconCircleActive: {
    backgroundColor: '#FF6B35',
  },
  iconCircleRaised: {
    transform: [{ translateY: -4 }],
  },
  label: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
});
