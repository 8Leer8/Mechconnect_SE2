import { Stack } from 'expo-router';
import React from 'react';

export default function PaymentLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="checkout" options={{ headerShown: false }} />
      <Stack.Screen name="checkoutdetail" options={{ headerShown: false }} />
    </Stack>
  );
}
