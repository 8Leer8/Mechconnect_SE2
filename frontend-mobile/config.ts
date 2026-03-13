const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.0.105:8000/api";

// Strip trailing /api if present so WS_URL points to the root
const ROOT_URL = BASE_URL.replace(/\/api\/?$/, "");

export const API_URL = BASE_URL;
export const WS_URL = ROOT_URL.replace(/^http/, "ws");
