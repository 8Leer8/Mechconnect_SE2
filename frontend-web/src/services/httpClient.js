import { API_BASE_URL } from "../config/env";

const AUTH_TOKEN_STORAGE_KEY = "admin_auth_token";

function toRequestUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function getErrorMessage(data, fallbackMessage) {
  if (!data) {
    return fallbackMessage;
  }

  if (typeof data.error === "string") {
    return data.error;
  }

  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
    return data.non_field_errors[0];
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  return fallbackMessage;
}

export function setStoredAuthToken(token) {
  if (typeof window === "undefined") {
    return;
  }
  if (!token) {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
}

export function getStoredAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

export function clearStoredAuthToken() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

export async function request(path, options = {}) {
  const { method = "GET", body, headers = {}, ...rest } = options;
  const isFormData = body instanceof FormData;
  const authToken = getStoredAuthToken();

  const response = await fetch(toRequestUrl(path), {
    method,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(authToken && !headers.Authorization ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    ...rest,
  });

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Request failed."));
  }

  return data;
}
