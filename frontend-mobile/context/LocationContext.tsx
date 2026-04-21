import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
  streetName: string;
  city: string;
  barangay: string;
  radiusKm?: number;
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

export function getDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);

  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getEstimatedPrice(
  distanceKm: number,
  serviceMinimumPrice: number,
  perKmRate: number = 10
): number {
  const distancePrice = distanceKm * perKmRate;
  return serviceMinimumPrice + distancePrice;
}