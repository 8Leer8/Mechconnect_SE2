from rest_framework import serializers
from .models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest,
    ActiveBooking, ServiceLocation, DirectRequestAddOn, BroadcastRequest, BroadcastOffer,
    EmergencyRequestPhoto,
    RequestAssignment, Receipt, Quotation, QuotationItem
)
from services.models import Service, ServiceAddOn
from users.models import Account, Client
from shops.models import Shop
from MainBackend.storage_utils import get_media_url
from .backjob_utils import booking_has_backjob


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
    vehicle_description = serializers.CharField(source='request.vehicle_description', read_only=True, allow_null=True)
    concern_pictures = serializers.SerializerMethodField()
    
    class Meta:
        model = EmergencyRequest
        fields = ['id', 'description', 'vehicle_description', 'concern_picture', 'concern_pictures', 'providers_note']
    
    def get_concern_picture(self, obj):
        """Return full URL for concern picture"""
        if obj.concern_picture:
            request = self.context.get('request')
            return get_media_url(obj.concern_picture, request)
        return None

    def get_concern_pictures(self, obj):
        request = self.context.get('request')
        photos = EmergencyRequestPhoto.objects.filter(emergency_request=obj).order_by('id')
        return [get_media_url(photo.photo, request) for photo in photos if photo.photo]


class BroadcastRequestDetailSerializer(serializers.ModelSerializer):
    services = ServiceBasicSerializer(many=True, read_only=True)
    add_ons = serializers.SerializerMethodField()
    vehicle_type = serializers.CharField(source='request.vehicle_type', read_only=True, allow_null=True)
    vehicle_brand = serializers.CharField(source='request.vehicle_brand', read_only=True, allow_null=True)
    vehicle_model = serializers.CharField(source='request.vehicle_model', read_only=True, allow_null=True)
    
    class Meta:
        model = BroadcastRequest
        fields = ['id', 'description', 'concern_picture', 'status', 'services', 'add_ons', 'expires_at',
                  'vehicle_type', 'vehicle_brand', 'vehicle_model']
    
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
    type = serializers.CharField(source='request_type', read_only=True)
    broadcast_request = serializers.SerializerMethodField()
    client = AccountBasicSerializer(source='client.account', read_only=True)
    provider = AccountBasicSerializer(read_only=True)
    shop = ShopBasicSerializer(read_only=True)
    service_location = ServiceLocationSerializer(read_only=True)
    request_details = serializers.SerializerMethodField()
    assigned_mechanics = RequestAssignmentSerializer(source='assignments', many=True, read_only=True)
    vehicle_type = serializers.CharField(read_only=True, allow_null=True)
    vehicle_brand = serializers.CharField(read_only=True, allow_null=True)
    vehicle_model = serializers.CharField(read_only=True, allow_null=True)
    vehicle_description = serializers.CharField(read_only=True, allow_null=True)
    
    class Meta:
        model = Request
        fields = ['id', 'type', 'request_type', 'broadcast_request', 'client', 'provider', 'shop',
                  'service_location', 'vehicle_type', 'vehicle_brand', 'vehicle_model',
                  'vehicle_description', 'created_at', 'request_details', 'assigned_mechanics']

    def get_broadcast_request(self, obj):
        if not hasattr(obj, 'broadcast_request') or obj.broadcast_request is None:
            return None
        br = obj.broadcast_request
        return {
            'latitude': float(br.latitude) if br.latitude is not None else None,
            'longitude': float(br.longitude) if br.longitude is not None else None,
        }
    
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


class QuotationItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    line_total = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()

    class Meta:
        model = QuotationItem
        fields = [
            'id',
            'description',
            'quantity',
            'unit_price',
            'line_total',
            'status',
            'service_name',
        ]

    def get_line_total(self, obj):
        return obj.line_total

    def get_status(self, obj):
        return obj.status

    def get_service_name(self, obj):
        if obj.service:
            return obj.service.name
        if obj.service_add_on:
            return obj.service_add_on.name
        return None


class QuotationDetailSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True, read_only=True)
    mechanic = AccountBasicSerializer(read_only=True)

    class Meta:
        model = Quotation
        fields = ['id', 'status', 'notes', 'total_amount', 'is_final', 'items', 'mechanic', 'created_at', 'updated_at']


class BookingSerializer(serializers.ModelSerializer):
    request = RequestSerializer(read_only=True)
    active_details = serializers.SerializerMethodField()
    estimated_eta_minutes = serializers.IntegerField(source='eta_minutes', read_only=True)
    traffic_level = serializers.SerializerMethodField()
    quotation = serializers.SerializerMethodField()
    vehicle_type = serializers.SerializerMethodField()
    base_fee = serializers.SerializerMethodField()
    services_list = serializers.SerializerMethodField()
    vehicle_information = serializers.SerializerMethodField()
    payment_breakdown = serializers.SerializerMethodField()
    quotation_details = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            'id', 'request', 'status', 'dispute_status', 'amount_fee', 'convenience_fee',
            'distance_km', 'estimated_eta_minutes', 'traffic_level', 'traffic_surcharge',
            'booked_at', 'updated_at', 'completed_at', 'active_details', 'quotation',
            'vehicle_type', 'base_fee', 'services_list', 'vehicle_information',
            'payment_breakdown', 'quotation_details'
        ]
        read_only_fields = ['id', 'request', 'amount_fee', 'booked_at', 'updated_at', 'completed_at', 'active_details']

    def get_active_details(self, obj):
        # Show active details for statuses where mechanic may need them
        if obj.status in [
            'active', 'on_the_way', 'at_location', 'diagnosing', 'accepted', 'paused', 'finished', 'pending_payment',
        ]:
            try:
                active = obj.activebooking
                return ActiveBookingSerializer(active).data
            except ActiveBooking.DoesNotExist:
                return None
        return None

    def get_traffic_level(self, obj):
        if not hasattr(obj, 'request') or not hasattr(obj.request, 'broadcast_request'):
            return None
        offer = BroadcastOffer.objects.filter(
            broadcast_request=obj.request.broadcast_request,
            status=BroadcastOffer.Status.ACCEPTED,
        ).order_by('-responded_at', '-id').first()
        return offer.traffic_level if offer and offer.traffic_level else None

    def get_quotation(self, obj):
        try:
            quotation = obj.quotation
            return QuotationDetailSerializer(quotation).data
        except Quotation.DoesNotExist:
            return None

    def get_vehicle_type(self, obj):
        if hasattr(obj, 'request') and obj.request:
            return obj.request.vehicle_type
        return None

    def get_base_fee(self, obj):
        """Calculate base fee by subtracting distance and traffic surcharges from convenience fee"""
        if obj.convenience_fee is None:
            return None
        distance_fee = (obj.distance_km or 0) * 10  # Assuming 10 per km rate
        traffic_fee = obj.traffic_surcharge or 0
        return obj.convenience_fee - distance_fee - traffic_fee

    def get_services_list(self, obj):
        """Return list of service names for both Broadcast and Direct requests"""
        if not hasattr(obj, 'request') or not obj.request:
            return []

        request = obj.request

        # Handle BroadcastRequest - multiple services
        if hasattr(request, 'broadcast_request') and request.broadcast_request:
            services = request.broadcast_request.services.all()
            return [service.name for service in services]

        # Handle DirectRequest - single service
        if hasattr(request, 'directrequest') and request.directrequest:
            service = request.directrequest.service
            if service:
                return [service.name]

        return []

    def get_vehicle_information(self, obj):
        """Combine vehicle brand, model, and type into a single string"""
        if not hasattr(obj, 'request') or not obj.request:
            return None

        request = obj.request
        parts = []

        if request.vehicle_brand:
            parts.append(request.vehicle_brand)
        if request.vehicle_model:
            parts.append(request.vehicle_model)
        if request.vehicle_type:
            parts.append(f"({request.vehicle_type})")

        return " ".join(parts) if parts else None

    def get_payment_breakdown(self, obj):
        """Return payment breakdown details"""
        convenience_fee = obj.convenience_fee or 0
        total_fee = obj.amount_fee or 0
        return {
            'distance_km': obj.distance_km,
            'traffic_surcharge': obj.traffic_surcharge,
            'convenience_fee_total': obj.convenience_fee,
            'service_fee': total_fee - convenience_fee,
            'total_fee': obj.amount_fee,
        }

    def get_quotation_details(self, obj):
        """Return quotation details if exists"""
        try:
            quotation = obj.quotation
            items = []
            for item in quotation.items.all():
                items.append({
                    'description': item.description or (item.service.name if item.service else ''),
                    'quantity': item.quantity,
                    'unit_price': item.unit_price,
                    'line_total': item.line_total,
                })
            return {
                'total_amount': quotation.total_amount,
                'items': items,
            }
        except Quotation.DoesNotExist:
            return None

    def update(self, instance, validated_data):
        # Allow status update via PATCH
        status = validated_data.get('status', None)
        if status and status in [choice[0] for choice in instance.Status.choices]:
            instance.status = status
            instance.save()
        return instance


class BookingPaymentSerializer(serializers.Serializer):
    """Serializer for client payment selection (cash | gcash | maya).
    This endpoint only records the chosen method and performs the simple
    status transition logic implemented in the view.
    """
    payment_method = serializers.ChoiceField(choices=['cash', 'gcash', 'maya'])
    receipt_image = serializers.ImageField(required=False, allow_null=True)

    def validate_payment_method(self, value):
        if value not in ('cash', 'gcash', 'maya'):
            raise serializers.ValidationError('Invalid payment method')
        return value


class HomePageSerializer(serializers.Serializer):
    current_bookings = BookingSerializer(many=True, read_only=True)
    pending_requests = RequestSerializer(many=True, read_only=True)


class BroadcastRequestSerializer(serializers.ModelSerializer):
    """Serializer for broadcast requests on mechanic map"""
    services = ServiceBasicSerializer(many=True, read_only=True)
    add_ons = serializers.SerializerMethodField()
    concern_picture = serializers.SerializerMethodField()
    required_tokens = serializers.SerializerMethodField()
    my_offer_id = serializers.SerializerMethodField()
    my_offer_status = serializers.SerializerMethodField()
    search_radius_km = serializers.FloatField(read_only=True)
    radius_km = serializers.SerializerMethodField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    vehicle_type = serializers.CharField(source='request.vehicle_type', read_only=True, allow_null=True)
    vehicle_brand = serializers.CharField(source='request.vehicle_brand', read_only=True, allow_null=True)
    vehicle_model = serializers.CharField(source='request.vehicle_model', read_only=True, allow_null=True)
    
    class Meta:
        model = BroadcastRequest
        fields = [
            'id', 'description', 'latitude', 'longitude', 
            'vehicle_type', 'vehicle_brand', 'vehicle_model',
            'services', 'add_ons', 'search_radius_km', 'radius_km',
            'created_at', 'expires_at', 'accepted_at',
            'status', 'concern_picture', 'required_tokens',
            'my_offer_id', 'my_offer_status',
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

    def get_radius_km(self, obj):
        # Backward-compatible alias used by some mobile screens.
        return float(obj.search_radius_km or 0)

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

    def _get_current_mechanic_offer(self, obj):
        request = self.context.get('request')
        if not request:
            return None

        account_id = getattr(request, 'session', {}).get('account_id') if hasattr(request, 'session') else None
        if not account_id:
            return None

        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return None

        if not hasattr(account, 'mechanic'):
            return None

        return BroadcastOffer.objects.filter(
            broadcast_request=obj,
            mechanic=account.mechanic,
        ).order_by('-created_at', '-id').first()

    def get_my_offer_id(self, obj):
        offer = self._get_current_mechanic_offer(obj)
        return offer.id if offer else None

    def get_my_offer_status(self, obj):
        offer = self._get_current_mechanic_offer(obj)
        return offer.status if offer else None


class BroadcastOfferSerializer(serializers.ModelSerializer):
    """Serializer for broadcast offers"""
    mechanic = AccountBasicSerializer(source='mechanic.account', read_only=True)
    mechanic_rating = serializers.SerializerMethodField()
    distance_km = serializers.SerializerMethodField()
    estimated_price = serializers.SerializerMethodField()
    convenience_fee = serializers.SerializerMethodField()
    estimated_eta_minutes = serializers.SerializerMethodField()
    
    class Meta:
        model = BroadcastOffer
        fields = [
            'id',
            'broadcast_request',
            'mechanic',
            'mechanic_rating',
            'status',
            'distance_km',
            'estimated_price',
            'convenience_fee',
            'estimated_eta_minutes',
            'created_at',
            'responded_at',
        ]

    def get_mechanic_rating(self, obj):
        try:
            rating = getattr(obj.mechanic, 'average_rating', None)
            if rating is None:
                return None
            rating_value = float(rating)
            return round(rating_value, 2) if rating_value > 0 else None
        except Exception:
            return None

    def get_distance_km(self, obj):
        try:
            return float(obj.distance_km) if obj.distance_km is not None else None
        except Exception:
            return None

    def get_estimated_price(self, obj):
        try:
            return float(obj.estimated_price) if obj.estimated_price is not None else None
        except Exception:
            return None

    def get_convenience_fee(self, obj):
        try:
            return float(obj.convenience_fee) if obj.convenience_fee is not None else None
        except Exception:
            return None

    def get_estimated_eta_minutes(self, obj):
        try:
            return int(obj.estimated_eta_minutes) if obj.estimated_eta_minutes is not None else None
        except Exception:
            return None


from . import models as booking_models


class QuotationItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    line_total = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = booking_models.QuotationItem
        fields = [
            'id',
            'line_kind',
            'source',
            'purchase_receipt_image',
            'receipt_submitted_at',
            'service',
            'service_add_on',
            'description',
            'quantity',
            'unit_price',
            'line_total',
            'status',
            'change_type',
            'previous_description',
            'previous_quantity',
            'previous_unit_price',
        ]

    def get_line_total(self, obj):
        try:
            return float(obj.line_total)
        except Exception:
            return 0.0

    def get_status(self, obj):
        try:
            # Prefer per-item status if present, otherwise fall back to parent quotation
            if hasattr(obj, 'status') and obj.status is not None:
                return obj.status
            return obj.quotation.status if hasattr(obj, 'quotation') and obj.quotation is not None else None
        except Exception:
            return None


def _quotation_line_shape(raw, existing_item=None):
    """Pick line_kind, source, and quantity for a quotation row (service vs item)."""
    QI = booking_models.QuotationItem
    lk = raw.get('line_kind')
    if lk is None and existing_item is not None:
        lk = getattr(existing_item, 'line_kind', None)
    lk = str(lk or QI.LineKind.ITEM).lower()
    if lk not in (QI.LineKind.SERVICE, QI.LineKind.ITEM):
        lk = QI.LineKind.ITEM
    if lk == QI.LineKind.SERVICE:
        return lk, None, 1
    allowed_src = {c[0] for c in QI.ItemSource.choices}
    src = raw.get('source')
    if src is None and existing_item is not None:
        src = getattr(existing_item, 'source', None)
    if src not in allowed_src:
        src = QI.ItemSource.ON_HAND
    qty = raw.get('quantity')
    if qty is None and existing_item is not None:
        qty = existing_item.quantity
    try:
        qty = max(1, int(qty or 1))
    except Exception:
        qty = 1
    return lk, src, qty


class QuotationSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    booking = serializers.IntegerField(read_only=True)
    mechanic = AccountBasicSerializer(read_only=True)
    status = serializers.CharField(read_only=True)
    notes = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    total_amount = serializers.FloatField(read_only=True)
    is_final = serializers.BooleanField(required=False)
    items = serializers.ListField(child=serializers.DictField(), required=False)

    def to_representation(self, instance):
        # instance is a Quotation model
        from .models import Quotation, QuotationItem
        if str(getattr(instance, 'status', '')).lower() == Quotation.Status.PENDING:
            visible_items_qs = QuotationItem.objects.filter(quotation=instance)
        else:
            visible_items_qs = QuotationItem.objects.filter(quotation=instance).exclude(status='rejected')
        data = {
            'id': instance.id,
            'booking': instance.booking.id,
            'mechanic': AccountBasicSerializer(instance.mechanic).data,
            'notes': instance.notes,
            'status': instance.status,
            'is_backjob': bool(getattr(instance, 'is_backjob', False)),
            'original_labor_cost': float(getattr(instance, 'original_labor_cost', 0) or 0),
            'backjob_discount': float(getattr(instance, 'backjob_discount', 0) or 0),
            'final_labor_total': float(getattr(instance, 'final_labor_total', 0) or 0),
            'total_amount': float(instance.total_amount),
            'is_final': instance.is_final,
            'created_at': instance.created_at,
            'updated_at': instance.updated_at,
            'items': QuotationItemSerializer(visible_items_qs, many=True).data,
        }
        return data

    def create(self, validated_data):
        from .models import Quotation, QuotationItem
        request = self.context.get('request')
        booking = self.context.get('booking')
        mechanic = self.context.get('mechanic')

        def get_requested_service_ids(bk):
            ids = set()
            try:
                req = getattr(bk, 'request', None)
                if req is None:
                    return ids
                if hasattr(req, 'directrequest') and req.directrequest and req.directrequest.service_id:
                    ids.add(int(req.directrequest.service_id))
                if hasattr(req, 'broadcast_request') and req.broadcast_request:
                    for svc in req.broadcast_request.services.all():
                        try:
                            ids.add(int(svc.id))
                        except Exception:
                            continue
            except Exception:
                pass
            return ids

        items = validated_data.pop('items', []) if isinstance(validated_data, dict) else []

        quotation, _ = Quotation.objects.get_or_create(booking=booking, defaults={
            'mechanic': mechanic,
            'notes': validated_data.get('notes', ''),
            'is_final': validated_data.get('is_final', False),
            'status': Quotation.Status.PENDING,
            'is_backjob': booking_has_backjob(booking),
        })
        quotation.is_backjob = booking_has_backjob(booking)
        requested_service_ids = get_requested_service_ids(booking)
        # If quotation is newly created, create provided items; if it already exists, append/update items without deleting existing ones
        total = 0
        existing_items = {it.id: it for it in QuotationItem.objects.filter(quotation=quotation)}
        for it in items:
            if it.get('id') and int(it.get('id')) in existing_items:
                # update existing item (preserve status unless explicitly provided)
                qitem = existing_items[int(it.get('id'))]
                qitem.service_id = it.get('service') if it.get('service') is not None else qitem.service_id
                qitem.service_add_on_id = it.get('service_add_on') if it.get('service_add_on') is not None else qitem.service_add_on_id
                if 'description' in it:
                    qitem.description = it.get('description', qitem.description)
                if 'unit_price' in it:
                    qitem.unit_price = it.get('unit_price', qitem.unit_price)
                merge_for_shape = {
                    'line_kind': it.get('line_kind', qitem.line_kind),
                    'source': it.get('source', qitem.source),
                    'quantity': it.get('quantity', qitem.quantity),
                }
                lk, src, qty = _quotation_line_shape(merge_for_shape, qitem)
                qitem.line_kind = lk
                qitem.source = src
                qitem.quantity = qty
                if 'status' in it:
                    qitem.status = it.get('status') or qitem.status
                if qitem.status != Quotation.Status.PENDING:
                    qitem.change_type = None
                    qitem.previous_description = None
                    qitem.previous_quantity = None
                    qitem.previous_unit_price = None
                qitem.save()
            else:
                # create new item (defaults to pending)
                service_id = it.get('service') if it.get('service') else None
                lk, src, qty = _quotation_line_shape(it, None)
                is_booked_service = (
                    lk == QuotationItem.LineKind.SERVICE
                    and service_id
                    and int(service_id) in requested_service_ids
                )
                default_status = Quotation.Status.ACCEPTED if is_booked_service else Quotation.Status.PENDING
                qitem = QuotationItem.objects.create(
                    quotation=quotation,
                    line_kind=lk,
                    source=src,
                    service_id=service_id,
                    service_add_on_id=it.get('service_add_on') if it.get('service_add_on') else None,
                    description=it.get('description', ''),
                    quantity=qty,
                    unit_price=it.get('unit_price', 0),
                    status=default_status,
                    change_type='added' if default_status == Quotation.Status.PENDING else None,
                )
            try:
                total += float(qitem.line_total)
            except Exception:
                pass

        quotation.recalculate_totals()
        quotation.notes = validated_data.get('notes', quotation.notes)
        quotation.is_final = validated_data.get('is_final', quotation.is_final)
        try:
            has_pending_like = quotation.items.filter(status__in=[Quotation.Status.PENDING, Quotation.Status.REJECTED]).exists()
            quotation.status = Quotation.Status.PENDING if has_pending_like else Quotation.Status.ACCEPTED
        except Exception:
            pass
        quotation.save()
        return quotation

    def update(self, instance, validated_data):
        from .models import Quotation, QuotationItem

        def get_requested_service_ids(bk):
            ids = set()
            try:
                req = getattr(bk, 'request', None)
                if req is None:
                    return ids
                if hasattr(req, 'directrequest') and req.directrequest and req.directrequest.service_id:
                    ids.add(int(req.directrequest.service_id))
                if hasattr(req, 'broadcast_request') and req.broadcast_request:
                    for svc in req.broadcast_request.services.all():
                        try:
                            ids.add(int(svc.id))
                        except Exception:
                            continue
            except Exception:
                pass
            return ids

        requested_service_ids = get_requested_service_ids(instance.booking)
        instance.is_backjob = booking_has_backjob(instance.booking)
        items_data = validated_data.pop('items', []) if isinstance(validated_data, dict) else []

        # load existing items mapping
        existing_items_qs = QuotationItem.objects.filter(quotation=instance)
        existing_items = {it.id: it for it in existing_items_qs}

        incoming_ids = set()

        for raw in items_data:
            try:
                item_id = int(raw.get('id')) if raw.get('id') is not None else None
            except Exception:
                item_id = None

            desc = raw.get('description') or raw.get('name') or 'Item'
            if item_id and item_id in existing_items:
                qitem = existing_items[item_id]
                existing_status = str(qitem.status or '').lower()
                existing_desc = qitem.description or ''
                existing_qty = int(qitem.quantity or 0)
                existing_price = float(qitem.unit_price or 0)
                existing_service = qitem.service_id
                existing_add_on = qitem.service_add_on_id
                existing_line_kind = getattr(qitem, 'line_kind', QuotationItem.LineKind.ITEM)
                existing_source = getattr(qitem, 'source', None)

                qitem.service_id = raw.get('service') if raw.get('service') is not None else qitem.service_id
                qitem.service_add_on_id = raw.get('service_add_on') if raw.get('service_add_on') is not None else qitem.service_add_on_id
                if 'description' in raw:
                    qitem.description = raw.get('description', qitem.description)
                if 'unit_price' in raw:
                    qitem.unit_price = raw.get('unit_price', qitem.unit_price)
                shape_merge = {
                    'line_kind': raw.get('line_kind', qitem.line_kind),
                    'source': raw.get('source', qitem.source),
                    'quantity': raw.get('quantity', qitem.quantity),
                }
                lk, src, qty = _quotation_line_shape(shape_merge, qitem)
                qitem.line_kind = lk
                qitem.source = src
                qitem.quantity = qty
                changed = (
                    (qitem.description or '') != existing_desc or
                    int(qitem.quantity or 0) != existing_qty or
                    float(qitem.unit_price or 0) != existing_price or
                    qitem.service_id != existing_service or
                    qitem.service_add_on_id != existing_add_on or
                    str(existing_line_kind or '') != str(qitem.line_kind or '') or
                    (existing_source or '') != (qitem.source or '')
                )
                # Preserve existing status unless payload explicitly provides a non-null value
                if 'status' in raw:
                    incoming_status = raw.get('status', qitem.status)
                    qitem.status = incoming_status if incoming_status is not None else qitem.status
                    if existing_status == 'accepted' and changed and str(qitem.status or '').lower() == Quotation.Status.PENDING:
                        qitem.previous_description = existing_desc
                        qitem.previous_quantity = existing_qty
                        qitem.previous_unit_price = existing_price
                        qitem.change_type = 'edited'
                    elif existing_status == 'rejected' and str(qitem.status or '').lower() == Quotation.Status.PENDING:
                        qitem.change_type = 'added'
                        qitem.previous_description = None
                        qitem.previous_quantity = None
                        qitem.previous_unit_price = None
                    elif existing_status == 'pending' and changed and str(qitem.change_type or '').lower() != 'added':
                        qitem.change_type = 'edited'
                else:
                    # If an already accepted item is edited, turn it into a pending proposal.
                    if existing_status == 'accepted' and changed:
                        qitem.previous_description = existing_desc
                        qitem.previous_quantity = existing_qty
                        qitem.previous_unit_price = existing_price
                        qitem.change_type = 'edited'
                        qitem.status = Quotation.Status.PENDING
                    elif existing_status == 'rejected':
                        # Re-including a previously removed row means mechanic is proposing
                        # to restore/edit it in this pending request.
                        qitem.change_type = 'added'
                        qitem.previous_description = None
                        qitem.previous_quantity = None
                        qitem.previous_unit_price = None
                        qitem.status = Quotation.Status.PENDING
                    elif existing_status == 'pending' and changed and str(qitem.change_type or '').lower() != 'added':
                        qitem.change_type = 'edited'

                if str(qitem.status or '').lower() != Quotation.Status.PENDING:
                    qitem.change_type = None
                    qitem.previous_description = None
                    qitem.previous_quantity = None
                    qitem.previous_unit_price = None
                qitem.save()
                incoming_ids.add(item_id)
            else:
                service_id = raw.get('service') if raw.get('service') else None
                lk, src, qty = _quotation_line_shape(raw, None)
                is_booked_service = (
                    lk == QuotationItem.LineKind.SERVICE
                    and service_id
                    and int(service_id) in requested_service_ids
                )
                # Do not duplicate baseline booked service rows.
                if is_booked_service:
                    existing_service_row = QuotationItem.objects.filter(
                        quotation=instance,
                        line_kind=QuotationItem.LineKind.SERVICE,
                        service_id=service_id,
                    ).exclude(id__in=incoming_ids).order_by('id').first()
                    if existing_service_row is not None:
                        if 'description' in raw:
                            existing_service_row.description = raw.get('description', existing_service_row.description)
                        if 'unit_price' in raw:
                            existing_service_row.unit_price = raw.get('unit_price', existing_service_row.unit_price)
                        existing_service_row.quantity = 1
                        existing_service_row.source = None
                        existing_service_row.save()
                        incoming_ids.add(existing_service_row.id)
                        continue
                default_status = Quotation.Status.ACCEPTED if is_booked_service else Quotation.Status.PENDING
                qitem = QuotationItem.objects.create(
                    quotation=instance,
                    line_kind=lk,
                    source=src,
                    service_id=service_id,
                    service_add_on_id=raw.get('service_add_on') if raw.get('service_add_on') else None,
                    description=raw.get('description', ''),
                    quantity=qty,
                    unit_price=raw.get('unit_price', 0),
                    status=default_status,
                    change_type='added' if default_status == Quotation.Status.PENDING else None,
                )
                # if payload included a status explicitly, set it
                if 'status' in raw and raw.get('status') is not None:
                    qitem.status = raw.get('status')
                    if str(qitem.status or '').lower() != Quotation.Status.PENDING:
                        qitem.change_type = None
                        qitem.previous_description = None
                        qitem.previous_quantity = None
                        qitem.previous_unit_price = None
                    qitem.save()
                incoming_ids.add(qitem.id)

        # Handle existing items that are missing from payload:
        # - accepted rows: treat as a removal proposal (mark rejected), not hard delete
        # - non-accepted rows: safe to hard delete
        try:
            missing_ids = [eid for eid in existing_items.keys() if eid not in incoming_ids]
            if missing_ids:
                to_mark_removed = []
                to_delete = []
                for mid in missing_ids:
                    ex = existing_items.get(mid)
                    if (
                        ex
                        and str(getattr(ex, 'line_kind', '') or '') == QuotationItem.LineKind.SERVICE
                        and getattr(ex, 'service_id', None) in requested_service_ids
                        and str(getattr(ex, 'status', '') or '').lower() == Quotation.Status.ACCEPTED
                    ):
                        # Keep baseline booked service rows stable across later edits.
                        continue
                    if str(getattr(ex, 'status', '') or '').lower() == Quotation.Status.ACCEPTED:
                        to_mark_removed.append(mid)
                    else:
                        to_delete.append(mid)

                if to_mark_removed:
                    QuotationItem.objects.filter(id__in=to_mark_removed).update(
                        status=Quotation.Status.REJECTED,
                        change_type='removed',
                    )

                if to_delete:
                    QuotationItem.objects.filter(id__in=to_delete).delete()
        except Exception:
            pass

        # Recalculate total
        instance.recalculate_totals()
        instance.notes = validated_data.get('notes', instance.notes)
        instance.is_final = validated_data.get('is_final', instance.is_final)
        # If status is explicitly provided, honor it.
        # Otherwise derive from item-level statuses.
        if 'status' in validated_data:
            try:
                instance.status = validated_data.get('status')
            except Exception:
                pass
        elif items_data:
            try:
                has_pending_like = QuotationItem.objects.filter(
                    quotation=instance,
                    status__in=[Quotation.Status.PENDING, Quotation.Status.REJECTED],
                ).exists()
                instance.status = Quotation.Status.PENDING if has_pending_like else Quotation.Status.ACCEPTED
            except Exception:
                instance.status = Quotation.Status.PENDING
        instance.save()
        return instance
