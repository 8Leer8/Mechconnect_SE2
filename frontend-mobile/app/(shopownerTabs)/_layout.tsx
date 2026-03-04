import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';

export default function ShopOwnerTabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: { backgroundColor: '#000' },
        tabBarActiveTintColor: '#FF9500',
        tabBarInactiveTintColor: '#888',
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontSize: 10, marginTop: 2, fontWeight: '500' },
      }}>
      <Tabs.Screen
        name="main/request"
        options={{
          title: 'Request',
          tabBarIcon: ({ color }) => <FontAwesome size={22} name="envelope" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <FontAwesome size={22} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/mechanics"
        options={{
          title: 'Mechanics',
          tabBarIcon: ({ color }) => <FontAwesome size={22} name="wrench" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ color }) => <FontAwesome size={22} name="building" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <FontAwesome size={22} name="user" color={color} />,
        }}
      />
      {/* Hide non-tab routes */}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
