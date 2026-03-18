import { Slot } from 'expo-router';
import React from 'react';

export default function ClientLayout() {
  // Use Slot to render nested routes; header handling is done in parent Stack
  return <Slot />;
}
