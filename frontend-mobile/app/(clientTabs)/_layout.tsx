import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ClientTabLayout() {
  const insets = useSafeAreaInsets();
  useTabsBackToHome('/(clientTabs)/main/home');

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FF8C00',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
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
        name="main/booking"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="calendar-check-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/request"
        options={{
          title: 'Requests',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="file-text-o" color={color} />,
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
        name="main/discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="compass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="user" color={color} />,
        }}
      />
      {/* Hide non-tab screens */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
