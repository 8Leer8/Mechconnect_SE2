import { Stack } from 'expo-router';
import React from 'react';

export default function BookingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="custom" options={{ headerShown: false }} />
      <Stack.Screen name="direct" options={{ headerShown: false }} />
      <Stack.Screen name="emergency" options={{ headerShown: false }} />
      <Stack.Screen name="disputedbooking" options={{ headerShown: false }} />
      <Stack.Screen name="reworkedbooking" options={{ headerShown: false }} />
    </Stack>
  );
}
