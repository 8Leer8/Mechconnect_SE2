from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from datetime import timedelta

from ..models import Request, DirectRequestAddOn, BroadcastRequest
from users.models import Account
from services.models import MechanicService


@api_view(['GET'])
@permission_classes([AllowAny])
def list_requests(request):
    """
    Get all requests made by the authenticated client.
    Returns requests grouped by type: custom, direct, emergency, broadcast.
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required',
            'custom_requests': [],
            'direct_requests': [],
            'emergency_requests': []
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        # Check if user is a client
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can view requests',
                'custom_requests': [],
                'direct_requests': [],
                'emergency_requests': []
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Get all requests made by this client
        all_requests = Request.objects.filter(client=client).select_related(
            'provider',
            'service_location'
        ).prefetch_related(
            'customrequest',
            'directrequest',
            'emergencyrequest',
            'broadcast_request'
        ).order_by('-created_at')
        
        # Separate by type
        custom_requests = []
        direct_requests = []
        emergency_requests = []
        broadcast_requests = []
        
        for req in all_requests:
            if req.request_type == 'custom' and hasattr(req, 'customrequest'):
                custom_requests.append({
                    'id': req.id,
                    'provider': {
                        'id': req.provider.id,
                        'name': f"{req.provider.firstname} {req.provider.lastname}"
                    } if req.provider else None,
                    'description': req.customrequest.description,
                    'status': req.customrequest.request_status,
                    'quoted_price': float(req.customrequest.quoted_price) if req.customrequest.quoted_price else None,
                    'providers_note': req.customrequest.providers_note,
                    'concern_picture': req.customrequest.concern_picture.url if req.customrequest.concern_picture else None,
                    'service_location': {
                        'street_name': req.service_location.street_name,
                        'barangay': req.service_location.barangay,
                        'city_municipality': req.service_location.city_municipality,
                    } if req.service_location else None,
                    'created_at': req.created_at.isoformat(),
                    'has_booking': hasattr(req, 'booking')
                })
            elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
                # Get add-ons for this request
                add_ons = DirectRequestAddOn.objects.filter(request=req).select_related('service_add_on')
                
                # Get the mechanic's price for this service
                service_price = req.directrequest.service.minimum_price  # Default to minimum_price
                if req.provider and hasattr(req.provider, 'mechanic'):
                    try:
                        mechanic_service = MechanicService.objects.get(
                            mechanic=req.provider.mechanic,
                            service=req.directrequest.service
                        )
                        service_price = mechanic_service.price
                    except MechanicService.DoesNotExist:
                        pass  # Use minimum_price as fallback
                
                direct_requests.append({
                    'id': req.id,
                    'provider': {
                        'id': req.provider.id,
                        'name': f"{req.provider.firstname} {req.provider.lastname}"
                    } if req.provider else None,
                    'service': {
                        'id': req.directrequest.service.id,
                        'name': req.directrequest.service.name,
                        'price': float(service_price)  # Use mechanic's specific price
                    },
                    'add_ons': [{
                        'id': addon.service_add_on.id,
                        'name': addon.service_add_on.name,
                        'price': float(addon.service_add_on.price)
                    } for addon in add_ons],
                    'status': req.directrequest.request_status,
                    'service_location': {
                        'street_name': req.service_location.street_name,
                        'barangay': req.service_location.barangay,
                        'city_municipality': req.service_location.city_municipality,
                    } if req.service_location else None,
                    'created_at': req.created_at.isoformat(),
                    'has_booking': hasattr(req, 'booking')
                })
            elif req.request_type == 'emergency' and hasattr(req, 'emergencyrequest'):
                emergency_requests.append({
                    'id': req.id,
                    'provider': {
                        'id': req.provider.id,
                        'name': f"{req.provider.firstname} {req.provider.lastname}"
                    } if req.provider else None,
                    'description': req.emergencyrequest.description,
                    'providers_note': req.emergencyrequest.providers_note,
                    'concern_picture': req.emergencyrequest.concern_picture.url if req.emergencyrequest.concern_picture else None,
                    'service_location': {
                        'street_name': req.service_location.street_name,
                        'barangay': req.service_location.barangay,
                        'city_municipality': req.service_location.city_municipality,
                    } if req.service_location else None,
                    'created_at': req.created_at.isoformat(),
                    'has_booking': hasattr(req, 'booking')
                })
            elif req.request_type == 'broadcast' and hasattr(req, 'broadcast_request'):
                # Update status to expired if time has passed and still searching
                if req.broadcast_request.is_expired():
                    req.broadcast_request.status = BroadcastRequest.Status.EXPIRED
                    req.broadcast_request.save()
                
                # Get services for this broadcast request
                broadcast_services = req.broadcast_request.services.all()
                
                broadcast_requests.append({
                    'id': req.id,
                    'provider': {
                        'id': req.provider.id,
                        'name': f"{req.provider.firstname} {req.provider.lastname}"
                    } if req.provider else None,
                    'description': req.broadcast_request.description,
                    'services': [{
                        'id': service.id,
                        'name': service.name
                    } for service in broadcast_services],
                    'status': req.broadcast_request.status,
                    'concern_picture': req.broadcast_request.concern_picture.url if req.broadcast_request.concern_picture else None,
                    'service_location': {
                        'street_name': req.service_location.street_name,
                        'barangay': req.service_location.barangay,
                        'city_municipality': req.service_location.city_municipality,
                    } if req.service_location else None,
                    'created_at': req.created_at.isoformat(),
                    'expires_at': req.broadcast_request.expires_at.isoformat(),
                    'has_booking': hasattr(req, 'booking')
                })
        
        return Response({
            'custom_requests': custom_requests,
            'direct_requests': direct_requests,
            'emergency_requests': emergency_requests,
            'broadcast_requests': broadcast_requests,
            'total_count': len(custom_requests) + len(direct_requests) + len(emergency_requests) + len(broadcast_requests)
        }, status=status.HTTP_200_OK)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def cancel_request(request, request_id):
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can cancel requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        req = Request.objects.get(id=request_id, client=client)
        
        if hasattr(req, 'booking'):
            return Response({
                'error': 'Cannot cancel a request that already has a booking'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if req.request_type == 'custom' and hasattr(req, 'customrequest'):
            if req.customrequest.request_status == 'cancelled':
                return Response({
                    'error': 'Request is already cancelled'
                }, status=status.HTTP_400_BAD_REQUEST)
            req.customrequest.request_status = 'cancelled'
            req.customrequest.save()
        elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
            if req.directrequest.request_status == 'cancelled':
                return Response({
                    'error': 'Request is already cancelled'
                }, status=status.HTTP_400_BAD_REQUEST)
            req.directrequest.request_status = 'cancelled'
            req.directrequest.save()
        elif req.request_type == 'broadcast' and hasattr(req, 'broadcast_request'):
            # For broadcast requests, delete the entire request
            req.delete()
            return Response({
                'message': 'Broadcast request deleted successfully'
            }, status=status.HTTP_200_OK)
        else:
            return Response({
                'error': 'Invalid request type for cancellation'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'message': 'Request cancelled successfully'
        }, status=status.HTTP_200_OK)
    
    except Request.DoesNotExist:
        return Response({
            'error': 'Request not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def resend_broadcast_request(request, request_id):
    """
    Resend/Reactivate an expired broadcast request by updating its status to SEARCHING
    and setting a new expiration time (30 minutes from now).
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
                'error': 'Only clients can resend broadcast requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Get the request and verify it belongs to the client
        req = Request.objects.get(id=request_id, client=client, request_type='broadcast')
        
        if not hasattr(req, 'broadcast_request'):
            return Response({
                'error': 'This is not a broadcast request'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        broadcast_req = req.broadcast_request
        
        # Only allow resending expired or cancelled requests
        if broadcast_req.status not in [BroadcastRequest.Status.EXPIRED, BroadcastRequest.Status.CANCELLED]:
            return Response({
                'error': 'Only expired or cancelled broadcast requests can be resent'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if there's already a booking
        if hasattr(req, 'booking'):
            return Response({
                'error': 'Cannot resend a request that already has a booking'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Update the broadcast request
        broadcast_req.status = BroadcastRequest.Status.SEARCHING
        broadcast_req.expires_at = timezone.now() + timedelta(minutes=30)
        broadcast_req.save()
        
        return Response({
            'message': 'Broadcast request resent successfully',
            'request_id': req.id,
            'expires_at': broadcast_req.expires_at.isoformat(),
            'status': broadcast_req.status
        }, status=status.HTTP_200_OK)
    
    except Request.DoesNotExist:
        return Response({
            'error': 'Request not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
