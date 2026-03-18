import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabsBackToHome } from '@/hooks/use-tabs-back-to-home';

export default function MechanicShopTabLayout() {
  const insets = useSafeAreaInsets();
  useTabsBackToHome('/(mechanicShopTabs)/main/home');

  return (
    <Tabs
      screenOptions={{
        unmountOnBlur: true,
        tabBarActiveTintColor: '#FF8C00',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1E1E1E',
          borderTopColor: '#333',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 5,
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
        name="main/home"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="tachometer" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="briefcase" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/profile"
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
