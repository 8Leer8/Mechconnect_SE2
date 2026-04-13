export interface AddressFields {
  street_name?: string | null;
  subdivision_village?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  region?: string | null;
}

interface TomTomGeocodeResponse {
  summary?: {
    numResults?: number;
  };
  results?: Array<{
    position?: {
      lat?: number;
      lon?: number;
    };
  }>;
}

function cleanPart(value: string | null | undefined): string {
  return (value || '').trim();
}

export const geocodeAddressFields = async (
  address: AddressFields
): Promise<{ latitude: number; longitude: number } | null> => {
  const TOMTOM_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY;
  if (!TOMTOM_KEY) return null;

  const reliableParts = [
    address.barangay?.trim(),
    address.city_municipality?.trim(),
    address.province?.trim(),
    'Philippines',
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  const fullParts = [
    address.street_name?.trim(),
    address.subdivision_village?.trim(),
    ...reliableParts,
  ].filter((p): p is string => typeof p === 'string' && p.length > 0);

  if (reliableParts.length < 2) {
    console.warn('Insufficient address data for geocoding');
    return null;
  }

  const tryGeocode = async (parts: string[]): Promise<{ latitude: number; longitude: number } | null> => {
    const addressString = parts.join(', ');
    const encoded = encodeURIComponent(addressString);
    const url = `https://api.tomtom.com/search/2/geocode/${encoded}.json?key=${TOMTOM_KEY}`;

    console.log('TomTom geocode attempt:', addressString);

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = (await response.json()) as TomTomGeocodeResponse;
      console.log('TomTom response summary count:', data.summary?.numResults ?? 0);

      if (data.results && data.results.length > 0) {
        const lat = data.results[0]?.position?.lat;
        const lon = data.results[0]?.position?.lon;
        if (typeof lat === 'number' && typeof lon === 'number') {
          console.log('TomTom geocode success:', { lat, lon });
          return { latitude: lat, longitude: lon };
        }
      }

      console.warn('TomTom geocode no results for:', addressString);
      return null;
    } catch (error) {
      console.error('TomTom geocode fetch error:', error);
      return null;
    }
  };

  try {
    let result = await tryGeocode(fullParts);
    if (!result) {
      console.warn('Full address failed, trying minimal address');
      result = await tryGeocode(reliableParts);
    }

    if (!result) {
      console.error('Both TomTom geocode attempts failed');
    }

    return result;
  } catch {
    return null;
  }
};

export const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
};
