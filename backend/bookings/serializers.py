from rest_framework import serializers
from .models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest,
    ActiveBooking, ServiceLocation, DirectRequestAddOn, BroadcastRequest, BroadcastOffer,
    RequestAssignment
)
from services.models import Service, ServiceAddOn
from users.models import Account, Client
from shops.models import Shop
from MainBackend.storage_utils import get_media_url


class ServiceLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceLocation
        fields = ['id', 'street_name', 'subdivision_village', 'barangay', 'city_municipality', 'landmark', 'latitude', 'longitude']


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
    name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    
    class Meta:
        model = Account
        fields = ['id', 'firstname', 'lastname', 'username', 'email', 'name', 'phone']
    
    def get_name(self, obj):
        return f"{obj.firstname} {obj.lastname}"
    
    def get_phone(self, obj):
        # Try to get phone from client
        if hasattr(obj, 'client'):
            return obj.client.contact_number
        # Try to get phone from mechanic
        elif hasattr(obj, 'mechanic'):
            return obj.mechanic.contact_number
        # Try to get phone from shop owner
        elif hasattr(obj, 'shopowner'):
            return obj.shopowner.shop_contact_number
        return None


class ShopBasicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shop
        fields = ['id', 'shop_name', 'contact_number', 'email']


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
    concern_picture = serializers.SerializerMethodField()
    
    class Meta:
        model = EmergencyRequest
        fields = ['id', 'description', 'concern_picture', 'providers_note']
    
    def get_concern_picture(self, obj):
        """Return full URL for concern picture"""
        if obj.concern_picture:
            request = self.context.get('request')
            return get_media_url(obj.concern_picture, request)
        return None


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


class RequestAssignmentSerializer(serializers.ModelSerializer):
    mechanic = AccountBasicSerializer(read_only=True)

    class Meta:
        model = RequestAssignment
        fields = ['id', 'mechanic', 'role', 'assigned_at']


class RequestSerializer(serializers.ModelSerializer):
    client = AccountBasicSerializer(source='client.account', read_only=True)
    provider = AccountBasicSerializer(read_only=True)
    shop = ShopBasicSerializer(read_only=True)
    service_location = ServiceLocationSerializer(read_only=True)
    request_details = serializers.SerializerMethodField()
    assigned_mechanics = RequestAssignmentSerializer(source='assignments', many=True, read_only=True)
    
    class Meta:
        model = Request
        fields = ['id', 'client', 'provider', 'shop', 'request_type', 'service_location', 'created_at', 'request_details', 'assigned_mechanics']
    
    def get_request_details(self, obj):
        if obj.request_type == 'custom':
            try:
                custom = obj.customrequest
                return CustomRequestSerializer(custom, context=self.context).data
            except CustomRequest.DoesNotExist:
                return None
        elif obj.request_type == 'direct':
            try:
                direct = obj.directrequest
                return DirectRequestSerializer(direct, context=self.context).data
            except DirectRequest.DoesNotExist:
                return None
        elif obj.request_type == 'emergency':
            try:
                emergency = obj.emergencyrequest
                return EmergencyRequestSerializer(emergency, context=self.context).data
            except EmergencyRequest.DoesNotExist:
                # Return empty emergency details if record doesn't exist
                return {
                    'id': None,
                    'description': None,
                    'concern_picture': None,
                    'providers_note': None
                }
        elif obj.request_type == 'broadcast':
            try:
                broadcast = obj.broadcast_request
                return BroadcastRequestDetailSerializer(broadcast, context=self.context).data
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


from . import models as booking_models


class QuotationItemSerializer(serializers.ModelSerializer):
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = booking_models.QuotationItem
        fields = ['id', 'service', 'service_add_on', 'description', 'quantity', 'unit_price', 'line_total']

    def get_line_total(self, obj):
        try:
            return float(obj.line_total)
        except Exception:
            return 0.0


class QuotationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    booking = serializers.IntegerField(read_only=True)
    mechanic = AccountBasicSerializer(read_only=True)
    notes = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    total_amount = serializers.FloatField(read_only=True)
    is_final = serializers.BooleanField(required=False)
    items = serializers.ListField(child=serializers.DictField(), required=False)

    def to_representation(self, instance):
        # instance is a Quotation model
        from .models import Quotation, QuotationItem
        data = {
            'id': instance.id,
            'booking': instance.booking.id,
            'mechanic': AccountBasicSerializer(instance.mechanic).data,
            'notes': instance.notes,
            'total_amount': float(instance.total_amount),
            'is_final': instance.is_final,
            'created_at': instance.created_at,
            'updated_at': instance.updated_at,
            'items': QuotationItemSerializer(QuotationItem.objects.filter(quotation=instance), many=True).data,
        }
        return data

    def create(self, validated_data):
        from .models import Quotation, QuotationItem
        request = self.context.get('request')
        booking = self.context.get('booking')
        mechanic = self.context.get('mechanic')

        items = validated_data.pop('items', []) if isinstance(validated_data, dict) else []

        quotation, _ = Quotation.objects.get_or_create(booking=booking, defaults={
            'mechanic': mechanic,
            'notes': validated_data.get('notes', ''),
            'is_final': validated_data.get('is_final', False),
        })

        # clear existing items and recreate
        QuotationItem.objects.filter(quotation=quotation).delete()
        total = 0
        for it in items:
            qitem = QuotationItem.objects.create(
                quotation=quotation,
                service_id=it.get('service') if it.get('service') else None,
                service_add_on_id=it.get('service_add_on') if it.get('service_add_on') else None,
                description=it.get('description', ''),
                quantity=it.get('quantity', 1),
                unit_price=it.get('unit_price', 0),
            )
            try:
                total += float(qitem.line_total)
            except Exception:
                pass

        quotation.total_amount = total
        quotation.notes = validated_data.get('notes', quotation.notes)
        quotation.is_final = validated_data.get('is_final', quotation.is_final)
        quotation.save()
        return quotation

    def update(self, instance, validated_data):
        from .models import QuotationItem
        items = validated_data.pop('items', []) if isinstance(validated_data, dict) else []
        QuotationItem.objects.filter(quotation=instance).delete()
        total = 0
        for it in items:
            qitem = QuotationItem.objects.create(
                quotation=instance,
                service_id=it.get('service') if it.get('service') else None,
                service_add_on_id=it.get('service_add_on') if it.get('service_add_on') else None,
                description=it.get('description', ''),
                quantity=it.get('quantity', 1),
                unit_price=it.get('unit_price', 0),
            )
            try:
                total += float(qitem.line_total)
            except Exception:
                pass

        instance.total_amount = total
        instance.notes = validated_data.get('notes', instance.notes)
        instance.is_final = validated_data.get('is_final', instance.is_final)
        instance.save()
        return instance
