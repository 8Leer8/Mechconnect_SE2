import { Stack } from 'expo-router';
import React from 'react';

export default function FormsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="cancellationform" options={{ headerShown: false }} />
      <Stack.Screen name="disputeform" options={{ headerShown: false }} />
      <Stack.Screen name="rescheduleform" options={{ headerShown: false }} />
      <Stack.Screen name="reworkfomr" options={{ headerShown: false }} />
    </Stack>
  );
}
