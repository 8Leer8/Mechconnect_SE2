from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q

from ..models import Shop, ShopMechanic
from users.models import ShopOwner, Mechanic
from MainBackend.storage_utils import get_media_url


def _get_owner_shop(account_id):
    try:
        shop_owner = ShopOwner.objects.get(account_id=account_id)
        shop = Shop.objects.get(shop_owner=shop_owner)
        return shop, None
    except ShopOwner.DoesNotExist:
        return None, Response({'error': 'Shop owner not found'}, status=status.HTTP_404_NOT_FOUND)
    except Shop.DoesNotExist:
        return None, Response({'error': 'Shop not found'}, status=status.HTTP_404_NOT_FOUND)


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
        
        shop, err = _get_owner_shop(account_id)
        if err:
            return err

        include_inactive = request.GET.get('include_inactive', 'false').lower() == 'true'
        
        # Get all mechanics in the shop
        shop_mechanics = ShopMechanic.objects.filter(shop=shop)
        if not include_inactive:
            shop_mechanics = shop_mechanics.filter(is_active=True)
        shop_mechanics = shop_mechanics.select_related('mechanic__account').order_by('-date_joined')
        
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
                'assignment_active': shop_mechanic.is_active,
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
        
        shop, err = _get_owner_shop(account_id)
        if err:
            return err
        
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
        
        # Check if mechanic is already linked to this shop (active or inactive)
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
        
        shop, err = _get_owner_shop(account_id)
        if err:
            return err
        
        # Get query parameters
        search_query = request.GET.get('search', '').strip()
        available_only = request.GET.get('available_only', 'true').lower() == 'true'
        
        # Mechanics linked to any shop (active/inactive) are reserved and not addable elsewhere.
        linked_mechanic_ids = ShopMechanic.objects.values_list('mechanic_id', flat=True).distinct()
        
        # Build query
        mechanics = Mechanic.objects.select_related('account').exclude(
            id__in=linked_mechanic_ids
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


@api_view(['POST'])
@permission_classes([AllowAny])
def set_shop_mechanic_active(request):
    """
    Activate/deactivate a mechanic in the current shop.
    Expects: mechanic_id, is_active (bool)
    """
    try:
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

        shop, err = _get_owner_shop(account_id)
        if err:
            return err

        mechanic_id = request.data.get('mechanic_id')
        is_active = request.data.get('is_active')
        if mechanic_id is None or is_active is None:
            return Response(
                {'error': 'mechanic_id and is_active are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            mechanic_id = int(mechanic_id)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid mechanic_id'}, status=status.HTTP_400_BAD_REQUEST)

        if isinstance(is_active, str):
            is_active = is_active.lower() == 'true'
        else:
            is_active = bool(is_active)

        try:
            shop_mechanic = ShopMechanic.objects.select_related('mechanic').get(
                shop=shop,
                mechanic_id=mechanic_id,
            )
        except ShopMechanic.DoesNotExist:
            return Response({'error': 'Mechanic not found in your shop'}, status=status.HTTP_404_NOT_FOUND)

        mechanic = shop_mechanic.mechanic
        if is_active and mechanic.is_working_for_shop and mechanic.shop_id and mechanic.shop_id != shop.id:
            return Response(
                {'error': f'Mechanic is currently working for {mechanic.shop.shop_name}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        shop_mechanic.is_active = is_active
        shop_mechanic.save(update_fields=['is_active'])

        mechanic.is_working_for_shop = is_active
        mechanic.shop = shop if is_active else None
        mechanic.save(update_fields=['is_working_for_shop', 'shop'])

        return Response(
            {
                'message': 'Mechanic activated successfully' if is_active else 'Mechanic deactivated successfully',
                'mechanic_id': mechanic.id,
                'assignment_active': shop_mechanic.is_active,
                'is_working_for_shop': mechanic.is_working_for_shop,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def remove_mechanic_from_shop(request):
    """
    Remove a mechanic from the current shop.
    Expects: mechanic_id
    """
    try:
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

        shop, err = _get_owner_shop(account_id)
        if err:
            return err

        mechanic_id = request.data.get('mechanic_id')
        if mechanic_id is None:
            return Response({'error': 'mechanic_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            mechanic_id = int(mechanic_id)
        except (TypeError, ValueError):
            return Response({'error': 'Invalid mechanic_id'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shop_mechanic = ShopMechanic.objects.select_related('mechanic').get(
                shop=shop,
                mechanic_id=mechanic_id,
            )
        except ShopMechanic.DoesNotExist:
            return Response({'error': 'Mechanic not found in your shop'}, status=status.HTTP_404_NOT_FOUND)

        mechanic = shop_mechanic.mechanic
        shop_mechanic.delete()

        if mechanic.shop_id == shop.id:
            mechanic.is_working_for_shop = False
            mechanic.shop = None
            mechanic.save(update_fields=['is_working_for_shop', 'shop'])

        return Response(
            {
                'message': 'Mechanic removed from shop successfully',
                'mechanic_id': mechanic_id,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
