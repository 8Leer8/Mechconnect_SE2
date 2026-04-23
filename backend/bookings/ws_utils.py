from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging

from notification.models import Notification
from users.models import Account


logger = logging.getLogger(__name__)


def _notification_title_for_booking_status(booking_status, message=None):
    status_key = str(booking_status or '').strip().lower()
    title_map = {
        'accepted': 'Booking Accepted',
        'on_the_way': 'Booking On The Way',
        'at_location': 'Booking Arrived',
        'diagnosing': 'Booking Diagnosing',
        'active': 'Booking Active',
        'paused': 'Booking Paused',
        'finished': 'Booking Finished',
        'completed': 'Booking Completed',
        'pending_payment': 'Payment Pending',
        'cancelled': 'Booking Cancelled',
        'reworked': 'Booking Reworked',
        'disputed': 'Booking Disputed',
        'rejected': 'Booking Rejected',
    }

    if status_key in title_map:
        return title_map[status_key]

    if status_key:
        return f"Booking {status_key.replace('_', ' ').title()}"

    return 'Booking Update' if message else 'Notification'


def _resolve_target_role(account_id):
    try:
        participant_account = Account.objects.get(id=account_id)
        if hasattr(participant_account, 'client'):
            return 'client'
        if hasattr(participant_account, 'mechanic'):
            return 'mechanic'
        if hasattr(participant_account, 'shopowner'):
            return 'shopowner'
    except Exception:
        pass

    return None


def _create_booking_notification(account_id, booking_id, booking_status, message, action=None):
    payload = {
        'booking_id': booking_id,
        'status': booking_status,
    }
    if action:
        payload['action'] = action

    target_role = _resolve_target_role(account_id)
    if target_role:
        payload['target_role'] = target_role

    Notification.objects.create(
        receiver_id=account_id,
        title=_notification_title_for_booking_status(booking_status, message),
        message=message,
        payload=payload,
    )


def notify_user(account_id, booking_id, booking_status, message):
    """Send a booking_update message to a user's WebSocket channel group."""
    try:
        _create_booking_notification(account_id, booking_id, booking_status, message)
    except Exception:
        logger.exception('Failed to create notification for account %s', account_id)

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
    participant_ids = {mechanic_account_id, client_account_id}

    channel_layer = get_channel_layer()
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

    participant_ids.add(shop_owner_account_id)

    for account_id in participant_ids:
        if not account_id:
            continue
        try:
            _create_booking_notification(account_id, booking_id, booking_status, message)
        except Exception:
            logger.exception('Failed to create notification for account %s', account_id)

    if channel_layer is None:
        return

    event = {
        "type": "booking_update",
        "booking_id": booking_id,
        "status": booking_status,
        "message": message,
    }

    for account_id in participant_ids:
        if not account_id:
            continue
        async_to_sync(channel_layer.group_send)(f"user_{account_id}", event)


def _ensure_conversation_for_booking(booking, account):
    """Get or create a Conversation tied to booking and ensure participants include client, provider/shop owner and mechanic."""
    try:
        from chat.models import Conversation
    except Exception:
        return None

    conv = Conversation.objects.filter(booking_id=booking.id).first()
    if not conv:
        conv = Conversation.objects.create(title=f'Booking {booking.id}', booking_id=booking.id)
        # add participants: client, provider (if exists), shop owner if exists
        try:
            if booking.request.client and booking.request.client.account:
                conv.participants.add(booking.request.client.account)
        except Exception:
            pass
        try:
            if booking.request.provider:
                conv.participants.add(booking.request.provider)
        except Exception:
            pass
        try:
            if booking.request.shop and booking.request.shop.shop_owner and booking.request.shop.shop_owner.account:
                conv.participants.add(booking.request.shop.shop_owner.account)
        except Exception:
            pass
        try:
            conv.participants.add(account)
        except Exception:
            pass
        conv.save()
    return conv


def post_quotation_chat_message(account, booking, quotation, action='created'):
    """Post a structured quotation system message into the booking conversation and broadcast it.
    action can be: 'created', 'updated', 'retracted', 'accepted', 'rejected'
    """
    # Ensure conversation exists (ORM-level, no external API calls)
    conv = _ensure_conversation_for_booking(booking, account)
    if not conv:
        raise RuntimeError('Failed to ensure conversation for booking')

    from chat.models import Message
    from chat.serializers import MessageSerializer
    import json

    items = []
    try:
        for it in quotation.items.all():
            items.append({
                'id': it.id,
                'line_kind': getattr(it, 'line_kind', 'item'),
                'source': getattr(it, 'source', None),
                'service': it.service_id,
                'service_add_on': it.service_add_on_id,
                'description': it.description,
                'quantity': int(it.quantity),
                'unit_price': float(it.unit_price),
                'line_total': float(it.line_total),
                'purchase_receipt_image': it.purchase_receipt_image.url if getattr(it, 'purchase_receipt_image', None) else None,
                'receipt_submitted_at': it.receipt_submitted_at.isoformat() if getattr(it, 'receipt_submitted_at', None) else None,
            })
    except Exception:
        items = []

    payload = {
        'type': 'quotation_request',
        'action': action,
        'quotation_id': quotation.id if quotation else None,
        'booking_id': booking.id,
        'status': getattr(quotation, 'status', None),
        'mechanic_id': getattr(account, 'id', None),
        'mechanic_name': f"{getattr(account, 'firstname', '')} {getattr(account, 'lastname', '')}".strip(),
        'notes': getattr(quotation, 'notes', ''),
        'total_amount': float(quotation.total_amount) if quotation else None,
        'items': items,
        'created_at': quotation.created_at.isoformat() if quotation and getattr(quotation, 'created_at', None) else None,
    }

    if action == 'retracted':
        payload['message'] = 'Mechanic retracted this request.'

    # Create a system-style message (sender=None) so this operation does not
    # depend on any external auth token state. We still include mechanic info
    # in the structured payload so UIs can display who initiated it.
    msg = Message.objects.create(conversation=conv, sender=None, content=json.dumps(payload))
    conv.save()
    serializer = MessageSerializer(msg, context={'request': None})

    # broadcast to participants except sender
    # broadcast to participants except the original mechanic (we still
    # include mechanic_id in payload so recipient UIs can render who did it)
    channel_layer = get_channel_layer()
    payload_ws = {
        'type': 'booking_update',
        'action': 'new_chat_message',
        'conversation_id': conv.id,
        'booking_id': getattr(conv, 'booking_id', booking.id if booking is not None else None),
        'message': serializer.data,
    }
    try:
        for participant in conv.participants.exclude(id=getattr(account, 'id', None)).all():
            group_name = f'user_{participant.id}'
            async_to_sync(channel_layer.group_send)(group_name, payload_ws)
    except Exception as e:
        # Broadcasting should not break the DB transaction; log and continue.
        logger.exception('Failed to broadcast quotation websocket message: %s', e)

    return serializer.data
