import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const ACCOUNT_ID_KEY = 'account_id';
const PROFILE_CACHE_KEY_PREFIX = 'profile_details_cache_v2';
const CACHE_TTL_MS = 60 * 1000; // 1 minute
let profileDetailsRequest: Promise<any | null> | null = null;

type ProfileCachePayload = {
  cachedAt: number;
  accountId: number | null;
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

function getProfileCacheKey(accountId: number | null): string {
  return `${PROFILE_CACHE_KEY_PREFIX}:${accountId ?? 'anonymous'}`;
}

export async function clearProfileDetailsCache(): Promise<void> {
  try {
    profileDetailsRequest = null;
    const accountId = await getCachedAccountId();
    await AsyncStorage.multiRemove([
      PROFILE_CACHE_KEY_PREFIX,
      getProfileCacheKey(accountId),
    ]);
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function fetchProfileDetailsCached(forceRefresh = false): Promise<any | null> {
  const storedAccountId = await getCachedAccountId();

  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(getProfileCacheKey(storedAccountId));
      if (raw) {
        const parsed = JSON.parse(raw) as ProfileCachePayload;
        const cachedAccountId = safeNumber(parsed?.accountId);
        if (
          parsed?.cachedAt &&
          Date.now() - parsed.cachedAt <= CACHE_TTL_MS &&
          cachedAccountId !== null &&
          cachedAccountId === storedAccountId
        ) {
          return parsed?.profile || null;
        }
      }
    } catch {
      // ignore broken cache
    }
  }

  if (!API_URL) return null;

  if (!forceRefresh && profileDetailsRequest) {
    return profileDetailsRequest;
  }

  profileDetailsRequest = (async () => {
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

    const nextAccountId = profileId ?? storedAccountId;

    const payload: ProfileCachePayload = {
      cachedAt: Date.now(),
      accountId: nextAccountId,
      profile,
    };
    await AsyncStorage.setItem(getProfileCacheKey(nextAccountId), JSON.stringify(payload));
    return profile;
  })();

  try {
    return await profileDetailsRequest;
  } catch {
    return null;
  } finally {
    profileDetailsRequest = null;
  }
}

