from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch, Q

from ..models import (
    Booking, Request, ActiveBooking, CancelBooking, 
    ReworkBooking, DisputeBooking, CompleteBooking
)
from ..models import Quotation, QuotationItem
from ..serializers import BookingSerializer
from ..serializers import BookingPaymentSerializer
from ..models import Receipt
from notification.models import Notification
from django.utils import timezone
from users.models import Account
import logging

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_client_bookings(request):
    """
    Get bookings for the authenticated client, filtered by status.
    
    Query Parameters:
    - status: Filter by booking status (active, completed, cancelled, reworked, disputed)
              If not provided, returns all bookings grouped by status
    
    Returns bookings with full details including:
    - Request information (service location, provider details)
    - Status-specific details (cancellation reason, rework details, etc.)
    - Timestamps and amounts
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

            # For 'active' tab, merge 'accepted', 'active' and 'on_the_way' statuses
            if status_filter.lower() == 'active':
                bookings_queryset = bookings_queryset.filter(status__in=['accepted', 'active', 'on_the_way', 'pending_payment'])
            else:
                bookings_queryset = bookings_queryset.filter(status=status_filter.lower())

            # Serialize and return filtered bookings
            bookings_data = _serialize_bookings(bookings_queryset)

            return Response({
                'status': status_filter.lower(),
                'bookings': bookings_data,
                'count': len(bookings_data)
            }, status=status.HTTP_200_OK)
        
        # If no filter, return bookings grouped by status
        else:
            # Merge 'accepted', 'active' and 'on_the_way' for the active group
            active_bookings = bookings_queryset.filter(status__in=['accepted', 'active', 'on_the_way', 'pending_payment'])
            completed_bookings = bookings_queryset.filter(status='completed')
            cancelled_bookings = bookings_queryset.filter(status='cancelled')
            reworked_bookings = bookings_queryset.filter(status='reworked')
            disputed_bookings = bookings_queryset.filter(status='disputed')

            return Response({
                'active': {
                    'bookings': _serialize_bookings(active_bookings),
                    'count': active_bookings.count()
                },
                'completed': {
                    'bookings': _serialize_bookings(completed_bookings),
                    'count': completed_bookings.count()
                },
                'cancelled': {
                    'bookings': _serialize_bookings(cancelled_bookings),
                    'count': cancelled_bookings.count()
                },
                'reworked': {
                    'bookings': _serialize_bookings(reworked_bookings),
                    'count': reworked_bookings.count()
                },
                'disputed': {
                    'bookings': _serialize_bookings(disputed_bookings),
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
        booking_data = _serialize_single_booking(booking)
        
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


def _serialize_bookings(bookings_queryset):
    """Helper function to serialize a queryset of bookings"""
    bookings_data = []
    
    for booking in bookings_queryset:
        bookings_data.append(_serialize_single_booking(booking))
    
    return bookings_data


def _serialize_single_booking(booking):
    """Helper function to serialize a single booking with all details"""
    booking_data = {
        'id': booking.id,
        'status': booking.status,
        'amount_fee': float(booking.amount_fee),
        'booked_at': booking.booked_at.isoformat(),
        'updated_at': booking.updated_at.isoformat(),
        'completed_at': booking.completed_at.isoformat() if booking.completed_at else None,
        'request': {
            'id': booking.request.id,
            'type': booking.request.request_type,
            'created_at': booking.request.created_at.isoformat(),
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
    
    elif booking.status == 'disputed' and hasattr(booking, 'disputebooking'):
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
            'resolution_notes': dispute.resolution_notes,
            'dispute_status': dispute.status,
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
    
    # Attach quotation if present so mechanic UI (payments/receipt) can show it
    try:
        if hasattr(booking, 'quotation') and booking.quotation is not None:
            q = booking.quotation
            qd = {
                'id': q.id,
                'mechanic_id': q.mechanic.id if q.mechanic else None,
                'notes': q.notes,
                'total_amount': float(q.total_amount) if q.total_amount is not None else None,
                'is_final': bool(q.is_final),
                'created_at': q.created_at.isoformat() if q.created_at else None,
                'updated_at': q.updated_at.isoformat() if q.updated_at else None,
                'items': []
            }
            for it in q.items.all():
                qd['items'].append({
                    'id': it.id,
                    'service': it.service.id if it.service else None,
                    'service_add_on': it.service_add_on.id if it.service_add_on else None,
                    'description': it.description,
                    'quantity': it.quantity,
                    'unit_price': float(it.unit_price),
                    'line_total': float(it.line_total) if hasattr(it, 'line_total') else float(it.quantity * it.unit_price),
                })
            booking_data['quotation'] = qd
    except Exception:
        pass

    # Attach payment/receipt information if present so clients and mechanics can see chosen method
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

    return booking_data


@api_view(['PATCH'])
@permission_classes([AllowAny])
def client_pay_booking(request, booking_id):
    """Client selects payment method for a booking that is in PENDING_PAYMENT.

    Payload: { payment_method: 'cash' | 'online' }

    - cash: records receipt as paid and marks booking as completed
    - online: records chosen method and leaves booking in pending_payment; actual
      payment confirmation should be handled by a payment gateway webhook that
      updates the Receipt.transaction_id / payment_received later.
    """
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients may perform this action'}, status=status.HTTP_403_FORBIDDEN)
        client = account.client

        booking = Booking.objects.select_related('request', 'request__provider').get(id=booking_id, request__client=client)

        if booking.status != Booking.Status.PENDING_PAYMENT:
            return Response({'error': 'Booking not in pending_payment state'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = BookingPaymentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        pm = serializer.validated_data['payment_method']

        # Create or update receipt record
        receipt, created = Receipt.objects.get_or_create(booking=booking, defaults={
            'payment_received': True if pm == 'cash' else False,
            'payment_method': pm
        })
        if not created:
            receipt.payment_method = pm
            receipt.payment_received = True if pm == 'cash' else False
            receipt.save()

        # Cash is confirmed immediately in this simple flow
        if pm == 'cash':
            booking.status = Booking.Status.COMPLETED
            booking.completed_at = timezone.now()
            booking.save()
            # Create CompleteBooking record if missing
            try:
                CompleteBooking.objects.get_or_create(booking=booking, defaults={'total_amount': booking.amount_fee})
            except Exception:
                logger.exception('Failed to create CompleteBooking for booking %s', booking.id)

            # Notify provider (if any)
            try:
                provider_account = booking.request.provider
                if provider_account:
                    Notification.objects.create(
                        receiver=provider_account,
                        title='Payment received (cash)',
                        message=f'Client confirmed cash payment for Booking #{booking.id}'
                    )
            except Exception:
                logger.exception('Failed to create notification for provider on booking %s', booking.id)

            # Return booking in same shape as get_booking_detail for client to refresh
            try:
                booking_data = _serialize_single_booking(booking)
            except Exception:
                booking_data = BookingSerializer(booking).data

            return Response({'message': 'cash_confirmed', 'booking': booking_data}, status=status.HTTP_200_OK)

        # Online selected — leave booking in pending_payment and record receipt placeholder
        try:
            provider_account = booking.request.provider
            if provider_account:
                Notification.objects.create(
                    receiver=provider_account,
                    title='Payment method selected',
                    message=f'Client selected online payment for Booking #{booking.id}'
                )
        except Exception:
            logger.exception('Failed to create notification for provider on booking %s', booking.id)

        try:
            booking_data = _serialize_single_booking(booking)
        except Exception:
            booking_data = BookingSerializer(booking).data

        return Response({'message': 'online_initiated', 'booking': booking_data}, status=status.HTTP_200_OK)

    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Booking.DoesNotExist:
        return Response({'error': 'Booking not found or not owned by client'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        logger.exception('Unhandled error in client_pay_booking')
        return Response({'error': 'Internal server error'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
