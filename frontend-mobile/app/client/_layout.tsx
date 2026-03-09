import { Stack } from 'expo-router';
import React from 'react';

export default function ClientLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
