from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch, Sum, Avg, Count, Q
from django.utils import timezone
from datetime import timedelta
from collections import Counter

from ..models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest, 
    BroadcastRequest, ActiveBooking
)
from ..serializers import BookingSerializer, RequestSerializer
from users.models import Account


@api_view(['GET'])
@permission_classes([AllowAny])
def home_page(request):
    account_id = request.session.get('account_id')
    
    print(f"[DEBUG] Session account_id: {account_id}")
    
    if not account_id:
        return Response({
            'current_bookings': [],
            'pending_requests': [],
            'message': 'Please log in to see your bookings and requests'
        }, status=status.HTTP_200_OK)
    
    try:
        account = Account.objects.get(id=account_id)
        print(f"[DEBUG] Account found: {account.username} (ID: {account.id})")
    except Account.DoesNotExist:
        return Response({
            'current_bookings': [],
            'pending_requests': [],
            'error': 'Account not found'
        }, status=status.HTTP_200_OK)
    
    try:
        if hasattr(account, 'client'):
            client = account.client
            print(f"[DEBUG] Account has client role, Client ID: {client.id}")
            
            # Check all bookings for this client (regardless of status)
            all_client_bookings = Booking.objects.filter(request__client=client)
            print(f"[DEBUG] Total bookings for client (all statuses): {all_client_bookings.count()}")
            for booking in all_client_bookings:
                print(f"[DEBUG] All bookings - ID: {booking.id}, Status: '{booking.status}', Request ID: {booking.request.id}")
            
            current_bookings = Booking.objects.filter(
                request__client=client,
                status__in=['accepted', 'on_the_way', 'active', 'reworked']
            ).select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__service_location'
            ).prefetch_related(
                Prefetch('activebooking', queryset=ActiveBooking.objects.all())
            ).order_by('-booked_at')
            
            print(f"[DEBUG] Current bookings query count: {current_bookings.count()}")
            for booking in current_bookings:
                print(f"[DEBUG] Booking ID: {booking.id}, Status: {booking.status}, Request ID: {booking.request.id}")
            
            all_requests = Request.objects.filter(
                client=client
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).order_by('-created_at')
            
            filtered_pending_requests = []
            for req in all_requests:
                try:
                    if req.request_type == 'custom' and hasattr(req, 'customrequest'):
                        if req.customrequest.request_status in ['pending', 'quoted']:
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
                        if req.directrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'emergency' and hasattr(req, 'emergencyrequest'):
                        filtered_pending_requests.append(req)
                    elif req.request_type == 'broadcast' and hasattr(req, 'broadcast_request'):
                        if req.broadcast_request.status == 'searching':
                            filtered_pending_requests.append(req)
                except Exception:
                    continue
            
            # Calculate statistics for client dashboard
            now = timezone.now()
            current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Get all completed bookings for statistics
            completed_bookings = Booking.objects.filter(
                request__client=client,
                status='completed'
            ).select_related('request')
            
            # Total completed bookings
            total_bookings = completed_bookings.count()
            
            # Average cost per service
            avg_cost = completed_bookings.aggregate(avg=Avg('amount_fee'))['avg'] or 0
            
            # This month's spending
            month_bookings = completed_bookings.filter(completed_at__gte=current_month_start)
            month_spending = month_bookings.aggregate(total=Sum('amount_fee'))['total'] or 0
            month_count = month_bookings.count()
            
            # Most used service type
            service_type_counts = Counter()
            for booking in completed_bookings:
                service_type_counts[booking.request.request_type] += 1
            most_used_service = service_type_counts.most_common(1)[0][0] if service_type_counts else None
            
            # Service frequency data (last 6 months)
            service_frequency = []
            for i in range(5, -1, -1):
                month_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i*30)).replace(day=1)
                month_end = (month_start + timedelta(days=32)).replace(day=1)
                count = completed_bookings.filter(
                    completed_at__gte=month_start,
                    completed_at__lt=month_end
                ).count()
                service_frequency.append({
                    'month': month_start.strftime('%b'),
                    'count': count
                })
            
            # Monthly spending trend (last 6 months)
            monthly_spending = []
            for i in range(5, -1, -1):
                month_start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=i*30)).replace(day=1)
                month_end = (month_start + timedelta(days=32)).replace(day=1)
                total = completed_bookings.filter(
                    completed_at__gte=month_start,
                    completed_at__lt=month_end
                ).aggregate(total=Sum('amount_fee'))['total'] or 0
                monthly_spending.append({
                    'month': month_start.strftime('%b'),
                    'amount': float(total)
                })
            
            # Prepare statistics object
            statistics = {
                'total_bookings': total_bookings,
                'average_cost': float(avg_cost) if avg_cost else 0,
                'month_spending': float(month_spending),
                'month_bookings': month_count,
                'most_used_service': most_used_service,
                'service_frequency': service_frequency,
                'monthly_spending': monthly_spending
            }
        
        elif hasattr(account, 'mechanic'):
            mechanic = account.mechanic
            
            current_bookings = Booking.objects.filter(
                request__provider=account,
                status__in=['accepted', 'on_the_way', 'active', 'reworked']
            ).select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__service_location'
            ).prefetch_related(
                Prefetch('activebooking', queryset=ActiveBooking.objects.all())
            ).order_by('-booked_at')
            
            all_requests = Request.objects.filter(
                provider=account
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).order_by('-created_at')
            
            filtered_pending_requests = []
            for req in all_requests:
                try:
                    if req.request_type == 'custom' and hasattr(req, 'customrequest'):
                        if req.customrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
                        if req.directrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'emergency' and hasattr(req, 'emergencyrequest'):
                        filtered_pending_requests.append(req)
                except Exception:
                    continue
        
        elif hasattr(account, 'shopowner'):
            shop_owner = account.shopowner
            
            current_bookings = Booking.objects.filter(
                request__provider=account,
                status__in=['accepted', 'on_the_way', 'active', 'reworked']
            ).select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__service_location'
            ).prefetch_related(
                Prefetch('activebooking', queryset=ActiveBooking.objects.all())
            ).order_by('-booked_at')
            
            all_requests = Request.objects.filter(
                provider=account
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).order_by('-created_at')
            
            filtered_pending_requests = []
            for req in all_requests:
                try:
                    if req.request_type == 'custom' and hasattr(req, 'customrequest'):
                        if req.customrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
                        if req.directrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'emergency' and hasattr(req, 'emergencyrequest'):
                        filtered_pending_requests.append(req)
                except Exception:
                    continue
        
        else:
            return Response({
                'current_bookings': [],
                'pending_requests': [],
                'error': 'User does not have a valid role'
            }, status=status.HTTP_200_OK)
        
        data = {
            'current_bookings': BookingSerializer(current_bookings, many=True).data,
            'pending_requests': RequestSerializer(filtered_pending_requests, many=True).data
        }
        
        # Add statistics for client role
        if hasattr(account, 'client'):
            data['statistics'] = statistics
        
        print(f"[DEBUG] Response data - current_bookings count: {len(data['current_bookings'])}")
        print(f"[DEBUG] Response data - pending_requests count: {len(data['pending_requests'])}")
        
        return Response(data, status=status.HTTP_200_OK)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[DEBUG] Exception occurred: {str(e)}")
        return Response({
            'current_bookings': [],
            'pending_requests': [],
            'error': str(e)
        }, status=status.HTTP_200_OK)
