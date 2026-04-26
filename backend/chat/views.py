from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer
from users.models import Account
from django.db.models import Prefetch
from bookings.models import Booking
from bookings.models import Backjob, Quotation, QuotationItem, RequestAssignment
from bookings.backjob_utils import get_booking_backjob
from .permissions import evaluate_booking_chat_access, sync_booking_conversation_participants
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import json
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from django.conf import settings


def get_current_account(request):
    # Rely on authentication classes to populate `request.user`.
    user = getattr(request, 'user', None)
    if user and isinstance(user, Account):
        return user
    # Fallback: check session for compatibility with existing web flows
    account_id = request.session.get('account_id')
    if account_id:
        try:
            return Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return None
    return None


def ensure_default_backjob_quotation(booking, backjob):
    if booking is None or backjob is None:
        return

    request_obj = getattr(booking, 'request', None)
    mechanic_account = getattr(request_obj, 'provider', None)
    if mechanic_account is None and request_obj is not None:
        assignment = RequestAssignment.objects.filter(
            request=request_obj,
            role=RequestAssignment.Role.LEAD,
        ).select_related('mechanic').first()
        if assignment is None:
            assignment = RequestAssignment.objects.filter(
                request=request_obj,
            ).select_related('mechanic').order_by('assigned_at', 'id').first()
        mechanic_account = assignment.mechanic if assignment is not None else None
    if mechanic_account is None:
        return

    quotation, _ = Quotation.objects.get_or_create(
        booking=booking,
        defaults={
            'mechanic': mechanic_account,
            'notes': 'Default free backjob booking.',
            'status': Quotation.Status.ACCEPTED,
            'is_backjob': True,
            'is_final': False,
        },
    )

    quotation.mechanic = quotation.mechanic or mechanic_account
    quotation.is_backjob = True
    quotation.status = Quotation.Status.ACCEPTED
    if not quotation.notes:
        quotation.notes = 'Default free backjob booking.'
    quotation.save(update_fields=['mechanic', 'notes', 'status', 'is_backjob', 'updated_at'])

    exists = quotation.items.filter(
        backjob=backjob,
        description='Backjob Repair',
        unit_price=0,
    ).exists()
    if not exists:
        QuotationItem.objects.create(
            quotation=quotation,
            line_kind=QuotationItem.LineKind.SERVICE,
            description='Backjob Repair',
            quantity=1,
            unit_price=0,
            status=Quotation.Status.ACCEPTED,
            change_type=None,
            is_backjob_line=True,
            backjob=backjob,
        )

    quotation.recalculate_totals()
    quotation.save(update_fields=[
        'original_labor_cost',
        'backjob_discount',
        'final_labor_total',
        'total_amount',
        'updated_at',
    ])


@api_view(['GET'])
@permission_classes([AllowAny])
def list_conversations(request):
    account = get_current_account(request)
    if not account:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    qs = Conversation.objects.filter(participants=account).prefetch_related(
        'participants',
        Prefetch('messages', queryset=Message.objects.order_by('-created_at')[:1]),
    )
    serializer = ConversationSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def conversation_for_booking(request, booking_id):
    """
    Get or create a conversation linked to a booking id.
    POST: accepts optional title and derives participants server-side.
    GET: returns conversation if exists.
    """
    account = get_current_account(request)
    if not account:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        booking = Booking.objects.select_related(
            'request',
            'request__client',
            'request__client__account',
            'request__provider',
            'request__shop',
            'request__shop__shop_owner',
            'request__shop__shop_owner__account',
        ).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({'detail': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

    access = evaluate_booking_chat_access(booking, account)
    if not access.get('is_participant'):
        return Response({'detail': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)

    # Try find existing conversation
    conv = Conversation.objects.filter(booking_id=booking_id).first()
    if request.method == 'GET':
        if not conv:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        sync_booking_conversation_participants(conv, booking)
        if not conv.participants.filter(id=account.id).exists():
            conv.participants.add(account)
        return Response(ConversationSerializer(conv, context={'request': request}).data)

    # POST - create if not exists
    if conv:
        # already exists: keep participants in sync with booking roles/assignments
        sync_booking_conversation_participants(conv, booking)
        if conv.participants.filter(id=account.id).exists():
            return Response(ConversationSerializer(conv, context={'request': request}).data)
        conv.participants.add(account)
        conv.save()
        return Response(ConversationSerializer(conv, context={'request': request}).data)

    # create conversation for this booking, starting with the current user as participant
    conv = Conversation.objects.create(title=request.data.get('title', None), booking_id=booking_id)
    sync_booking_conversation_participants(conv, booking)
    conv.participants.add(account)
    conv.save()
    return Response(ConversationSerializer(conv, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
def booking_chat_access(request, booking_id):
    """
    Return booking-chat role/access metadata without creating or mutating conversations.
    """
    account = get_current_account(request)
    if not account:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        booking = Booking.objects.select_related(
            'request',
            'request__client',
            'request__client__account',
            'request__provider',
            'request__shop',
            'request__shop__shop_owner',
            'request__shop__shop_owner__account',
        ).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({'detail': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

    access = evaluate_booking_chat_access(booking, account)
    conv = Conversation.objects.filter(booking_id=booking_id).first()
    return Response(
        {
            'booking_id': booking_id,
            'conversation_id': conv.id if conv else None,
            'my_chat_role': access.get('role', 'none'),
            'can_send': bool(access.get('can_send')),
            'is_participant': bool(access.get('is_participant')),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def create_conversation(request):
    account = get_current_account(request)
    if not account:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    participant_ids = request.data.get('participants', [])
    if not isinstance(participant_ids, list) or account.id not in participant_ids:
        # ensure requesting user is participant
        participant_ids = list(set(participant_ids + [account.id]))

    # Create conversation and add participants
    conv = Conversation.objects.create(title=request.data.get('title', None))
    conv.participants.add(*Account.objects.filter(id__in=participant_ids))
    conv.save()
    serializer = ConversationSerializer(conv, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def request_backjob(request, booking_id):
    """
    Create a backjob request for a booking: saves optional images and posts a structured
    system-style message into the booking conversation so both client and mechanic see it.
    Accepts multipart form with fields: reason (optional), images[] (optional file inputs).
    """
    account = get_current_account(request)
    if not account:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    # Ensure booking exists and requester is participant (reuse logic similar to conversation_for_booking)
    try:
        booking = Booking.objects.select_related('request', 'request__client', 'request__provider', 'request__shop').get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({'detail': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

    permitted = False
    try:
        client_account = booking.request.client.account
        if client_account and client_account.id == account.id:
            permitted = True
    except Exception:
        pass
    if not permitted:
        return Response({'detail': 'Only the client can request a backjob'}, status=status.HTTP_403_FORBIDDEN)

    # Get or create conversation for this booking
    conv = Conversation.objects.filter(booking_id=booking_id).first()
    if not conv:
        conv = Conversation.objects.create(title=f'Booking {booking_id}', booking_id=booking_id)
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
        conv.participants.add(account)
        conv.save()

    # Save uploaded images
    image_urls = []
    files = request.FILES.getlist('images') if hasattr(request, 'FILES') else []
    for f in files:
        # store under media/backjob_images/<booking_id>/
        path = f'backjob_images/{booking_id}/{f.name}'
        saved_path = default_storage.save(path, ContentFile(f.read()))
        try:
            url = request.build_absolute_uri(default_storage.url(saved_path))
        except Exception:
            url = default_storage.url(saved_path)
        image_urls.append(url)

    reason = request.data.get('reason') or ''

    payload = {
        'type': 'backjob_request',
        'requested_by': getattr(account, 'id', None),
        'requested_by_name': f"{getattr(account, 'firstname', '')} {getattr(account, 'lastname', '')}".strip(),
        'reason': reason,
        'images': image_urls,
    }

    msg = Message.objects.create(conversation=conv, sender=account, content=json.dumps(payload))
    conv.save()
    serializer = MessageSerializer(msg, context={'request': request})

    # Create a new round when the previous backjob was already completed.
    # If there is still a live round, update that one instead of stacking duplicates.
    try:
        current_backjob = get_booking_backjob(booking)
        if current_backjob is None:
            current_backjob = Backjob.objects.create(
                booking=booking,
                requested_by=account,
                reason=reason,
                images=image_urls,
                status=Booking.Status.BACKJOB_PENDING,
            )
        else:
            current_backjob.requested_by = account
            current_backjob.reason = reason
            current_backjob.images = image_urls
            current_backjob.status = Booking.Status.BACKJOB_PENDING
            current_backjob.save(update_fields=["requested_by", "reason", "images", "status", "updated_at"])

        ensure_default_backjob_quotation(booking, current_backjob)

        # Re-open booking state for backjob diagnostic flow while preserving history.
        if booking.status == Booking.Status.COMPLETED:
            booking.status = Booking.Status.BACKJOB_PENDING
            booking.completed_at = None
            booking.save(update_fields=["status", "completed_at", "updated_at"])
    except Exception:
        # don't block message creation if backjob record fails
        pass

    # For shop jobs, the shop owner decides whether to accept a backjob.
    # Assigned shop mechanics should not see the pending request until the owner accepts it.
    try:
        if booking.request.shop_id:
            assigned_ids = list(
                RequestAssignment.objects.filter(request=booking.request).values_list("mechanic_id", flat=True)
            )
            if assigned_ids:
                conv.participants.remove(*Account.objects.filter(id__in=assigned_ids))
    except Exception:
        pass

    # broadcast to participants groups (except sender)
    try:
        channel_layer = get_channel_layer()
        payload_ws = {
            'type': 'booking_update',
            'action': 'new_chat_message',
            'conversation_id': conv.id,
            'message': serializer.data,
        }
        for participant in conv.participants.exclude(id=account.id).all():
            group_name = f'user_{participant.id}'
            async_to_sync(channel_layer.group_send)(group_name, payload_ws)
    except Exception:
        pass

    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def messages_view(request, pk):
    account = get_current_account(request)
    if not account:
        return Response({'detail': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    conv = get_object_or_404(Conversation, id=pk)
    if not conv.participants.filter(id=account.id).exists():
        return Response({'detail': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)

    can_send = True
    booking = None
    if conv.booking_id:
        try:
            booking = Booking.objects.select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__shop',
                'request__shop__shop_owner',
                'request__shop__shop_owner__account',
            ).get(id=conv.booking_id)
        except Booking.DoesNotExist:
            return Response({'detail': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

        access = evaluate_booking_chat_access(booking, account)
        if not access.get('is_participant'):
            return Response({'detail': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)
        can_send = bool(access.get('can_send'))

    if request.method == 'GET':
        qs = conv.messages.select_related('sender').order_by('created_at')
        if booking:
            setattr(conv, '_booking_obj', booking)
        # optional auto-mark read via query param
        mark = request.query_params.get('mark_read')
        if mark and mark.lower() in ('1', 'true', 'yes'):
            # mark unread messages not sent by current account as read
            conv.messages.filter(is_read=False).exclude(sender=account).update(is_read=True)
        serializer = MessageSerializer(
            qs,
            many=True,
            context={'request': request, 'booking': booking, 'booking_id': conv.booking_id},
        )
        return Response(serializer.data)

    # POST create message
    content = request.data.get('content')
    if not content:
        return Response({'content': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not can_send:
        return Response(
            {'detail': 'You can view this chat but cannot send messages for this booking.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    msg = Message.objects.create(conversation=conv, sender=account, content=content)
    # update conversation timestamp
    conv.save()
    serializer = MessageSerializer(msg, context={'request': request, 'booking': booking, 'booking_id': conv.booking_id})
    # Broadcast the new message to connected websocket clients in the user's groups.
    try:
        channel_layer = get_channel_layer()
        payload = {
            'type': 'booking_update',
            'action': 'new_chat_message',
            'conversation_id': conv.id,
            'message': serializer.data,
        }
        # send to each participant's personal group (user_<id>) except the sender
        for participant in conv.participants.exclude(id=account.id).all():
            group_name = f"user_{participant.id}"
            async_to_sync(channel_layer.group_send)(group_name, payload)
    except Exception:
        # Don't prevent message creation on broadcast failure; log in future if needed
        pass
    return Response(serializer.data, status=status.HTTP_201_CREATED)
