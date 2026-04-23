from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Avg, Count, Prefetch
from django.utils import timezone

from ..models import Shop, ShopMechanic
from users.models import Account, FavoriteShop, ShopOwner, Mechanic
from users.serializers import AccountAddressSerializer, AccountBranchLocationSerializer
from services.models import ShopService, ServiceAddOn
from services.serializers import ServiceAddOnPublicSerializer
from MainBackend.storage_utils import get_media_url


def _serialize_addresses(account, branch_type='shop_owner'):
    addresses = []
    main_address = getattr(account, 'accountaddress', None)
    if main_address:
        main_data = AccountAddressSerializer(main_address).data
        main_data['address_type'] = 'main'
        addresses.append(main_data)

    branch_locations = getattr(account, 'branch_locations', None)
    if branch_locations is not None:
        for branch in branch_locations.all().order_by('created_at'):
            if branch.branch_type != branch_type:
                continue
            branch_data = AccountBranchLocationSerializer(branch).data
            branch_data['address_type'] = 'branch'
            addresses.append(branch_data)

    return addresses


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
        item_filters = {
            'shop_id': shop_id,
            'shop__isnull': False,
        }
        item_field_names = {field.name for field in ServiceAddOn._meta.fields}
        if 'is_active' in item_field_names:
            item_filters['is_active'] = True

        item_queryset = ServiceAddOn.objects.select_related(
            'mechanic', 'shop', 'service'
        ).filter(**item_filters)

        shop = Shop.objects.select_related('shop_owner__account').prefetch_related(
            Prefetch('service_add_ons', queryset=item_queryset, to_attr='public_items')
        ).get(id=shop_id)
        
        # Get shop owner info
        owner = shop.shop_owner
        owner_account = owner.account
        owner_address = getattr(owner_account, 'accountaddress', None)
        
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

        items_data = ServiceAddOnPublicSerializer(
            getattr(shop, 'public_items', []),
            many=True,
            context={'request': request},
        ).data
        
        # Calculate years active
        years_active = 0
        if shop.created_at:
            delta = timezone.now() - shop.created_at
            years_active = round(delta.days / 365.25, 1)
        
        # Build response data
        user = getattr(request, "user", None)
        current_account = user if isinstance(user, Account) else None
        if current_account is None:
            account_id = request.session.get("account_id")
            if account_id:
                current_account = Account.objects.filter(id=account_id).first()

        is_favorited = False
        if current_account and hasattr(current_account, "client"):
            is_favorited = FavoriteShop.objects.filter(
                client=current_account.client,
                shop=shop,
            ).exists()

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
            'is_favorited': is_favorited,
            'created_at': shop.created_at.isoformat() if shop.created_at else None,
            'years_active': years_active,
            'address': {
                'lat': owner_address.lat if owner_address else None,
                'lng': owner_address.lng if owner_address else None,
                'formatted_address': owner_address.formatted_address if owner_address else None,
                'label': owner_address.label if owner_address else 'Main Branch',
                'is_main': owner_address.is_main if owner_address else True,
                'street_name': owner_address.street_name if owner_address else None,
                'subdivision_village': owner_address.subdivision_village if owner_address else None,
                'barangay': owner_address.barangay if owner_address else None,
                'city_municipality': owner_address.city_municipality if owner_address else None,
                'province': owner_address.province if owner_address else None,
                'region': owner_address.region if owner_address else None,
            },
            'addresses': _serialize_addresses(owner_account),
            
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

            # Products / items from ServiceAddOn
            'items': items_data,
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
