import { Stack } from 'expo-router';
import React from 'react';

export default function MainRequestFormLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="main_form" options={{ headerShown: false }} />
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
