/**
 * Shared helpers for booking chat quotation_request rows.
 * Used by booking_chat and booking detail screens (client / mechanic / shop owner).
 */

export function parseStructuredQuotationContent(raw: any): any | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw !== 'string') return null;
  try {
    const first = JSON.parse(raw);
    if (first && typeof first === 'object') return first;
    if (typeof first === 'string') {
      const nested = first.trim();
      if (nested.startsWith('{')) {
        try {
          const second = JSON.parse(nested);
          return second && typeof second === 'object' ? second : null;
        } catch {
          return null;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getQuoteRequestKey(payload: any): string {
  const amendmentId = payload?.amendment_id;
  if (amendmentId != null && amendmentId !== '') return `amendment:${String(amendmentId)}`;
  return `quotation:${String(payload?.quotation_id ?? '')}`;
}

function quotationBundleResolved(p: any): boolean {
  if (!p || p.type !== 'quotation_request') return false;
  const act = String(p.action || '').toLowerCase();
  if (act === 'accepted' || act === 'rejected' || act === 'retracted') return true;
  const st = String(p.status || '').toLowerCase();
  return st === 'accepted' || st === 'rejected' || st === 'retracted';
}

/**
 * Merges accept/reject/retract rows into the matching pending card and drops stale
 * duplicate quotation_request messages for the same amendment / quotation bundle.
 */
export function mergeResolvedQuotationMessages(rawMessages: any[]): any[] {
  const merged: any[] = [];
  const requestIndexByKey: Record<string, number> = {};

  (rawMessages || []).forEach((message: any) => {
    const payload = parseStructuredQuotationContent(message?.content);
    if (!payload || payload.type !== 'quotation_request') {
      merged.push(message);
      return;
    }

    const action = String(payload?.action || '').toLowerCase();
    const requestKey = getQuoteRequestKey(payload);
    const isDecisionMessage =
      action === 'accepted' || action === 'rejected' || action === 'retracted';

    if (isDecisionMessage && requestKey && requestIndexByKey[requestKey] != null) {
      const originalIndex = requestIndexByKey[requestKey];
      const originalMessage = merged[originalIndex];
      const originalPayload = parseStructuredQuotationContent(originalMessage?.content) || {};
      const nextPayload: Record<string, unknown> = {
        ...originalPayload,
        status: action === 'retracted' ? 'retracted' : action,
        action,
        total_amount: payload?.total_amount ?? originalPayload?.total_amount,
      };
      if (Array.isArray(payload?.items) && payload.items.length) {
        nextPayload.items = payload.items;
      }

      merged[originalIndex] = {
        ...originalMessage,
        content: JSON.stringify(nextPayload),
      };
      return;
    }

    const nextIndex = merged.length;
    merged.push(message);
    if (!isDecisionMessage && requestKey) {
      requestIndexByKey[requestKey] = nextIndex;
    }
  });

  const keysWithResolution = new Set<string>();
  merged.forEach((m) => {
    const p = parseStructuredQuotationContent(m?.content);
    if (!p || p.type !== 'quotation_request') return;
    const key = getQuoteRequestKey(p);
    if (key && quotationBundleResolved(p)) keysWithResolution.add(key);
  });

  return merged.filter((m) => {
    const p = parseStructuredQuotationContent(m?.content);
    if (!p || p.type !== 'quotation_request') return true;
    const key = getQuoteRequestKey(p);
    if (!key || !keysWithResolution.has(key)) return true;
    return quotationBundleResolved(p);
  });
}
