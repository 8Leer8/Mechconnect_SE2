from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from datetime import timedelta

from ...models import Request, DirectRequestAddOn, BroadcastRequest
from users.models import Account
from services.models import MechanicService, ShopService


@api_view(['GET'])
@permission_classes([AllowAny])
def list_requests(request):
    """
    Get all requests made by the authenticated client.
    Returns requests grouped by type: custom, direct, broadcast (no emergency).
    Supports pagination and filtering.
    Query params:
    - page: page number (default: 1)
    - page_size: items per page (default: 5)
    - filter: 'all', 'custom', 'direct', 'broadcast' (default: 'all')
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    # Get pagination and filter params
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 5))
    filter_type = request.GET.get('filter', 'all')
    
    if not account_id:
        return Response({
            'error': 'Authentication required',
            'custom_requests': [],
            'direct_requests': [],
            'emergency_requests': [],
            'broadcast_requests': [],
            'total_count': 0,
            'total_pages': 0,
            'current_page': page
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        # Check if user is a client
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can view requests',
                'custom_requests': [],
                'direct_requests': [],
                'emergency_requests': [],
                'broadcast_requests': [],
                'total_count': 0,
                'total_pages': 0,
                'current_page': page
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Get all requests made by this client (custom, direct, broadcast only; no emergency)
        all_requests_query = Request.objects.filter(client=client).exclude(
            request_type='emergency'
        ).select_related(
            'provider',
            'shop',
            'service_location'
        ).prefetch_related(
            'customrequest',
            'directrequest',
            'broadcast_request'
        )
        
        # Apply filter
        if filter_type == 'custom':
            all_requests_query = all_requests_query.filter(request_type='custom')
        elif filter_type == 'direct':
            all_requests_query = all_requests_query.filter(request_type='direct')
        elif filter_type == 'broadcast':
            all_requests_query = all_requests_query.filter(request_type='broadcast')
        # 'all' means no additional filter
        
        all_requests_query = all_requests_query.order_by('-created_at')
        
        # Calculate total count and pages
        total_count = all_requests_query.count()
        total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 1
        
        # Apply pagination
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        all_requests = all_requests_query[start_index:end_index]
        
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
                    'shop': {
                        'id': req.shop.id,
                        'shop_name': req.shop.shop_name,
                        'contact_number': req.shop.contact_number,
                        'email': req.shop.email
                    } if req.shop else None,
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
                
                # Get the price for this service (shop or mechanic)
                service_price = req.directrequest.service.minimum_price  # Default to minimum_price
                if req.shop:
                    # For shop requests, get shop's price
                    try:
                        shop_service = ShopService.objects.get(
                            shop=req.shop,
                            service=req.directrequest.service
                        )
                        service_price = shop_service.price
                    except ShopService.DoesNotExist:
                        pass  # Use minimum_price as fallback
                elif req.provider and hasattr(req.provider, 'mechanic'):
                    # For mechanic requests, get mechanic's price
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
                    'shop': {
                        'id': req.shop.id,
                        'shop_name': req.shop.shop_name,
                        'contact_number': req.shop.contact_number,
                        'email': req.shop.email
                    } if req.shop else None,
                    'service': {
                        'id': req.directrequest.service.id,
                        'name': req.directrequest.service.name,
                        'price': float(service_price)  # Use shop's or mechanic's specific price
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
                    'shop': {
                        'id': req.shop.id,
                        'shop_name': req.shop.shop_name,
                        'contact_number': req.shop.contact_number,
                        'email': req.shop.email
                    } if req.shop else None,
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
            'total_count': total_count,
            'total_pages': total_pages,
            'current_page': page,
            'page_size': page_size,
            'filter': filter_type
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
def get_request_detail(request, request_id):
    """
    Return detailed information for a single request (custom, direct, broadcast, or emergency).
    This endpoint is intentionally permissive so provider apps (mechanic/shopowner) can fetch
    request details before a booking is created.
    """
    try:
        req = Request.objects.select_related('provider', 'shop', 'service_location').prefetch_related('directrequest', 'customrequest', 'broadcast_request').get(id=request_id)

        base = {
            'id': req.id,
            'request_type': req.request_type,
            'created_at': req.created_at.isoformat() if req.created_at else None,
            'service_location': {
                'street_name': req.service_location.street_name,
                'barangay': req.service_location.barangay,
                'city_municipality': req.service_location.city_municipality,
            } if req.service_location else None,
            'provider': {
                'id': req.provider.id,
                'name': f"{req.provider.firstname} {req.provider.lastname}"
            } if req.provider else None,
            'shop': {
                'id': req.shop.id,
                'shop_name': req.shop.shop_name,
            } if req.shop else None,
            'has_booking': hasattr(req, 'booking')
        }

        # custom
        if req.request_type == 'custom' and hasattr(req, 'customrequest'):
            base.update({
                'type': 'custom',
                'description': req.customrequest.description,
                'quoted_price': float(req.customrequest.quoted_price) if req.customrequest.quoted_price else None,
                'providers_note': req.customrequest.providers_note,
                'concern_picture': req.customrequest.concern_picture.url if req.customrequest.concern_picture else None,
                'status': req.customrequest.request_status,
            })

        # direct
        elif req.request_type == 'direct' and hasattr(req, 'directrequest'):
            # determine service price
            service_price = req.directrequest.service.minimum_price
            from services.models import MechanicService, ShopService
            if req.shop:
                try:
                    shop_service = ShopService.objects.get(shop=req.shop, service=req.directrequest.service)
                    service_price = shop_service.price
                except ShopService.DoesNotExist:
                    pass
            elif req.provider and hasattr(req.provider, 'mechanic'):
                try:
                    mechanic_service = MechanicService.objects.get(mechanic=req.provider.mechanic, service=req.directrequest.service)
                    service_price = mechanic_service.price
                except MechanicService.DoesNotExist:
                    pass

            add_ons = DirectRequestAddOn.objects.filter(request=req).select_related('service_add_on')
            base.update({
                'type': 'direct',
                'service': {
                    'id': req.directrequest.service.id,
                    'name': req.directrequest.service.name,
                    'price': float(service_price)
                },
                'add_ons': [{
                    'id': addon.service_add_on.id,
                    'name': addon.service_add_on.name,
                    'price': float(addon.service_add_on.price)
                } for addon in add_ons],
                'status': req.directrequest.request_status,
            })

        # broadcast
        elif req.request_type == 'broadcast' and hasattr(req, 'broadcast_request'):
            base.update({
                'type': 'broadcast',
                'description': req.broadcast_request.description,
                'services': [{'id': s.id, 'name': s.name} for s in req.broadcast_request.services.all()],
                'status': req.broadcast_request.status,
                'concern_picture': req.broadcast_request.concern_picture.url if req.broadcast_request.concern_picture else None,
                'expires_at': req.broadcast_request.expires_at.isoformat() if req.broadcast_request.expires_at else None,
            })

        # emergency
        elif req.request_type == 'emergency' and hasattr(req, 'emergencyrequest'):
            base.update({
                'type': 'emergency',
                'description': req.emergencyrequest.description,
                'urgency_level': req.emergencyrequest.urgency_level,
                'concern_picture': req.emergencyrequest.concern_picture.url if req.emergencyrequest.concern_picture else None,
            })

        # include minimal client info if available
        if hasattr(req, 'client') and req.client:
            base['client'] = {
                'id': req.client.id,
                'name': f"{req.client.firstname} {req.client.lastname}" if getattr(req.client, 'firstname', None) else getattr(req.client, 'name', None)
            }

        return Response({'request': base}, status=status.HTTP_200_OK)

    except Request.DoesNotExist:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
