from rest_framework import serializers
from .models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest,
    ActiveBooking, ServiceLocation, DirectRequestAddOn
)
from services.models import Service, ServiceAddOn
from users.models import Account, Client


class ServiceLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceLocation
        fields = ['id', 'street_name', 'subdivision_village', 'barangay', 'city_municipality', 'landmark']


class ServiceBasicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Service
        fields = ['id', 'name', 'description', 'price']


class ServiceAddOnSerializer(serializers.ModelSerializer):
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
        return None


class ActiveBookingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActiveBooking
        fields = [
            'id', 'before_picture_service', 'is_job_done', 'after_picture_service',
            'is_rescheduled', 'reason', 'new_time', 'new_date', 'started_at'
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
    
    def get_active_details(self, obj):
        if obj.status == 'active':
            try:
                active = obj.activebooking
                return ActiveBookingSerializer(active).data
            except ActiveBooking.DoesNotExist:
                return None
        return None


class HomePageSerializer(serializers.Serializer):
    current_bookings = BookingSerializer(many=True, read_only=True)
    pending_requests = RequestSerializer(many=True, read_only=True)
