from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Request, Booking, DisputeBooking, BroadcastRequest, BroadcastOffer, ActiveBooking
from users.permissions import IsAdmin
from users.models import Account


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_booking_overview(request):
    unresolved_statuses = [
        DisputeBooking.Status.ACTIVE,
        DisputeBooking.Status.UNDER_ADMIN_REVIEW,
        DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT,
        DisputeBooking.Status.WAITING_FOR_CLIENT_VERIFICATION,
    ]
    data = {
        'requests_total': Request.objects.count(),
        'bookings_total': Booking.objects.count(),
        'active_bookings': Booking.objects.filter(status=Booking.Status.ACTIVE).count(),
        'completed_bookings': Booking.objects.filter(status=Booking.Status.COMPLETED).count(),
        'disputed_bookings': Booking.objects.filter(dispute_status=Booking.DisputeState.ACTIVE).count(),
        'pending_disputes': DisputeBooking.objects.filter(status__in=unresolved_statuses).count(),
        'broadcast_searching': BroadcastRequest.objects.filter(status=BroadcastRequest.Status.SEARCHING).count(),
        'broadcast_offers_total': BroadcastOffer.objects.count(),
    }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_disputes(request):
    queryset = DisputeBooking.objects.select_related(
        'booking',
        'complainer',
        'complaint_against',
        'refund_receiver',
    ).order_by('-created_at')

    status_filter = request.GET.get('status')
    q = request.GET.get('q')

    if status_filter in {
        DisputeBooking.Status.ACTIVE,
        DisputeBooking.Status.UNDER_ADMIN_REVIEW,
        DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT,
        DisputeBooking.Status.WAITING_FOR_CLIENT_VERIFICATION,
        DisputeBooking.Status.RESOLVED_REFUNDED,
        DisputeBooking.Status.RESOLVED_DISMISSED,
        DisputeBooking.Status.RESOLVED_VOUCHER,
    }:
        queryset = queryset.filter(status=status_filter)

    if q:
        queryset = queryset.filter(
            Q(issue_description__icontains=q)
            | Q(complainer__username__icontains=q)
            | Q(complaint_against__username__icontains=q)
        )

    queryset = queryset[:200]

    results = []
    for dispute in queryset:
        # Get before/after pictures from ActiveBooking
        before_picture = None
        after_picture = None
        try:
            active_booking = ActiveBooking.objects.get(booking=dispute.booking)
            if active_booking.before_picture_service:
                before_picture = active_booking.before_picture_service.url
            if active_booking.after_picture_service:
                after_picture = active_booking.after_picture_service.url
        except ActiveBooking.DoesNotExist:
            pass

        results.append(
            {
                'id': dispute.id,
                'booking_id': dispute.booking_id,
                'status': dispute.status,
                'issue_description': dispute.issue_description,
                'issue_picture': dispute.issue_picture.url if dispute.issue_picture else None,
                'complainer': dispute.complainer.username,
                'complaint_against': dispute.complaint_against.username,
                'mechanic_defense_description': dispute.mechanic_defense_description,
                'mechanic_defense_picture': dispute.mechanic_defense_picture.url if dispute.mechanic_defense_picture else None,
                'refund_receipt_image': dispute.refund_receipt_image.url if dispute.refund_receipt_image else None,
                'amount_refunded': dispute.amount_refunded,
                'created_at': dispute.created_at,
                'resolved_at': dispute.resolved_at,
                'before_picture': before_picture,
                'after_picture': after_picture,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAdmin])
def admin_resolve_dispute(request, dispute_id):
    """Admin mediation decision: dismiss, voucher fallback, request payment proof, or force verify receipt."""
    try:
        dispute = DisputeBooking.objects.select_related('booking', 'booking__request__provider').get(id=dispute_id)
    except DisputeBooking.DoesNotExist:
        return Response({'error': 'Dispute not found'}, status=status.HTTP_404_NOT_FOUND)

    booking = dispute.booking
    if booking.dispute_status != Booking.DisputeState.ACTIVE:
        return Response({'error': 'Dispute is not active'}, status=status.HTTP_400_BAD_REQUEST)

    action = str(request.data.get('action', '')).strip().lower()
    if action not in {'dismiss', 'voucher', 'request_payment', 'force_verify'}:
        return Response({'error': "action must be one of: dismiss, voucher, request_payment, force_verify"}, status=status.HTTP_400_BAD_REQUEST)

    resolution_notes = str(request.data.get('resolution_notes', '')).strip()

    authenticated_account = getattr(request, 'user', None)
    if not getattr(authenticated_account, 'is_authenticated', False):
        authenticated_account = None

    account_id = request.session.get('account_id') or getattr(authenticated_account, 'id', None)
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        if authenticated_account is not None and getattr(authenticated_account, 'id', None) == account_id:
            admin_account = authenticated_account
        else:
            admin_account = Account.objects.get(id=account_id)

        if not hasattr(admin_account, 'admin'):
            return Response({'error': 'Only admins can resolve disputes'}, status=status.HTTP_403_FORBIDDEN)
    except Account.DoesNotExist:
        return Response({'error': 'Admin account not found'}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        dispute.admin = admin_account.admin
        dispute.resolution_notes = resolution_notes

        unlock_mechanic = False
        if action == 'dismiss':
            dispute.status = DisputeBooking.Status.RESOLVED_DISMISSED
            dispute.resolved_at = timezone.now()
            booking.dispute_status = Booking.DisputeState.RESOLVED
            unlock_mechanic = True
        elif action == 'voucher':
            dispute.status = DisputeBooking.Status.RESOLVED_VOUCHER
            dispute.resolved_at = timezone.now()
            booking.dispute_status = Booking.DisputeState.RESOLVED
        elif action == 'force_verify':
            dispute.status = DisputeBooking.Status.RESOLVED_REFUNDED
            dispute.resolved_at = timezone.now()
            dispute.is_client_verified = True
            booking.dispute_status = Booking.DisputeState.RESOLVED
            unlock_mechanic = True
        else:
            dispute.status = DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT
            dispute.resolved_at = None

        dispute_update_fields = ['admin', 'resolution_notes', 'status', 'resolved_at']
        if action == 'force_verify':
            dispute_update_fields.append('is_client_verified')

        dispute.save(update_fields=dispute_update_fields)
        booking.save(update_fields=['dispute_status', 'updated_at'])

        provider = booking.request.provider
        if unlock_mechanic and provider is not None and hasattr(provider, 'mechanic'):
            provider.mechanic.is_locked = False
            provider.mechanic.save(update_fields=['is_locked'])

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is not None:
            payload = {
                'type': 'booking_update',
                'action': 'booking.dispute_payment_requested' if action == 'request_payment' else 'booking.dispute_resolved',
                'booking_id': booking.id,
                'status': booking.status,
                'dispute_status': booking.dispute_status,
                'message': 'Admin updated dispute status',
            }
            targets = {
                booking.request.client.account_id if booking.request and booking.request.client else None,
                booking.request.provider_id if booking.request else None,
            }
            for target in targets:
                if target:
                    async_to_sync(channel_layer.group_send)(f'user_{target}', payload)
    except Exception:
        pass

    return Response(
        {
            'message': 'Dispute decision applied',
            'dispute': {
                'id': dispute.id,
                'status': dispute.status,
                'resolved_at': dispute.resolved_at.isoformat() if dispute.resolved_at else None,
            },
            'booking': {
                'id': booking.id,
                'dispute_status': booking.dispute_status,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_bookings(request):
    queryset = Booking.objects.select_related(
        'request__client__account',
        'request__provider',
        'request__shop',
        'request__service_location',
        'request__customrequest',
        'request__directrequest__service',
        'request__emergencyrequest',
        'request__broadcast_request',
    ).prefetch_related(
        'request__broadcast_request__services',
    ).order_by('-booked_at')

    q = request.GET.get('q')
    booking_status = request.GET.get('status')
    request_type = request.GET.get('request_type')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if q:
        queryset = queryset.filter(
            Q(request__client__account__username__icontains=q)
            | Q(request__provider__username__icontains=q)
            | Q(request__shop__shop_name__icontains=q)
        )

    if booking_status in {choice[0] for choice in Booking.Status.choices}:
        queryset = queryset.filter(status=booking_status)

    if request_type in {choice[0] for choice in Request.Type.choices}:
        queryset = queryset.filter(request__request_type=request_type)

    queryset = queryset[:limit]

    results = []
    for booking in queryset:
        request_obj = booking.request
        client_account = request_obj.client.account
        provider = request_obj.provider
        shop = request_obj.shop
        location = request_obj.service_location

        request_details = {}

        if request_obj.request_type == Request.Type.CUSTOM and hasattr(request_obj, 'customrequest'):
            custom_request = request_obj.customrequest
            request_details = {
                'description': custom_request.description,
                'request_status': custom_request.request_status,
                'quoted_price': custom_request.quoted_price,
                'providers_note': custom_request.providers_note,
                'photo_url': custom_request.concern_picture.url if custom_request.concern_picture else None,
            }
        elif request_obj.request_type == Request.Type.DIRECT and hasattr(request_obj, 'directrequest'):
            direct_request = request_obj.directrequest
            request_details = {
                'request_status': direct_request.request_status,
                'service_id': direct_request.service_id,
                'service_name': direct_request.service.name if direct_request.service else None,
                'photo_url': None,
            }
        elif request_obj.request_type == Request.Type.EMERGENCY and hasattr(request_obj, 'emergencyrequest'):
            emergency_request = request_obj.emergencyrequest
            request_details = {
                'description': emergency_request.description,
                'providers_note': emergency_request.providers_note,
                'photo_url': emergency_request.concern_picture.url if emergency_request.concern_picture else None,
            }
        elif request_obj.request_type == Request.Type.BROADCAST and hasattr(request_obj, 'broadcast_request'):
            broadcast_request = request_obj.broadcast_request
            selected_service_names = [service.name for service in broadcast_request.services.all()]
            request_details = {
                'description': broadcast_request.description,
                'status': broadcast_request.status,
                'service_names': selected_service_names,
                'service_name': ', '.join(selected_service_names) if selected_service_names else None,
                'latitude': float(broadcast_request.latitude) if broadcast_request.latitude is not None else None,
                'longitude': float(broadcast_request.longitude) if broadcast_request.longitude is not None else None,
                'expires_at': broadcast_request.expires_at,
                'accepted_at': broadcast_request.accepted_at,
                'photo_url': broadcast_request.concern_picture.url if broadcast_request.concern_picture else None,
            }

        # Build vehicle information string
        vehicle_parts = []
        if request_obj.vehicle_brand:
            vehicle_parts.append(request_obj.vehicle_brand)
        if request_obj.vehicle_model:
            vehicle_parts.append(request_obj.vehicle_model)
        if request_obj.vehicle_type:
            vehicle_parts.append(f"({request_obj.vehicle_type})")
        vehicle_information = " ".join(vehicle_parts) if vehicle_parts else None

        # Build services list
        services_list = []
        if request_obj.request_type == Request.Type.BROADCAST and hasattr(request_obj, 'broadcast_request'):
            services_list = [service.name for service in request_obj.broadcast_request.services.all()]
        elif request_obj.request_type == Request.Type.DIRECT and hasattr(request_obj, 'directrequest'):
            from ...direct_request_utils import iter_direct_request_services

            services_list = [s.name for s in iter_direct_request_services(request_obj) if getattr(s, "name", None)]

        # Build payment breakdown
        convenience_fee = booking.convenience_fee or 0
        distance_km = booking.distance_km or 0
        traffic_surcharge = booking.traffic_surcharge or 0
        total_fee = booking.amount_fee or 0
        base_fee = convenience_fee - (distance_km * 10) - traffic_surcharge if convenience_fee > 0 else 0

        payment_breakdown = {
            'distance_km': booking.distance_km,
            'traffic_surcharge': booking.traffic_surcharge,
            'convenience_fee_total': booking.convenience_fee,
            'service_fee': total_fee - convenience_fee,
            'total_fee': booking.amount_fee,
        }

        # Build quotation details
        quotation_details = None
        if hasattr(booking, 'quotation'):
            try:
                quotation = booking.quotation
                q_items = []
                for item in quotation.items.all():
                    q_items.append({
                        'description': item.description or (item.service.name if item.service else ''),
                        'quantity': item.quantity,
                        'unit_price': item.unit_price,
                        'line_total': item.line_total,
                    })
                quotation_details = {
                    'total_amount': quotation.total_amount,
                    'items': q_items,
                }
            except Exception:
                pass

        # Build receipt/payment info
        receipt_info = None
        if hasattr(booking, 'receipt'):
            try:
                receipt = booking.receipt
                receipt_info = {
                    'payment_method': receipt.payment_method,
                    'payment_received': receipt.payment_received,
                    'paid_at': receipt.paid_at,
                    'transaction_id': receipt.transaction_id,
                }
            except Exception:
                pass

        results.append(
            {
                'id': booking.id,
                'request_id': booking.request_id,
                'status': booking.status,
                'amount_fee': booking.amount_fee,
                'convenience_fee': booking.convenience_fee,
                'distance_km': booking.distance_km,
                'traffic_surcharge': booking.traffic_surcharge,
                'base_fee': base_fee,
                'booked_at': booking.booked_at,
                'completed_at': booking.completed_at,
                'request_created_at': request_obj.created_at,
                'client_id': client_account.id,
                'client_username': client_account.username,
                'provider_id': provider.id if provider else None,
                'provider_username': provider.username if provider else None,
                'shop_id': shop.id if shop else None,
                'shop_name': shop.shop_name if shop else None,
                'request_type': request_obj.request_type,
                'vehicle_information': vehicle_information,
                'services_list': services_list,
                'payment_breakdown': payment_breakdown,
                'quotation_details': quotation_details,
                'receipt_info': receipt_info,
                'service_location': {
                    'id': location.id,
                    'street_name': location.street_name,
                    'subdivision_village': location.subdivision_village,
                    'barangay': location.barangay,
                    'city_municipality': location.city_municipality,
                    'landmark': location.landmark,
                    'latitude': float(location.latitude) if location.latitude is not None else None,
                    'longitude': float(location.longitude) if location.longitude is not None else None,
                }
                if location
                else None,
                'request_details': request_details,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_requests(request):
    queryset = Request.objects.select_related(
        'client__account',
        'provider',
        'shop',
        'service_location',
    ).order_by('-created_at')

    q = request.GET.get('q')
    request_type = request.GET.get('request_type')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if q:
        queryset = queryset.filter(
            Q(client__account__username__icontains=q)
            | Q(provider__username__icontains=q)
            | Q(shop__shop_name__icontains=q)
        )

    if request_type in {choice[0] for choice in Request.Type.choices}:
        queryset = queryset.filter(request_type=request_type)

    queryset = queryset[:limit]

    results = []
    for request_obj in queryset:
        client_account = request_obj.client.account
        provider = request_obj.provider
        shop = request_obj.shop
        location = request_obj.service_location

        results.append(
            {
                'id': request_obj.id,
                'client_id': client_account.id,
                'client_username': client_account.username,
                'provider_id': provider.id if provider else None,
                'provider_username': provider.username if provider else None,
                'shop_id': shop.id if shop else None,
                'shop_name': shop.shop_name if shop else None,
                'request_type': request_obj.request_type,
                'created_at': request_obj.created_at,
                'service_location': {
                    'id': location.id,
                    'city_municipality': location.city_municipality,
                    'barangay': location.barangay,
                }
                if location
                else None,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)
