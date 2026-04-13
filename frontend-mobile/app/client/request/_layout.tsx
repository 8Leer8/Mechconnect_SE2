import { Stack } from 'expo-router';
import React from 'react';

export default function RequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
