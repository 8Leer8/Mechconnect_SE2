/**
 * Utility function to safely resolve media URLs.
 * Handles both full URLs (from S3) and relative paths (from local storage).
 * 
 * @param imageUrl - The image URL from the backend (can be full URL or relative path)
 * @returns Full URL to the image or null if imageUrl is falsy
 * 
 * Usage:
 *   <Image source={{ uri: getImageUrl(profile.profile_photo_url) }} />
 */
/** If backend returns http://127.0.0.1/... but the app uses LAN IP in EXPO_PUBLIC_API_URL, rewrite so the device can load the image. */
function rewriteLocalhostToApiHost(resolved: string, apiUrl: string | undefined): string {
  if (!apiUrl || (!resolved.startsWith('http://') && !resolved.startsWith('https://'))) {
    return resolved;
  }
  try {
    const u = new URL(resolved);
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return resolved;
    let base = apiUrl.replace(/\/$/, '');
    if (!base.includes('://')) base = `http://${base}`;
    const api = new URL(base);
    if (api.hostname === '127.0.0.1' || api.hostname === 'localhost') return resolved;
    u.protocol = api.protocol;
    u.hostname = api.hostname;
    if (api.port) u.port = api.port;
    return u.toString();
  } catch {
    return resolved;
  }
}

export function getImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  const trimmed = imageUrl.trim();
  if (!trimmed) return null;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  const shouldKeepHttp = (hostname: string) => {
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  };

  const maybeUpgradeToHttps = (absoluteUrl: string) => {
    if (!absoluteUrl.startsWith('http://') || !apiUrl?.startsWith('https://')) {
      return absoluteUrl;
    }

    try {
      const media = new URL(absoluteUrl);
      const api = new URL(apiUrl);

      // On some proxy setups, backend emits http URLs even when API is served via https.
      if (!shouldKeepHttp(media.hostname) && media.hostname === api.hostname) {
        media.protocol = 'https:';
        return media.toString();
      }
    } catch {
      return absoluteUrl;
    }

    return absoluteUrl;
  };
  
  // If URL is already absolute (starts with http:// or https://), use as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return rewriteLocalhostToApiHost(maybeUpgradeToHttps(trimmed), apiUrl);
  }

  // Protocol-relative URL (//host/path)
  if (trimmed.startsWith('//')) {
    const protocol = apiUrl?.startsWith('https://') ? 'https:' : 'http:';
    return rewriteLocalhostToApiHost(`${protocol}${trimmed}`, apiUrl);
  }
  
  // For relative paths, prepend the API base URL
  if (!apiUrl) {
    console.warn('EXPO_PUBLIC_API_URL is not defined');
    return trimmed; // Return relative URL as fallback
  }
  
  // Remove trailing slash from API URL if present
  const normalizedApiUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  // Ensure image URL starts with /
  const imagePath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // If backend returns /media/... and API URL ends with /api, use the root host.
  // Example: http://host/api + /media/file.jpg -> http://host/media/file.jpg
  const baseUrl = imagePath.startsWith('/media/')
    ? normalizedApiUrl.replace(/\/api$/, '')
    : normalizedApiUrl;

  return rewriteLocalhostToApiHost(`${baseUrl}${imagePath}`, apiUrl);
}

/**
 * Type-safe wrapper for getImageUrl that can be used with Image components.
 * Returns undefined instead of null for better compatibility with React Native Image.
 */
export function getImageSource(imageUrl: string | null | undefined): { uri: string } | undefined {
  const url = getImageUrl(imageUrl);
  return url ? { uri: url } : undefined;
}

/**
 * Saved quotation receipt paths (/media/...) or full URLs; also passes through
 * local camera/gallery URIs. Use for quotation lines in chat and booking details.
 */
export function quotationReceiptDisplayUri(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('file:') || s.startsWith('content:') || s.startsWith('blob:')) return s;
  return getImageUrl(s);
}
