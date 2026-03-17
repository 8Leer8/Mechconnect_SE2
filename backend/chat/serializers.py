from rest_framework import serializers
from .models import Conversation, Message
from users.models import Account


class ParticipantSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    firstname = serializers.CharField()
    lastname = serializers.CharField()
    username = serializers.CharField()


class MessageSerializer(serializers.ModelSerializer):
    sender = ParticipantSerializer(read_only=True, allow_null=True)
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'conversation', 'sender', 'content', 'is_read', 'created_at', 'is_mine']
        read_only_fields = ['id', 'sender', 'created_at']

    def get_is_mine(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        if request:
            user = getattr(request, 'user', None)
            if isinstance(user, Account):
                return bool(obj.sender and getattr(obj.sender, 'id', None) == getattr(user, 'id', None))
            try:
                account_id = request.session.get('account_id')
            except Exception:
                account_id = None
            return bool(account_id and obj.sender and getattr(obj.sender, 'id', None) == account_id)
        return False


class ConversationSerializer(serializers.ModelSerializer):
    participants = ParticipantSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    booking_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Conversation
        fields = ['id', 'title', 'participants', 'last_message', 'booking_id', 'created_at', 'updated_at']

    def get_last_message(self, obj):
        last = obj.messages.order_by('-created_at').first()
        if not last:
            return None
        sender_id = last.sender.id if last.sender else None
        return {
            'id': last.id,
            'sender_id': sender_id,
            'content': last.content,
            'created_at': last.created_at,
        }
