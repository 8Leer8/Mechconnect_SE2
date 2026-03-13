from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer
from users.models import Account
from django.db.models import Prefetch


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
    POST: accepts optional title and participants (list of ids).
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
        # already exists
        if not conv.participants.filter(id=account.id).exists():
            conv.participants.add(account)
        return Response(ConversationSerializer(conv).data)

    # create conversation with participants: default to booking client and current user if provided
    participant_ids = request.data.get('participants', [])
    if not isinstance(participant_ids, list):
        participant_ids = []
    if account.id not in participant_ids:
        participant_ids.append(account.id)

    conv = Conversation.objects.create(title=request.data.get('title', None), booking_id=booking_id)
    conv.participants.add(*Account.objects.filter(id__in=participant_ids))
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
    return Response(serializer.data, status=status.HTTP_201_CREATED)
