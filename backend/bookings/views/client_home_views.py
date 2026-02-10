from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch

from ..models import (
    Booking, Request, CustomRequest, DirectRequest, EmergencyRequest, 
    ActiveBooking
)
from ..serializers import BookingSerializer, RequestSerializer
from users.models import Account


@api_view(['GET'])
@permission_classes([AllowAny])
def home_page(request):
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'current_bookings': [],
            'pending_requests': [],
            'message': 'Please log in to see your bookings and requests'
        }, status=status.HTTP_200_OK)
    
    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return Response({
            'current_bookings': [],
            'pending_requests': [],
            'error': 'Account not found'
        }, status=status.HTTP_200_OK)
    
    try:
        if hasattr(account, 'client'):
            client = account.client
            
            current_bookings = Booking.objects.filter(
                request__client=client,
                status__in=['active', 'reworked']
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
                except Exception:
                    continue
        
        elif hasattr(account, 'mechanic'):
            mechanic = account.mechanic
            
            current_bookings = Booking.objects.filter(
                request__provider=account,
                status__in=['active', 'reworked']
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
                status__in=['active', 'reworked']
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
        
        return Response(data, status=status.HTTP_200_OK)
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return Response({
            'current_bookings': [],
            'pending_requests': [],
            'error': str(e)
        }, status=status.HTTP_200_OK)
