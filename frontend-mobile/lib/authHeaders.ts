import AsyncStorage from '@react-native-async-storage/async-storage';

type HeaderMap = Record<string, string>;

export async function buildAuthHeaders(baseHeaders: HeaderMap = {}): Promise<HeaderMap> {
  const headers: HeaderMap = { ...baseHeaders };
  try {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Keep request working even if storage read fails.
  }
  return headers;
}
