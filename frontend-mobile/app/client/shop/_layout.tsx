import { Stack } from 'expo-router';
import React from 'react';

export default function ShopLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="shopprofile" options={{ headerShown: false }} />
      <Stack.Screen name="shopserviceprofile" options={{ headerShown: false }} />
    </Stack>
  );
}
