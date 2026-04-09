import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  streetName: string;
  city: string;
  barangay: string;
}

interface MechanicLocation {
  latitude: number;
  longitude: number;
}

interface LocationContextType {
  selectedLocation: LocationData | null;
  setSelectedLocation: (location: LocationData | null) => void;
  mechanicLocation: MechanicLocation | null;
  setMechanicLocation: (location: MechanicLocation | null) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [mechanicLocation, setMechanicLocation] = useState<MechanicLocation | null>(null);

  // Memoize context value to prevent re-renders on every parent render
  const value = useMemo(
    () => ({ selectedLocation, setSelectedLocation, mechanicLocation, setMechanicLocation }),
    [selectedLocation, mechanicLocation]
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}

// ---- Distance & Pricing Helpers ----

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns distance in kilometers
 */
export function getDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Calculate estimated price from service minimum and distance config values.
 * @param distanceKm - actual distance in km
 * @param serviceMinimumPrice - base service price
 * @param perKmRate - dynamic rate per km from pricing config
 * @param baseDistanceFee - dynamic base distance fee from pricing config
 * @param freeDistanceKm - dynamic free distance threshold from pricing config
 * @returns total estimated price
 */
export function getEstimatedPrice(
  distanceKm: number,
  serviceMinimumPrice: number,
  perKmRate: number,
  baseDistanceFee: number = 0,
  freeDistanceKm: number = 0
): number {
  const safeDistanceKm = Math.max(0, distanceKm);
  const safeFreeDistanceKm = Math.max(0, freeDistanceKm);
  const billableDistanceKm = Math.max(0, safeDistanceKm - safeFreeDistanceKm);
  const distancePrice = (safeDistanceKm > safeFreeDistanceKm ? baseDistanceFee : 0) + (billableDistanceKm * perKmRate);
  return serviceMinimumPrice + distancePrice;
}
