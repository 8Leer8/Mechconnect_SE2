from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q

from ..models import Shop, ShopMechanic
from users.models import ShopOwner, Mechanic
from MainBackend.storage_utils import get_media_url


@api_view(['GET'])
@permission_classes([AllowAny])
def list_shop_mechanics(request):
    """
    Get list of all mechanics working in the shop owner's shop
    Returns mechanic details including account info and join date
    """
    try:
        # Get account_id from session
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({
                'error': 'Not authenticated'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Get shop owner and shop
        try:
            shop_owner = ShopOwner.objects.get(account_id=account_id)
            shop = Shop.objects.get(shop_owner=shop_owner)
        except ShopOwner.DoesNotExist:
            return Response({
                'error': 'Shop owner not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Shop.DoesNotExist:
            return Response({
                'error': 'Shop not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Get all mechanics in the shop
        shop_mechanics = ShopMechanic.objects.filter(
            shop=shop
        ).select_related('mechanic__account').order_by('-date_joined')
        
        mechanics_data = []
        for shop_mechanic in shop_mechanics:
            mechanic = shop_mechanic.mechanic
            account = mechanic.account
            
            mechanic_info = {
                'id': mechanic.id,
                'account_id': account.id,
                'firstname': account.firstname,
                'lastname': account.lastname,
                'middlename': account.middlename,
                'email': account.email,
                'username': account.username,
                'profile_photo': get_media_url(mechanic.profile_photo, request),
                'contact_number': mechanic.contact_number,
                'bio': mechanic.bio,
                'average_rating': float(mechanic.average_rating) if mechanic.average_rating else 0.0,
                'status': mechanic.status,
                'is_working_for_shop': mechanic.is_working_for_shop,
                'date_joined': shop_mechanic.date_joined.isoformat(),
            }
            mechanics_data.append(mechanic_info)
        
        return Response({
            'shop_name': shop.shop_name,
            'shop_id': shop.id,
            'mechanics': mechanics_data,
            'count': len(mechanics_data)
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def add_mechanic_to_shop(request):
    """
    Add a mechanic to the shop owner's shop
    Expects: mechanic_id (Mechanic model ID) or account_id
    """
    try:
        # Get account_id from session
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({
                'error': 'Not authenticated'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Get shop owner and shop
        try:
            shop_owner = ShopOwner.objects.get(account_id=account_id)
            shop = Shop.objects.get(shop_owner=shop_owner)
        except ShopOwner.DoesNotExist:
            return Response({
                'error': 'Shop owner not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Shop.DoesNotExist:
            return Response({
                'error': 'Shop not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Get mechanic_id or account_id from request
        mechanic_id = request.data.get('mechanic_id')
        mechanic_account_id = request.data.get('account_id')
        
        if not mechanic_id and not mechanic_account_id:
            return Response({
                'error': 'mechanic_id or account_id is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get mechanic
        try:
            if mechanic_id:
                mechanic = Mechanic.objects.get(id=mechanic_id)
            else:
                mechanic = Mechanic.objects.get(account_id=mechanic_account_id)
        except Mechanic.DoesNotExist:
            return Response({
                'error': 'Mechanic not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Check if mechanic is already in this shop
        if ShopMechanic.objects.filter(shop=shop, mechanic=mechanic).exists():
            return Response({
                'error': 'Mechanic is already in this shop'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if mechanic is already working for another shop
        if mechanic.is_working_for_shop and mechanic.shop and mechanic.shop != shop:
            return Response({
                'error': f'Mechanic is already working for {mechanic.shop.shop_name}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create ShopMechanic relationship
        shop_mechanic = ShopMechanic.objects.create(
            shop=shop,
            mechanic=mechanic
        )
        
        # Update mechanic's shop information
        mechanic.is_working_for_shop = True
        mechanic.shop = shop
        mechanic.save()
        
        return Response({
            'message': 'Mechanic added successfully',
            'mechanic': {
                'id': mechanic.id,
                'name': f"{mechanic.account.firstname} {mechanic.account.lastname}",
                'email': mechanic.account.email,
                'contact_number': mechanic.contact_number,
                'average_rating': float(mechanic.average_rating) if mechanic.average_rating else 0.0,
                'date_joined': shop_mechanic.date_joined.isoformat(),
            }
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def search_available_mechanics(request):
    """
    Search for available mechanics that can be added to the shop
    Query params: 
        - search: Search by name, email, or username
        - available_only: Filter only mechanics not working for any shop (default: true)
    """
    try:
        # Get account_id from session
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({
                'error': 'Not authenticated'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Get shop owner and shop
        try:
            shop_owner = ShopOwner.objects.get(account_id=account_id)
            shop = Shop.objects.get(shop_owner=shop_owner)
        except (ShopOwner.DoesNotExist, Shop.DoesNotExist):
            return Response({
                'error': 'Shop not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Get query parameters
        search_query = request.GET.get('search', '').strip()
        available_only = request.GET.get('available_only', 'true').lower() == 'true'
        
        # Get mechanics already in this shop
        existing_mechanic_ids = ShopMechanic.objects.filter(
            shop=shop
        ).values_list('mechanic_id', flat=True)
        
        # Build query
        mechanics = Mechanic.objects.select_related('account').exclude(
            id__in=existing_mechanic_ids
        )
        
        # Filter by availability if requested
        if available_only:
            mechanics = mechanics.filter(
                Q(is_working_for_shop=False) | Q(shop__isnull=True)
            )
        
        # Apply search filter
        if search_query:
            mechanics = mechanics.filter(
                Q(account__firstname__icontains=search_query) |
                Q(account__lastname__icontains=search_query) |
                Q(account__email__icontains=search_query) |
                Q(account__username__icontains=search_query)
            )
        
        # Limit results
        mechanics = mechanics[:50]
        
        mechanics_data = []
        for mechanic in mechanics:
            account = mechanic.account
            mechanic_info = {
                'id': mechanic.id,
                'account_id': account.id,
                'firstname': account.firstname,
                'lastname': account.lastname,
                'middlename': account.middlename,
                'email': account.email,
                'username': account.username,
                'profile_photo': get_media_url(mechanic.profile_photo, request),
                'contact_number': mechanic.contact_number,
                'bio': mechanic.bio,
                'average_rating': float(mechanic.average_rating) if mechanic.average_rating else 0.0,
                'status': mechanic.status,
                'is_working_for_shop': mechanic.is_working_for_shop,
                'current_shop': mechanic.shop.shop_name if mechanic.shop else None,
            }
            mechanics_data.append(mechanic_info)
        
        return Response({
            'mechanics': mechanics_data,
            'count': len(mechanics_data)
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
