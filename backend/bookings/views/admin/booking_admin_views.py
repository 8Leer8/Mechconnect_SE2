from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Request, Booking, DisputeBooking, BroadcastRequest, BroadcastOffer
from users.permissions import IsAdmin


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_booking_overview(request):
    data = {
        'requests_total': Request.objects.count(),
        'bookings_total': Booking.objects.count(),
        'active_bookings': Booking.objects.filter(status=Booking.Status.ACTIVE).count(),
        'completed_bookings': Booking.objects.filter(status=Booking.Status.COMPLETED).count(),
        'disputed_bookings': Booking.objects.filter(status=Booking.Status.DISPUTED).count(),
        'pending_disputes': DisputeBooking.objects.filter(status=DisputeBooking.Status.PENDING).count(),
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
        DisputeBooking.Status.PENDING,
        DisputeBooking.Status.SOLVED,
        DisputeBooking.Status.REFUNDED,
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
        results.append(
            {
                'id': dispute.id,
                'booking_id': dispute.booking_id,
                'status': dispute.status,
                'issue_description': dispute.issue_description,
                'complainer': dispute.complainer.username,
                'complaint_against': dispute.complaint_against.username,
                'amount_refunded': dispute.amount_refunded,
                'created_at': dispute.created_at,
                'resolved_at': dispute.resolved_at,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


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

        results.append(
            {
                'id': booking.id,
                'request_id': booking.request_id,
                'status': booking.status,
                'amount_fee': booking.amount_fee,
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
