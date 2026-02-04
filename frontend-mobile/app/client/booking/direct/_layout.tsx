import { Stack } from 'expo-router';
import React from 'react';

export default function DirectBookingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="activebooking" options={{ headerShown: false }} />
      <Stack.Screen name="cancelledbooking" options={{ headerShown: false }} />
      <Stack.Screen name="completedbooking" options={{ headerShown: false }} />
    </Stack>
  );
}
