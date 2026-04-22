const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  "https://mechconnectse2-production-621a.up.railway.app/api";

// Strip trailing /api if present so WS_URL points to the root
const ROOT_URL = BASE_URL.replace(/\/api\/?$/, "");

export const API_URL = BASE_URL;
export const WS_URL = ROOT_URL.replace(/^http/, "ws");
