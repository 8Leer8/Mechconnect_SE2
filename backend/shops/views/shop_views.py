from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Count, Sum, Avg, Q

from ..models import Shop, ShopMechanic
from users.models import Account, FavoriteShop, ShopOwner, Mechanic
from bookings.models import Booking, CompleteBooking
from services.models import ShopService
from MainBackend.storage_utils import get_media_url


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
                'average_rating': shop_rating_map.get(shop.id, 0),
            }
            shops_data.append(shop_info)
        
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

