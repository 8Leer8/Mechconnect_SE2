import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';

export default function ShopOwnerTabLayout() {
  const insets = useSafeAreaInsets();
  useTabsBackToHome('/(shopownerTabs)/main/home');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: '#FF8C00',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#1E1E1E',
          borderTopColor: '#333',
          borderTopWidth: 1,
          height: 55 + Math.max(insets.bottom, 6),
          paddingBottom: Math.max(insets.bottom, 6),
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          marginTop: 2,
          fontWeight: '500',
        },
      }}>
      <Tabs.Screen
        name="main/jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="briefcase" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/mechanics"
        options={{
          title: 'Mechanics',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="wrench" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="building" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="user" color={color} />,
        }}
      />
      {/* Hide non-tab routes */}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
