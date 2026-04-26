"""
Admin views for fetching booking chat history for disputes.
"""
from rest_framework.decorators import api_view, permission_classes
from users.permissions import IsAdmin
from rest_framework.response import Response
from rest_framework import status
from chat.models import Conversation, Message
from chat.serializers import MessageSerializer


@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_booking_chat_history(request, booking_id):
    """
    Admin endpoint to fetch all messages for a booking.
    Used by Dispute Center to review communication history.
    """
    try:
        conversation = Conversation.objects.get(booking_id=booking_id)
    except Conversation.DoesNotExist:
        return Response({"messages": []}, status=status.HTTP_200_OK)

    messages = Message.objects.filter(conversation=conversation).order_by("created_at")

    # Serialize with sender info
    message_data = []
    for msg in messages:
        sender_name = None
        sender_role = None
        if msg.sender:
            # Construct full name from Account fields
            first = msg.sender.firstname or ""
            last = msg.sender.lastname or ""
            sender_name = f"{first} {last}".strip() or msg.sender.username
            # Determine role based on account type
            if hasattr(msg.sender, "client_profile"):
                sender_role = "client"
            elif hasattr(msg.sender, "mechanic_profile"):
                sender_role = "mechanic"
            elif hasattr(msg.sender, "shop_profile"):
                sender_role = "shop"
            else:
                sender_role = "admin"

        message_data.append({
            "id": msg.id,
            "content": msg.content,
            "sender_id": msg.sender_id,
            "sender_name": sender_name,
            "sender_role": sender_role,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
            "is_read": msg.is_read,
        })

    return Response({
        "booking_id": booking_id,
        "conversation_id": conversation.id,
        "messages": message_data,
        "message_count": len(message_data),
    }, status=status.HTTP_200_OK)
