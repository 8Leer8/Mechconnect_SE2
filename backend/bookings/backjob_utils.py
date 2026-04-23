from __future__ import annotations

from .models import Backjob, Booking


LIVE_BACKJOB_STATUSES = {
    Booking.Status.BACKJOB_PENDING,
    Booking.Status.REWORKED,
    Booking.Status.ACCEPTED,
    Booking.Status.ON_THE_WAY,
    Booking.Status.AT_LOCATION,
    Booking.Status.DIAGNOSING,
    Booking.Status.ACTIVE,
    Booking.Status.PAUSED,
    Booking.Status.FINISHED,
    Booking.Status.PENDING_PAYMENT,
}


def get_booking_backjob(booking):
    if booking is None:
        return None

    try:
        return booking.backjob
    except Backjob.DoesNotExist:
        return None
    except Exception:
        return None


def booking_has_backjob(booking) -> bool:
    return get_booking_backjob(booking) is not None


def booking_has_live_backjob(booking) -> bool:
    backjob = get_booking_backjob(booking)
    if backjob is None:
        return False

    return str(getattr(backjob, 'status', '') or '').lower() in LIVE_BACKJOB_STATUSES


def booking_allows_chat(booking) -> bool:
    if booking is None:
        return False

    booking_status = str(getattr(booking, 'status', '') or '').lower()
    if booking_status == Booking.Status.COMPLETED:
        return booking_has_live_backjob(booking)

    return True