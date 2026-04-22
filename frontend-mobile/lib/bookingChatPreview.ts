const API_URL = process.env.EXPO_PUBLIC_API_URL;

function truncate(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** Turn stored chat content into a short one-line preview for booking details. */
export function formatChatPreviewContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{')) {
    try {
      const j = JSON.parse(trimmed) as Record<string, unknown>;
      const rawType = String(j.type || j.action || '').toLowerCase();
      if (rawType.includes('quotation')) {
        if (rawType.includes('request')) return 'Quotation request sent';
        if (rawType.includes('accepted')) return 'Quotation accepted';
        if (rawType.includes('rejected')) return 'Quotation rejected';
        if (rawType.includes('retract')) return 'Quotation retracted';
        if (rawType.includes('update')) return 'Quotation updated';
        return 'Quotation update';
      }
      if (typeof j.message === 'string' && j.message.trim()) return truncate(j.message, 140);
      if (typeof j.text === 'string' && j.text.trim()) return truncate(j.text, 140);
      if (typeof j.body === 'string' && j.body.trim()) return truncate(j.body, 140);
    } catch {
      // fall through
    }
  }

  return truncate(trimmed.replace(/\s+/g, ' '), 140);
}

export type BookingChatPreviewResult = {
  lastPreview: string | null;
  hasConversation: boolean;
};

/**
 * Loads booking conversation metadata (GET). Does not create a conversation.
 * Returns null on network errors; empty preview if no conversation yet.
 */
export async function fetchBookingChatPreview(bookingId: number): Promise<BookingChatPreviewResult | null> {
  if (!API_URL || !Number.isFinite(bookingId)) return null;

  try {
    const res = await fetch(`${API_URL}/chat/booking/${bookingId}/`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 404) {
      return { lastPreview: null, hasConversation: false };
    }
    if (!res.ok) return null;

    const data = (await res.json()) as { last_message?: { content?: string | null } | null };
    const content = data?.last_message?.content;
    if (content == null || !String(content).trim()) {
      return { lastPreview: null, hasConversation: true };
    }
    return { lastPreview: formatChatPreviewContent(String(content)), hasConversation: true };
  } catch {
    return null;
  }
}
