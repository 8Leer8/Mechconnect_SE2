import { Stack } from 'expo-router';
import React from 'react';

export default function EmergencyRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="emergencyrequest" options={{ headerShown: false }} />
    </Stack>
  );
}
