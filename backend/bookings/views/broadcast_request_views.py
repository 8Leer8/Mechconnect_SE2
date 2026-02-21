from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from datetime import timedelta
import json

from ..models import (
    Request, BroadcastRequest, ServiceLocation, BroadcastRequestAddOn
)
from users.models import Account
from services.models import Service, ServiceAddOn


@api_view(['POST'])
@permission_classes([AllowAny])
def create_broadcast_request(request):
    """
    Create a new broadcast request
    Required fields: service_ids (JSON array), description, latitude, longitude, service_location
    Optional: concern_picture, add_on_ids (JSON array)
    """
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can create broadcast requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Extract data
        description = request.data.get('description')
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        concern_picture = request.FILES.get('concern_picture')
        
        # Parse JSON fields
        try:
            service_location_str = request.data.get('service_location')
            if isinstance(service_location_str, str):
                service_location_data = json.loads(service_location_str)
            else:
                service_location_data = service_location_str
            
            service_ids_str = request.data.get('service_ids')
            if isinstance(service_ids_str, str):
                service_ids = json.loads(service_ids_str)
            else:
                service_ids = service_ids_str if service_ids_str else []
            
            # Optional add-ons
            add_on_ids_str = request.data.get('add_on_ids', '[]')
            if isinstance(add_on_ids_str, str):
                add_on_ids = json.loads(add_on_ids_str)
            else:
                add_on_ids = add_on_ids_str if add_on_ids_str else []
        except json.JSONDecodeError as e:
            return Response({
                'error': f'Invalid JSON format: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate required fields
        if not description or not service_location_data:
            return Response({
                'error': 'Description and service location are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not service_ids or len(service_ids) == 0:
            return Response({
                'error': 'At least one service is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if latitude is None or longitude is None:
            return Response({
                'error': 'Latitude and longitude are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (ValueError, TypeError):
            return Response({
                'error': 'Invalid latitude or longitude format'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate services exist
        services = Service.objects.filter(id__in=service_ids)
        if services.count() != len(service_ids):
            return Response({
                'error': 'One or more services not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name'),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay'),
            city_municipality=service_location_data.get('city_municipality'),
            landmark=service_location_data.get('landmark')
        )
        
        # Create base request (no provider for broadcast - will be assigned when accepted)
        new_request = Request.objects.create(
            client=client,
            provider=None,  # No provider yet
            request_type='broadcast',
            service_location=service_location
        )
        
        # Create broadcast request with expiration (30 minutes from now)
        expires_at = timezone.now() + timedelta(minutes=30)
        
        broadcast_request = BroadcastRequest.objects.create(
            request=new_request,
            description=description,
            concern_picture=concern_picture,
            latitude=latitude,
            longitude=longitude,
            expires_at=expires_at,
            status=BroadcastRequest.Status.SEARCHING
        )
        
        # Add services
        broadcast_request.services.set(services)
        
        # Add service add-ons if provided
        if add_on_ids:
            for add_on_id in add_on_ids:
                try:
                    add_on = ServiceAddOn.objects.get(id=add_on_id)
                    BroadcastRequestAddOn.objects.create(
                        broadcast_request=broadcast_request,
                        service_add_on=add_on
                    )
                except ServiceAddOn.DoesNotExist:
                    pass  # Skip invalid add-on IDs
        
        return Response({
            'message': 'Broadcast request created successfully',
            'request_id': new_request.id,
            'broadcast_id': broadcast_request.id,
            'status': broadcast_request.status,
            'expires_at': broadcast_request.expires_at.isoformat()
        }, status=status.HTTP_201_CREATED)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
