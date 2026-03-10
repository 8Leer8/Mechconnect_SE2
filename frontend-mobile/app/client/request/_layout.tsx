import { Stack } from 'expo-router';
import React from 'react';
import { LocationProvider } from './main_request_form/LocationContext';

export default function RequestLayout() {
  return (
    <LocationProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </LocationProvider>
  );
}
