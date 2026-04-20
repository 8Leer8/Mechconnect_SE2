import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="switchAccount/switchPage" options={{ headerShown: false }} />
      <Stack.Screen name="switchAccount/mechanicRegister" options={{ headerShown: false }} />
      <Stack.Screen name="switchAccount/shopOwnerRegister" options={{ headerShown: false }} />
    </Stack>
  );
}
