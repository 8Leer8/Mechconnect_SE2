from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging

from notification.upsert import upsert_notification
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


def _service_line_from_request(req):
    from .models import DirectRequest

    service_line = ''
    try:
        rtype = str(req.request_type or '').lower()
        if rtype == 'broadcast':
            br = getattr(req, 'broadcast_request', None)
            if br:
                service_line = (br.description or 'Broadcast').strip()[:80]
        elif rtype == 'direct':
            dr = DirectRequest.objects.select_related('service').filter(request=req).first()
            if dr and dr.service:
                service_line = dr.service.name
        elif rtype == 'custom':
            cr = getattr(req, 'customrequest', None)
            if cr:
                service_line = (cr.description or 'Custom request').strip()[:80]
        elif rtype == 'emergency':
            er = getattr(req, 'emergencyrequest', None)
            if er and er.description:
                service_line = er.description.strip()[:80]
            else:
                service_line = 'Emergency'
    except Exception:
        service_line = ''

    if not service_line:
        service_line = str(req.request_type or 'service').replace('_', ' ').title()
    return service_line


def _enrich_thread_body(receiver_account_id, base_message, *, booking=None, request=None):
    """Shared header: Request/Booking #, service label, counterparty, then status line."""
    from .models import Request

    if booking is not None:
        req = booking.request
        if not req:
            return base_message
        header = f'Booking #{booking.id} · {_service_line_from_request(req)}'
    elif request is not None:
        if isinstance(request, int):
            req = Request.objects.select_related('client__account', 'provider').filter(id=request).first()
        else:
            req = request
        if not req:
            return base_message
        header = f'Request #{req.id} · {_service_line_from_request(req)}'
    else:
        return base_message

    client_nm = ''
    mech_nm = ''
    try:
        if req.client and req.client.account:
            client_nm = f'{req.client.account.firstname} {req.client.account.lastname}'.strip()
    except Exception:
        pass
    try:
        if req.provider:
            mech_nm = f'{req.provider.firstname} {req.provider.lastname}'.strip()
    except Exception:
        pass

    try:
        receiver_aid = int(receiver_account_id)
    except (TypeError, ValueError):
        receiver_aid = None

    client_aid = int(req.client.account_id) if getattr(req, 'client', None) else None
    prov_aid = int(req.provider_id) if getattr(req, 'provider_id', None) else None

    party_line = ''
    if receiver_aid and client_aid and receiver_aid == client_aid:
        party_line = f'Mechanic: {mech_nm}' if mech_nm else ''
    elif receiver_aid and prov_aid and receiver_aid == prov_aid:
        party_line = f'Client: {client_nm}' if client_nm else ''
    else:
        parts = [p for p in [client_nm, mech_nm] if p]
        party_line = ' · '.join(parts)

    lines = [header]
    if party_line:
        lines.append(party_line)
    lines.append(base_message)
    return '\n'.join(lines)


def _enrich_booking_notification_body(booking_id, receiver_account_id, base_message):
    from .models import Booking

    booking = (
        Booking.objects.select_related(
            'request__client__account',
            'request__provider',
        )
        .filter(id=booking_id)
        .first()
    )
    if not booking:
        return base_message
    return _enrich_thread_body(receiver_account_id, base_message, booking=booking)


def _enrich_request_thread_body(request_id, receiver_account_id, base_message):
    return _enrich_thread_body(receiver_account_id, base_message, request=request_id)


def upsert_request_thread_notification(account_id, request_id, title, message, payload, mark_unread=True):
    """One row per (receiver, request) for pre-booking updates (e.g. broadcast offers)."""
    body = _enrich_request_thread_body(request_id, account_id, message)
    upsert_notification(
        receiver_id=account_id,
        correlation_key=f'request:{request_id}',
        title=title,
        message=body,
        payload=payload,
        mark_unread=mark_unread,
    )


def upsert_booking_party_notification(account_id, booking, title, message, action=None):
    """Single in-app row per service request per receiver (broadcast → booking lifecycle)."""
    target_role = _resolve_target_role(account_id)
    payload = {
        'booking_id': booking.id,
        'request_id': booking.request_id,
        'status': booking.status,
    }
    if action:
        payload['action'] = action
    if target_role:
        payload['target_role'] = target_role

    try:
        if booking.request and str(booking.request.request_type or '').lower() == 'broadcast':
            br = getattr(booking.request, 'broadcast_request', None)
            if br:
                payload['broadcast_id'] = br.id
    except Exception:
        pass

    body = _enrich_booking_notification_body(booking.id, account_id, message)
    upsert_notification(
        receiver_id=account_id,
        correlation_key=f'request:{booking.request_id}',
        title=title,
        message=body,
        payload=payload,
        mark_unread=True,
    )


def _create_booking_notification(account_id, booking_id, booking_status, message, action=None):
    from .models import Booking

    booking = Booking.objects.filter(id=booking_id).first()
    if not booking:
        return

    title = _notification_title_for_booking_status(booking_status, message)
    upsert_booking_party_notification(
        account_id,
        booking,
        title,
        message,
        action=action,
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
