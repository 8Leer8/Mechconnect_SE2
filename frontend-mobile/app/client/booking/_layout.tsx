import { Stack } from 'expo-router';
import React from 'react';

export default function BookingLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="booking_details" options={{ headerShown: false }} />
      <Stack.Screen name="booking_location_map" options={{ headerShown: false }} />
    </Stack>
  );
}
