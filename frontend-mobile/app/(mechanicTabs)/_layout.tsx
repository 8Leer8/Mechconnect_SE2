import { Tabs } from 'expo-router';
import React from 'react';
import { FontAwesome } from '@expo/vector-icons';

export default function MechanicTabLayout() {
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
          height: 60,
          paddingBottom: 5,
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
        name="main/bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="calendar-check-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="main/emergency"
        options={{
          title: 'Emergency',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="exclamation-triangle" color={color} />,
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
        name="main/map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <FontAwesome size={20} name="map-marker" color={color} />,
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
      <Tabs.Screen name="booking" options={{ href: null }} />
      <Tabs.Screen name="buyToken" options={{ href: null }} />
      <Tabs.Screen name="client" options={{ href: null }} />
      <Tabs.Screen name="forms" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="request" options={{ href: null }} />
      <Tabs.Screen name="shop" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="workingShop" options={{ href: null }} />
    </Tabs>
  );
}
