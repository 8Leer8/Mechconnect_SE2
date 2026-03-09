from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from ...models import (
    Request, DirectRequest, DirectRequestAddOn,
    ServiceLocation
)
from users.models import Account, Mechanic
from services.models import Service, ServiceAddOn, MechanicService, ShopService
from shops.models import Shop
from django.db.models import Q


@api_view(['GET'])
@permission_classes([AllowAny])
def get_mechanics(request):
    """
    Get list of available mechanics with their services
    """
    try:
        mechanics = Mechanic.objects.select_related('account').all()
        
        mechanics_data = []
        for mechanic in mechanics:
            account = mechanic.account
            
            # Get mechanic services
            mechanic_services = MechanicService.objects.filter(mechanic=mechanic).select_related('service')
            services = [
                {
                    'id': ms.service.id,
                    'name': ms.service.name,
                    'price': float(ms.price)  # Use mechanic's specific price
                }
                for ms in mechanic_services
            ]
            
            mechanics_data.append({
                'id': account.id,
                'name': f"{account.firstname} {account.lastname}",
                'full_name': f"{account.lastname}, {account.firstname} {account.middlename or ''}".strip(),
                'services': services
            })
        
        return Response({
            'mechanics': mechanics_data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_mechanic_services(request, mechanic_id):
    """
    Get services offered by a specific mechanic with their add-ons
    """
    try:
        mechanic = Mechanic.objects.get(account__id=mechanic_id)
        
        # Get mechanic services
        mechanic_services = MechanicService.objects.filter(mechanic=mechanic).select_related('service')
        
        services_data = []
        for ms in mechanic_services:
            service = ms.service
            
            # Get add-ons for this service
            add_ons = ServiceAddOn.objects.filter(service=service)
            add_ons_data = [
                {
                    'id': addon.id,
                    'name': addon.name,
                    'description': addon.description,
                    'price': float(addon.price)
                }
                for addon in add_ons
            ]
            
            services_data.append({
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'price': float(ms.price),  # Use mechanic's specific price
                'add_ons': add_ons_data
            })
        
        return Response({
            'services': services_data
        }, status=status.HTTP_200_OK)
        
    except Mechanic.DoesNotExist:
        return Response({
            'error': 'Mechanic not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_service_addons(request, service_id):
    """
    Get add-ons for a specific service
    """
    try:
        service = Service.objects.get(id=service_id)
        add_ons = ServiceAddOn.objects.filter(service=service)
        
        add_ons_data = [
            {
                'id': addon.id,
                'name': addon.name,
                'description': addon.description,
                'price': float(addon.price)
            }
            for addon in add_ons
        ]
        
        return Response({
            'add_ons': add_ons_data
        }, status=status.HTTP_200_OK)
        
    except Service.DoesNotExist:
        return Response({
            'error': 'Service not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def create_mechanic_direct_request(request):
    """
    Create a new direct request for a mechanic
    Required fields: provider_id, service_id, service_location, scheduled_time
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
        scheduled_time = request.data.get('scheduled_time')
        
        # Validate required fields
        if not provider_id:
            return Response({
                'error': 'Provider is required'
            }, status=status.HTTP_400_BAD_REQUEST)
            
        if not service_id:
            return Response({
                'error': 'Service is required'
            }, status=status.HTTP_400_BAD_REQUEST)
            
        if not service_location_data:
            return Response({
                'error': 'Service location is required'
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
        
        # Verify provider is a mechanic and offers the service
        if not hasattr(provider, 'mechanic'):
            return Response({
                'error': 'Selected provider is not a mechanic'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get the mechanic service to retrieve their specific price
        try:
            mechanic_service = MechanicService.objects.get(
                mechanic=provider.mechanic,
                service=service
            )
        except MechanicService.DoesNotExist:
            return Response({
                'error': 'Selected mechanic does not offer this service'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name', ''),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay', ''),
            city_municipality=service_location_data.get('city_municipality', ''),
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
        total_amount = float(mechanic_service.price)  # Use mechanic's specific price
        if add_on_ids:
            for add_on_id in add_on_ids:
                try:
                    add_on = ServiceAddOn.objects.get(id=add_on_id, service=service)
                    DirectRequestAddOn.objects.create(
                        request=new_request,
                        service_add_on=add_on
                    )
                    total_amount += float(add_on.price)
                except ServiceAddOn.DoesNotExist:
                    pass  # Skip invalid add-on IDs
        
        return Response({
            'message': 'Direct request created successfully',
            'request_id': new_request.id,
            'request_number': f"{new_request.id:02d}",
            'status': direct_request.request_status,
            'total_amount': total_amount
        }, status=status.HTTP_201_CREATED)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# =============================================
# SHOP DIRECT REQUEST ENDPOINTS
# =============================================

@api_view(['GET'])
@permission_classes([AllowAny])
def get_shops(request):
    """
    Get list of available shops with their services
    """
    try:
        shops = Shop.objects.select_related('shop_owner').filter(status='open')
        
        shops_data = []
        for shop in shops:
            # Get shop services
            shop_services = ShopService.objects.filter(shop=shop).select_related('service')
            services = [
                {
                    'id': ss.service.id,
                    'name': ss.service.name,
                    'price': float(ss.service.minimum_price)  # Use service's minimum price as reference
                }
                for ss in shop_services
            ]
            
            shops_data.append({
                'id': shop.shop_owner.account.id,  # Using shop owner's account ID as provider ID
                'shop_id': shop.id,
                'name': shop.shop_name,
                'full_name': shop.shop_name,
                'services': services,
                'contact_number': shop.contact_number or '',
                'is_verified': shop.is_verified
            })
        
        return Response({
            'shops': shops_data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_shop_services(request, shop_id):
    """
    Get services offered by a specific shop with their add-ons
    """
    try:
        # shop_id here refers to the shop owner's account ID
        from users.models import ShopOwner
        shop_owner = ShopOwner.objects.get(account__id=shop_id)
        shop = shop_owner.shop
        
        # Get shop services
        shop_services = ShopService.objects.filter(shop=shop).select_related('service')
        
        services_data = []
        for ss in shop_services:
            service = ss.service
            
            # Get add-ons for this service
            add_ons = ServiceAddOn.objects.filter(service=service)
            add_ons_data = [
                {
                    'id': addon.id,
                    'name': addon.name,
                    'description': addon.description,
                    'price': float(addon.price)
                }
                for addon in add_ons
            ]
            
            services_data.append({
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'price': float(service.minimum_price),  # Use service's minimum price
                'add_ons': add_ons_data
            })
        
        return Response({
            'services': services_data
        }, status=status.HTTP_200_OK)
        
    except ShopOwner.DoesNotExist:
        return Response({
            'error': 'Shop not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def create_shop_direct_request(request):
    """
    Create a new direct request for a shop
    Required fields: provider_id (shop owner's account ID), service_id, service_location, scheduled_time
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
        scheduled_time = request.data.get('scheduled_time')
        
        # Validate required fields
        if not provider_id:
            return Response({
                'error': 'Provider is required'
            }, status=status.HTTP_400_BAD_REQUEST)
            
        if not service_id:
            return Response({
                'error': 'Service is required'
            }, status=status.HTTP_400_BAD_REQUEST)
            
        if not service_location_data:
            return Response({
                'error': 'Service location is required'
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
        
        # Verify provider is a shop owner and shop offers the service
        if not hasattr(provider, 'shopowner'):
            return Response({
                'error': 'Selected provider is not a shop owner'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        shop = provider.shopowner.shop
        
        # Verify shop offers the service
        try:
            shop_service = ShopService.objects.get(
                shop=shop,
                service=service
            )
        except ShopService.DoesNotExist:
            return Response({
                'error': 'Selected shop does not offer this service'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name', ''),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay', ''),
            city_municipality=service_location_data.get('city_municipality', ''),
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
        total_amount = float(service.minimum_price)  # Use service's minimum price
        if add_on_ids:
            for add_on_id in add_on_ids:
                try:
                    add_on = ServiceAddOn.objects.get(id=add_on_id, service=service)
                    DirectRequestAddOn.objects.create(
                        request=new_request,
                        service_add_on=add_on
                    )
                    total_amount += float(add_on.price)
                except ServiceAddOn.DoesNotExist:
                    pass  # Skip invalid add-on IDs
        
        return Response({
            'message': 'Direct request to shop created successfully',
            'request_id': new_request.id,
            'request_number': f"{new_request.id:02d}",
            'status': direct_request.request_status,
            'total_amount': total_amount
        }, status=status.HTTP_201_CREATED)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

