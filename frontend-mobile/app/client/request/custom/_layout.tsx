import { Stack } from 'expo-router';
import React from 'react';

export default function CustomRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="mechaniccustomrequest" options={{ headerShown: false }} />
      <Stack.Screen name="shopcustomrequest" options={{ headerShown: false }} />
    </Stack>
  );
}
