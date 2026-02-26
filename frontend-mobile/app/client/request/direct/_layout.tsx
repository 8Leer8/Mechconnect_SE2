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
      {/* `shopdirectrequest` route is handled by file-based routing or not present,
          defining it here causes an extraneous screen warning, so it's removed. */}
    </Stack>
  );
}
