const API_URL = process.env.EXPO_PUBLIC_API_URL;

export interface NotificationTargetPayload {
  booking_id?: number;
  request_id?: number;
  broadcast_id?: number;
  offer_id?: number;
  action?: string;
  target_role?: 'client' | 'mechanic' | 'shopowner' | string | null;
  /** Mirrors WebSocket booking_update (e.g. mechanic_accepted_direct). */
  event_source?: string;
  [key: string]: unknown;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  payload?: NotificationTargetPayload | null;
  is_read: boolean;
  created_at: string;
  /** Last content/status update (same row updated for booking lifecycle). */
  updated_at?: string;
}

export interface NotificationListResponse {
  count: number;
  unread_count: number;
  page: number;
  page_size: number;
  has_next: boolean;
  has_previous: boolean;
  results: NotificationItem[];
}

function getApiBaseUrl() {
  if (!API_URL) {
    throw new Error('API URL is not configured');
  }

  return API_URL.replace(/\/$/, '');
}

async function parseApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    if (payload && typeof payload === 'object') {
      const message = (payload as { error?: unknown; message?: unknown }).error ??
        (payload as { error?: unknown; message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }
  } catch {
    // Fall back to the default message.
  }

  return fallback;
}

export function formatNotificationTimestamp(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export async function fetchNotifications(options?: {
  page?: number;
  pageSize?: number;
  unread?: boolean;
}): Promise<NotificationListResponse> {
  const baseUrl = getApiBaseUrl();
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 10;
  const unread = options?.unread ? '&unread=true' : '';

  const response = await fetch(
    `${baseUrl}/notifications/?page=${page}&page_size=${pageSize}${unread}`,
    {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to load notifications'));
  }

  return response.json();
}

export async function markNotificationRead(notificationId: number): Promise<NotificationItem> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/notifications/read/${notificationId}/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to mark notification as read'));
  }

  const payload = await response.json();
  return (payload?.notification as NotificationItem) ?? payload;
}

export async function markAllNotificationsRead(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}/notifications/read-all/`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, 'Failed to mark notifications as read'));
  }
}