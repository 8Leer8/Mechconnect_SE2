import { API_BASE_URL } from "../config/env";

const AUTH_TOKEN_STORAGE_KEY = "admin_auth_token";

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number; retryAfterSeconds?: number }} meta
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = "ApiError";
    this.status = meta.status;
    this.retryAfterSeconds = meta.retryAfterSeconds;
  }
}

function toRequestUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function pickField(value) {
  if (Array.isArray(value) && value.length > 0) {
    return String(value[0]);
  }
  if (typeof value === "string" && value) {
    return value;
  }
  return null;
}

/**
 * Turn JSON error bodies (DRF, our API) into a user-facing string.
 * @param {Record<string, unknown> | null} data
 * @param {number} status
 */
export function getErrorMessage(data, status, fallbackMessage = "Request failed.") {
  if (!data) {
    return fallbackMessage;
  }

  if (typeof data.error === "string" && data.error) {
    return formatWithRetryHint(data.error, data.retry_after_seconds, status);
  }

  if (typeof data.message === "string" && data.message) {
    return formatWithRetryHint(data.message, data.retry_after_seconds, status);
  }

  const nonField = pickField(data.non_field_errors);
  if (nonField) {
    return formatWithRetryHint(nonField, data.retry_after_seconds, status);
  }

  const usernameMsg = pickField(data.username);
  if (usernameMsg) {
    return usernameMsg;
  }

  const passwordMsg = pickField(data.password);
  if (passwordMsg) {
    return passwordMsg;
  }

  if (typeof data.detail === "string") {
    return data.detail;
  }

  return fallbackMessage;
}

function formatWithRetryHint(baseMessage, retryAfterSeconds, status) {
  if (status === 429 && typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    const waitLabel = formatWaitLabel(retryAfterSeconds);
    if (baseMessage.toLowerCase().includes("wait") || baseMessage.toLowerCase().includes("try again")) {
      return `${baseMessage} (about ${waitLabel})`;
    }
    return `${baseMessage} Try again in about ${waitLabel}.`;
  }
  return baseMessage;
}

function formatWaitLabel(seconds) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
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
    const retryAfterSeconds =
      data && typeof data.retry_after_seconds === "number" ? data.retry_after_seconds : undefined;
    const message = getErrorMessage(data, response.status, "Request failed.");
    throw new ApiError(message, { status: response.status, retryAfterSeconds });
  }

  return data;
}
