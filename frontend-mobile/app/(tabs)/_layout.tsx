import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="client/Booking/booking"
        options={{
          title: 'Booking',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="client/Request/request"
        options={{
          title: 'Request',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="client/Home/home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="client/Discover/discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="client/Profile/profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="request"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="client"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="mechanic"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="shopowner"
        options={{
          href: null, // Hide from tabs
        }}
      />
    </Tabs>
  );
}
