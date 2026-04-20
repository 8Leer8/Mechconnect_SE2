from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from django.db.models import Prefetch, Q
from django.db import transaction
from django.utils import timezone
from datetime import timedelta
from math import atan2, cos, radians, sin, sqrt
import logging

from ...models import (
    Booking, Request, ActiveBooking, CancelBooking,
    ReworkBooking, DisputeBooking, CompleteBooking, Receipt, BroadcastOffer, PaymentInstallment, Quotation, RequestAssignment,
    BroadcastRequest, BroadcastRequestAddOn, DirectRequestAddOn, MechanicLocation
)
from ...serializers import BookingSerializer, BookingPaymentSerializer
from users.models import Account, Mechanic, MechanicReview, TokenTransaction
from notification.models import Notification


logger = logging.getLogger(__name__)


def _broadcast_booking_action(booking, action, message):
    """Broadcast booking websocket action to all involved account groups."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        participant_ids = set()
        try:
            if booking.request and booking.request.client and booking.request.client.account_id:
                participant_ids.add(booking.request.client.account_id)
        except Exception:
            pass
        try:
            if booking.request and booking.request.provider_id:
                participant_ids.add(booking.request.provider_id)
        except Exception:
            pass
        try:
            if booking.request and booking.request.shop and booking.request.shop.shop_owner and booking.request.shop.shop_owner.account_id:
                participant_ids.add(booking.request.shop.shop_owner.account_id)
        except Exception:
            pass

        payload = {
            'type': 'booking_update',
            'action': action,
            'booking_id': booking.id,
            'status': booking.status,
            'dispute_status': booking.dispute_status,
            'message': message,
        }

        for account_id in participant_ids:
            async_to_sync(channel_layer.group_send)(f'user_{account_id}', payload)
    except Exception:
        logger.exception('Failed to broadcast booking action %s for booking %s', action, getattr(booking, 'id', None))


def _to_money(value):
    from decimal import Decimal

    amount = Decimal(value or 0)
    return amount.quantize(Decimal('0.01'))


def _haversine_meters(lat1, lon1, lat2, lon2):
    """Return great-circle distance between two coordinates in meters."""
    earth_radius_m = 6_371_000

    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earth_radius_m * c


def _collect_rescue_services_and_addons(original_request, booking):
    """Collect service and add-on IDs to clone into an auto-rescue broadcast."""
    service_ids = set()
    add_on_ids = set()

    # Direct request source of truth
    if hasattr(original_request, 'directrequest') and original_request.directrequest is not None:
        direct_request = original_request.directrequest
        if direct_request.service_id:
            service_ids.add(direct_request.service_id)

        for add_on in DirectRequestAddOn.objects.filter(request=original_request).values_list('service_add_on_id', flat=True):
            if add_on:
                add_on_ids.add(add_on)

    # Existing broadcast source of truth
    if hasattr(original_request, 'broadcast_request') and original_request.broadcast_request is not None:
        broadcast = original_request.broadcast_request
        service_ids.update(list(broadcast.services.values_list('id', flat=True)))
        add_on_ids.update(
            list(
                BroadcastRequestAddOn.objects.filter(broadcast_request=broadcast).values_list(
                    'service_add_on_id', flat=True
                )
            )
        )

    # Custom request fallback via latest quotation selections
    try:
        quotation = booking.quotation
        quote_items = quotation.items.exclude(status=Quotation.Status.REJECTED)
        for item in quote_items:
            if item.service_id:
                service_ids.add(item.service_id)
            if item.service_add_on_id:
                add_on_ids.add(item.service_add_on_id)
    except Exception:
        pass

    return list(service_ids), list(add_on_ids)


def _build_rescue_description(original_request, booking):
    """Build a sensible rescue description from the original request payload."""
    if hasattr(original_request, 'broadcast_request') and original_request.broadcast_request is not None:
        description = (original_request.broadcast_request.description or '').strip()
        if description:
            return description

    if hasattr(original_request, 'customrequest') and original_request.customrequest is not None:
        description = (original_request.customrequest.description or '').strip()
        if description:
            return description

    if hasattr(original_request, 'emergencyrequest') and original_request.emergencyrequest is not None:
        description = (original_request.emergencyrequest.description or '').strip()
        if description:
            return description

    if hasattr(original_request, 'directrequest') and original_request.directrequest is not None:
        try:
            service_name = original_request.directrequest.service.name
            if service_name:
                return f"Auto-rescue no-show for {service_name}"
        except Exception:
            pass

    try:
        quotation = booking.quotation
        names = [
            item.service.name
            for item in quotation.items.select_related('service').exclude(service=None)
            if item.service and item.service.name
        ]
        if names:
            return f"Auto-rescue no-show for {', '.join(sorted(set(names)))}"
    except Exception:
        pass

    return "Client reported a mechanic no-show."


def _build_booking_payment_summary(booking):
    total_amount = _to_money(booking.amount_fee)

    quotation = getattr(booking, 'quotation', None)
    if booking.status != Booking.Status.PENDING_PAYMENT and quotation is not None:
        accepted_total = _to_money(0)
        try:
            for item in quotation.items.filter(status=Quotation.Status.ACCEPTED):
                accepted_total += _to_money(item.line_total)
            accepted_total = _to_money(accepted_total)
            if accepted_total > 0:
                convenience_component = _to_money(getattr(booking, 'convenience_fee', 0) or 0)
                if convenience_component <= 0:
                    inferred = _to_money(total_amount - accepted_total)
                    if inferred > 0:
                        convenience_component = inferred
                computed_total = _to_money(accepted_total + max(_to_money(0), convenience_component))
                if computed_total > 0 and computed_total != total_amount:
                    booking.amount_fee = computed_total
                    booking.save(update_fields=['amount_fee', 'updated_at'])
                    total_amount = computed_total
        except Exception:
            pass

    installments = list(
        PaymentInstallment.objects.filter(booking=booking).order_by('created_at', 'id')
    )

    total_paid = _to_money(0)
    serialized_installments = []
    for installment in installments:
        if installment.status == PaymentInstallment.Status.PAID:
            total_paid += _to_money(installment.amount)
        serialized_installments.append(
            {
                'type': installment.installment_type,
                'installment_type': installment.installment_type,
                'amount': float(installment.amount),
                'status': installment.status,
                'is_released': bool(installment.is_released),
                'paid_at': installment.paid_at.isoformat() if installment.paid_at else None,
            }
        )

    remaining_balance = max(_to_money(0), _to_money(total_amount - total_paid))

    if installments:
        paid_exists = any(it.status == PaymentInstallment.Status.PAID for it in installments)
        pending_final = next(
            (it for it in installments if it.status == PaymentInstallment.Status.PENDING and it.installment_type == PaymentInstallment.Type.FINAL),
            None,
        )
        if paid_exists and pending_final and _to_money(pending_final.amount) != remaining_balance:
            pending_final.amount = remaining_balance
            pending_final.save(update_fields=['amount', 'updated_at'])
            for serialized in serialized_installments:
                if serialized.get('installment_type') == PaymentInstallment.Type.FINAL and serialized.get('status') == PaymentInstallment.Status.PENDING:
                    serialized['amount'] = float(remaining_balance)
                    break

    if total_paid >= total_amount and total_amount > 0:
        derived_payment_status = Booking.PaymentStatus.FULLY_PAID
    elif total_paid > _to_money(0):
        derived_payment_status = Booking.PaymentStatus.PARTIALLY_PAID
    else:
        derived_payment_status = Booking.PaymentStatus.UNPAID

    return {
        'payment_status': derived_payment_status,
        'total_amount': float(total_amount),
        'total_paid': float(total_paid),
        'remaining_balance': float(remaining_balance),
        'installments': serialized_installments,
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def list_client_bookings(request):
    """
    Get bookings for the authenticated client, filtered by status.
    
    Query Parameters:
    - status: Filter by booking status (active, completed, cancelled, reworked, disputed)
              If not provided, returns all bookings grouped by status
    - page: Page number (default: 1)
    - page_size: Number of bookings per page (default: 10)
    
    Returns bookings with full details including:
    - Request information (service location, provider details)
    - Status-specific details (cancellation reason, rework details, etc.)
    - Timestamps and amounts
    - Pagination info (total_pages, current_page, has_next, has_previous)
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        # Check if user is a client
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can view bookings'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Get pagination params
        page = int(request.query_params.get('page', 1))
        # Default page size for client listing set to 5
        page_size = int(request.query_params.get('page_size', 5))
        
        # Get status filter from query params
        status_filter = request.query_params.get('status', None)
        
        # Base queryset - all bookings for this client
        bookings_queryset = Booking.objects.filter(
            request__client=client
        ).select_related(
            'request',
            'request__client',
            'request__client__account',
            'request__provider',
            'request__service_location'
        ).prefetch_related(
            Prefetch('activebooking', queryset=ActiveBooking.objects.all()),
            Prefetch('cancelbooking', queryset=CancelBooking.objects.select_related('cancelled_by')),
            Prefetch('reworkbooking', queryset=ReworkBooking.objects.select_related('requested_by')),
            Prefetch('disputebooking', queryset=DisputeBooking.objects.select_related(
                'complainer', 'complaint_against', 'admin'
            )),
            Prefetch('completebooking', queryset=CompleteBooking.objects.all())
        ).order_by('-booked_at')
        
        # Apply status filter if provided
        if status_filter:
            valid_statuses = ['active', 'on_the_way', 'pending_payment', 'completed', 'cancelled', 'reworked', 'disputed']
            if status_filter.lower() not in valid_statuses:
                return Response({
                    'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'
                }, status=status.HTTP_400_BAD_REQUEST)

            # For 'active' tab, merge 'accepted', 'active', 'on_the_way', and 'pending_payment' statuses
            if status_filter.lower() == 'active':
                bookings_queryset = bookings_queryset.filter(status__in=['accepted', 'active', 'on_the_way', 'pending_payment'])
            else:
                bookings_queryset = bookings_queryset.filter(status=status_filter.lower())

            # Calculate pagination
            total_count = bookings_queryset.count()
            total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
            
            # Apply pagination
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            paginated_bookings = bookings_queryset[start_index:end_index]
            
            # Serialize and return filtered bookings
            bookings_data = _serialize_bookings(paginated_bookings, viewer_account=account)

            return Response({
                'status': status_filter.lower(),
                'bookings': bookings_data,
                'count': len(bookings_data),
                'total_count': total_count,
                'page': page,
                'page_size': page_size,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_previous': page > 1,
            }, status=status.HTTP_200_OK)
        
        # If no filter, return bookings grouped by status (no pagination for grouped view)
        else:
            # Merge 'accepted', 'active' and 'on_the_way' for the active group
            active_bookings = bookings_queryset.filter(status__in=['accepted', 'active', 'on_the_way', 'pending_payment'])
            completed_bookings = bookings_queryset.filter(status='completed')
            cancelled_bookings = bookings_queryset.filter(status='cancelled')
            reworked_bookings = bookings_queryset.filter(status='reworked')
            disputed_bookings = bookings_queryset.filter(status='disputed')

            return Response({
                'active': {
                    'bookings': _serialize_bookings(active_bookings, viewer_account=account),
                    'count': active_bookings.count()
                },
                'completed': {
                    'bookings': _serialize_bookings(completed_bookings, viewer_account=account),
                    'count': completed_bookings.count()
                },
                'cancelled': {
                    'bookings': _serialize_bookings(cancelled_bookings, viewer_account=account),
                    'count': cancelled_bookings.count()
                },
                'reworked': {
                    'bookings': _serialize_bookings(reworked_bookings, viewer_account=account),
                    'count': reworked_bookings.count()
                },
                'disputed': {
                    'bookings': _serialize_bookings(disputed_bookings, viewer_account=account),
                    'count': disputed_bookings.count()
                },
                'total_count': bookings_queryset.count()
            }, status=status.HTTP_200_OK)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_booking_detail(request, booking_id):
    """
    Get detailed information for a specific booking.
    
    Path Parameters:
    - booking_id: ID of the booking to retrieve
    
    Returns complete booking details with all related information.
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        # Check if user is a client
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can view booking details'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Get booking and verify it belongs to this client
        booking = Booking.objects.select_related(
            'request',
            'request__client',
            'request__client__account',
            'request__provider',
            'request__service_location'
        ).prefetch_related(
            Prefetch('activebooking', queryset=ActiveBooking.objects.all()),
            Prefetch('cancelbooking', queryset=CancelBooking.objects.select_related('cancelled_by')),
            Prefetch('reworkbooking', queryset=ReworkBooking.objects.select_related('requested_by')),
            Prefetch('disputebooking', queryset=DisputeBooking.objects.select_related(
                'complainer', 'complaint_against', 'admin'
            )),
            Prefetch('completebooking', queryset=CompleteBooking.objects.all())
        ).get(id=booking_id, request__client=client)
        
        # Ensure ActiveBooking exists for runtime details when booking is in a running/finished state
        if booking.status in ['active', 'paused', 'pending_payment', 'finished', 'on_the_way']:
            try:
                ActiveBooking.objects.get_or_create(booking=booking)
            except Exception:
                pass

        # Serialize booking
        booking_data = _serialize_single_booking(booking, viewer_account=account)
        
        return Response({
            'booking': booking_data
        }, status=status.HTTP_200_OK)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({
            'error': 'Booking not found or you do not have permission to view it'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def submit_mechanic_review(request, booking_id):
    """Submit a mechanic review from client booking details.

    Rules:
    - Requesting user must be the booking's client.
    - Booking must be completed.
    - Booking payment must be fully paid.
    - Booking provider must be a mechanic account.
    - One review per reviewer/mechanic pair (model constraint). Existing review is updated.
    """
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can submit mechanic reviews'}, status=status.HTTP_403_FORBIDDEN)

        booking = Booking.objects.select_related('request__client', 'request__provider').get(
            id=booking_id,
            request__client=account.client,
        )

        if booking.status != Booking.Status.COMPLETED:
            return Response({'error': 'You can review only after the booking is completed'}, status=status.HTTP_400_BAD_REQUEST)

        payment_summary = _build_booking_payment_summary(booking)
        if str(payment_summary.get('payment_status', '')).lower() != Booking.PaymentStatus.FULLY_PAID:
            return Response({'error': 'You can review only after full payment is completed'}, status=status.HTTP_400_BAD_REQUEST)

        provider_account = getattr(booking.request, 'provider', None)
        if provider_account is None:
            return Response({'error': 'No provider found for this booking'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mechanic = provider_account.mechanic
        except Mechanic.DoesNotExist:
            return Response({'error': 'Booking provider is not a mechanic'}, status=status.HTTP_400_BAD_REQUEST)

        rating_raw = request.data.get('rating')
        try:
            rating = int(rating_raw)
        except (TypeError, ValueError):
            return Response({'error': 'Rating is required and must be an integer from 1 to 5'}, status=status.HTTP_400_BAD_REQUEST)

        if rating < 1 or rating > 5:
            return Response({'error': 'Rating must be between 1 and 5'}, status=status.HTTP_400_BAD_REQUEST)

        comment = request.data.get('comment', '')
        if comment is None:
            comment = ''
        comment = str(comment).strip()

        review, created = MechanicReview.objects.update_or_create(
            reviewer=account,
            mechanic=mechanic,
            defaults={
                'rating': rating,
                'comment': comment,
            },
        )

        return Response(
            {
                'message': 'Review submitted successfully' if created else 'Review updated successfully',
                'review': {
                    'id': review.id,
                    'rating': review.rating,
                    'comment': review.comment,
                    'created_at': review.created_at.isoformat() if review.created_at else None,
                },
                'created': created,
            },
            status=status.HTTP_200_OK,
        )
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found or you do not have permission'}, status=status.HTTP_404_NOT_FOUND)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def create_dispute(request, booking_id):
    """Create a dispute without changing Booking.status (decoupled dispute state)."""
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        booking = Booking.objects.select_related(
            'request__client__account',
            'request__provider',
            'request__shop__shop_owner',
        ).get(id=booking_id)

        allowed_statuses = {Booking.Status.PENDING_PAYMENT, Booking.Status.COMPLETED}
        if booking.status not in allowed_statuses:
            return Response(
                {'error': 'Disputes are allowed only for pending_payment or completed bookings'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if booking.dispute_status == Booking.DisputeState.ACTIVE:
            return Response({'error': 'An active dispute already exists for this booking'}, status=status.HTTP_400_BAD_REQUEST)

        if not booking.request.client or booking.request.client.account_id != account.id:
            return Response({'error': 'Only the booking client can file a dispute'}, status=status.HTTP_403_FORBIDDEN)

        issue_description = str(request.data.get('issue_description', '')).strip()
        if not issue_description:
            return Response({'error': 'issue_description is required'}, status=status.HTTP_400_BAD_REQUEST)

        complaint_against = booking.request.provider
        if complaint_against is None and booking.request.shop and booking.request.shop.shop_owner:
            complaint_against = booking.request.shop.shop_owner.account
        if complaint_against is None:
            return Response({'error': 'No provider found to file dispute against'}, status=status.HTTP_400_BAD_REQUEST)

        issue_picture = request.FILES.get('issue_picture')

        with transaction.atomic():
            dispute = DisputeBooking.objects.create(
                booking=booking,
                complainer=account,
                complaint_against=complaint_against,
                issue_description=issue_description,
                issue_picture=issue_picture,
                status=DisputeBooking.Status.ACTIVE,
            )

            booking.dispute_status = Booking.DisputeState.ACTIVE
            booking.save(update_fields=['dispute_status', 'updated_at'])

            provider_account = booking.request.provider
            if provider_account is not None and hasattr(provider_account, 'mechanic'):
                provider_account.mechanic.is_locked = True
                provider_account.mechanic.save(update_fields=['is_locked'])

        _broadcast_booking_action(booking, 'booking.disputed', 'A dispute has been filed for this booking')

        return Response(
            {
                'message': 'Dispute created successfully',
                'dispute': {
                    'id': dispute.id,
                    'booking_id': dispute.booking_id,
                    'status': dispute.status,
                    'issue_description': dispute.issue_description,
                    'issue_picture': dispute.issue_picture.url if dispute.issue_picture else None,
                    'created_at': dispute.created_at.isoformat() if dispute.created_at else None,
                },
                'booking': {
                    'id': booking.id,
                    'status': booking.status,
                    'dispute_status': booking.dispute_status,
                },
            },
            status=status.HTTP_201_CREATED,
        )
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def resolve_dispute(request, booking_id):
    """Admin mediation endpoint for dispute transitions while keeping Booking.status untouched."""
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'admin'):
            return Response({'error': 'Only admins can resolve disputes'}, status=status.HTTP_403_FORBIDDEN)

        booking = Booking.objects.select_related('request__provider').get(id=booking_id)
        try:
            dispute = booking.disputebooking
        except DisputeBooking.DoesNotExist:
            return Response({'error': 'No dispute found for this booking'}, status=status.HTTP_404_NOT_FOUND)

        if booking.dispute_status != Booking.DisputeState.ACTIVE:
            return Response({'error': 'Only active disputes can be processed'}, status=status.HTTP_400_BAD_REQUEST)

        action = str(request.data.get('action', '')).strip().lower()
        if action not in {'dismiss', 'voucher', 'request_payment'}:
            return Response(
                {'error': "action must be one of: dismiss, voucher, request_payment"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resolution_notes = str(request.data.get('resolution_notes', '')).strip()

        with transaction.atomic():
            dispute.admin = account.admin
            dispute.resolution_notes = resolution_notes

            unlock_mechanic = False
            if action == 'dismiss':
                dispute.status = DisputeBooking.Status.RESOLVED_DISMISSED
                booking.dispute_status = Booking.DisputeState.RESOLVED
                dispute.resolved_at = timezone.now()
                unlock_mechanic = True
            elif action == 'voucher':
                dispute.status = DisputeBooking.Status.RESOLVED_VOUCHER
                booking.dispute_status = Booking.DisputeState.RESOLVED
                dispute.resolved_at = timezone.now()
            else:
                dispute.status = DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT
                dispute.resolved_at = None

            dispute.save(update_fields=[
                'admin',
                'status',
                'resolution_notes',
                'amount_refunded',
                'refund_receiver',
                'resolved_at',
            ])

            booking.save(update_fields=['dispute_status', 'updated_at'])

            provider_account = booking.request.provider
            if unlock_mechanic and provider_account is not None and hasattr(provider_account, 'mechanic'):
                provider_account.mechanic.is_locked = False
                provider_account.mechanic.save(update_fields=['is_locked'])

        ws_action = 'booking.dispute_payment_requested' if action == 'request_payment' else 'booking.dispute_resolved'
        ws_message = 'Admin requested mechanic payment proof upload' if action == 'request_payment' else 'The dispute has been resolved'
        _broadcast_booking_action(booking, ws_action, ws_message)

        return Response(
            {
                'message': 'Dispute resolved successfully',
                'dispute': {
                    'id': dispute.id,
                    'status': dispute.status,
                    'resolution_notes': dispute.resolution_notes,
                    'is_client_verified': dispute.is_client_verified,
                    'refund_receipt_image': dispute.refund_receipt_image.url if dispute.refund_receipt_image else None,
                    'amount_refunded': float(dispute.amount_refunded) if dispute.amount_refunded is not None else None,
                    'resolved_at': dispute.resolved_at.isoformat() if dispute.resolved_at else None,
                },
                'booking': {
                    'id': booking.id,
                    'status': booking.status,
                    'dispute_status': booking.dispute_status,
                },
            },
            status=status.HTTP_200_OK,
        )
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def client_verify_refund(request, booking_id):
    """Client confirms refund receipt and closes the dispute while unlocking mechanic."""
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        booking = Booking.objects.select_related('request__client__account', 'request__provider').get(id=booking_id)

        if not booking.request.client or booking.request.client.account_id != account.id:
            return Response({'error': 'Only the booking client can verify refund'}, status=status.HTTP_403_FORBIDDEN)

        try:
            dispute = booking.disputebooking
        except DisputeBooking.DoesNotExist:
            return Response({'error': 'No dispute found for this booking'}, status=status.HTTP_404_NOT_FOUND)

        if dispute.status != DisputeBooking.Status.WAITING_FOR_CLIENT_VERIFICATION:
            return Response(
                {'error': 'Refund can only be verified when waiting for client verification'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            dispute.status = DisputeBooking.Status.RESOLVED_REFUNDED
            dispute.is_client_verified = True
            dispute.refund_receiver = account
            dispute.resolved_at = timezone.now()
            dispute.save(update_fields=['status', 'is_client_verified', 'refund_receiver', 'resolved_at'])

            booking.dispute_status = Booking.DisputeState.RESOLVED
            booking.save(update_fields=['dispute_status', 'updated_at'])

            provider_account = booking.request.provider
            if provider_account is not None and hasattr(provider_account, 'mechanic'):
                provider_account.mechanic.is_locked = False
                provider_account.mechanic.save(update_fields=['is_locked'])

        _broadcast_booking_action(booking, 'booking.dispute_refund_verified', 'Client verified refund receipt')

        return Response(
            {
                'message': 'Refund verified and dispute resolved',
                'dispute': {
                    'id': dispute.id,
                    'status': dispute.status,
                    'is_client_verified': dispute.is_client_verified,
                    'resolved_at': dispute.resolved_at.isoformat() if dispute.resolved_at else None,
                },
                'booking': {
                    'id': booking.id,
                    'status': booking.status,
                    'dispute_status': booking.dispute_status,
                },
            },
            status=status.HTTP_200_OK,
        )
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def provide_refund_details(request, booking_id):
    """Client provides refund destination details so mechanic knows where to send funds."""
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        booking = Booking.objects.select_related('request__client__account', 'request__provider').get(id=booking_id)

        if not booking.request.client or booking.request.client.account_id != account.id:
            return Response({'error': 'Only the booking client can provide refund details'}, status=status.HTTP_403_FORBIDDEN)

        try:
            dispute = booking.disputebooking
        except DisputeBooking.DoesNotExist:
            return Response({'error': 'No dispute found for this booking'}, status=status.HTTP_404_NOT_FOUND)

        if booking.dispute_status != Booking.DisputeState.ACTIVE:
            return Response({'error': 'Dispute is not active'}, status=status.HTTP_400_BAD_REQUEST)

        current_status = str(dispute.status or '').lower()
        if current_status not in {
            DisputeBooking.Status.ACTIVE,
            DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT,
            DisputeBooking.Status.WAITING_FOR_CLIENT_VERIFICATION,
        }:
            return Response({'error': 'Dispute is already resolved'}, status=status.HTTP_400_BAD_REQUEST)

        refund_method = str(request.data.get('refund_method', '')).strip().lower()
        if refund_method not in {
            DisputeBooking.RefundMethod.GCASH,
            DisputeBooking.RefundMethod.MAYA,
            DisputeBooking.RefundMethod.VOUCHER,
        }:
            return Response({'error': "refund_method must be one of: gcash, maya, voucher"}, status=status.HTTP_400_BAD_REQUEST)

        account_number = str(request.data.get('account_number', '')).strip()

        with transaction.atomic():
            dispute.refund_method = refund_method

            if refund_method == DisputeBooking.RefundMethod.VOUCHER:
                dispute.refund_account_number = None
                dispute.status = DisputeBooking.Status.RESOLVED_VOUCHER
                dispute.resolved_at = timezone.now()
                dispute.is_client_verified = True
                dispute.refund_receiver = account

                booking.dispute_status = Booking.DisputeState.RESOLVED
                booking.save(update_fields=['dispute_status', 'updated_at'])

                provider_account = booking.request.provider
                if provider_account is not None and hasattr(provider_account, 'mechanic'):
                    mechanic = provider_account.mechanic
                    debt_amount = int(round(float(dispute.amount_refunded or booking.amount_fee or 0)))
                    if debt_amount > 0:
                        mechanic.tokens_balance = (mechanic.tokens_balance or 0) - debt_amount
                        mechanic.save(update_fields=['tokens_balance'])
                        TokenTransaction.objects.create(
                            account=provider_account,
                            tokens=-debt_amount,
                            reason=f"Dispute voucher debt recovery (booking #{booking.id})",
                            related_booking_id=booking.id,
                        )

                    mechanic.is_locked = False
                    mechanic.save(update_fields=['is_locked'])

                dispute.resolution_notes = (dispute.resolution_notes or '').strip()
                if dispute.resolution_notes:
                    dispute.resolution_notes += ' '
                dispute.resolution_notes += f"Platform voucher issued for booking #{booking.id}."
            else:
                if not account_number:
                    return Response(
                        {'error': 'account_number is required for gcash/maya refunds'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                dispute.refund_account_number = account_number
                dispute.status = DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT
                dispute.resolved_at = None

            dispute.save(update_fields=[
                'refund_method',
                'refund_account_number',
                'status',
                'resolved_at',
                'is_client_verified',
                'refund_receiver',
                'resolution_notes',
            ])

        if refund_method == DisputeBooking.RefundMethod.VOUCHER:
            _broadcast_booking_action(booking, 'booking.dispute_resolved_voucher', 'Dispute resolved via platform voucher fallback')
            return Response(
                {
                    'message': 'Voucher fallback applied. Dispute resolved.',
                    'dispute': {
                        'id': dispute.id,
                        'status': dispute.status,
                        'refund_method': dispute.refund_method,
                        'resolution_notes': dispute.resolution_notes,
                    },
                    'booking': {
                        'id': booking.id,
                        'status': booking.status,
                        'dispute_status': booking.dispute_status,
                    },
                },
                status=status.HTTP_200_OK,
            )

        _broadcast_booking_action(booking, 'booking.dispute_refund_details_submitted', 'Client submitted refund destination details')
        return Response(
            {
                'message': 'Refund details submitted. Waiting for mechanic payment.',
                'dispute': {
                    'id': dispute.id,
                    'status': dispute.status,
                    'refund_method': dispute.refund_method,
                    'refund_account_number': dispute.refund_account_number,
                },
                'booking': {
                    'id': booking.id,
                    'status': booking.status,
                    'dispute_status': booking.dispute_status,
                },
            },
            status=status.HTTP_200_OK,
        )
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_my_disputes(request):
    """List disputes where current account is complainer or complaint target."""
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        disputes = (
            DisputeBooking.objects.select_related('booking', 'complainer', 'complaint_against')
            .filter(Q(complainer=account) | Q(complaint_against=account))
            .order_by('-created_at')
        )

        results = []
        for dispute in disputes:
            results.append(
                {
                    'id': dispute.id,
                    'booking_id': dispute.booking_id,
                    'booking_status': dispute.booking.status,
                    'booking_dispute_status': dispute.booking.dispute_status,
                    'status': dispute.status,
                    'issue_description': dispute.issue_description,
                    'issue_picture': dispute.issue_picture.url if dispute.issue_picture else None,
                    'complainer': {
                        'id': dispute.complainer.id,
                        'name': f"{dispute.complainer.firstname} {dispute.complainer.lastname}".strip(),
                    },
                    'complaint_against': {
                        'id': dispute.complaint_against.id,
                        'name': f"{dispute.complaint_against.firstname} {dispute.complaint_against.lastname}".strip(),
                    },
                    'resolution_notes': dispute.resolution_notes,
                    'amount_refunded': float(dispute.amount_refunded) if dispute.amount_refunded is not None else None,
                    'refund_method': dispute.refund_method,
                    'refund_account_number': dispute.refund_account_number,
                    'is_client_verified': dispute.is_client_verified,
                    'refund_receipt_image': dispute.refund_receipt_image.url if dispute.refund_receipt_image else None,
                    'created_at': dispute.created_at.isoformat() if dispute.created_at else None,
                    'resolved_at': dispute.resolved_at.isoformat() if dispute.resolved_at else None,
                }
            )

        return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _serialize_bookings(bookings_queryset, viewer_account=None):
    """Helper function to serialize a queryset of bookings"""
    bookings_data = []
    
    for booking in bookings_queryset:
        bookings_data.append(_serialize_single_booking(booking, viewer_account=viewer_account))
    
    return bookings_data


def _serialize_single_booking(booking, viewer_account=None):
    """Helper function to serialize a single booking with all details"""
    broadcast_request_payload = None
    accepted_offer = None
    if hasattr(booking.request, 'broadcast_request') and booking.request.broadcast_request is not None:
        br = booking.request.broadcast_request
        broadcast_request_payload = {
            'latitude': float(br.latitude) if br.latitude is not None else None,
            'longitude': float(br.longitude) if br.longitude is not None else None,
        }
        accepted_offer = BroadcastOffer.objects.filter(
            broadcast_request=br,
            status=BroadcastOffer.Status.ACCEPTED,
        ).order_by('-responded_at', '-id').first()

    distance_value = getattr(booking, 'distance_km', None)
    if distance_value is None and accepted_offer and accepted_offer.distance_km is not None:
        distance_value = accepted_offer.distance_km

    eta_value = getattr(booking, 'eta_minutes', None)
    if eta_value is None and accepted_offer and accepted_offer.estimated_eta_minutes is not None:
        eta_value = accepted_offer.estimated_eta_minutes

    traffic_level_value = None
    if accepted_offer and accepted_offer.traffic_level:
        traffic_level_value = accepted_offer.traffic_level

    booking_data = {
        'id': booking.id,
        'status': booking.status,
        'dispute_status': booking.dispute_status,
        'amount_fee': float(booking.amount_fee),
        'convenience_fee': float(booking.convenience_fee) if getattr(booking, 'convenience_fee', None) is not None else None,
        'traffic_surcharge': float(booking.traffic_surcharge) if getattr(booking, 'traffic_surcharge', None) is not None else None,
        'distance_km': float(distance_value) if distance_value is not None else None,
        'estimated_eta_minutes': int(eta_value) if eta_value is not None else None,
        'traffic_level': traffic_level_value,
        'booked_at': booking.booked_at.isoformat(),
        'updated_at': booking.updated_at.isoformat(),
        'completed_at': booking.completed_at.isoformat() if booking.completed_at else None,
        'request': {
            'id': booking.request.id,
            'type': booking.request.request_type,
            'vehicle_type': booking.request.vehicle_type,
            'vehicle_brand': booking.request.vehicle_brand,
            'vehicle_model': booking.request.vehicle_model,
            'created_at': booking.request.created_at.isoformat(),
            'broadcast_request': broadcast_request_payload,
            'assigned_mechanics': [
                {
                    'id': a.id,
                    'role': a.role,
                    'mechanic': {
                        'id': a.mechanic.id,
                        'firstname': a.mechanic.firstname,
                        'lastname': a.mechanic.lastname,
                        'username': a.mechanic.username,
                    },
                    'assigned_at': a.assigned_at.isoformat() if a.assigned_at else None,
                }
                for a in RequestAssignment.objects.filter(request=booking.request).select_related('mechanic')
            ],
        },
        'provider': {
            'id': booking.request.provider.id,
            'name': f"{booking.request.provider.firstname} {booking.request.provider.lastname}",
            'email': booking.request.provider.email,
        } if booking.request.provider else None,
        'client': {
            'firstname':booking.request.client.account.firstname,
            'lastname':booking.request.client.account.lastname,
            'username':booking.request.client.account.username,
            'email':booking.request.client.account.email,
            } if booking.request.client and hasattr(booking.request.client, 'account') else None,
        'service_location': {
            'street_name': booking.request.service_location.street_name,
            'subdivision_village': booking.request.service_location.subdivision_village,
            'barangay': booking.request.service_location.barangay,
            'city_municipality': booking.request.service_location.city_municipality,
            'landmark': booking.request.service_location.landmark,
        } if booking.request.service_location else None,
    }
    
    # Add active booking runtime details when ActiveBooking exists
    if hasattr(booking, 'activebooking'):
        active = booking.activebooking
        booking_data['active_details'] = {
            'before_picture': active.before_picture_service.url if active.before_picture_service else None,
            'after_picture': active.after_picture_service.url if active.after_picture_service else None,
            'is_job_done': active.is_job_done,
            'is_rescheduled': active.is_rescheduled,
            'reason': active.reason,
            'new_time': active.new_time.isoformat() if active.new_time else None,
            'new_date': active.new_date.isoformat() if active.new_date else None,
            'started_at': active.started_at.isoformat() if active.started_at else None,
            'paused_at': active.paused_at.isoformat() if getattr(active, 'paused_at', None) else None,
            'total_pause_duration': str(active.total_pause_duration) if getattr(active, 'total_pause_duration', None) is not None else None,
        }
    
    elif booking.status == 'cancelled' and hasattr(booking, 'cancelbooking'):
        cancel = booking.cancelbooking
        booking_data['cancellation_details'] = {
            'cancelled_by': {
                'id': cancel.cancelled_by.id,
                'name': f"{cancel.cancelled_by.firstname} {cancel.cancelled_by.lastname}",
            },
            'reason': cancel.reason,
            'cancelled_at': cancel.cancelled_at.isoformat(),
        }
    
    elif booking.status == 'reworked' and hasattr(booking, 'reworkbooking'):
        rework = booking.reworkbooking
        booking_data['rework_details'] = {
            'requested_by': {
                'id': rework.requested_by.id,
                'name': f"{rework.requested_by.firstname} {rework.requested_by.lastname}",
            },
            'reason': rework.reason,
            'created_at': rework.created_at.isoformat(),
            'completed_at': rework.completed_at.isoformat() if rework.completed_at else None,
        }
    
    if hasattr(booking, 'disputebooking'):
        dispute = booking.disputebooking
        booking_data['dispute_details'] = {
            'complainer': {
                'id': dispute.complainer.id,
                'name': f"{dispute.complainer.firstname} {dispute.complainer.lastname}",
            },
            'complaint_against': {
                'id': dispute.complaint_against.id,
                'name': f"{dispute.complaint_against.firstname} {dispute.complaint_against.lastname}",
            },
            'issue_description': dispute.issue_description,
            'issue_picture': dispute.issue_picture.url if dispute.issue_picture else None,
            'mechanic_defense_description': dispute.mechanic_defense_description,
            'mechanic_defense_picture': dispute.mechanic_defense_picture.url if dispute.mechanic_defense_picture else None,
            'refund_receipt_image': dispute.refund_receipt_image.url if dispute.refund_receipt_image else None,
            'resolution_notes': dispute.resolution_notes,
            'dispute_status': dispute.status,
            'refund_method': dispute.refund_method,
            'refund_account_number': dispute.refund_account_number,
            'is_client_verified': dispute.is_client_verified,
            'amount_refunded': float(dispute.amount_refunded) if dispute.amount_refunded else None,
            'created_at': dispute.created_at.isoformat(),
            'resolved_at': dispute.resolved_at.isoformat() if dispute.resolved_at else None,
        }
    
    elif booking.status == 'completed' and hasattr(booking, 'completebooking'):
        complete = booking.completebooking
        booking_data['completion_details'] = {
            'completed_at': complete.completed_at.isoformat(),
            'total_amount': float(complete.total_amount),
            'notes': complete.notes,
        }
    # Attach request-level details (service / services / add-ons) in a separate
    # block to avoid disturbing the control-flow above. This is used by the
    # mobile app to prefill mechanic quotations with the availed service.
    try:
        req = booking.request
        rd = {'type': req.request_type}

        # Direct request: single service + possible add-ons
        if hasattr(req, 'directrequest') and getattr(req, 'directrequest') is not None:
            try:
                svc = req.directrequest.service
                if svc:
                    rd['service'] = {
                        'id': svc.id,
                        'name': svc.name,
                        'minimum_price': float(svc.minimum_price) if getattr(svc, 'minimum_price', None) is not None else None,
                    }
                # collect add-ons for direct requests
                addons = []
                from ...models import DirectRequestAddOn
                for a in DirectRequestAddOn.objects.filter(request=req).select_related('service_add_on'):
                    sao = a.service_add_on
                    if sao:
                        addons.append({'id': sao.id, 'name': sao.name, 'price': float(sao.price)})
                if addons:
                    rd['add_ons'] = addons
            except Exception:
                pass

        # Broadcast request: multiple services + broadcast add-ons
        if hasattr(req, 'broadcast_request') and getattr(req, 'broadcast_request') is not None:
            try:
                br = req.broadcast_request
                rd['services'] = []
                for s in br.services.all():
                    rd['services'].append({'id': s.id, 'name': s.name, 'minimum_price': float(s.minimum_price) if getattr(s, 'minimum_price', None) is not None else None})
                # broadcast add-ons
                addons = []
                from ...models import BroadcastRequestAddOn
                for a in BroadcastRequestAddOn.objects.filter(broadcast_request=br).select_related('service_add_on'):
                    sao = a.service_add_on
                    if sao:
                        addons.append({'id': sao.id, 'name': sao.name, 'price': float(sao.price)})
                if addons:
                    rd['add_ons'] = addons
                rd['description'] = br.description
            except Exception:
                pass

        # Custom request: description and quoted price if present
        if hasattr(req, 'customrequest') and getattr(req, 'customrequest') is not None:
            try:
                cr = req.customrequest
                rd['description'] = cr.description
                rd['quoted_price'] = float(cr.quoted_price) if cr.quoted_price is not None else None
            except Exception:
                pass

        # Emergency request: include description
        if hasattr(req, 'emergencyrequest') and getattr(req, 'emergencyrequest') is not None:
            try:
                er = req.emergencyrequest
                rd['description'] = er.description
            except Exception:
                pass

        booking_data['request']['request_details'] = rd
    except Exception:
        # never fail serialization for minor request detail issues
        pass

    # Attach mechanic quotation if one exists for this booking (manual build)
    try:
        try:
            q = booking.quotation
            qd = {
                'id': q.id,
                'mechanic_id': q.mechanic.id if q.mechanic else None,
                'status': q.status,
                'notes': q.notes,
                'total_amount': float(q.total_amount) if q.total_amount is not None else None,
                'is_final': bool(q.is_final),
                'created_at': q.created_at.isoformat() if q.created_at else None,
                'updated_at': q.updated_at.isoformat() if q.updated_at else None,
                'items': []
            }
            # While quotation is pending, keep rejected item rows visible so clients can
            # review pending removal proposals in pricing/quotation sections.
            items_qs = q.items.all() if str(q.status).lower() == 'pending' else q.items.exclude(status='rejected')
            for it in items_qs:
                qd['items'].append({
                    'id': it.id,
                    'service': it.service.id if it.service else None,
                    'service_add_on': it.service_add_on.id if it.service_add_on else None,
                    'description': it.description,
                    'quantity': it.quantity,
                    'unit_price': float(it.unit_price),
                    'line_total': float(it.line_total) if hasattr(it, 'line_total') else float(it.quantity * it.unit_price),
                    'status': it.status if hasattr(it, 'status') and it.status is not None else q.status,
                    'change_type': getattr(it, 'change_type', None),
                    'previous_description': getattr(it, 'previous_description', None),
                    'previous_quantity': getattr(it, 'previous_quantity', None),
                    'previous_unit_price': float(it.previous_unit_price) if getattr(it, 'previous_unit_price', None) is not None else None,
                })
            booking_data['quotation'] = qd
        except Exception:
            # no related quotation present
            pass
    except Exception:
        # don't fail serialization if quotation construction fails
        pass

    # Attach backjob info when present
    try:
        if hasattr(booking, 'backjob') and booking.backjob is not None:
            bj = booking.backjob
            booking_data['has_backjob'] = True
            booking_data['backjob'] = {
                'id': bj.id,
                'status': bj.status,
                'reason': bj.reason,
                'images': bj.images or [],
                'requested_by': {
                    'id': bj.requested_by.id,
                    'name': f"{bj.requested_by.firstname} {bj.requested_by.lastname}",
                } if bj.requested_by else None,
                'created_at': bj.created_at.isoformat() if bj.created_at else None,
            }
        else:
            booking_data['has_backjob'] = False
    except Exception:
        booking_data['has_backjob'] = False

    # Attach payment/receipt information so clients and mechanics can see chosen method
    try:
        if hasattr(booking, 'receipt') and booking.receipt is not None:
            receipt = booking.receipt
            booking_data['payment'] = {
                'payment_method': receipt.payment_method,
                'payment_received': bool(receipt.payment_received),
                'transaction_id': receipt.transaction_id,
            }
        else:
            booking_data['payment'] = None
    except Exception:
        booking_data['payment'] = None

    # Installment-aware payment summary used by mobile UIs.
    try:
        booking_data['payment_summary'] = _build_booking_payment_summary(booking)
    except Exception:
        booking_data['payment_summary'] = {
            'payment_status': getattr(booking, 'payment_status', 'unpaid'),
            'total_paid': 0.0,
            'remaining_balance': float(booking.amount_fee),
            'installments': [],
        }

    # Attach mechanic review state for client-side rating prompt.
    try:
        provider_account = getattr(booking.request, 'provider', None)
        viewer_is_client = bool(viewer_account and hasattr(viewer_account, 'client'))
        can_rate = False
        review_payload = None

        if viewer_is_client and provider_account is not None:
            try:
                mechanic = provider_account.mechanic
                payment_status = str((booking_data.get('payment_summary') or {}).get('payment_status', '')).lower()
                can_rate = booking.status == Booking.Status.COMPLETED and payment_status == Booking.PaymentStatus.FULLY_PAID

                review_obj = MechanicReview.objects.filter(reviewer=viewer_account, mechanic=mechanic).first()
                if review_obj is not None:
                    review_payload = {
                        'id': review_obj.id,
                        'rating': review_obj.rating,
                        'comment': review_obj.comment,
                        'created_at': review_obj.created_at.isoformat() if review_obj.created_at else None,
                    }
            except Mechanic.DoesNotExist:
                pass

        booking_data['mechanic_review'] = {
            'can_rate': bool(can_rate),
            'has_review': review_payload is not None,
            'review': review_payload,
        }
    except Exception:
        booking_data['mechanic_review'] = {
            'can_rate': False,
            'has_review': False,
            'review': None,
        }

    return booking_data


@api_view(['POST'])
@permission_classes([AllowAny])
def client_accept_quotation(request, booking_id):
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can accept quotations'}, status=status.HTTP_403_FORBIDDEN)

        booking = Booking.objects.select_related('quotation', 'request__client').get(id=booking_id)
        if booking.request.client.account.id != account.id:
            return Response({'error': 'Not permitted'}, status=status.HTTP_403_FORBIDDEN)

        try:
            quotation = booking.quotation
        except Exception:
            return Response({'error': 'No quotation found'}, status=status.HTTP_404_NOT_FOUND)

        from ...models import Quotation
        quotation.status = Quotation.Status.ACCEPTED
        quotation.save(update_fields=['status'])

        # Only promote pending proposal rows to accepted.
        # Rejected rows are pending removal proposals and should be removed on accept.
        try:
            quotation.items.filter(status=Quotation.Status.PENDING).update(status=Quotation.Status.ACCEPTED)
            quotation.items.filter(status=Quotation.Status.ACCEPTED).update(
                change_type=None,
                previous_description=None,
                previous_quantity=None,
                previous_unit_price=None,
            )
            quotation.items.filter(status=Quotation.Status.REJECTED).delete()
        except Exception as e:
            print(f"DEBUG: Failed to update QuotationItem statuses for Quotation {quotation.id}: {e}")

        # Verify persistence immediately and print DB value for debugging
        try:
            fresh = Quotation.objects.get(id=quotation.id)
            print(f"DEBUG: Quotation {quotation.id} after save status in DB is: {fresh.status}")
            # print a sample of item statuses
            item_statuses = list(fresh.items.values_list('id', 'status'))
            print(f"DEBUG: Quotation {quotation.id} item statuses: {item_statuses}")
        except Exception as e:
            print(f"DEBUG: Failed to re-load Quotation {quotation.id} after save: {e}")

        print(f"DEBUG: Acceptance triggered for Quotation {quotation.id}")

        # Find and update only the latest pending quotation request message for this quotation.
        # Do not rewrite historical rejected/accepted snapshots.
        try:
            from chat.models import Message as ChatMessage
            import json

            messages = ChatMessage.objects.filter(
                conversation__booking_id=booking.id,
                content__contains='"quotation_id"'
            ).order_by('-created_at')

            latest_pending_message_id = None
            for m in messages:
                try:
                    payload = json.loads(m.content) if isinstance(m.content, str) else m.content
                except Exception:
                    continue
                if not isinstance(payload, dict):
                    continue
                if payload.get('type') != 'quotation_request':
                    continue
                if str(payload.get('quotation_id')) != str(quotation.id):
                    continue
                if str(payload.get('status', '')).lower() == 'pending':
                    latest_pending_message_id = m.id
                    break

            updated = 0
            for m in messages:
                try:
                    payload = json.loads(m.content) if isinstance(m.content, str) else m.content
                except Exception:
                    # skip non-json content
                    continue

                try:
                    # Ensure payload is a dict and matches the quotation id (compare as strings to be robust)
                    if isinstance(payload, dict) and payload.get('type') == 'quotation_request' and str(payload.get('quotation_id')) == str(quotation.id):
                        if str(payload.get('status', '')).lower() != 'pending':
                            continue
                        if latest_pending_message_id is not None and m.id != latest_pending_message_id:
                            continue

                        payload['status'] = 'accepted'
                        # keep accepted message items aligned with DB accepted rows only
                        payload['items'] = []
                        try:
                            for it in quotation.items.filter(status=Quotation.Status.ACCEPTED):
                                payload['items'].append({
                                    'id': it.id,
                                    'service': it.service_id,
                                    'service_add_on': it.service_add_on_id,
                                    'description': it.description,
                                    'quantity': int(it.quantity),
                                    'unit_price': float(it.unit_price),
                                    'line_total': float(it.line_total),
                                    'status': 'accepted',
                                })
                        except Exception:
                            pass
                        # overwrite content with updated payload and save normally so auto timestamps update
                        m.content = json.dumps(payload)
                        m.save()
                        updated += 1
                except Exception:
                    continue

            print(f"DEBUG: Updated {updated} messages for quotation {quotation.id}")
            # Explicit success trace required for debugging acceptance propagation
            print(f"DEBUG: Successfully updated message payload to ACCEPTED. Broadcasting now...")
        except Exception as e:
            print(f"DEBUG: Error while updating chat messages for quotation {quotation.id}: {e}")

        # Recalculate totals from accepted rows only.
        accepted_total = 0
        try:
            accepted_total = sum(float(it.line_total) for it in quotation.items.filter(status=Quotation.Status.ACCEPTED))
        except Exception:
            accepted_total = 0

        quotation.total_amount = accepted_total
        quotation.save(update_fields=['total_amount', 'updated_at'])

        # Update booking amount and complete/receipt if present
        booking.amount_fee = accepted_total
        booking.save(update_fields=['amount_fee', 'updated_at'])

        # Update CompleteBooking if exists
        try:
            complete = CompleteBooking.objects.filter(booking=booking).first()
            if complete:
                complete.total_amount = accepted_total
                complete.save(update_fields=['total_amount'])
        except Exception:
            pass

        # post system chat message about acceptance
        try:
            from ...ws_utils import post_quotation_chat_message
            post_quotation_chat_message(account, booking, quotation, action='accepted')
        except Exception:
            pass

        # notify parties via websocket booking events
        try:
            from ...ws_utils import notify_booking_parties
            mechanic_id = getattr(booking.request.provider, 'id', None)
            notify_booking_parties(mechanic_id, account.id, booking.id, booking.status, 'Quotation accepted')
        except Exception:
            pass

        # Explicitly broadcast a quotation_accepted event to mechanic personal group
        try:
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            mechanic_id = getattr(booking.request.provider, 'id', None)
            if channel_layer and mechanic_id:
                payload = {
                    'type': 'booking_update',
                    'action': 'quotation_accepted',
                    'booking_id': booking.id,
                    'quotation_id': quotation.id,
                    'status': 'accepted',
                    'message': 'Quotation accepted by client',
                }
                from asgiref.sync import async_to_sync
                async_to_sync(channel_layer.group_send)(f'user_{mechanic_id}', payload)
        except Exception:
            pass

        # Also broadcast to booking-specific group so viewers listening to booking channels update
        try:
            from channels.layers import get_channel_layer
            channel_layer = get_channel_layer()
            if channel_layer:
                booking_payload = {
                    'type': 'booking_update',
                    'action': 'quotation_accepted',
                    'booking_id': booking.id,
                    'quotation_id': quotation.id,
                    'status': 'accepted',
                    'message': 'Quotation accepted by client',
                }
                from asgiref.sync import async_to_sync
                async_to_sync(channel_layer.group_send)(f'booking_{booking.id}', booking_payload)
                print(f"DEBUG: Broadcasted quotation_accepted for booking_{booking.id}")
        except Exception as e:
            print(f"DEBUG: Failed to broadcast to booking group for quotation {quotation.id}: {e}")

        return Response({'message': 'Quotation accepted', 'quotation_id': quotation.id}, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@permission_classes([AllowAny])
def client_reject_quotation(request, booking_id):
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can reject quotations'}, status=status.HTTP_403_FORBIDDEN)

        booking = Booking.objects.select_related('quotation', 'request__client').get(id=booking_id)
        if booking.request.client.account.id != account.id:
            return Response({'error': 'Not permitted'}, status=status.HTTP_403_FORBIDDEN)

        try:
            quotation = booking.quotation
        except Exception:
            return Response({'error': 'No quotation found'}, status=status.HTTP_404_NOT_FOUND)

        from ...models import Quotation
        # Reject only pending proposal items. If a pending item was an edit of an
        # accepted item, restore it from the latest accepted chat snapshot.
        latest_accepted_snapshot = {}
        latest_baseline_snapshot = {}
        latest_pending_message_id = None
        try:
            from chat.models import Message as ChatMessage
            import json

            snapshot_messages = ChatMessage.objects.filter(
                conversation__booking_id=booking.id,
                content__contains='"quotation_id"'
            ).order_by('-created_at')

            pending_seen = False
            for sm in snapshot_messages:
                try:
                    sp = json.loads(sm.content) if isinstance(sm.content, str) else sm.content
                except Exception:
                    continue
                if not isinstance(sp, dict):
                    continue
                if sp.get('type') != 'quotation_request':
                    continue
                if str(sp.get('quotation_id')) != str(quotation.id):
                    continue
                msg_status = str(sp.get('status', '')).lower()

                if not pending_seen and msg_status == 'pending':
                    pending_seen = True
                    latest_pending_message_id = sm.id
                    continue

                if pending_seen and msg_status == 'accepted' and not latest_accepted_snapshot:
                    for idx, sit in enumerate((sp.get('items') or [])):
                        try:
                            sid = int(sit.get('id')) if sit.get('id') is not None else None
                        except Exception:
                            sid = None
                        if sid is None:
                            sid = -(idx + 1)
                        latest_accepted_snapshot[sid] = sit

                if pending_seen and msg_status != 'rejected' and not latest_baseline_snapshot:
                    for idx, sit in enumerate((sp.get('items') or [])):
                        try:
                            sid = int(sit.get('id')) if sit.get('id') is not None else None
                        except Exception:
                            sid = None
                        if sid is None:
                            sid = -(idx + 1)
                        latest_baseline_snapshot[sid] = sit

                if latest_accepted_snapshot and latest_baseline_snapshot:
                    break
        except Exception:
            latest_accepted_snapshot = {}
            latest_baseline_snapshot = {}
            latest_pending_message_id = None

        snapshot_to_restore = latest_accepted_snapshot or latest_baseline_snapshot

        pending_exists = quotation.items.filter(status=Quotation.Status.PENDING).exists()
        pending_request_exists = pending_exists or (latest_pending_message_id is not None) or (str(getattr(quotation, 'status', '')).lower() == 'pending')

        # Strong revert guarantee: when rejecting pending edits, rebuild current quotation items
        # from the latest accepted snapshot so no edited value can push through.
        if pending_request_exists and snapshot_to_restore:
            try:
                quotation.items.all().delete()
            except Exception:
                pass

            for _sid, snap in snapshot_to_restore.items():
                try:
                    # Reject means rollback to baseline state, so restored rows must be accepted.
                    item_status = Quotation.Status.ACCEPTED
                    quotation.items.create(
                        service_id=snap.get('service') if snap.get('service') is not None else None,
                        service_add_on_id=snap.get('service_add_on') if snap.get('service_add_on') is not None else None,
                        description=snap.get('description', ''),
                        quantity=snap.get('quantity', 1),
                        unit_price=snap.get('unit_price', 0),
                        status=item_status,
                        change_type=None,
                        previous_description=None,
                        previous_quantity=None,
                        previous_unit_price=None,
                    )
                except Exception:
                    continue
        else:
            # Fallback behavior when snapshot is unavailable.
            pending_items = list(quotation.items.filter(status=Quotation.Status.PENDING))
            for pit in pending_items:
                snap = latest_accepted_snapshot.get(pit.id)
                if snap:
                    pit.description = snap.get('description', pit.description)
                    pit.quantity = snap.get('quantity', pit.quantity)
                    pit.unit_price = snap.get('unit_price', pit.unit_price)
                    pit.service_id = snap.get('service') if snap.get('service') is not None else None
                    pit.service_add_on_id = snap.get('service_add_on') if snap.get('service_add_on') is not None else None
                    pit.status = Quotation.Status.ACCEPTED
                    pit.change_type = None
                    pit.previous_description = None
                    pit.previous_quantity = None
                    pit.previous_unit_price = None
                    pit.save()
                else:
                    # Safety fallback: don't drop data when snapshot is unavailable.
                    # Revert proposal state so edited accepted rows do not disappear.
                    pit.status = Quotation.Status.ACCEPTED
                    pit.change_type = None
                    pit.previous_description = None
                    pit.previous_quantity = None
                    pit.previous_unit_price = None
                    pit.save()

            # If snapshot is unavailable, also revert pending removal proposals.
            try:
                quotation.items.filter(status=Quotation.Status.REJECTED).update(
                    status=Quotation.Status.ACCEPTED,
                    change_type=None,
                    previous_description=None,
                    previous_quantity=None,
                    previous_unit_price=None,
                )
            except Exception:
                pass

        # Hard guard: after reject rollback there must be no lingering pending rows.
        try:
            quotation.items.filter(status=Quotation.Status.PENDING).update(
                status=Quotation.Status.ACCEPTED,
                change_type=None,
                previous_description=None,
                previous_quantity=None,
                previous_unit_price=None,
            )
        except Exception:
            pass

        accepted_items_qs = quotation.items.filter(status=Quotation.Status.ACCEPTED)
        accepted_total = 0
        try:
            accepted_total = sum(float(it.line_total) for it in accepted_items_qs)
        except Exception:
            accepted_total = 0

        quotation.status = Quotation.Status.ACCEPTED if accepted_items_qs.exists() else Quotation.Status.REJECTED
        quotation.total_amount = accepted_total
        quotation.save(update_fields=['status', 'total_amount', 'updated_at'])

        # Rejected pending deltas must not affect the booking amount.
        try:
            booking.amount_fee = accepted_total
            booking.save(update_fields=['amount_fee', 'updated_at'])
        except Exception:
            pass

        # Update any existing quotation_request chat messages for this quotation so
        # clients/mechanics see the rejected status on that exact request card.
        try:
            from chat.models import Message as ChatMessage
            import json

            messages = ChatMessage.objects.filter(conversation__booking_id=booking.id, content__contains='"quotation_id"')
            for m in messages:
                try:
                    payload = json.loads(m.content) if isinstance(m.content, str) else m.content
                except Exception:
                    continue

                if isinstance(payload, dict) and payload.get('type') == 'quotation_request' and str(payload.get('quotation_id')) == str(quotation.id):
                    # Preserve historical accepted snapshots. Only stamp currently-pending
                    # quotation requests as rejected.
                    if str(payload.get('status', '')).lower() != 'pending':
                        continue
                    if latest_pending_message_id is not None and m.id != latest_pending_message_id:
                        continue
                    payload['status'] = 'rejected'
                    for pit in payload.get('items', []) or []:
                        try:
                            pstatus = str((pit or {}).get('status', '')).lower()
                            if pstatus == 'pending':
                                pit['status'] = 'rejected'
                        except Exception:
                            continue
                    m.content = json.dumps(payload)
                    m.save()
        except Exception:
            pass

        # post system chat message about rejection
        try:
            from ...ws_utils import post_quotation_chat_message
            post_quotation_chat_message(account, booking, quotation, action='rejected')
        except Exception:
            pass

        try:
            from ...ws_utils import notify_booking_parties
            mechanic_id = getattr(booking.request.provider, 'id', None)
            notify_booking_parties(mechanic_id, account.id, booking.id, booking.status, 'Quotation rejected')
        except Exception:
            pass

        return Response({'message': 'Quotation rejected', 'quotation_id': quotation.id}, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def client_pay_booking(request, booking_id):
    # DEPRECATED: Replaced by payment_views.initiate_payment
    # Kept for reference only - do not use.
    return Response(
        {'error': 'Deprecated endpoint. Use /bookings/payments/initiate/ instead.'},
        status=status.HTTP_410_GONE,
    )


class ReportNoShowView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, booking_id):
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            account = Account.objects.select_related('client').get(id=account_id)
        except Account.DoesNotExist:
            return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can report a no-show'}, status=status.HTTP_403_FORBIDDEN)

        try:
            booking = Booking.objects.select_related(
                'request',
                'request__client',
                'request__provider',
                'request__service_location',
                'request__broadcast_request',
            ).get(id=booking_id)
        except Booking.DoesNotExist:
            return Response({'error': 'Booking not found'}, status=status.HTTP_404_NOT_FOUND)

        if booking.request.client_id != account.client.id:
            return Response({'error': 'You can only report your own bookings'}, status=status.HTTP_403_FORBIDDEN)

        if booking.status not in {Booking.Status.ACCEPTED, Booking.Status.ON_THE_WAY}:
            return Response(
                {'error': 'No-show reporting is only allowed while booking is accepted or on_the_way'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Gate 1: Time gate -> fee_locked_at + eta_minutes + 15 minutes
        if not booking.fee_locked_at or booking.eta_minutes is None:
            return Response(
                {'error': 'Too early to report no-show'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        now = timezone.now()
        grace_deadline = booking.fee_locked_at + timedelta(minutes=int(booking.eta_minutes) + 15)
        if now < grace_deadline:
            return Response(
                {'error': 'Too early to report no-show'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Gate 2: Geo-fence -> reject if mechanic within 200m of service location
        service_location = booking.request.service_location
        if (
            service_location
            and service_location.latitude is not None
            and service_location.longitude is not None
        ):
            mechanic_location = MechanicLocation.objects.filter(booking=booking).first()
            if mechanic_location is not None:
                distance_m = _haversine_meters(
                    float(mechanic_location.latitude),
                    float(mechanic_location.longitude),
                    float(service_location.latitude),
                    float(service_location.longitude),
                )
                if distance_m < 200:
                    return Response(
                        {'error': 'Mechanic is arriving'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        original_request = booking.request
        rescue_service_ids, rescue_add_on_ids = _collect_rescue_services_and_addons(original_request, booking)
        rescue_description = _build_rescue_description(original_request, booking)

        concern_picture = None
        if hasattr(original_request, 'broadcast_request') and original_request.broadcast_request is not None:
            concern_picture = original_request.broadcast_request.concern_picture
        elif hasattr(original_request, 'customrequest') and original_request.customrequest is not None:
            concern_picture = original_request.customrequest.concern_picture
        elif hasattr(original_request, 'emergencyrequest') and original_request.emergencyrequest is not None:
            concern_picture = original_request.emergencyrequest.concern_picture

        rescue_latitude = None
        rescue_longitude = None
        if service_location and service_location.latitude is not None and service_location.longitude is not None:
            rescue_latitude = service_location.latitude
            rescue_longitude = service_location.longitude
        elif hasattr(original_request, 'broadcast_request') and original_request.broadcast_request is not None:
            rescue_latitude = original_request.broadcast_request.latitude
            rescue_longitude = original_request.broadcast_request.longitude

        if rescue_latitude is None or rescue_longitude is None:
            return Response(
                {'error': 'Cannot auto-rescue booking without a valid location'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        penalty_applied_until = None
        offense_count = None

        with transaction.atomic():
            booking.status = Booking.Status.CANCELLED
            booking.save(update_fields=['status', 'updated_at'])

            CancelBooking.objects.update_or_create(
                booking=booking,
                defaults={
                    'cancelled_by': account,
                    'reason': 'Client reported no-show. Auto-rescue broadcast created.',
                },
            )

            # Penalty tiers:
            # 1st offense -> 2h lock, 2nd -> 24h lock, 3rd+ -> 30 days lock.
            try:
                mechanic = None
                if original_request.provider_id:
                    mechanic = Mechanic.objects.select_for_update().filter(account_id=original_request.provider_id).first()

                if mechanic is not None:
                    offense_count = (mechanic.no_show_count or 0) + 1
                    mechanic.no_show_count = offense_count

                    if offense_count == 1:
                        lock_duration = timedelta(hours=2)
                    elif offense_count == 2:
                        lock_duration = timedelta(hours=24)
                    else:
                        lock_duration = timedelta(days=30)

                    penalty_applied_until = now + lock_duration
                    mechanic.cooldown_until = penalty_applied_until
                    mechanic.is_locked = True
                    mechanic.save(update_fields=['no_show_count', 'cooldown_until', 'is_locked', 'updated_at'])
            except Exception:
                logger.exception('Failed to apply no-show penalty for booking %s', booking.id)

            new_request = Request.objects.create(
                client=original_request.client,
                request_type=Request.Type.BROADCAST,
                service_location=original_request.service_location,
                vehicle_type=original_request.vehicle_type,
                vehicle_brand=original_request.vehicle_brand,
                vehicle_model=original_request.vehicle_model,
            )

            new_broadcast = BroadcastRequest.objects.create(
                request=new_request,
                description=rescue_description,
                concern_picture=concern_picture,
                latitude=rescue_latitude,
                longitude=rescue_longitude,
                search_radius_km=10,
                expires_at=now + timedelta(minutes=15),
                status=BroadcastRequest.Status.SEARCHING,
            )

            if rescue_service_ids:
                new_broadcast.services.set(rescue_service_ids)

            for add_on_id in rescue_add_on_ids:
                BroadcastRequestAddOn.objects.get_or_create(
                    broadcast_request=new_broadcast,
                    service_add_on_id=add_on_id,
                )

        try:
            _broadcast_booking_action(
                booking,
                'cancelled_no_show',
                'Booking cancelled due to no-show report and auto-rescue started.',
            )
        except Exception:
            pass

        response_payload = {
            'message': 'No-show reported. Auto-rescue broadcast created.',
            'booking_id': booking.id,
            'broadcast_request_id': new_broadcast.id,
            'request_id': new_request.id,
        }

        if offense_count is not None:
            response_payload['mechanic_no_show_count'] = offense_count
        if penalty_applied_until is not None:
            response_payload['mechanic_cooldown_until'] = penalty_applied_until.isoformat()

        return Response(response_payload, status=status.HTTP_201_CREATED)

