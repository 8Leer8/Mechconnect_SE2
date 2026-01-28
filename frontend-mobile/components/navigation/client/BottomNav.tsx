import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface BottomNavProps {
  activeTab: 'booking' | 'request' | 'home' | 'discover' | 'profile';
  onTabPress: (tab: 'booking' | 'request' | 'home' | 'discover' | 'profile') => void;
}

export function ClientBottomNav({ activeTab, onTabPress }: BottomNavProps) {
  const colorScheme = useColorScheme();
  const tintColor = Colors[colorScheme ?? 'light'].tint;
  const inactiveColor = Colors[colorScheme ?? 'light'].tabIconDefault;

  const tabs = [
    { name: 'booking', label: 'Booking', icon: 'calendar' },
    { name: 'request', label: 'Request', icon: 'bell.fill' },
    { name: 'home', label: 'Home', icon: 'house.fill' },
    { name: 'discover', label: 'Discover', icon: 'magnifyingglass' },
    { name: 'profile', label: 'Profile', icon: 'person.fill' },
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
            <IconSymbol
              size={24}
              name={tab.icon}
              color={isActive ? tintColor : inactiveColor}
            />
            <ThemedText
              style={[
                styles.label,
                { color: isActive ? tintColor : inactiveColor },
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
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 5,
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
  },
});
