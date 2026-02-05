import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FF8C00',
        tabBarInactiveTintColor: '#999',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFF5E6',
          borderTopColor: '#FFE4B3',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 5,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
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
          title: 'Booking',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/request"
        options={{
          title: 'Request',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="file-text" color={color} />,
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
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="search" color={color} />,
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
