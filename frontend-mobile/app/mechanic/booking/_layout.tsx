import { Stack } from 'expo-router';
import React from 'react';

/** Only list screens that match files in this folder (wrong names break navigation state). */
export default function BookingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="booking_details" />
      <Stack.Screen name="quotation_edit" />
      <Stack.Screen name="booking_location_map" />
    </Stack>
  );
}
