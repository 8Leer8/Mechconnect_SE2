from rest_framework import serializers
from .models import Conversation, Message
from users.models import Account
from bookings.models import Booking
from .permissions import evaluate_booking_chat_access
from MainBackend.storage_utils import get_media_url


class ParticipantSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    firstname = serializers.CharField()
    lastname = serializers.CharField()
    username = serializers.CharField()
    profile_photo = serializers.SerializerMethodField()
    chat_role = serializers.SerializerMethodField()

    def get_profile_photo(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        image_field = None

        try:
            if hasattr(obj, 'client') and obj.client.profile_photo:
                image_field = obj.client.profile_photo
            elif hasattr(obj, 'mechanic') and obj.mechanic.profile_photo:
                image_field = obj.mechanic.profile_photo
            elif hasattr(obj, 'shopowner') and obj.shopowner.profile_photo:
                image_field = obj.shopowner.profile_photo
            elif hasattr(obj, 'admin') and obj.admin.profile_photo:
                image_field = obj.admin.profile_photo
        except Exception:
            image_field = None

        if not image_field:
            return None
        return get_media_url(image_field, request)

    def get_chat_role(self, obj):
        def infer_role_from_account(account_obj):
            try:
                if hasattr(account_obj, 'shopowner'):
                    return 'shop_owner'
            except Exception:
                pass
            try:
                if hasattr(account_obj, 'client'):
                    return 'client'
            except Exception:
                pass
            try:
                if hasattr(account_obj, 'mechanic'):
                    # Booking context is required to distinguish lead vs assisting.
                    return 'provider_mechanic'
            except Exception:
                pass
            try:
                if hasattr(account_obj, 'admin'):
                    return 'admin'
            except Exception:
                pass
            return 'participant'

        booking = self.context.get('booking') if hasattr(self, 'context') else None
        booking_id = self.context.get('booking_id') if hasattr(self, 'context') else None

        if booking is None and booking_id:
            booking = Booking.objects.select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__shop',
                'request__shop__shop_owner',
                'request__shop__shop_owner__account',
            ).filter(id=booking_id).first()

        if not booking:
            return infer_role_from_account(obj)

        access = evaluate_booking_chat_access(booking, obj)
        resolved_role = access.get('role', 'participant')
        if resolved_role in ('none', 'participant'):
            return infer_role_from_account(obj)
        return resolved_role


class MessageSerializer(serializers.ModelSerializer):
    sender = serializers.SerializerMethodField()
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'conversation', 'sender', 'content', 'is_read', 'created_at', 'is_mine']
        read_only_fields = ['id', 'sender', 'created_at']

    def get_sender(self, obj):
        if not obj.sender:
            return None

        ctx = dict(self.context) if hasattr(self, 'context') else {}
        ctx['booking_id'] = getattr(obj.conversation, 'booking_id', None)
        if not ctx.get('booking'):
            ctx['booking'] = getattr(obj.conversation, '_booking_obj', None)
        return ParticipantSerializer(obj.sender, context=ctx).data

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
    participants = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    booking_id = serializers.IntegerField(read_only=True)
    my_chat_role = serializers.SerializerMethodField()
    can_send = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id',
            'title',
            'participants',
            'last_message',
            'booking_id',
            'my_chat_role',
            'can_send',
            'created_at',
            'updated_at',
        ]

    def get_participants(self, obj):
        participants_qs = obj.participants.all()
        participant_context = dict(self.context) if hasattr(self, 'context') else {}
        participant_context['booking_id'] = getattr(obj, 'booking_id', None)
        participant_context['booking'] = getattr(obj, '_booking_obj', None)
        return ParticipantSerializer(participants_qs, many=True, context=participant_context).data

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

    def _get_current_account(self):
        request = self.context.get('request') if hasattr(self, 'context') else None
        if not request:
            return None

        user = getattr(request, 'user', None)
        if isinstance(user, Account):
            return user

        try:
            account_id = request.session.get('account_id')
        except Exception:
            account_id = None

        if not account_id:
            return None

        try:
            return Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return None

    def _get_chat_access(self, obj):
        if not hasattr(self, '_chat_access_cache'):
            self._chat_access_cache = {}
        cache_key = getattr(obj, 'id', None)
        if cache_key in self._chat_access_cache:
            return self._chat_access_cache[cache_key]

        account = self._get_current_account()
        if not account:
            result = {'role': 'none', 'can_send': False}
            self._chat_access_cache[cache_key] = result
            return result

        if not obj.booking_id:
            is_participant = obj.participants.filter(id=account.id).exists()
            result = {
                'role': 'participant' if is_participant else 'none',
                'can_send': bool(is_participant),
            }
            self._chat_access_cache[cache_key] = result
            return result

        booking = Booking.objects.select_related(
            'request',
            'request__client',
            'request__client__account',
            'request__provider',
            'request__shop',
            'request__shop__shop_owner',
            'request__shop__shop_owner__account',
        ).filter(id=obj.booking_id).first()
        if not booking:
            result = {'role': 'none', 'can_send': False}
            self._chat_access_cache[cache_key] = result
            return result

        access = evaluate_booking_chat_access(booking, account)
        result = {
            'role': access.get('role', 'none'),
            'can_send': bool(access.get('can_send')),
        }
        self._chat_access_cache[cache_key] = result
        return result

    def get_my_chat_role(self, obj):
        return self._get_chat_access(obj).get('role', 'none')

    def get_can_send(self, obj):
        return bool(self._get_chat_access(obj).get('can_send'))
