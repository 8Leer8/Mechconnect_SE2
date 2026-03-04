from rest_framework import serializers
from .models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest,
    ActiveBooking, ServiceLocation, DirectRequestAddOn, BroadcastRequest, BroadcastOffer
)
from services.models import Service, ServiceAddOn
from users.models import Account, Client
from MainBackend.storage_utils import get_media_url


class ServiceLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceLocation
        fields = ['id', 'street_name', 'subdivision_village', 'barangay', 'city_municipality', 'landmark']


class ServiceBasicSerializer(serializers.ModelSerializer):
    minimum_price = serializers.FloatField()
    
    class Meta:
        model = Service
        fields = ['id', 'name', 'description', 'minimum_price']


class ServiceAddOnSerializer(serializers.ModelSerializer):
    price = serializers.FloatField()
    
    class Meta:
        model = ServiceAddOn
        fields = ['id', 'name', 'description', 'price']


class AccountBasicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'firstname', 'lastname', 'username', 'email']


class CustomRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomRequest
        fields = ['id', 'description', 'request_status', 'concern_picture', 'quoted_price', 'providers_note']


class DirectRequestSerializer(serializers.ModelSerializer):
    service = ServiceBasicSerializer(read_only=True)
    add_ons = serializers.SerializerMethodField()
    
    class Meta:
        model = DirectRequest
        fields = ['id', 'service', 'request_status', 'add_ons']
    
    def get_add_ons(self, obj):
        add_ons = DirectRequestAddOn.objects.filter(request=obj.request).select_related('service_add_on')
        return ServiceAddOnSerializer([addon.service_add_on for addon in add_ons], many=True).data


class EmergencyRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyRequest
        fields = ['id', 'description', 'concern_picture', 'providers_note']


class BroadcastRequestDetailSerializer(serializers.ModelSerializer):
    services = ServiceBasicSerializer(many=True, read_only=True)
    add_ons = serializers.SerializerMethodField()
    
    class Meta:
        model = BroadcastRequest
        fields = ['id', 'description', 'concern_picture', 'status', 'services', 'add_ons', 'expires_at']
    
    def get_add_ons(self, obj):
        from .models import BroadcastRequestAddOn
        add_ons = BroadcastRequestAddOn.objects.filter(broadcast_request=obj).select_related('service_add_on')
        return ServiceAddOnSerializer([addon.service_add_on for addon in add_ons], many=True).data


class RequestSerializer(serializers.ModelSerializer):
    client = AccountBasicSerializer(source='client.account', read_only=True)
    provider = AccountBasicSerializer(read_only=True)
    service_location = ServiceLocationSerializer(read_only=True)
    request_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Request
        fields = ['id', 'client', 'provider', 'request_type', 'service_location', 'created_at', 'request_details']
    
    def get_request_details(self, obj):
        if obj.request_type == 'custom':
            try:
                custom = obj.customrequest
                return CustomRequestSerializer(custom).data
            except CustomRequest.DoesNotExist:
                return None
        elif obj.request_type == 'direct':
            try:
                direct = obj.directrequest
                return DirectRequestSerializer(direct).data
            except DirectRequest.DoesNotExist:
                return None
        elif obj.request_type == 'emergency':
            try:
                emergency = obj.emergencyrequest
                return EmergencyRequestSerializer(emergency).data
            except EmergencyRequest.DoesNotExist:
                return None
        elif obj.request_type == 'broadcast':
            try:
                broadcast = obj.broadcast_request
                return BroadcastRequestDetailSerializer(broadcast).data
            except BroadcastRequest.DoesNotExist:
                return None
        return None


class ActiveBookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActiveBooking
        fields = [
            'id', 'before_picture_service', 'is_job_done', 'after_picture_service',
            'is_rescheduled', 'reason', 'new_time', 'new_date', 'started_at', 'paused_at', 'total_pause_duration'
        ]


class BookingSerializer(serializers.ModelSerializer):
    request = RequestSerializer(read_only=True)
    active_details = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'request', 'status', 'amount_fee', 'booked_at',
            'updated_at', 'completed_at', 'active_details'
        ]
        read_only_fields = ['id', 'request', 'amount_fee', 'booked_at', 'updated_at', 'completed_at', 'active_details']

    def get_active_details(self, obj):
        # Show active details for statuses where mechanic may need them
        if obj.status in ['active', 'on_the_way', 'accepted', 'paused', 'finished', 'pending_payment']:
            try:
                active = obj.activebooking
                return ActiveBookingSerializer(active).data
            except ActiveBooking.DoesNotExist:
                return None
        return None

    def update(self, instance, validated_data):
        # Allow status update via PATCH
        status = validated_data.get('status', None)
        if status and status in [choice[0] for choice in instance.Status.choices]:
            instance.status = status
            instance.save()
        return instance


class HomePageSerializer(serializers.Serializer):
    current_bookings = BookingSerializer(many=True, read_only=True)
    pending_requests = RequestSerializer(many=True, read_only=True)


class BroadcastRequestSerializer(serializers.ModelSerializer):
    """Serializer for broadcast requests on mechanic map"""
    services = ServiceBasicSerializer(many=True, read_only=True)
    add_ons = serializers.SerializerMethodField()
    concern_picture = serializers.SerializerMethodField()
    required_tokens = serializers.SerializerMethodField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    
    class Meta:
        model = BroadcastRequest
        fields = [
            'id', 'description', 'latitude', 'longitude', 
            'services', 'add_ons', 'created_at', 'expires_at', 'accepted_at',
            'status', 'concern_picture', 'required_tokens'
        ]
    
    def get_concern_picture(self, obj):
        """Return full URL for concern picture"""
        if obj.concern_picture:
            request = self.context.get('request')
            return get_media_url(obj.concern_picture, request)
        return None
    
    def get_add_ons(self, obj):
        from .models import BroadcastRequestAddOn
        add_ons = BroadcastRequestAddOn.objects.filter(broadcast_request=obj).select_related('service_add_on')
        return ServiceAddOnSerializer([addon.service_add_on for addon in add_ons], many=True).data

    def get_required_tokens(self, obj):
        """Calculate required tokens (2% of total service price) rounded up to integer."""
        try:
            total_amount = 0.0
            for service in obj.services.all():
                total_amount += float(service.minimum_price)

            from .models import BroadcastRequestAddOn
            add_ons = BroadcastRequestAddOn.objects.filter(broadcast_request=obj).select_related('service_add_on')
            for ar in add_ons:
                total_amount += float(ar.service_add_on.price)

            import math
            required = math.ceil(total_amount * 0.02)
            return required
        except Exception:
            return 0


class BroadcastOfferSerializer(serializers.ModelSerializer):
    """Serializer for broadcast offers"""
    mechanic = AccountBasicSerializer(source='mechanic.account', read_only=True)
    
    class Meta:
        model = BroadcastOffer
        fields = ['id', 'broadcast_request', 'mechanic', 'status', 'created_at', 'responded_at']
