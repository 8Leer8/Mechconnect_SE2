from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import logging

from notification.upsert import upsert_notification
from users.models import Account
from .backjob_utils import get_booking_backjob


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
    service_line = ''
    try:
        rtype = str(req.request_type or '').lower()
        if rtype == 'broadcast':
            br = getattr(req, 'broadcast_request', None)
            if br:
                service_line = (br.description or 'Broadcast').strip()[:80]
        elif rtype == 'direct':
            from .direct_request_utils import iter_direct_request_services

            names = [s.name for s in iter_direct_request_services(req) if getattr(s, "name", None)]
            if names:
                service_line = ", ".join(names)[:80]
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
    target_role = None
    try:
        req = booking.request
        if req:
            if getattr(req, 'provider_id', None) and int(req.provider_id) == int(account_id):
                target_role = 'mechanic'
            elif getattr(req, 'client', None) and getattr(req.client, 'account_id', None) and int(req.client.account_id) == int(account_id):
                target_role = 'client'
            elif getattr(req, 'shop', None) and getattr(req.shop, 'shop_owner', None) and getattr(req.shop.shop_owner, 'account_id', None) and int(req.shop.shop_owner.account_id) == int(account_id):
                target_role = 'shopowner'
    except Exception:
        target_role = None

    if not target_role:
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

    body = _enrich_thread_body(account_id, message, booking=booking)
    upsert_notification(
        receiver_id=account_id,
        correlation_key=f'request:{booking.request_id}',
        title=title,
        message=body,
        payload=payload,
        mark_unread=True,
    )


def _create_booking_notification(account_id, booking_id, booking_status, message, action=None, booking=None):
    from .models import Booking

    if booking is None:
        booking = (
            Booking.objects.select_related(
                'request__client__account',
                'request__provider',
                'request__shop__shop_owner',
            )
            .filter(id=booking_id)
            .first()
        )
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
    booking = None
    shop_owner_account_id = None
    try:
        # Local import to avoid circulars at module import time.
        from .models import Booking

        booking = (
            Booking.objects.select_related(
                "request__client__account",
                "request__provider",
                "request__shop__shop_owner",
            )
            .filter(id=booking_id)
            .first()
        )
        if booking and booking.request and getattr(booking.request, "shop", None):
            shop = booking.request.shop
            if shop and getattr(shop, "shop_owner", None):
                shop_owner_account_id = shop.shop_owner.account_id
        if booking and booking.request:
            assignment_ids = booking.request.assignments.values_list("mechanic_id", flat=True)
            participant_ids.update([aid for aid in assignment_ids if aid])
    except Exception:
        shop_owner_account_id = None

    participant_ids.add(shop_owner_account_id)

    for account_id in participant_ids:
        if not account_id:
            continue
        try:
            _create_booking_notification(account_id, booking_id, booking_status, message, booking=booking)
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
        for assignment in booking.request.assignments.select_related("mechanic").all():
            conv.participants.add(assignment.mechanic)
    except Exception:
        pass
    try:
        conv.participants.add(account)
    except Exception:
        pass
    return conv


def post_quotation_chat_message(account, booking, quotation, action='created', request=None, amendment=None):
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
    pending_total_amount = None
    try:
        current_backjob = get_booking_backjob(booking) if getattr(quotation, "is_backjob", False) else None
        current_backjob_created_at = getattr(current_backjob, "created_at", None)

        def is_current_backjob_item(item):
            if not getattr(quotation, "is_backjob", False):
                return True
            if current_backjob is None:
                return False
            if getattr(item, "backjob_id", None):
                return item.backjob_id == current_backjob.id
            item_created_at = getattr(item, "created_at", None)
            return bool(
                getattr(item, "is_backjob_line", False)
                and current_backjob_created_at is not None
                and item_created_at is not None
                and item_created_at >= current_backjob_created_at
            )

        # For pending amendment requests (action=updated), show the staged delta rows.
        # For resolved actions (accepted/rejected), always show the current quotation rows
        # so old removed deltas do not leak into future diff baselines.
        use_amendment_rows = amendment is not None and action == "updated"
        if use_amendment_rows:
            requested_service_ids = set()
            try:
                request_obj = getattr(booking, "request", None)
                from .direct_request_utils import direct_request_service_ids

                requested_service_ids.update(direct_request_service_ids(request_obj))
                broadcast = getattr(request_obj, "broadcast_request", None)
                if broadcast:
                    requested_service_ids.update(int(sid) for sid in broadcast.services.values_list("id", flat=True))
            except Exception:
                requested_service_ids = set()

            def is_booked_service_row(row):
                try:
                    return (
                        str(row.get("line_kind") or "").lower() == "service" and
                        int(row.get("service") or 0) in requested_service_ids
                    )
                except Exception:
                    return False

            def normalize_line_kind(line_kind, service_id=None):
                value = str(line_kind or "item").lower()
                if value == "service" and not service_id:
                    return "item"
                return value if value in {"service", "item"} else "item"

            def rows_are_same(original, proposed):
                try:
                    return (
                        normalize_line_kind(original.get("line_kind"), original.get("service")) ==
                        normalize_line_kind(proposed.get("line_kind"), proposed.get("service")) and
                        str(original.get("source") or "") == str(proposed.get("source") or "") and
                        str(original.get("service") or "") == str(proposed.get("service") or "") and
                        str(original.get("service_add_on") or "") == str(proposed.get("service_add_on") or "") and
                        str(original.get("description") or "") == str(proposed.get("description") or "") and
                        int(original.get("quantity") or 1) == int(proposed.get("quantity") or 1) and
                        float(original.get("unit_price") or 0) == float(proposed.get("unit_price") or 0)
                    )
                except Exception:
                    return False

            accepted_totals_by_id = {}
            try:
                for current_item in quotation.items.filter(status="accepted"):
                    accepted_totals_by_id[current_item.id] = float(current_item.line_total)
            except Exception:
                accepted_totals_by_id = {}
            # Pending amendment chat total is the requested delta, not the full original booking total.
            next_total = 0

            for change in amendment.items.all().order_by("id"):
                proposed = change.proposed_changes or {}
                original = change.original_snapshot or {}
                stable_original_id = change.original_item_id
                if stable_original_id is None:
                    try:
                        stable_original_id = int(original.get("id"))
                    except Exception:
                        stable_original_id = None
                row = {
                    "id": stable_original_id,
                    "line_kind": proposed.get("line_kind") or original.get("line_kind") or "item",
                    "source": proposed.get("source") if proposed.get("source") is not None else original.get("source"),
                    "service": proposed.get("service") if proposed.get("service") is not None else original.get("service"),
                    "service_add_on": proposed.get("service_add_on") if proposed.get("service_add_on") is not None else original.get("service_add_on"),
                    "description": proposed.get("description") if proposed.get("description") is not None else original.get("description"),
                    "quantity": int(proposed.get("quantity") if proposed.get("quantity") is not None else (original.get("quantity") or 1)),
                    "unit_price": float(proposed.get("unit_price") if proposed.get("unit_price") is not None else (original.get("unit_price") or 0)),
                    "status": "pending" if action == "updated" else getattr(amendment, "status", None),
                    "change_type": change.action_type,
                    "previous_description": original.get("description"),
                    "previous_quantity": original.get("quantity"),
                    "previous_unit_price": original.get("unit_price"),
                    "is_backjob_new_line": bool(getattr(quotation, "is_backjob", False) and change.action_type == "added"),
                    "backjob_id": current_backjob.id if getattr(quotation, "is_backjob", False) and current_backjob is not None and change.action_type == "added" else original.get("backjob_id"),
                }
                if str(row["line_kind"] or "").lower() == "service" and not row.get("service"):
                    row["line_kind"] = "item"
                row["line_total"] = float(row["quantity"]) * float(row["unit_price"])

                if change.action_type == "removed" and is_booked_service_row(row):
                    continue
                if change.action_type == "edited" and rows_are_same(original, proposed):
                    continue

                items.append(row)

                if change.action_type == "added":
                    next_total += row["line_total"]
                elif change.action_type == "edited":
                    if stable_original_id in accepted_totals_by_id:
                        next_total += row["line_total"] - accepted_totals_by_id[stable_original_id]
                elif change.action_type == "removed":
                    if stable_original_id in accepted_totals_by_id:
                        next_total -= accepted_totals_by_id[stable_original_id]

            try:
                fee_total = float(getattr(booking, "convenience_fee", 0) or 0)
                traffic_fee = float(getattr(booking, "traffic_surcharge", 0) or 0)
                if fee_total <= 0 and traffic_fee <= 0:
                    fee_total = float(getattr(booking, "convenience_fee", 0) or 0)
                pending_total_amount = max(0, next_total + fee_total + traffic_fee)
            except Exception:
                pending_total_amount = max(0, next_total)
        else:
            for it in quotation.items.all():
                if not is_current_backjob_item(it):
                    continue
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
                    'status': getattr(it, 'status', None),
                    'change_type': getattr(it, 'change_type', None),
                    'previous_description': getattr(it, 'previous_description', None),
                    'previous_quantity': getattr(it, 'previous_quantity', None),
                    'previous_unit_price': float(it.previous_unit_price) if getattr(it, 'previous_unit_price', None) is not None else None,
                    'is_backjob_new_line': bool(getattr(it, 'is_backjob_line', False)),
                    'backjob_id': getattr(it, 'backjob_id', None),
                    'created_at': it.created_at.isoformat() if getattr(it, 'created_at', None) else None,
                    'updated_at': it.updated_at.isoformat() if getattr(it, 'updated_at', None) else None,
                    'purchase_receipt_image': it.purchase_receipt_image.url if getattr(it, 'purchase_receipt_image', None) else None,
                    'receipt_submitted_at': it.receipt_submitted_at.isoformat() if getattr(it, 'receipt_submitted_at', None) else None,
                })
    except Exception:
        items = []

    # Prefer amendment lifecycle for bundled flows; quotation instance may be stale
    # in-memory right after request creation.
    request_status = (
        getattr(amendment, "status", None)
        if amendment is not None
        else getattr(quotation, 'status', None)
    )
    if action == 'accepted':
        request_status = 'accepted'
    elif action == 'rejected':
        request_status = 'rejected'
    elif action == 'retracted':
        request_status = 'retracted'

    payload = {
        'type': 'quotation_request',
        'action': action,
        'quotation_id': quotation.id if quotation else None,
        'amendment_id': amendment.id if amendment is not None else None,
        'booking_id': booking.id,
        'status': request_status,
        'mechanic_id': getattr(account, 'id', None),
        'mechanic_name': f"{getattr(account, 'firstname', '')} {getattr(account, 'lastname', '')}".strip(),
        'notes': getattr(quotation, 'notes', ''),
        'is_backjob': bool(getattr(quotation, 'is_backjob', False)),
        'backjob_id': current_backjob.id if current_backjob is not None else None,
        'total_amount': pending_total_amount if pending_total_amount is not None else (float(quotation.total_amount) if quotation else None),
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
    serializer = MessageSerializer(msg, context={'request': request})

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
