import { Stack } from 'expo-router';
import React from 'react';
import { LocationProvider } from './LocationContext';

export default function BroadcastRequestLayout() {
  return (
    <LocationProvider>
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
    </LocationProvider>
  );
}
