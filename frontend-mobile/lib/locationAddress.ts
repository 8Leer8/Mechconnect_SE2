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

function dedupeComponent(value: string, comparisons: string[]): string {
  const normalized = clean(value);
  if (!normalized) return '';
  const normalizedKey = normalized.toLowerCase();
  const matches = comparisons.some((item) => clean(item).toLowerCase() === normalizedKey);
  return matches ? '' : normalized;
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
  const subdivision =
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

  barangay = dedupeComponent(barangay, [streetName, city]);
  city = dedupeComponent(city, [streetName, barangay]);

  const address = uniqueJoin([
    streetName,
    barangay,
    city,
    subdivision,
    region,
  ]) || clean(result.formatted_address);

  return {
    address,
    streetName,
    barangay,
    city,
    subdivision: firstSegment(subdivision),
    region: firstSegment(region),
  };
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

  return {
    address: address || uniqueJoin([cityMunicipality, region]) || 'Selected location',
    streetName,
    barangay,
    city: cityMunicipality,
    subdivision,
    region,
  };
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
