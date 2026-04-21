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
  'active',
  'paused',
  'finished',
  'pending_payment',
]);

export function bookingHasBackjob(booking?: BookingBackjobLike | null): boolean {
  return Boolean(booking?.has_backjob || booking?.backjob);
}

export function bookingHasLiveBackjob(booking?: BookingBackjobLike | null): boolean {
  const backjobStatus = String(booking?.backjob?.status || '').toLowerCase();
  return bookingHasBackjob(booking) && LIVE_BACKJOB_STATUSES.has(backjobStatus);
}

export function canOpenBookingChat(booking?: BookingBackjobLike | null): boolean {
  if (!booking) return false;

  const status = String(booking.status || '').toLowerCase();
  return status !== 'completed' || bookingHasLiveBackjob(booking);
}