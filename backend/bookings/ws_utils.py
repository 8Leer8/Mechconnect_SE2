from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


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
