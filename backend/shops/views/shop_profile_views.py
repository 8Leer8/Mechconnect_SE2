from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Avg, Count
from django.utils import timezone

from ..models import Shop, ShopMechanic
from users.models import ShopOwner, Mechanic
from services.models import ShopService
from MainBackend.storage_utils import get_media_url


@api_view(['GET'])
@permission_classes([AllowAny])
def get_shop_profile(request, shop_id):
    """
    Get detailed shop profile by shop ID
    
    Returns comprehensive profile including:
    - Basic info (name, banner, contact, description)
    - Shop owner info
    - Mechanics working at the shop
    - Services offered by the shop
    - Average rating from mechanics
    - Verification status
    """
    try:
        shop = Shop.objects.select_related('shop_owner__account').get(id=shop_id)
        
        # Get shop owner info
        owner = shop.shop_owner
        owner_account = owner.account
        
        # Get mechanics working at this shop
        shop_mechanics = ShopMechanic.objects.filter(
            shop=shop
        ).select_related('mechanic__account').order_by('-date_joined')
        
        mechanics_data = []
        total_mechanic_ratings = []
        
        for shop_mechanic in shop_mechanics:
            mechanic = shop_mechanic.mechanic
            account = mechanic.account
            
            mechanic_info = {
                'id': mechanic.id,
                'account_id': account.id,
                'full_name': f"{account.firstname} {account.lastname}",
                'firstname': account.firstname,
                'lastname': account.lastname,
                'profile_photo': get_media_url(mechanic.profile_photo, request) if mechanic.profile_photo else None,
                'contact_number': mechanic.contact_number,
                'bio': mechanic.bio,
                'average_rating': float(mechanic.average_rating) if mechanic.average_rating else 0.0,
                'status': mechanic.status,
                'date_joined': shop_mechanic.date_joined.isoformat(),
            }
            mechanics_data.append(mechanic_info)
            
            # Collect ratings for shop average
            if mechanic.average_rating and float(mechanic.average_rating) > 0:
                total_mechanic_ratings.append(float(mechanic.average_rating))
        
        # Calculate shop average rating from mechanics
        shop_average_rating = sum(total_mechanic_ratings) / len(total_mechanic_ratings) if total_mechanic_ratings else 0.0
        
        # Get services offered by the shop
        shop_services = ShopService.objects.filter(
            shop=shop
        ).select_related('service', 'service__category').order_by('service__name')
        
        services_data = []
        for shop_service in shop_services:
            service = shop_service.service
            service_info = {
                'id': shop_service.id,
                'service_id': service.id,
                'service_name': service.name,
                'service_description': service.description,
                'service_category': service.category.name if service.category else None,
                'service_picture': get_media_url(service.service_picture, request) if service.service_picture else None,
                'price': str(service.minimum_price),  # Use the service's minimum price
            }
            services_data.append(service_info)
        
        # Calculate years active
        years_active = 0
        if shop.created_at:
            delta = timezone.now() - shop.created_at
            years_active = round(delta.days / 365.25, 1)
        
        # Build response data
        shop_profile = {
            'id': shop.id,
            'shop_name': shop.shop_name,
            'contact_number': shop.contact_number,
            'email': shop.email,
            'website': shop.website,
            'description': shop.description,
            'service_banner': get_media_url(shop.service_banner, request) if shop.service_banner else None,
            'is_verified': shop.is_verified,
            'status': shop.status,
            'created_at': shop.created_at.isoformat() if shop.created_at else None,
            'years_active': years_active,
            
            # Owner info
            'owner': {
                'id': owner.id,
                'account_id': owner_account.id,
                'full_name': f"{owner_account.firstname} {owner_account.lastname}",
                'email': owner_account.email,
            },
            
            # Ratings
            'average_rating': round(shop_average_rating, 2),
            'total_mechanics': len(mechanics_data),
            'total_services': len(services_data),
            
            # Mechanics
            'mechanics': mechanics_data,
            
            # Services
            'services': services_data,
        }
        
        return Response({
            'shop': shop_profile
        }, status=status.HTTP_200_OK)
        
    except Shop.DoesNotExist:
        return Response({
            'error': 'Shop not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        # Log the actual error for debugging
        import traceback
        print(f"Error in get_shop_profile: {str(e)}")
        print(traceback.format_exc())
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
