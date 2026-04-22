import * as Location from 'expo-location';

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  address_components: GoogleAddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  results?: GoogleGeocodeResult[];
}

export interface ParsedLocationAddress {
  address: string;
  streetName: string;
  barangay: string;
  city: string;
  subdivision: string;
  region: string;
}

export interface StructuredAccountAddress {
  house_building_number?: string | null;
  street_name?: string | null;
  subdivision_village?: string | null;
  barangay?: string | null;
  city_municipality?: string | null;
  province?: string | null;
  region?: string | null;
  postal_code?: string | null;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const geocodeCache = new Map<string, Coordinates | null>();

function clean(value?: string | null): string {
  return (value || '').trim();
}

function firstSegment(value: string): string {
  const normalized = clean(value);
  if (!normalized) return '';
  if (!normalized.includes(',')) return normalized;
  return normalized.split(',')[0].trim();
}

function getAddressComponent(components: GoogleAddressComponent[], type: string): string {
  const component = components.find((item) => item.types.includes(type));
  return clean(component?.long_name);
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>();
  const ordered: string[] = [];

  parts.forEach((part) => {
    const normalized = clean(part);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(normalized);
  });

  return ordered.join(', ');
}

export function formatStructuredAddress(address?: StructuredAccountAddress | null): string {
  if (!address) {
    return '';
  }

  return uniqueJoin([
    address.house_building_number || '',
    address.street_name || '',
    address.subdivision_village || '',
    address.barangay || '',
    address.city_municipality || '',
    address.province || '',
    address.region || '',
    address.postal_code || '',
  ]);
}

function dedupeComponent(value: string, comparisons: string[]): string {
  const normalized = clean(value);
  if (!normalized) return '';
  const normalizedKey = normalized.toLowerCase();
  const matches = comparisons.some((item) => clean(item).toLowerCase() === normalizedKey);
  return matches ? '' : normalized;
}

/** True if this label is a region / large admin area, not a barangay or village. */
function looksLikePhilippineRegionLabel(value: string): boolean {
  const v = clean(value).toLowerCase();
  if (!v) return false;
  if (/zamboanga\s+peninsula/i.test(v)) return true;
  if (v.includes('administrative region')) return true;
  if (v.includes('autonomous region')) return true;
  if (v === 'zamboanga del sur' || v === 'zamboanga del norte' || v === 'zamboanga sibugay') return true;
  if (/\bregion\b/.test(v)) return true;
  if (v.includes('metro manila') || v === 'ncr') return true;
  if (v.includes('mimaropa') || v.includes('calabarzon') || v.includes('soccsksargen')) return true;
  if (v.includes('bangsamoro') || v.includes('barmm')) return true;
  if (v.includes('caraga') || v.includes('cordillera')) return true;
  if (v.includes('northern mindanao') || v.includes('davao region') || v.includes('western visayas')) return true;
  if (v.includes('eastern visayas') || v.includes('central visayas')) return true;
  return false;
}

/** Region-like value wrongly stored as subdivision (e.g. admin_area_level_3 = Peninsula). */
function subdivisionIsActuallyRegion(value: string): boolean {
  const v = clean(value).toLowerCase();
  if (!v) return false;
  if (looksLikePhilippineRegionLabel(value)) return true;
  if (v.includes('peninsula')) return true;
  return false;
}

function namesMatch(a: string, b: string): boolean {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** Remove "Zamboanga Peninsula" when it is stuck on the end of a barangay string (with or without a comma). */
function stripTrailingZamboangaPeninsulaFromBarangay(value: string): string {
  let s = clean(value);
  if (!s) return '';
  s = s.replace(/\s*,\s*zamboanga\s+peninsula\s*$/i, '').trim();
  s = s.replace(/\s+zamboanga\s+peninsula\s*$/i, '').trim();
  return s;
}

/**
 * Clean a barangay string that may already be saved on the server (Expo/geocode quirks).
 * Pass city / region / subdivision when you have them so overlaps are removed.
 */
export function coerceBarangayForDisplay(
  barangay: string | null | undefined,
  cityMunicipality?: string | null,
  region?: string | null,
  subdivisionVillage?: string | null
): string {
  return sanitizeParsedLocationAddress({
    address: '',
    streetName: '',
    barangay: clean(barangay),
    city: clean(cityMunicipality),
    subdivision: clean(subdivisionVillage),
    region: clean(region),
  }).barangay;
}

/**
 * Google sometimes puts the region in sublocality/subdivision; some screens also
 * confused region with barangay. Clean overlaps and normalize Zamboanga labels.
 */
function sanitizeParsedLocationAddress(data: ParsedLocationAddress): ParsedLocationAddress {
  let streetName = clean(data.streetName);
  let barangay = stripTrailingZamboangaPeninsulaFromBarangay(clean(data.barangay));
  let city = clean(data.city);
  let subdivision = clean(data.subdivision);
  let region = clean(data.region);

  // Treat "Zamboanga City" as the same area name as "Zamboanga Peninsula" for dedupe only.
  const zamboangaCityVsPeninsula = (a: string, b: string) => {
    const x = clean(a).toLowerCase();
    const y = clean(b).toLowerCase();
    if (!x || !y) return false;
    const city = x.includes('zamboanga city') || y.includes('zamboanga city');
    const pen = x.includes('zamboanga peninsula') || y.includes('zamboanga peninsula');
    return city && pen;
  };

  // Geocoder sometimes uses "Zamboanga City" where we want the standard region label.
  if (region && /^zamboanga city$/i.test(region.trim())) {
    region = 'Zamboanga Peninsula';
  }

  if (subdivision) {
    if (namesMatch(subdivision, region) || subdivisionIsActuallyRegion(subdivision)) {
      if (!region) {
        region = firstSegment(subdivision);
      }
      subdivision = '';
    }
  }

  if (barangay) {
    const parts = barangay.includes(',')
      ? barangay.split(',').map((p) => p.trim()).filter(Boolean)
      : [barangay];
    const kept: string[] = [];
    for (const part of parts) {
      const seg = stripTrailingZamboangaPeninsulaFromBarangay(part);
      if (!seg) continue;
      if (namesMatch(seg, region) || namesMatch(seg, city) || namesMatch(seg, subdivision)) {
        continue;
      }
      if (looksLikePhilippineRegionLabel(seg)) {
        if (!region) region = firstSegment(seg);
        continue;
      }
      if (zamboangaCityVsPeninsula(seg, region) || zamboangaCityVsPeninsula(seg, city)) {
        continue;
      }
      kept.push(seg);
    }
    barangay = kept.join(', ').trim();

    if (barangay && looksLikePhilippineRegionLabel(barangay)) {
      if (!region) region = firstSegment(barangay);
      barangay = '';
    } else if (barangay) {
      const overlapsHigher =
        namesMatch(barangay, region) ||
        namesMatch(barangay, city) ||
        namesMatch(barangay, subdivision) ||
        zamboangaCityVsPeninsula(barangay, region) ||
        zamboangaCityVsPeninsula(barangay, city);
      if (overlapsHigher) {
        barangay = '';
      }
    }
  }

  // "Zamboanga del Sur" in barangay is usually the province/region tier, not a barangay.
  if (barangay && /^zamboanga del sur$/i.test(barangay.trim())) {
    if (!region) {
      region = 'Zamboanga del Sur';
    }
    barangay = '';
  }

  if (city && region && namesMatch(city, region)) {
    city = '';
  }

  barangay = firstSegment(barangay);
  city = firstSegment(city);
  subdivision = firstSegment(subdivision);
  region = firstSegment(region);

  const address =
    uniqueJoin([streetName, barangay, city, subdivision, region]) || clean(data.address);

  return {
    address,
    streetName,
    barangay,
    city,
    subdivision,
    region,
  };
}

function parseGoogleResult(result: GoogleGeocodeResult): ParsedLocationAddress {
  const components = result.address_components || [];

  const streetNumber = getAddressComponent(components, 'street_number');
  const route = getAddressComponent(components, 'route');
  const neighborhood = getAddressComponent(components, 'neighborhood');
  const sublocality =
    getAddressComponent(components, 'sublocality_level_1') ||
    getAddressComponent(components, 'sublocality') ||
    neighborhood;
  const locality =
    getAddressComponent(components, 'locality') ||
    getAddressComponent(components, 'administrative_area_level_2');
  let subdivision =
    getAddressComponent(components, 'administrative_area_level_3') ||
    getAddressComponent(components, 'administrative_area_level_4');
  const region = getAddressComponent(components, 'administrative_area_level_1');

  let streetName = clean(`${streetNumber} ${route}`.trim());
  if (!streetName) {
    streetName = getAddressComponent(components, 'premise') || getAddressComponent(components, 'subpremise');
  }

  streetName = firstSegment(streetName);
  let barangay = firstSegment(sublocality);
  let city = firstSegment(locality);

  barangay = dedupeComponent(barangay, [streetName, city, region, subdivision]);
  city = dedupeComponent(city, [streetName, barangay, region]);
  subdivision = dedupeComponent(firstSegment(subdivision), [streetName, barangay, city, region]);

  const address = uniqueJoin([
    streetName,
    barangay,
    city,
    subdivision,
    region,
  ]) || clean(result.formatted_address);

  return sanitizeParsedLocationAddress({
    address,
    streetName,
    barangay,
    city,
    subdivision,
    region,
  });
}

function parseExpoResult(place: Location.LocationGeocodedAddress | null | undefined): ParsedLocationAddress {
  const streetFromExpo = clean(place?.street);
  const nameFromExpo = firstSegment(clean(place?.name));
  const district = firstSegment(clean(place?.district));
  const city = firstSegment(clean(place?.city));
  const subregion = firstSegment(clean(place?.subregion));
  const region = firstSegment(clean(place?.region));

  let streetName = streetFromExpo || nameFromExpo;
  let barangay = district;
  let cityMunicipality = city || subregion;
  let subdivision = subregion && subregion.toLowerCase() !== cityMunicipality.toLowerCase() ? subregion : '';

  streetName = dedupeComponent(streetName, [barangay, cityMunicipality, region]);
  barangay = dedupeComponent(barangay, [streetName, cityMunicipality, region]);
  cityMunicipality = dedupeComponent(cityMunicipality, [streetName, barangay, region]);
  subdivision = dedupeComponent(subdivision, [streetName, barangay, cityMunicipality, region]);

  const address = uniqueJoin([
    streetName,
    barangay,
    cityMunicipality,
    subdivision,
    region,
  ]);

  return sanitizeParsedLocationAddress({
    address: address || uniqueJoin([cityMunicipality, region]) || 'Selected location',
    streetName,
    barangay,
    city: cityMunicipality,
    subdivision,
    region,
  });
}

export async function reverseGeocodeAddress(latitude: number, longitude: number): Promise<ParsedLocationAddress> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}` +
        `&key=${apiKey}&language=en`;
      const response = await fetch(url);
      if (response.ok) {
        const payload = (await response.json()) as GoogleGeocodeResponse;
        if (payload.status === 'OK' && payload.results && payload.results.length > 0) {
          return parseGoogleResult(payload.results[0]);
        }
      }
    } catch {
      // Fall back to expo reverse geocoding.
    }
  }

  try {
    const expoResults = await Location.reverseGeocodeAsync({ latitude, longitude });
    return parseExpoResult(expoResults?.[0]);
  } catch {
    return {
      address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      streetName: '',
      barangay: '',
      city: '',
      subdivision: '',
      region: '',
    };
  }
}

async function geocodeWithExpo(address: string): Promise<Coordinates | null> {
  try {
    const geocodeFn = (Location as typeof Location & {
      geocodeAsync?: (address: string) => Promise<Array<{ latitude: number; longitude: number }>>;
    }).geocodeAsync;

    if (!geocodeFn) {
      return null;
    }

    const results = await geocodeFn(address);
    const firstResult = results?.[0];
    if (
      firstResult &&
      typeof firstResult.latitude === 'number' &&
      typeof firstResult.longitude === 'number'
    ) {
      return {
        latitude: firstResult.latitude,
        longitude: firstResult.longitude,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  const normalizedAddress = clean(address);
  if (!normalizedAddress) {
    return null;
  }

  const cacheKey = normalizedAddress.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey) || null;
  }

  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (apiKey) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalizedAddress)}` +
        `&key=${apiKey}&language=en`;
      const response = await fetch(url);
      if (response.ok) {
        const payload = (await response.json()) as GoogleGeocodeResponse;
        if (payload.status === 'OK' && payload.results && payload.results.length > 0) {
          const firstResult = payload.results[0];
          const location = firstResult?.geometry?.location;
          if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
            const coordinates = {
              latitude: location.lat,
              longitude: location.lng,
            };
            geocodeCache.set(cacheKey, coordinates);
            return coordinates;
          }
        }
      }
    } catch {
      // Fall back to Expo geocoding.
    }
  }

  const expoCoordinates = await geocodeWithExpo(normalizedAddress);
  geocodeCache.set(cacheKey, expoCoordinates);
  return expoCoordinates;
}
