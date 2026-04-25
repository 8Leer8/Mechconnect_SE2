type BookingBackjobLike = {
  status?: string | null;
  has_backjob?: boolean | null;
  backjob?: {
    status?: string | null;
  } | null;
};

const LIVE_BACKJOB_STATUSES = new Set([
  'reworked',
  'accepted',
  'on_the_way',
  'at_location',
  'diagnosing',
  'active',
  'paused',
  'finished',
  'pending_payment',
]);

export function bookingHasBackjob(booking?: BookingBackjobLike | null): boolean {
  return Boolean(booking?.has_backjob || booking?.backjob);
}

export function bookingHasAcceptedBackjob(booking?: BookingBackjobLike | null): boolean {
  if (!bookingHasBackjob(booking)) return false;
  return String(booking?.backjob?.status || '').toLowerCase() === 'accepted';
}

export function bookingHasLiveBackjob(booking?: BookingBackjobLike | null): boolean {
  const backjobStatus = String(booking?.backjob?.status || '').toLowerCase();
  return bookingHasBackjob(booking) && LIVE_BACKJOB_STATUSES.has(backjobStatus);
}

/** After the mechanic accepts the backjob (not client-request / reworked-only). Payment UI uses new lines only. */
export function bookingInBackjobPaymentPhase(booking?: BookingBackjobLike | null): boolean {
  if (!bookingHasBackjob(booking)) return false;
  const st = String(booking?.backjob?.status || '').toLowerCase();
  return st !== 'backjob_pending' && st !== 'reworked';
}

export function canOpenBookingChat(booking?: BookingBackjobLike | null): boolean {
  if (!booking) return false;

  const status = String(booking.status || '').toLowerCase();
  return status !== 'completed' || bookingHasLiveBackjob(booking);
}