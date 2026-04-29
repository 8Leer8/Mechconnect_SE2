from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch, Sum, Avg, Count, Q
from django.utils import timezone
from collections import Counter
from dateutil.relativedelta import relativedelta

from ...models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest, 
    BroadcastRequest, ActiveBooking
)
from ...serializers import BookingSerializer, RequestSerializer
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
            # Include booked / payment-related statuses so jobs stay visible after the client
            # picks a mechanic (broadcast creates booking as "booked") and through payment.
            current_bookings = Booking.objects.filter(
                request__client=client,
                status__in=[
                    'booked',
                    'accepted',
                    'on_the_way',
                    'at_location',
                    'diagnosing',
                    'active',
                    'paused',
                    'finished',
                    'pending_payment',
                    'reworked',
                    'backjob_pending',
                ]
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
                client=client
            ).exclude(
                booking__isnull=False
            ).exclude(
                request_type='emergency'
            ).select_related(
                'client',
                'client__account',
                'provider',
                'shop',
                'service_location'
            ).prefetch_related(
                Prefetch('customrequest', queryset=CustomRequest.objects.all()),
                Prefetch('directrequest', queryset=DirectRequest.objects.all()),
                Prefetch('broadcast_request', queryset=BroadcastRequest.objects.all()),
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

            base_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Service frequency data (last 6 months)
            service_frequency = []
            for i in range(5, -1, -1):
                month_start = base_month_start - relativedelta(months=i)
                month_end = month_start + relativedelta(months=1)
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
                month_start = base_month_start - relativedelta(months=i)
                month_end = month_start + relativedelta(months=1)
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
            print(f"[DEBUG] Account has mechanic role, Mechanic ID: {mechanic.id}")
            
            current_bookings = Booking.objects.filter(
                request__provider=account,
                status__in=['accepted', 'on_the_way', 'at_location', 'diagnosing', 'active', 'reworked']
            ).select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__service_location'
            ).prefetch_related(
                Prefetch('activebooking', queryset=ActiveBooking.objects.all())
            ).order_by('-booked_at')
            
            # Get assigned requests
            all_requests = Request.objects.filter(
                provider=account
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).prefetch_related(
                Prefetch('customrequest', queryset=CustomRequest.objects.all()),
                Prefetch('directrequest', queryset=DirectRequest.objects.all()),
                Prefetch('emergencyrequest', queryset=EmergencyRequest.objects.all())
            ).order_by('-created_at')
            
            # Get emergency requests (available to all mechanics)
            emergency_requests = Request.objects.filter(
                request_type='emergency',
                provider__isnull=True
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).prefetch_related(
                Prefetch('emergencyrequest', queryset=EmergencyRequest.objects.all())
            ).order_by('-created_at')
            
            print(f"[DEBUG] Found {emergency_requests.count()} emergency requests without provider")
            
            # Check ALL emergency requests for debugging
            all_emergency = Request.objects.filter(request_type='emergency').select_related('client__account')
            print(f"[DEBUG] Total emergency requests in database: {all_emergency.count()}")
            for er in all_emergency:
                has_booking = hasattr(er, 'booking')
                has_emergency_details = hasattr(er, 'emergencyrequest')
                print(f"[DEBUG] Emergency Request ID: {er.id}, Client: {er.client.account.username if er.client else 'None'}, Provider: {er.provider_id}, Has Booking: {has_booking}, Has EmergencyRequest: {has_emergency_details}")
            
            for er in emergency_requests:
                print(f"[DEBUG] Filtered Emergency Request ID: {er.id}, Client: {er.client.account.username}, Has EmergencyRequest: {hasattr(er, 'emergencyrequest')}")
            
            filtered_pending_requests = []
            
            # Add assigned requests
            for req in all_requests:
                try:
                    if req.request_type == 'custom' and hasattr(req, 'customrequest'):
                        if req.customrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
                        if req.directrequest.request_status == 'pending':
                            filtered_pending_requests.append(req)
                    elif req.request_type == 'emergency':
                        # Add emergency requests even if emergencyrequest doesn't exist
                        filtered_pending_requests.append(req)
                except Exception:
                    continue
            
            # Add all emergency requests (without provider)
            # Emergency requests should show even without emergencyrequest details
            for req in emergency_requests:
                try:
                    # Add to list regardless of emergencyrequest existence
                    # since emergency type requests should always be visible
                    filtered_pending_requests.append(req)
                    print(f"[DEBUG] Added emergency request {req.id} to filtered list (Has details: {hasattr(req, 'emergencyrequest')})")
                except Exception as e:
                    print(f"[DEBUG] Exception adding emergency request {req.id}: {e}")
                    continue
            
            print(f"[DEBUG] Total filtered pending requests for mechanic: {len(filtered_pending_requests)}")
            print(f"[DEBUG] Emergency requests in filtered list: {sum(1 for r in filtered_pending_requests if r.request_type == 'emergency')}")
        
        elif hasattr(account, 'shopowner'):
            shop_owner = account.shopowner

            # Match client home: include booked / in-progress payment states so shop dashboard
            # shows jobs after broadcast finalize or early booking lifecycle.
            current_bookings = Booking.objects.filter(
                request__provider=account,
                status__in=[
                    'booked',
                    'accepted',
                    'on_the_way',
                    'at_location',
                    'diagnosing',
                    'active',
                    'paused',
                    'finished',
                    'pending_payment',
                    'reworked',
                    'backjob_pending',
                ]
            ).select_related(
                'request',
                'request__client',
                'request__client__account',
                'request__provider',
                'request__service_location'
            ).prefetch_related(
                Prefetch('activebooking', queryset=ActiveBooking.objects.all())
            ).order_by('-booked_at')

            # Client requests to this shop: by shop or provider (custom, direct, broadcast only; no emergency)
            request_ids_with_booking = set(
                Booking.objects.values_list('request_id', flat=True)
            )
            try:
                shop = shop_owner.shop
            except Exception:
                shop = None
            shop_filter = Q(provider=account)
            if shop is not None:
                shop_filter = Q(shop=shop) | Q(provider=account)
            all_requests = Request.objects.filter(
                shop_filter
            ).exclude(
                id__in=request_ids_with_booking
            ).exclude(
                request_type='emergency'
            ).select_related(
                'client',
                'client__account',
                'provider',
                'shop',
                'service_location'
            ).prefetch_related(
                Prefetch('customrequest', queryset=CustomRequest.objects.all()),
                Prefetch('directrequest', queryset=DirectRequest.objects.all()),
                Prefetch('broadcast_request', queryset=BroadcastRequest.objects.all()),
            ).order_by('-created_at')

            # Broadcast requests (client broadcast, still searching)
            broadcast_requests = Request.objects.filter(
                request_type='broadcast'
            ).exclude(
                id__in=request_ids_with_booking
            ).filter(
                broadcast_request__status='searching'
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).prefetch_related(
                Prefetch('broadcast_request', queryset=BroadcastRequest.objects.all()),
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
                    elif req.request_type == 'broadcast' and hasattr(req, 'broadcast_request'):
                        if getattr(req.broadcast_request, 'status', None) == 'searching':
                            filtered_pending_requests.append(req)
                except Exception:
                    continue
            for req in broadcast_requests:
                if req.id not in {r.id for r in filtered_pending_requests}:
                    filtered_pending_requests.append(req)
            filtered_pending_requests.sort(key=lambda r: r.created_at, reverse=True)
        
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
