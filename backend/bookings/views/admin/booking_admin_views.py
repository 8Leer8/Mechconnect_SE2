from decimal import Decimal
from django.db.models import Q, Sum
from django.db.models.functions import TruncDate
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import (
    Request,
    Booking,
    DisputeBooking,
    BroadcastRequest,
    BroadcastOffer,
    ActiveBooking,
    Receipt,
    PaymentInstallment,
    PaymentTransaction,
)
from users.permissions import IsAdmin
from users.models import Account, Admin, Wallet, TokenPurchase


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _require_superadmin(request):
    account_id = request.session.get('account_id')

    authenticated_account = None
    if account_id:
        try:
            authenticated_account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            authenticated_account = None

    if authenticated_account is None:
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return None, Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        candidate_id = getattr(user, 'id', None)
        if not candidate_id:
            return None, Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            authenticated_account = Account.objects.get(id=candidate_id)
        except Account.DoesNotExist:
            return None, Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        if not authenticated_account.accountrole_set.filter(account_role='admin').exists():
            return None, Response({'error': 'Admin access is required'}, status=status.HTTP_403_FORBIDDEN)

        request.session['account_id'] = authenticated_account.id
        request.session['username'] = authenticated_account.username
        request.session['roles'] = list(authenticated_account.accountrole_set.values_list('account_role', flat=True))

    try:
        admin_profile = Admin.objects.get(account=authenticated_account)
    except Admin.DoesNotExist:
        return None, Response({'error': 'Admin profile not found'}, status=status.HTTP_403_FORBIDDEN)

    if not admin_profile.is_superadmin:
        return None, Response({'error': 'Only superadmins can access this endpoint'}, status=status.HTTP_403_FORBIDDEN)

    return admin_profile, None


def _parse_date_range(request):
    start_raw = request.GET.get('start_date')
    end_raw = request.GET.get('end_date')

    start_date = parse_date(start_raw) if start_raw else None
    end_date = parse_date(end_raw) if end_raw else None

    if start_date is None and end_date is None:
        return None, None

    start_dt = None
    end_dt = None

    if start_date is not None:
        start_dt = timezone.make_aware(
            timezone.datetime.combine(start_date, timezone.datetime.min.time())
        )

    if end_date is not None:
        end_dt = timezone.make_aware(
            timezone.datetime.combine(end_date, timezone.datetime.max.time())
        )

    return start_dt, end_dt


def _build_admin_booking_payload(booking):
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

    vehicle_parts = []
    if request_obj.vehicle_brand:
        vehicle_parts.append(request_obj.vehicle_brand)
    if request_obj.vehicle_model:
        vehicle_parts.append(request_obj.vehicle_model)
    if request_obj.vehicle_type:
        vehicle_parts.append(f"({request_obj.vehicle_type})")
    vehicle_information = " ".join(vehicle_parts) if vehicle_parts else None

    services_list = []
    if request_obj.request_type == Request.Type.BROADCAST and hasattr(request_obj, 'broadcast_request'):
        services_list = [service.name for service in request_obj.broadcast_request.services.all()]
    elif request_obj.request_type == Request.Type.DIRECT and hasattr(request_obj, 'directrequest'):
        from ...direct_request_utils import iter_direct_request_services

        services_list = [s.name for s in iter_direct_request_services(request_obj) if getattr(s, "name", None)]

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

    return {
        'id': booking.id,
        'request_id': booking.request_id,
        'status': booking.status,
        'amount_fee': booking.amount_fee,
        'convenience_fee': booking.convenience_fee,
        'distance_km': booking.distance_km,
        'traffic_surcharge': booking.traffic_surcharge,
        'base_fee': base_fee,
        'booked_at': booking.booked_at,
        'booking_date': booking.booking_date,
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
                'issue_pictures': [img.image.url for img in dispute.images.all()],
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

    results = [_build_admin_booking_payload(booking) for booking in queryset]

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_get_booking(request, booking_id):
    queryset = Booking.objects.select_related(
        'request__client__account',
        'request__provider',
        'request__shop',
        'request__service_location',
        'request__customrequest',
        'request__directrequest__service',
        'request__emergencyrequest',
        'request__broadcast_request',
        'receipt',
    ).prefetch_related(
        'request__broadcast_request__services',
    )

    try:
        booking = queryset.get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response(_build_admin_booking_payload(booking), status=status.HTTP_200_OK)


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


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_transactions_overview(request):
    _, error_response = _require_superadmin(request)
    if error_response is not None:
        return error_response

    start_dt, end_dt = _parse_date_range(request)

    transaction_qs = PaymentTransaction.objects.filter(status=PaymentTransaction.Status.SUCCESS)
    if start_dt:
        transaction_qs = transaction_qs.filter(created_at__gte=start_dt)
    if end_dt:
        transaction_qs = transaction_qs.filter(created_at__lte=end_dt)

    receipt_qs = Receipt.objects.filter(payment_received=True)
    if start_dt:
        receipt_qs = receipt_qs.filter(paid_at__gte=start_dt)
    if end_dt:
        receipt_qs = receipt_qs.filter(paid_at__lte=end_dt)

    payout_pending_qs = PaymentInstallment.objects.filter(
        Q(status=PaymentInstallment.Status.PENDING) | Q(is_released=False)
    )
    if start_dt:
        payout_pending_qs = payout_pending_qs.filter(created_at__gte=start_dt)
    if end_dt:
        payout_pending_qs = payout_pending_qs.filter(created_at__lte=end_dt)

    gmv_total = transaction_qs.aggregate(total=Sum('amount')).get('total') or Decimal('0')
    cash_gmv_total = receipt_qs.filter(payment_method='cash').aggregate(total=Sum('booking__amount_fee')).get('total') or Decimal('0')
    gmv_total += cash_gmv_total

    platform_revenue = receipt_qs.aggregate(total=Sum('platform_fee')).get('total') or Decimal('0')
    pending_payouts = payout_pending_qs.aggregate(total=Sum('amount')).get('total') or Decimal('0')
    wallet_float = Wallet.objects.aggregate(total=Sum('balance')).get('total') or Decimal('0')

    revenue_series = transaction_qs.annotate(day=TruncDate('created_at')).values('day').annotate(
        total=Sum('amount')
    ).order_by('day')

    payout_series = receipt_qs.annotate(day=TruncDate('paid_at')).values('day').annotate(
        total=Sum('mechanic_payout')
    ).order_by('day')

    method_counts = transaction_qs.values('method').annotate(total=Sum('amount')).order_by('method')
    cash_count = receipt_qs.filter(payment_method='cash').aggregate(total=Sum('booking__amount_fee')).get('total') or Decimal('0')

    method_map = {}
    for row in method_counts:
        method_key = row['method']
        if method_key in {'gcash', 'maya'}:
            method_key = 'e_cash'
        elif method_key == 'qr':
            method_key = 'cash'

        method_map[method_key] = method_map.get(method_key, Decimal('0')) + (row['total'] or Decimal('0'))

    if cash_count:
        method_map['cash'] = method_map.get('cash', Decimal('0')) + cash_count

    return Response(
        {
            'kpis': {
                'gmv_total': gmv_total,
                'platform_revenue_total': platform_revenue,
                'pending_payout_total': pending_payouts,
                'wallet_float_total': wallet_float,
            },
            'charts': {
                'revenue_series': [
                    {'date': row['day'], 'total': row['total'] or 0}
                    for row in revenue_series
                ],
                'payout_series': [
                    {'date': row['day'], 'total': row['total'] or 0}
                    for row in payout_series
                ],
                'method_breakdown': [
                    {'method': key, 'total': value}
                    for key, value in method_map.items()
                ],
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_transactions_ledger(request):
    _, error_response = _require_superadmin(request)
    if error_response is not None:
        return error_response

    start_dt, end_dt = _parse_date_range(request)
    txn_type = request.GET.get('type')
    status_filter = request.GET.get('status')
    search_query = str(request.GET.get('q') or '').strip().lower()

    payment_status_map = {
        'not_paid': Booking.PaymentStatus.UNPAID,
        'initial_paid': Booking.PaymentStatus.PARTIALLY_PAID,
        'fully_paid': Booking.PaymentStatus.FULLY_PAID,
    }
    payment_status_filter = payment_status_map.get(status_filter)

    page = max(1, _to_int(request.GET.get('page'), 1))
    page_size = max(1, min(_to_int(request.GET.get('page_size'), 20), 100))

    ledger_rows = []

    if not txn_type or txn_type == 'payment':
        payment_qs = PaymentTransaction.objects.select_related('booking__request__client__account').all()
        if start_dt:
            payment_qs = payment_qs.filter(created_at__gte=start_dt)
        if end_dt:
            payment_qs = payment_qs.filter(created_at__lte=end_dt)
        if status_filter:
            payment_qs = payment_qs.filter(status=status_filter)
        if payment_status_filter:
            payment_qs = payment_qs.filter(booking__payment_status=payment_status_filter)
        for payment in payment_qs:
            actor = None
            if payment.booking and payment.booking.request and payment.booking.request.client:
                actor = payment.booking.request.client.account.username
            payment_status = getattr(payment.booking, 'payment_status', None) if payment.booking else None
            method_val = payment.method if payment.method is not None else None
            if method_val == 'qr':
                method_val = 'cash'

            ledger_rows.append(
                {
                    'date': payment.created_at,
                    'transaction_id': f"pay_{payment.id}",
                    'type': 'payment',
                    'actor': actor,
                    'amount': payment.amount,
                    'status': payment.status,
                    'payment_status': payment_status,
                    'reference_id': payment.booking_id,
                    'method': method_val,
                }
            )

    if not txn_type or txn_type == 'payout':
        payout_qs = Receipt.objects.select_related(
            'booking__request__provider',
            'booking__request__shop',
        ).exclude(mechanic_payout__isnull=True)

        if start_dt:
            payout_qs = payout_qs.filter(paid_at__gte=start_dt)
        if end_dt:
            payout_qs = payout_qs.filter(paid_at__lte=end_dt)
        if payment_status_filter:
            payout_qs = payout_qs.filter(booking__payment_status=payment_status_filter)
        for payout in payout_qs:
            actor = None
            booking = payout.booking
            if booking and booking.request:
                if booking.request.provider:
                    actor = booking.request.provider.username
                elif booking.request.shop:
                    actor = booking.request.shop.shop_name
            payout_method = payout.payment_method
            if payout_method == 'qr':
                payout_method = 'cash'

            ledger_rows.append(
                {
                    'date': payout.paid_at or payout.created_at,
                    'transaction_id': f"payout_{payout.id}",
                    'type': 'payout',
                    'actor': actor,
                    'amount': payout.mechanic_payout,
                    'status': 'paid' if payout.payment_received else 'pending',
                    'payment_status': getattr(booking, 'payment_status', None) if booking else None,
                    'reference_id': payout.booking_id,
                    'method': payout_method,
                }
            )

    if not txn_type or txn_type == 'topup':
        topup_qs = TokenPurchase.objects.select_related('account').all()
        if start_dt:
            topup_qs = topup_qs.filter(purchased_at__gte=start_dt)
        if end_dt:
            topup_qs = topup_qs.filter(purchased_at__lte=end_dt)
        if status_filter:
            topup_qs = topup_qs.filter(status=status_filter)
        if payment_status_filter:
            topup_qs = topup_qs.none()

        for topup in topup_qs:
            ledger_rows.append(
                {
                    'date': topup.purchased_at,
                    'transaction_id': f"topup_{topup.id}",
                    'type': 'topup',
                    'actor': topup.account.username if topup.account else None,
                    'amount': topup.price,
                    'status': topup.status,
                    'payment_status': None,
                    'reference_id': None,
                    'method': topup.payment_method,
                }
            )

    if search_query:
        def _matches_search(row):
            actor_value = str(row.get('actor') or '').lower()
            transaction_value = str(row.get('transaction_id') or '').lower()
            reference_value = str(row.get('reference_id') or '').lower()
            return (
                search_query in actor_value
                or search_query in transaction_value
                or search_query in reference_value
            )

        ledger_rows = [row for row in ledger_rows if _matches_search(row)]

    ledger_rows.sort(key=lambda row: row['date'] or timezone.now(), reverse=True)
    total_count = len(ledger_rows)
    start_index = (page - 1) * page_size
    end_index = start_index + page_size
    paged_rows = ledger_rows[start_index:end_index]

    return Response(
        {
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'results': paged_rows,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_booking_transaction_stats(request, booking_id):
    _, error_response = _require_superadmin(request)
    if error_response is not None:
        return error_response

    try:
        booking = Booking.objects.select_related(
            'receipt',
        ).prefetch_related(
            'payment_installments',
            'payment_transactions',
        ).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

    receipt_info = None
    if isinstance(getattr(booking, 'receipt', None), Receipt):
        receipt = booking.receipt
        # Normalize payment method: treat 'qr' as 'cash'
        pm = receipt.payment_method
        if pm == 'qr':
            pm = 'cash'

        receipt_info = {
            'payment_method': pm,
            'payment_received': receipt.payment_received,
            'platform_fee': receipt.platform_fee,
            'mechanic_payout': receipt.mechanic_payout,
            'paid_at': receipt.paid_at,
            'transaction_id': receipt.transaction_id,
            'receipt_image': receipt.receipt_image.url if receipt.receipt_image else None,
        }

    installments = []
    for installment in booking.payment_installments.all():
        installments.append(
            {
                'id': installment.id,
                'installment_type': installment.installment_type,
                'amount': installment.amount,
                'status': installment.status,
                'is_released': installment.is_released,
                'paid_at': installment.paid_at,
                'external_reference': installment.external_reference,
                'created_at': installment.created_at,
            }
        )

    transactions = []
    for transaction in booking.payment_transactions.all():
        method_val = transaction.method if transaction.method is not None else None
        if method_val == 'qr':
            method_val = 'cash'

        transactions.append(
            {
                'id': transaction.id,
                'installment_id': transaction.installment_id,
                'amount': transaction.amount,
                'method': method_val,
                'status': transaction.status,
                'reference': transaction.reference,
                'created_at': transaction.created_at,
            }
        )

    total_fee = booking.amount_fee or Decimal('0')
    transaction_total = sum(
        (txn.amount or Decimal('0'))
        for txn in booking.payment_transactions.all()
        if txn.status == PaymentTransaction.Status.SUCCESS
    )
    installment_paid_total = sum(
        (inst.amount or Decimal('0'))
        for inst in booking.payment_installments.all()
        if inst.status == PaymentInstallment.Status.PAID
    )

    if transaction_total > 0:
        client_paid_total = transaction_total
    elif installment_paid_total > 0:
        client_paid_total = installment_paid_total
    elif receipt_info and receipt_info.get('payment_received'):
        client_paid_total = total_fee
    else:
        client_paid_total = Decimal('0')

    mechanic_earnings_total = receipt_info.get('mechanic_payout') if receipt_info else None
    platform_earnings_total = receipt_info.get('platform_fee') if receipt_info else None
    outstanding_balance = total_fee - client_paid_total
    if outstanding_balance < 0:
        outstanding_balance = Decimal('0')

    return Response(
        {
            'booking_id': booking.id,
            'totals': {
                'client_paid_total': client_paid_total,
                'mechanic_earnings_total': mechanic_earnings_total,
                'platform_earnings_total': platform_earnings_total,
                'outstanding_balance': outstanding_balance,
                'total_fee': total_fee,
            },
            'receipt_info': receipt_info,
            'payment_installments': installments,
            'payment_transactions': transactions,
        },
        status=status.HTTP_200_OK,
    )
