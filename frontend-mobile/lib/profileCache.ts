import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const ACCOUNT_ID_KEY = 'account_id';
const PROFILE_CACHE_KEY = 'profile_details_cache_v1';
const CACHE_TTL_MS = 60 * 1000; // 1 minute

type ProfileCachePayload = {
  cachedAt: number;
  profile: any;
};

function safeNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getCachedAccountId(): Promise<number | null> {
  try {
    const stored = await AsyncStorage.getItem(ACCOUNT_ID_KEY);
    return safeNumber(stored);
  } catch {
    return null;
  }
}

export async function fetchProfileDetailsCached(forceRefresh = false): Promise<any | null> {
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ProfileCachePayload;
        if (parsed?.cachedAt && Date.now() - parsed.cachedAt <= CACHE_TTL_MS) {
          const cachedId = safeNumber(parsed?.profile?.id);
          if (cachedId) {
            await AsyncStorage.setItem(ACCOUNT_ID_KEY, String(cachedId));
          }
          return parsed?.profile || null;
        }
      }
    } catch {
      // ignore broken cache
    }
  }

  if (!API_URL) return null;

  try {
    const response = await fetch(`${API_URL}/users/profile/details/`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const profile = data?.profile || null;
    const profileId = safeNumber(profile?.id);
    if (profileId) {
      await AsyncStorage.setItem(ACCOUNT_ID_KEY, String(profileId));
    }

    const payload: ProfileCachePayload = {
      cachedAt: Date.now(),
      profile,
    };
    await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(payload));
    return profile;
  } catch {
    return null;
  }
}

