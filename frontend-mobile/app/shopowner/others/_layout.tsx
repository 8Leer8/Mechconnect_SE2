import { Stack } from 'expo-router';
import React from 'react';

export default function ShopOwnerOthersLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
    </Stack>
  );
}
