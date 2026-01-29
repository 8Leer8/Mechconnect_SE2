from django.shortcuts import render
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.db.models import Q, Prefetch

from .models import Booking, Request, CustomRequest, DirectRequest, EmergencyRequest, ActiveBooking
from .serializers import HomePageSerializer, BookingSerializer, RequestSerializer
from users.models import Client, Mechanic, ShopOwner, Account
from users.permissions import IsClient, IsMechanic, IsShopOwner


@api_view(['GET'])
@permission_classes([AllowAny])  # Changed to AllowAny for testing
def home_page(request):
    """
    Get current bookings and pending requests for the authenticated user.
    Works for clients, mechanics, and shop owners.
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    # If not authenticated, return empty data for testing
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
    
    # Determine user type and get relevant data
    try:
        # Check if user is a client
        if hasattr(account, 'client'):
            client = account.client
            
            # Get current bookings (active, reworked)
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
            
            # Get pending requests (custom: pending/quoted, direct: pending, emergency)
            pending_requests = Request.objects.filter(
                client=client
            ).exclude(
                # Exclude requests that already have bookings
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).prefetch_related(
                Prefetch('customrequest', queryset=CustomRequest.objects.filter(
                    request_status__in=['pending', 'quoted']
                )),
                Prefetch('directrequest', queryset=DirectRequest.objects.filter(
                    request_status='pending'
                )),
                Prefetch('emergencyrequest', queryset=EmergencyRequest.objects.all())
            ).order_by('-created_at')
            
            # Filter to only include requests with pending status
            filtered_pending_requests = []
            for req in pending_requests:
                if req.request_type == 'custom':
                    if hasattr(req, 'customrequest') and req.customrequest.request_status in ['pending', 'quoted']:
                        filtered_pending_requests.append(req)
                elif req.request_type == 'direct':
                    if hasattr(req, 'directrequest') and req.directrequest.request_status == 'pending':
                        filtered_pending_requests.append(req)
                elif req.request_type == 'emergency':
                    if hasattr(req, 'emergencyrequest'):
                        filtered_pending_requests.append(req)
        
        # Check if user is a mechanic
        elif hasattr(account, 'mechanic'):
            mechanic = account.mechanic
            
            # Get current bookings where mechanic is the provider
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
            
            # Get pending requests assigned to this mechanic
            pending_requests = Request.objects.filter(
                provider=account
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).prefetch_related(
                Prefetch('customrequest', queryset=CustomRequest.objects.filter(
                    request_status='pending'
                )),
                Prefetch('directrequest', queryset=DirectRequest.objects.filter(
                    request_status='pending'
                )),
                Prefetch('emergencyrequest', queryset=EmergencyRequest.objects.all())
            ).order_by('-created_at')
            
            filtered_pending_requests = list(pending_requests)
        
        # Check if user is a shop owner
        elif hasattr(account, 'shopowner'):
            shop_owner = account.shopowner
            
            # Get current bookings where shop owner is the provider
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
            
            # Get pending requests assigned to this shop owner
            pending_requests = Request.objects.filter(
                provider=account
            ).exclude(
                booking__isnull=False
            ).select_related(
                'client',
                'client__account',
                'provider',
                'service_location'
            ).prefetch_related(
                Prefetch('customrequest', queryset=CustomRequest.objects.filter(
                    request_status='pending'
                )),
                Prefetch('directrequest', queryset=DirectRequest.objects.filter(
                    request_status='pending'
                )),
                Prefetch('emergencyrequest', queryset=EmergencyRequest.objects.all())
            ).order_by('-created_at')
            
            filtered_pending_requests = list(pending_requests)
        
        else:
            return Response({
                'error': 'User does not have a valid role (client, mechanic, or shop owner)'
            }, status=status.HTTP_403_FORBIDDEN)
        
        # Serialize the data
        data = {
            'current_bookings': BookingSerializer(current_bookings, many=True).data,
            'pending_requests': RequestSerializer(filtered_pending_requests, many=True).data
        }
        
        return Response(data, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
