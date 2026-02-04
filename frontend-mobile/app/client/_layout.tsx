import { Stack } from 'expo-router';
import React from 'react';

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="booking" options={{ headerShown: false }} />
      <Stack.Screen name="forms" options={{ headerShown: false }} />
      <Stack.Screen name="mechanic" options={{ headerShown: false }} />
      <Stack.Screen name="payment" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="request" options={{ headerShown: false }} />
      <Stack.Screen name="shop" options={{ headerShown: false }} />
    </Stack>
  );
}
