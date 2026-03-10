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
export function getImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  
  // If URL is already absolute (starts with http:// or https://), use as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // For relative paths, prepend the API base URL
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) {
    console.warn('EXPO_PUBLIC_API_URL is not defined');
    return imageUrl; // Return relative URL as fallback
  }
  
  // Remove trailing slash from API URL if present
  const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
  
  // Ensure image URL starts with /
  const imagePath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  
  return `${baseUrl}${imagePath}`;
}

/**
 * Type-safe wrapper for getImageUrl that can be used with Image components.
 * Returns undefined instead of null for better compatibility with React Native Image.
 */
export function getImageSource(imageUrl: string | null | undefined): { uri: string } | undefined {
  const url = getImageUrl(imageUrl);
  return url ? { uri: url } : undefined;
}
