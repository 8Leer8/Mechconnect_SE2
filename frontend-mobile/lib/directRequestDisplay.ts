/**
 * Helpers for direct-request payloads on booking / quotation UIs.
 * Keeps mechanic and shop-owner screens consistent.
 */

export function normalizeBookedServiceRows(
  details: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  if (!details || typeof details !== 'object') return [];
  const multi = details.services;
  if (Array.isArray(multi) && multi.length > 0) {
    return multi.filter((s) => s && typeof s === 'object') as Array<Record<string, unknown>>;
  }
  const one = details.service;
  if (one && typeof one === 'object') {
    const row = one as Record<string, unknown>;
    if (row.id != null || row.name) return [row];
  }
  return [];
}

export function normalizeRequestedAddOnRows(
  details: Record<string, unknown> | null | undefined,
): Array<Record<string, unknown>> {
  if (!details || !Array.isArray(details.add_ons)) return [];
  return (details.add_ons as unknown[]).filter((x) => x && typeof x === 'object') as Array<Record<string, unknown>>;
}

/** Prefer shop/mechanic booked price from API, then legacy fields. */
export function directRequestServiceUnitPrice(svc: Record<string, unknown> | null | undefined): number {
  if (!svc || typeof svc !== 'object') return 0;
  const v = svc.booked_unit_price ?? svc.price ?? svc.minimum_price;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
