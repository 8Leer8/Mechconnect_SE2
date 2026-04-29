/**
 * Parse a fetch Response body as JSON with clear errors.
 * Avoids RN "JSON Parse error: Unexpected character: <" when the server
 * returns an HTML error page, empty body, or plain text.
 */
export async function parseResponseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `Server returned HTML instead of JSON (HTTP ${response.status}). Check EXPO_PUBLIC_API_URL and that the Django API is running.`
    );
  }
  if (!trimmed) {
    if (!response.ok) {
      throw new Error(`Request failed (HTTP ${response.status}) with an empty body.`);
    }
    return {} as T;
  }
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`Server returned non-JSON (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Invalid JSON from server (HTTP ${response.status}).`);
  }
}
