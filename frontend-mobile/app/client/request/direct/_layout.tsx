import { Stack } from 'expo-router';
import React from 'react';

export default function DirectRequestLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
