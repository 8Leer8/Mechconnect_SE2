import { Stack } from 'expo-router';
import React from 'react';

export default function AiRecommendLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen name="aicustomrequest" options={{ headerShown: false }} />
      <Stack.Screen name="recommendprovider" options={{ headerShown: false }} />
    </Stack>
  );
}
