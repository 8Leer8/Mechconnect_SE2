import { Stack } from 'expo-router';
import React from 'react';

export default function DirectRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="choosePart" options={{ headerShown: false }} />
      <Stack.Screen name="mechanicdirectrequest" options={{ headerShown: false }} />
      <Stack.Screen name="shopdirectrequest" options={{ headerShown: false }} />
    </Stack>
  );
}
