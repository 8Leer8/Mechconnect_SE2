import { Stack } from 'expo-router';
import React from 'react';

export default function MechanicLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="mechanicprofile" options={{ headerShown: false }} />
    </Stack>
  );
}
