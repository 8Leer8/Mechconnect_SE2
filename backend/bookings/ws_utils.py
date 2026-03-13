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

    targets = {mechanic_account_id, client_account_id}
    for account_id in targets:
        if not account_id:
            continue
        async_to_sync(channel_layer.group_send)(f"user_{account_id}", event)
