from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Count, Sum, Avg, Q

from ..models import Shop, ShopMechanic
from users.models import Account, FavoriteShop, ShopOwner, Mechanic
from bookings.models import Booking, CompleteBooking
from bookings.models import MechanicLocation, BroadcastOffer
from services.models import ShopService
from MainBackend.storage_utils import get_media_url
from utils.location_utils import haversine_km, mechanic_location_annotations


def _format_address(address):
    if not address:
        return None

    if getattr(address, 'formatted_address', None):
        return address.formatted_address

    parts = [
        address.house_building_number,
        address.street_name,
        address.subdivision_village,
        address.barangay,
        address.city_municipality,
        address.province,
        address.region,
        address.postal_code,
    ]
    label = ', '.join(
        str(part).strip() for part in parts if part and str(part).strip()
    )
    return label or None


@api_view(['GET'])
@permission_classes([AllowAny])
def list_shops(request):
    """
    Get list of all shops
    Returns shop details including owner info and status
    """
    try:
        current_account = None
        user = getattr(request, "user", None)
        lat_raw = request.GET.get('lat')
        lng_raw = request.GET.get('lng')
        filter_value = str(request.GET.get('filter', '')).strip().lower()

        selected_lat = selected_lng = None
        try:
            if lat_raw is not None and lng_raw is not None:
                selected_lat = float(lat_raw)
                selected_lng = float(lng_raw)
        except (TypeError, ValueError):
            selected_lat = selected_lng = None

        if isinstance(user, Account):
            current_account = user
        else:
            account_id = request.session.get("account_id")
            if account_id:
                current_account = Account.objects.filter(id=account_id).first()

        current_client = None
        if current_account and hasattr(current_account, "client"):
            current_client = current_account.client

        shops = Shop.objects.select_related('shop_owner__account').filter(
            is_verified=True,
            shop_owner__verification_status=ShopOwner.VerificationStatus.APPROVED,
            shop_owner__account__is_active=True,
        )
        shop_list = list(shops)
        shop_ids = [shop.id for shop in shop_list]

        favorite_shop_ids = set()
        if current_client and shop_ids:
            favorite_shop_ids = set(
                FavoriteShop.objects.filter(
                    client=current_client,
                    shop_id__in=shop_ids,
                ).values_list("shop_id", flat=True)
            )

        shop_rating_map = {}
        if shop_ids:
            rating_rows = ShopMechanic.objects.filter(
                shop_id__in=shop_ids,
            ).values('shop_id').annotate(
                avg_rating=Avg('mechanic__average_rating', filter=Q(mechanic__average_rating__gt=0))
            )
            shop_rating_map = {
                row['shop_id']: round(float(row['avg_rating']), 2) if row['avg_rating'] else 0
                for row in rating_rows
            }

        shop_distance_map = {}
        if selected_lat is not None and selected_lng is not None and shop_ids:
            shop_mechanics = ShopMechanic.objects.filter(
                shop_id__in=shop_ids,
                is_active=True,
            ).select_related(
                'shop',
                'mechanic',
                'mechanic__account',
            ).annotate(**mechanic_location_annotations('mechanic__account_id', 'mechanic_id'))

            for shop_mechanic in shop_mechanics:
                src_lat = shop_mechanic.live_lat if shop_mechanic.live_lat is not None else shop_mechanic.offer_lat
                src_lng = shop_mechanic.live_lng if shop_mechanic.live_lng is not None else shop_mechanic.offer_lng
                if src_lat is None or src_lng is None:
                    continue

                try:
                    distance_km = haversine_km(
                        selected_lat,
                        selected_lng,
                        float(src_lat),
                        float(src_lng),
                    )
                except (TypeError, ValueError):
                    continue

                current_distance = shop_distance_map.get(shop_mechanic.shop_id)
                if current_distance is None or distance_km < current_distance:
                    shop_distance_map[shop_mechanic.shop_id] = distance_km

        shops_data = []
        
        for shop in shop_list:
            shop_info = {
                'id': shop.id,
                'shop_name': shop.shop_name,
                'owner_name': f"{shop.shop_owner.account.firstname} {shop.shop_owner.account.lastname}",
                'contact_number': shop.contact_number,
                'email': shop.email,
                'website': shop.website,
                'description': shop.description,
                'service_banner': get_media_url(shop.service_banner, request) if shop.service_banner else None,
                'is_verified': shop.is_verified,
                'status': shop.status,
                'is_favorited': shop.id in favorite_shop_ids,
                'address': {
                    'lat': shop.shop_owner.account.accountaddress.lat,
                    'lng': shop.shop_owner.account.accountaddress.lng,
                    'formatted_address': shop.shop_owner.account.accountaddress.formatted_address,
                    'label': shop.shop_owner.account.accountaddress.label,
                    'is_main': shop.shop_owner.account.accountaddress.is_main,
                    'house_building_number': shop.shop_owner.account.accountaddress.house_building_number,
                    'street_name': shop.shop_owner.account.accountaddress.street_name,
                    'subdivision_village': shop.shop_owner.account.accountaddress.subdivision_village,
                    'barangay': shop.shop_owner.account.accountaddress.barangay,
                    'city_municipality': shop.shop_owner.account.accountaddress.city_municipality,
                    'province': shop.shop_owner.account.accountaddress.province,
                    'region': shop.shop_owner.account.accountaddress.region,
                    'postal_code': shop.shop_owner.account.accountaddress.postal_code,
                } if hasattr(shop.shop_owner.account, 'accountaddress') else None,
                'address_label': _format_address(getattr(shop.shop_owner.account, 'accountaddress', None)),
                'average_rating': shop_rating_map.get(shop.id, 0),
                'distance_km': round(float(shop_distance_map[shop.id]), 2) if shop.id in shop_distance_map else None,
            }
            shops_data.append(shop_info)

        if filter_value == 'nearest' and any(item['distance_km'] is not None for item in shops_data):
            shops_data.sort(
                key=lambda item: (
                    item['distance_km'] is None,
                    item['distance_km'] if item['distance_km'] is not None else 0,
                )
            )
        
        return Response({
            'shops': shops_data,
            'count': len(shops_data)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def shop_owner_dashboard(request):
    """
    Get shop owner dashboard statistics
    Returns:
    - Total mechanics working for the shop
    - Total services offered by the shop
    - Active bookings count
    - Completed jobs count
    - Total revenue from completed jobs
    - Average rating of shop mechanics
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        # Get shop owner
        shop_owner = ShopOwner.objects.get(account_id=account_id)
        
        # Check if shop owner has a shop
        if not shop_owner.owns_shop:
            return Response({
                'error': 'No shop found for this owner'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Get the shop
        shop = Shop.objects.get(shop_owner=shop_owner)
        
        # 1. Total mechanics
        total_mechanics = ShopMechanic.objects.filter(shop=shop).count()
        
        # 2. Total services offered
        total_services = ShopService.objects.filter(shop=shop).count()
        
        # Get all mechanics working for this shop
        shop_mechanic_ids = ShopMechanic.objects.filter(shop=shop).values_list('mechanic_id', flat=True)
        shop_mechanic_accounts = Mechanic.objects.filter(
            id__in=shop_mechanic_ids
        ).values_list('account_id', flat=True)
        
        # 3. Active bookings (bookings where shop is the provider OR one of shop's mechanics)
        active_bookings = Booking.objects.filter(
            Q(request__shop=shop) | Q(request__provider_id__in=shop_mechanic_accounts),
            status=Booking.Status.ACTIVE
        ).count()
        
        # 4. Completed jobs
        completed_jobs = Booking.objects.filter(
            Q(request__shop=shop) | Q(request__provider_id__in=shop_mechanic_accounts),
            status=Booking.Status.COMPLETED
        ).count()
        
        # 5. Total revenue from completed bookings
        revenue_data = CompleteBooking.objects.filter(
            Q(booking__request__shop=shop) | Q(booking__request__provider_id__in=shop_mechanic_accounts)
        ).aggregate(
            total_revenue=Sum('total_amount')
        )
        total_revenue = revenue_data['total_revenue'] if revenue_data['total_revenue'] else 0
        
        # 6. Average rating of shop mechanics
        rating_data = Mechanic.objects.filter(
            id__in=shop_mechanic_ids
        ).aggregate(
            avg_rating=Avg('average_rating')
        )
        average_rating = round(float(rating_data['avg_rating']), 2) if rating_data['avg_rating'] else 0
        
        return Response({
            'shop_name': shop.shop_name,
            'total_mechanics': total_mechanics,
            'total_services': total_services,
            'active_bookings': active_bookings,
            'completed_jobs': completed_jobs,
            'total_revenue': float(total_revenue),
            'average_rating': average_rating,
            'shop_status': shop.status,
            'is_verified': shop.is_verified
        }, status=status.HTTP_200_OK)
        
    except ShopOwner.DoesNotExist:
        return Response({
            'error': 'Shop owner profile not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Shop.DoesNotExist:
        return Response({
            'error': 'Shop not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)

