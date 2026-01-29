from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import Shop

@api_view(['GET'])
@permission_classes([AllowAny])
def list_shops(request):
    """
    Get list of all shops
    Returns shop details including owner info and status
    """
    try:
        shops = Shop.objects.select_related('shop_owner__account').all()
        shops_data = []
        
        for shop in shops:
            shop_info = {
                'id': shop.id,
                'shop_name': shop.shop_name,
                'owner_name': f"{shop.shop_owner.account.firstname} {shop.shop_owner.account.lastname}",
                'contact_number': shop.contact_number,
                'email': shop.email,
                'website': shop.website,
                'description': shop.description,
                'service_banner': shop.service_banner.url if shop.service_banner else None,
                'is_verified': shop.is_verified,
                'status': shop.status,
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

