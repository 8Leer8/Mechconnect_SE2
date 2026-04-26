from __future__ import annotations

from decimal import Decimal

from django.db.models import Q, Sum

from .models import Backjob, Booking, PaymentTransaction


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


BACKJOB_PRE_ACCEPT_STATUSES = frozenset(
    {
        str(Booking.Status.BACKJOB_PENDING),
        str(Booking.Status.REWORKED),
    }
)


def backjob_scoped_payments_active(booking) -> bool:
    """
    True once the mechanic has accepted the backjob (not client-request / reworked-only phases).
    In this phase, payment totals ignore the original job's installments and only count new backjob lines.
    """
    backjob = get_booking_backjob(booking)
    if backjob is None:
        return False
    st = str(getattr(backjob, 'status', '') or '').lower()
    return st not in BACKJOB_PRE_ACCEPT_STATUSES


def backjob_phase_total_paid(booking) -> Decimal:
    """
    Sum successful payment transactions recorded after the backjob row was last updated
    (mechanic accept bumps updated_at). Excludes pre-backjob payments on the same booking.
    """
    backjob = get_booking_backjob(booking)
    if backjob is None or not backjob_scoped_payments_active(booking):
        return Decimal('0.00')

    cutoff = getattr(backjob, 'updated_at', None)
    if cutoff is None:
        return Decimal('0.00')

    agg = PaymentTransaction.objects.filter(
        booking=booking,
        status=PaymentTransaction.Status.SUCCESS,
        created_at__gte=cutoff,
    ).aggregate(s=Sum('amount'))['s']

    return (Decimal(str(agg or 0))).quantize(Decimal('0.01'))


def booking_allows_chat(booking) -> bool:
    if booking is None:
        return False

    booking_status = str(getattr(booking, 'status', '') or '').lower()
    if booking_status == Booking.Status.COMPLETED:
        return booking_has_live_backjob(booking)

    return True


def backjob_quotation_has_pending_client_lines(booking) -> bool:
    """
    True when the booking is a backjob and at least one new backjob quotation line
    is still waiting for the client to accept or reject.
    """
    if not booking_has_backjob(booking):
        return False
    quotation = getattr(booking, "quotation", None)
    if quotation is None:
        return False
    return quotation.items.filter(
        is_backjob_line=True,
        status=quotation.Status.PENDING,
    ).exists()


def backjob_accepted_payable_total(quotation) -> Decimal:
    """
    Sum of client-accepted, new backjob quotation rows.

    Excludes the original job receipt (rows with is_backjob_line=False) so the client
    is not double-charged for the completed work.

    Includes every accepted backjob line at its agreed unit_price x quantity, whether
    the row is stored as service or item. Ad-hoc / service-typed new lines are payable;
    the old "parts only" filter wrongly treated service-typed new lines as free.
    """
    if quotation is None:
        return Decimal("0.00")
    backjob = get_booking_backjob(getattr(quotation, "booking", None))
    new_line_filter = Q(is_backjob_line=True)
    if backjob is not None and getattr(backjob, "created_at", None) is not None:
        # Self-heal older accepted rows that were added after the backjob but were
        # not flagged by older code.
        new_line_filter = new_line_filter | Q(created_at__gte=backjob.created_at)

    total = Decimal("0.00")
    for item in quotation.items.filter(
        new_line_filter,
        status=quotation.Status.ACCEPTED,
    ):
        if not getattr(item, "is_backjob_line", False):
            item.is_backjob_line = True
            item.backjob = backjob
            item.save(update_fields=["is_backjob_line", "backjob", "updated_at"])
        total += Decimal(item.line_total or 0)
    return total.quantize(Decimal("0.01"))
