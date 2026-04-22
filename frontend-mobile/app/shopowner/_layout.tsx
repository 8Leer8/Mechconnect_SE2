import { Stack } from 'expo-router';
import React from 'react';

export default function ShopOwnerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="others" options={{ headerShown: false }} />
      <Stack.Screen name="booking/booking_details" options={{ headerShown: false }} />
      <Stack.Screen name="request_details" options={{ headerShown: false }} />
    </Stack>
  );
}