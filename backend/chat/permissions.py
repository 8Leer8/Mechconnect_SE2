from __future__ import annotations

from typing import Any, Dict

from bookings.models import RequestAssignment
from bookings.backjob_utils import booking_allows_chat


def evaluate_booking_chat_access(booking, account) -> Dict[str, Any]:
    """
    Determine booking-chat access for an account.

    Returns dict with:
    - is_participant: whether account should be in booking chat
    - can_send: whether account can send messages
    - role: chat role label for UI/logic
    """
    if booking is None or account is None:
        return {
            "is_participant": False,
            "can_send": False,
            "role": "none",
        }

    # Client can always chat in their booking conversation.
    try:
        client_account = booking.request.client.account
        if client_account and client_account.id == account.id:
            return {
                "is_participant": True,
                "can_send": True,
                "role": "client",
            }
    except Exception:
        pass

    # Shop owner can always chat for shop bookings.
    try:
        shop_owner_account = booking.request.shop.shop_owner.account
        if shop_owner_account and shop_owner_account.id == account.id:
            return {
                "is_participant": True,
                "can_send": True,
                "role": "shop_owner",
            }
    except Exception:
        pass

    # Non-owner/non-client participants are gated when booking chat is closed.
    if not booking_allows_chat(booking):
        return {
            "is_participant": False,
            "can_send": False,
            "role": "none",
        }

    has_assignments = RequestAssignment.objects.filter(request=booking.request).exists()

    # Assigned mechanics: lead can send; assistants are view-only.
    assignment = RequestAssignment.objects.filter(
        request=booking.request,
        mechanic=account,
    ).first()
    if assignment:
        is_lead = assignment.role == RequestAssignment.Role.LEAD
        return {
            "is_participant": True,
            "can_send": bool(is_lead),
            "role": "lead_mechanic" if is_lead else "assistant_mechanic",
        }

    # Legacy fallback for old flows that still rely on request.provider only.
    # If assignments exist, only assigned mechanics should participate.
    if has_assignments:
        return {
            "is_participant": False,
            "can_send": False,
            "role": "none",
        }

    # Legacy fallback: request provider can send.
    try:
        if booking.request.provider and booking.request.provider.id == account.id:
            return {
                "is_participant": True,
                "can_send": True,
                "role": "provider_mechanic",
            }
    except Exception:
        pass

    return {
        "is_participant": False,
        "can_send": False,
        "role": "none",
    }


def sync_booking_conversation_participants(conversation, booking) -> None:
    """
    Ensure all expected booking participants are part of the conversation.
    """
    if conversation is None or booking is None:
        return

    participant_ids = set()

    try:
        client_account = booking.request.client.account
        if client_account:
            participant_ids.add(client_account.id)
    except Exception:
        pass

    try:
        shop_owner_account = booking.request.shop.shop_owner.account
        if shop_owner_account:
            participant_ids.add(shop_owner_account.id)
    except Exception:
        pass

    try:
        if booking.request.provider:
            participant_ids.add(booking.request.provider.id)
    except Exception:
        pass

    for mechanic_id in RequestAssignment.objects.filter(request=booking.request).values_list(
        "mechanic_id", flat=True
    ):
        participant_ids.add(mechanic_id)

    if participant_ids:
        conversation.participants.add(*participant_ids)
