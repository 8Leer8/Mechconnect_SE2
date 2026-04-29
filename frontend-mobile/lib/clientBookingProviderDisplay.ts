/** Booking list payloads: flat (`_serialize_single_booking`) or nested `request` (`BookingSerializer`). */
type ClientBookingProviderSource = {
  shop?: { shop_name?: string | null } | null;
  provider?: { name?: string | null } | null;
  request?: {
    shop?: { shop_name?: string | null } | null;
    provider?: { name?: string | null } | null;
  } | null;
};

/** Show shop name when the job is under a shop; otherwise the provider (mechanic / shop owner) name. */
export function getClientBookingProviderDisplayName(booking: ClientBookingProviderSource): string | null {
  const shopName = String(booking.shop?.shop_name ?? booking.request?.shop?.shop_name ?? '').trim();
  if (shopName) return shopName;
  const providerName = String(booking.provider?.name ?? booking.request?.provider?.name ?? '').trim();
  return providerName || null;
}

export function getClientBookingProviderIconName(booking: ClientBookingProviderSource): 'building' | 'user-o' {
  return String(booking.shop?.shop_name ?? booking.request?.shop?.shop_name ?? '').trim() ? 'building' : 'user-o';
}
