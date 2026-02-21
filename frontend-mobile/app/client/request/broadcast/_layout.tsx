import { Stack } from 'expo-router';
import React from 'react';

export default function BroadcastRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="broadcastrequest" options={{ headerShown: false }} />
      <Stack.Screen 
        name="map" 
        options={{ 
          headerShown: false,
          presentation: 'modal',
        }} 
      />
    </Stack>
  );
}
