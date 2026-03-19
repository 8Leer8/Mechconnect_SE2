from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging


logger = logging.getLogger(__name__)


def notify_user(account_id, booking_id, booking_status, message):
    """Send a booking_update message to a user's WebSocket channel group."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        f"user_{account_id}",
        {
            "type": "booking_update",
            "booking_id": booking_id,
            "status": booking_status,
            "message": message,
        },
    )


def notify_booking_parties(mechanic_account_id, client_account_id, booking_id, booking_status, message):
    """Broadcast booking_update to both mechanic and client personal groups."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    event = {
        "type": "booking_update",
        "booking_id": booking_id,
        "status": booking_status,
        "message": message,
    }

    # Also notify the shop owner associated with this booking (so the shop owner Jobs UI updates).
    shop_owner_account_id = None
    try:
        # Local import to avoid circulars at module import time.
        from .models import Booking

        booking = (
            Booking.objects.select_related("request__shop__shop_owner")
            .filter(id=booking_id)
            .first()
        )
        if booking and booking.request and getattr(booking.request, "shop", None):
            shop = booking.request.shop
            if shop and getattr(shop, "shop_owner", None):
                shop_owner_account_id = shop.shop_owner.account_id
    except Exception:
        shop_owner_account_id = None

    targets = {mechanic_account_id, client_account_id, shop_owner_account_id}
    for account_id in targets:
        if not account_id:
            continue
        async_to_sync(channel_layer.group_send)(f"user_{account_id}", event)
