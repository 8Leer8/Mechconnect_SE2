from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from ..models import (
    Request, CustomRequest, DirectRequest, EmergencyRequest,
    ServiceLocation, DirectRequestAddOn
)
from users.models import Account
from services.models import Service, ServiceAddOn


@api_view(['POST'])
@permission_classes([AllowAny])
def create_custom_request(request):
    """
    Create a new custom request
    Required fields: provider_id, description, service_location
    Optional: concern_picture
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
                'error': 'Only clients can create requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Extract data
        provider_id = request.data.get('provider_id')
        description = request.data.get('description')
        service_location_data = request.data.get('service_location')
        concern_picture = request.FILES.get('concern_picture')
        
        # Validate required fields
        if not description or not service_location_data:
            return Response({
                'error': 'Description and service location are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get provider if specified
        provider = None
        if provider_id:
            try:
                provider = Account.objects.get(id=provider_id)
            except Account.DoesNotExist:
                return Response({
                    'error': 'Provider not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name'),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay'),
            city_municipality=service_location_data.get('city_municipality'),
            landmark=service_location_data.get('landmark')
        )
        
        # Create request
        new_request = Request.objects.create(
            client=client,
            provider=provider,
            request_type='custom',
            service_location=service_location
        )
        
        # Create custom request
        custom_request = CustomRequest.objects.create(
            request=new_request,
            description=description,
            concern_picture=concern_picture
        )
        
        return Response({
            'message': 'Custom request created successfully',
            'request_id': new_request.id,
            'status': custom_request.request_status
        }, status=status.HTTP_201_CREATED)
    
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
def create_direct_request(request):
    """
    Create a new direct request
    Required fields: provider_id, service_id, service_location
    Optional: add_on_ids (array of service add-on IDs)
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
                'error': 'Only clients can create requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Extract data
        provider_id = request.data.get('provider_id')
        service_id = request.data.get('service_id')
        service_location_data = request.data.get('service_location')
        add_on_ids = request.data.get('add_on_ids', [])
        
        # Validate required fields
        if not provider_id or not service_id or not service_location_data:
            return Response({
                'error': 'Provider, service, and service location are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get provider and service
        try:
            provider = Account.objects.get(id=provider_id)
            service = Service.objects.get(id=service_id)
        except Account.DoesNotExist:
            return Response({
                'error': 'Provider not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Service.DoesNotExist:
            return Response({
                'error': 'Service not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name'),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay'),
            city_municipality=service_location_data.get('city_municipality'),
            landmark=service_location_data.get('landmark')
        )
        
        # Create request
        new_request = Request.objects.create(
            client=client,
            provider=provider,
            request_type='direct',
            service_location=service_location
        )
        
        # Create direct request
        direct_request = DirectRequest.objects.create(
            request=new_request,
            service=service
        )
        
        # Add service add-ons if provided
        if add_on_ids:
            for add_on_id in add_on_ids:
                try:
                    add_on = ServiceAddOn.objects.get(id=add_on_id)
                    DirectRequestAddOn.objects.create(
                        request=new_request,
                        service_add_on=add_on
                    )
                except ServiceAddOn.DoesNotExist:
                    pass  # Skip invalid add-on IDs
        
        return Response({
            'message': 'Direct request created successfully',
            'request_id': new_request.id,
            'status': direct_request.request_status
        }, status=status.HTTP_201_CREATED)
    
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
def create_emergency_request(request):
    """
    Create a new emergency request
    Required fields: description, service_location
    Optional: concern_picture, provider_id
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
                'error': 'Only clients can create requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Extract data
        provider_id = request.data.get('provider_id')
        description = request.data.get('description')
        service_location_data = request.data.get('service_location')
        concern_picture = request.FILES.get('concern_picture')
        
        # Validate required fields
        if not description or not service_location_data:
            return Response({
                'error': 'Description and service location are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get provider if specified
        provider = None
        if provider_id:
            try:
                provider = Account.objects.get(id=provider_id)
            except Account.DoesNotExist:
                return Response({
                    'error': 'Provider not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name'),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay'),
            city_municipality=service_location_data.get('city_municipality'),
            landmark=service_location_data.get('landmark')
        )
        
        # Create request
        new_request = Request.objects.create(
            client=client,
            provider=provider,
            request_type='emergency',
            service_location=service_location
        )
        
        # Create emergency request
        emergency_request = EmergencyRequest.objects.create(
            request=new_request,
            description=description,
            concern_picture=concern_picture
        )
        
        return Response({
            'message': 'Emergency request created successfully',
            'request_id': new_request.id
        }, status=status.HTTP_201_CREATED)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
