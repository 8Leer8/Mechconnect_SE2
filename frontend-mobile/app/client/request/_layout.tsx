import { Stack } from 'expo-router';
import React from 'react';
import { LocationProvider } from './main_request_form/LocationContext';

export default function RequestLayout() {
  return (
    <LocationProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}>
        <Stack.Screen name="direct" options={{ headerShown: false }} />
        <Stack.Screen name="custom" options={{ headerShown: false }} />
        <Stack.Screen name="broadcast" options={{ headerShown: false }} />
        <Stack.Screen name="emergency" options={{ headerShown: false }} />
        <Stack.Screen name="aiRecommend" options={{ headerShown: false }} />
        <Stack.Screen name="main_request_form" options={{ headerShown: false }} />
        
      </Stack>
    </LocationProvider>
  );
}
