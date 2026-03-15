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
from bookings.models import Backjob
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
    serializer = ConversationSerializer(qs, many=True)
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

    # Try find existing conversation
    conv = Conversation.objects.filter(booking_id=booking_id).first()
    if request.method == 'GET':
        if not conv:
            return Response({'detail': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if not conv.participants.filter(id=account.id).exists():
            return Response({'detail': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)
        return Response(ConversationSerializer(conv).data)

    # POST - create if not exists
    if conv:
        # already exists: allow auto-joining when the requester is associated with the booking
        if conv.participants.filter(id=account.id).exists():
            return Response(ConversationSerializer(conv).data)

        # Determine if requester is permitted to join this booking conversation
        try:
            booking = Booking.objects.select_related('request', 'request__client', 'request__provider', 'request__shop', 'request__shop__shop_owner', 'request__client__account').get(id=booking_id)
        except Booking.DoesNotExist:
            return Response({'detail': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)

        permitted = False
        # client account
        try:
            client_account = booking.request.client.account
            if client_account and client_account.id == account.id:
                permitted = True
        except Exception:
            pass

        # direct provider (mechanic) assigned to request
        if not permitted and booking.request.provider and booking.request.provider.id == account.id:
            permitted = True

        # shop owner (if booking attached to shop)
        try:
            if not permitted and booking.request.shop and booking.request.shop.shop_owner and booking.request.shop.shop_owner.account.id == account.id:
                permitted = True
        except Exception:
            pass

        if permitted:
            conv.participants.add(account)
            conv.save()
            return Response(ConversationSerializer(conv).data)

        return Response({'detail': 'Not a participant'}, status=status.HTTP_403_FORBIDDEN)

    # create conversation for this booking, starting with the current user as participant
    conv = Conversation.objects.create(title=request.data.get('title', None), booking_id=booking_id)
    conv.participants.add(account)
    conv.save()
    return Response(ConversationSerializer(conv).data, status=status.HTTP_201_CREATED)


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
    serializer = ConversationSerializer(conv)
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
    if not permitted and booking.request.provider and booking.request.provider.id == account.id:
        permitted = True
    try:
        if not permitted and booking.request.shop and booking.request.shop.shop_owner and booking.request.shop.shop_owner.account.id == account.id:
            permitted = True
    except Exception:
        pass
    if not permitted:
        return Response({'detail': 'Not permitted'}, status=status.HTTP_403_FORBIDDEN)

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

    # Create or update Backjob record for this booking
    try:
        Backjob.objects.update_or_create(
            booking=booking,
            defaults={
                'requested_by': account,
                'reason': reason,
                'images': image_urls,
                'status': Booking.Status.REWORKED,
            },
        )
    except Exception:
        # don't block message creation if backjob record fails
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

    if request.method == 'GET':
        qs = conv.messages.select_related('sender').order_by('created_at')
        # optional auto-mark read via query param
        mark = request.query_params.get('mark_read')
        if mark and mark.lower() in ('1', 'true', 'yes'):
            # mark unread messages not sent by current account as read
            conv.messages.filter(is_read=False).exclude(sender=account).update(is_read=True)
        serializer = MessageSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    # POST create message
    content = request.data.get('content')
    if not content:
        return Response({'content': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)

    msg = Message.objects.create(conversation=conv, sender=account, content=content)
    # update conversation timestamp
    conv.save()
    serializer = MessageSerializer(msg, context={'request': request})
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
