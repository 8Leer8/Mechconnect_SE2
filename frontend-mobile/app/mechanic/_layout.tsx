import { Stack } from 'expo-router';
import React from 'react';

export default function MechanicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="booking" options={{ headerShown: false }} />
      <Stack.Screen name="wallet" options={{ headerShown: false }} />
    </Stack>
  );
}
