import * as Location from 'expo-location';

export type ForegroundLocationAccess = {
  granted: boolean;
  canAskAgain: boolean;
};

export async function ensureForegroundLocationAccess(): Promise<ForegroundLocationAccess> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) {
    return {
      granted: true,
      canAskAgain: Boolean(current.canAskAgain),
    };
  }

  const requested = await Location.requestForegroundPermissionsAsync();
  return {
    granted: requested.status === 'granted',
    canAskAgain: Boolean(requested.canAskAgain),
  };
}
