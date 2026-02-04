import { Stack } from 'expo-router';
import React from 'react';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="accountsetting" options={{ headerShown: false }} />
      <Stack.Screen name="dispute" options={{ headerShown: false }} />
      <Stack.Screen name="notification" options={{ headerShown: false }} />
      <Stack.Screen name="switchaccount" options={{ headerShown: false }} />
    </Stack>
  );
}
