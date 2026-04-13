import { Slot } from 'expo-router';
import React from 'react';
import { LocationProvider } from './request/main_request_form/LocationContext';

export default function ClientLayout() {
  // Provide shared location context for all client-route screens.
  return (
    <LocationProvider>
      <Slot />
    </LocationProvider>
  );
}
