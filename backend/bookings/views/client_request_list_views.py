from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from ..models import Request, DirectRequestAddOn
from users.models import Account


@api_view(['GET'])
@permission_classes([AllowAny])
def list_requests(request):
    """
    Get all requests made by the authenticated client.
    Returns requests grouped by type: custom, direct, emergency
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
            'emergencyrequest'
        ).order_by('-created_at')
        
        # Separate by type
        custom_requests = []
        direct_requests = []
        emergency_requests = []
        
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
                
                direct_requests.append({
                    'id': req.id,
                    'provider': {
                        'id': req.provider.id,
                        'name': f"{req.provider.firstname} {req.provider.lastname}"
                    } if req.provider else None,
                    'service': {
                        'id': req.directrequest.service.id,
                        'name': req.directrequest.service.name,
                        'price': float(req.directrequest.service.price)
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
        
        return Response({
            'custom_requests': custom_requests,
            'direct_requests': direct_requests,
            'emergency_requests': emergency_requests,
            'total_count': len(custom_requests) + len(direct_requests) + len(emergency_requests)
        }, status=status.HTTP_200_OK)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
