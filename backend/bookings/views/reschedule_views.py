from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from notification.upsert import upsert_notification
from users.models import Account

from ..models import ActiveBooking, Booking, RequestAssignment
from ..serializers import BookingSerializer


def _get_account(request):
    account_id = request.session.get("account_id")
    if not account_id:
        return None, Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        return Account.objects.get(id=account_id), None
    except Account.DoesNotExist:
        return None, Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)


def _get_booking(booking_id):
    return (
        Booking.objects.select_related(
            "request",
            "request__client__account",
            "request__provider",
            "request__shop__shop_owner__account",
        )
        .filter(id=booking_id)
        .first()
    )


def _parse_proposed_date(value):
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _scheduled_date(booking):
    return booking.booking_date


def _buffer_has_passed(booking):
    scheduled_date = _scheduled_date(booking)
    if not scheduled_date:
        return False
    return timezone.now() >= scheduled_date - timezone.timedelta(hours=1)


def _client_account(booking):
    return getattr(getattr(booking.request, "client", None), "account", None)


def _shop_owner_account(booking):
    shop = getattr(booking.request, "shop", None)
    if not shop or not getattr(shop, "shop_owner", None):
        return None
    return shop.shop_owner.account


def _assigned_mechanic_accounts(booking):
    accounts = list(
        Account.objects.filter(job_assignments__request=booking.request)
        .select_related("mechanic")
        .distinct()
    )
    provider = getattr(booking.request, "provider", None)
    if provider and hasattr(provider, "mechanic") and provider not in accounts:
        accounts.append(provider)
    return accounts


def _lead_mechanic_account(booking):
    assignment = (
        RequestAssignment.objects.filter(request=booking.request, role=RequestAssignment.Role.LEAD)
        .select_related("mechanic__mechanic")
        .first()
    )
    if assignment:
        return assignment.mechanic
    accounts = _assigned_mechanic_accounts(booking)
    return accounts[0] if accounts else None


def _is_shop_based(booking, mechanic_account):
    shop = getattr(booking.request, "shop", None)
    if shop is not None:
        return True
    mechanic = getattr(mechanic_account, "mechanic", None)
    return bool(mechanic and mechanic.is_working_for_shop and mechanic.shop_id)


def _can_initiate(account, booking):
    client = _client_account(booking)
    if client and account.id == client.id:
        return True
    if any(account.id == mechanic.id for mechanic in _assigned_mechanic_accounts(booking)):
        return True
    owner = _shop_owner_account(booking)
    return bool(owner and account.id == owner.id)


def _response_authority(booking, requester):
    mechanic = _lead_mechanic_account(booking)
    if _is_shop_based(booking, mechanic):
        return _shop_owner_account(booking)

    client = _client_account(booking)
    if requester and client and requester.id == client.id:
        return mechanic
    return client


def _role_for_account(booking, account):
    if account is None:
        return None
    client = _client_account(booking)
    if client and client.id == account.id:
        return "client"
    owner = _shop_owner_account(booking)
    if owner and owner.id == account.id:
        return "shopowner"
    if hasattr(account, "mechanic"):
        return "mechanic"
    return None


def _notify(account, booking, title, message, action, extra=None):
    if not account:
        return
    payload = {
        "type": "reschedule",
        "action": action,
        "booking_id": booking.id,
        "related_booking_id": booking.id,
        "request_id": booking.request_id,
        "status": booking.status,
        "target_role": _role_for_account(booking, account),
        "is_read": False,
    }
    if extra:
        payload.update(extra)
    upsert_notification(
        receiver_id=account.id,
        correlation_key=f"reschedule-{booking.id}",
        title=title,
        message=message,
        payload=payload,
        mark_unread=True,
    )


def _broadcast(booking, action, message, extra=None):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    accounts = []
    for account in [_client_account(booking), _shop_owner_account(booking), *_assigned_mechanic_accounts(booking)]:
        if account and account.id not in [item.id for item in accounts]:
            accounts.append(account)

    payload = {
        "type": "booking_update",
        "action": action,
        "booking_id": booking.id,
        "status": booking.status,
        "message": message,
    }
    if extra:
        payload.update(extra)

    for account in accounts:
        async_to_sync(channel_layer.group_send)(f"user_{account.id}", payload)


def _reschedule_payload(booking):
    return BookingSerializer(booking).data


@api_view(["POST"])
@permission_classes([AllowAny])
def propose_reschedule(request, booking_id):
    account, error = _get_account(request)
    if error:
        return error

    with transaction.atomic():
        booking = _get_booking(booking_id)
        if booking is None:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

        if not _can_initiate(account, booking):
            return Response({"error": "You cannot reschedule this booking"}, status=status.HTTP_403_FORBIDDEN)
        if _buffer_has_passed(booking):
            return Response({"error": "Bookings cannot be rescheduled within 1 hour of the schedule"}, status=status.HTTP_403_FORBIDDEN)
        if booking.status == Booking.Status.RESCHEDULE_PROPOSED:
            return Response({"error": "A reschedule request is already pending"}, status=status.HTTP_409_CONFLICT)

        proposed_date = _parse_proposed_date(
            request.data.get("proposed_date") or request.data.get("booking_date") or request.data.get("scheduled_time")
        )
        if proposed_date is None:
            return Response({"error": "proposed_date is required"}, status=status.HTTP_400_BAD_REQUEST)

        active, _ = ActiveBooking.objects.select_for_update().get_or_create(booking=booking)
        active.pre_reschedule_status = booking.status
        active.proposed_date = proposed_date
        active.reschedule_requested_by = account
        active.is_rescheduled = True
        active.save(update_fields=["pre_reschedule_status", "proposed_date", "reschedule_requested_by", "is_rescheduled"])

        booking.status = Booking.Status.RESCHEDULE_PROPOSED
        booking.save(update_fields=["status", "updated_at"])

    booking = _get_booking(booking_id)
    active = booking.activebooking
    authority = _response_authority(booking, account)
    mechanic = _lead_mechanic_account(booking)
    client = _client_account(booking)
    owner = _shop_owner_account(booking)

    message = "A reschedule request is waiting for a response."
    proposed_iso = active.proposed_date.isoformat() if active.proposed_date else None
    extra = {"proposed_date": proposed_iso, "requested_by_id": account.id}

    _notify(authority, booking, "Reschedule Request", message, "reschedule_proposed", {**extra, "can_respond": True})
    if _is_shop_based(booking, mechanic):
        _notify(mechanic, booking, "Reschedule Requested", message, "reschedule_proposed", {**extra, "can_respond": False})
        if client and client.id != account.id:
            _notify(client, booking, "Reschedule Requested", message, "reschedule_proposed", {**extra, "can_respond": False})
    elif authority and mechanic and authority.id != mechanic.id:
        _notify(mechanic, booking, "Reschedule Requested", message, "reschedule_proposed", {**extra, "can_respond": False})
    if owner and authority and owner.id != authority.id:
        _notify(owner, booking, "Reschedule Requested", message, "reschedule_proposed", {**extra, "can_respond": False})

    _broadcast(booking, "reschedule_proposed", message, extra)
    return Response(_reschedule_payload(booking), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def respond_reschedule(request, booking_id):
    account, error = _get_account(request)
    if error:
        return error

    action = str(request.data.get("action") or "").upper()
    if action not in {"ACCEPT", "DECLINE"}:
        return Response({"error": "action must be ACCEPT or DECLINE"}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        booking = _get_booking(booking_id)
        if booking is None:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)
        if booking.status != Booking.Status.RESCHEDULE_PROPOSED:
            return Response({"error": "No reschedule request is pending"}, status=status.HTTP_409_CONFLICT)

        active, _ = ActiveBooking.objects.select_for_update().get_or_create(booking=booking)
        requester = active.reschedule_requested_by
        authority = _response_authority(booking, requester)
        if not authority or account.id != authority.id:
            return Response({"error": "You cannot respond to this reschedule request"}, status=status.HTTP_403_FORBIDDEN)

        if action == "DECLINE":
            requester_id = requester.id if requester else None
            proposed_iso = active.proposed_date.isoformat() if active.proposed_date else None
        else:
            if active.proposed_date is None:
                return Response({"error": "Missing proposed date"}, status=status.HTTP_400_BAD_REQUEST)
            booking.status = Booking.Status.PENDING
            booking.booking_date = active.proposed_date
            booking.save(update_fields=["status", "booking_date", "updated_at"])
            proposed_iso = booking.booking_date.isoformat() if booking.booking_date else None
            requester_id = requester.id if requester else None
            active.proposed_date = None
            active.pre_reschedule_status = None
            active.reschedule_requested_by = None
            active.is_rescheduled = False
            active.save(update_fields=["proposed_date", "pre_reschedule_status", "reschedule_requested_by", "is_rescheduled"])

    booking = _get_booking(booking_id)
    if action == "DECLINE":
        message = "The other party declined the reschedule. Please suggest a better time or stick to the original schedule."
        if requester_id:
            requester_account = Account.objects.filter(id=requester_id).first()
            _notify(requester_account, booking, "Reschedule Declined", message, "reschedule_declined", {"proposed_date": proposed_iso})
        _broadcast(booking, "reschedule_declined", message, {"proposed_date": proposed_iso, "requester_id": requester_id})
        return Response(_reschedule_payload(booking), status=status.HTTP_200_OK)

    message = f"Action buttons will activate on the scheduled date ({proposed_iso})."
    extra = {"new_date": proposed_iso, "requester_id": requester_id}
    for receiver in [_client_account(booking), _shop_owner_account(booking), *_assigned_mechanic_accounts(booking)]:
        _notify(receiver, booking, "Reschedule Accepted", message, "reschedule_accepted", extra)
    _broadcast(booking, "reschedule_accepted", message, extra)
    return Response(_reschedule_payload(booking), status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def cancel_reschedule(request, booking_id):
    account, error = _get_account(request)
    if error:
        return error

    with transaction.atomic():
        booking = _get_booking(booking_id)
        if booking is None:
            return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)
        if booking.status != Booking.Status.RESCHEDULE_PROPOSED:
            return Response({"error": "No reschedule request is pending"}, status=status.HTTP_409_CONFLICT)

        active, _ = ActiveBooking.objects.select_for_update().get_or_create(booking=booking)
        requester = active.reschedule_requested_by
        if not requester or requester.id != account.id:
            return Response({"error": "Only the original requester can cancel this reschedule"}, status=status.HTTP_403_FORBIDDEN)

        previous_status = active.pre_reschedule_status or Booking.Status.ACCEPTED
        booking.status = previous_status
        booking.save(update_fields=["status", "updated_at"])

        active.proposed_date = None
        active.pre_reschedule_status = None
        active.reschedule_requested_by = None
        active.is_rescheduled = False
        active.save(update_fields=["proposed_date", "pre_reschedule_status", "reschedule_requested_by", "is_rescheduled"])

    booking = _get_booking(booking_id)
    message = "The reschedule request was cancelled."
    _broadcast(booking, "reschedule_cancelled", message, {})
    return Response(_reschedule_payload(booking), status=status.HTTP_200_OK)
