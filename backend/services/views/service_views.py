from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Service, ServiceCategory
from ..pricing_utils import get_service_price_stats, get_all_services_with_pricing


@api_view(['GET'])
@permission_classes([AllowAny])
def list_services(request):
    """
    Get list of all services
    Returns service details including category and minimum pricing
    """
    try:
        services = Service.objects.select_related('category').all()
        services_data = []
        
        for service in services:
            service_info = {
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'service_picture': service.service_picture.url if service.service_picture else None,
                'category': service.category.name if service.category else None,
                'category_id': service.category.id if service.category else None,
                'minimum_price': float(service.minimum_price),
            }
            services_data.append(service_info)
        
        return Response({
            'services': services_data,
            'count': len(services_data)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_service_categories(request):
    """
    Get list of all service categories
    """
    try:
        categories = ServiceCategory.objects.all()
        categories_data = []
        
        for category in categories:
            category_info = {
                'id': category.id,
                'name': category.name,
                'worth_token': float(category.worth_token),
            }
            categories_data.append(category_info)
        
        return Response({
            'categories': categories_data,
            'count': len(categories_data)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_services_with_market_pricing(request):
    """
    Get list of all services with computed market pricing statistics.
    Includes average, median, and price range from mechanics.
    This is ideal for marketplace display showing typical pricing.
    """
    try:
        services = get_all_services_with_pricing()
        services_data = []
        
        for service in services:
            # Get detailed price statistics
            price_stats = get_service_price_stats(service=service)
            
            service_info = {
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'service_picture': service.service_picture.url if service.service_picture else None,
                'category': service.category.name if service.category else None,
                'category_id': service.category.id if service.category else None,
                'minimum_price': float(service.minimum_price),
                'mechanic_count': service.mechanic_count,
            }
            
            # Add market pricing if mechanics offer this service
            if price_stats:
                service_info['market_pricing'] = {
                    'average': float(price_stats['average']),
                    'median': float(price_stats['median']),
                    'min_mechanic_price': float(price_stats['min_mechanic_price']),
                    'max_mechanic_price': float(price_stats['max_mechanic_price']),
                }
            else:
                # No mechanics offer this service yet
                service_info['market_pricing'] = None
            
            services_data.append(service_info)
        
        return Response({
            'services': services_data,
            'count': len(services_data)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_service_detail_with_pricing(request, service_id):
    """
    Get detailed information for a single service including pricing statistics.
    
    URL: /services/<service_id>/detail-with-pricing/
    """
    try:
        service = Service.objects.select_related('category').get(pk=service_id)
        price_stats = get_service_price_stats(service=service)
        
        service_info = {
            'id': service.id,
            'name': service.name,
            'description': service.description,
            'service_picture': service.service_picture.url if service.service_picture else None,
            'category': {
                'id': service.category.id if service.category else None,
                'name': service.category.name if service.category else None,
            },
            'minimum_price': float(service.minimum_price),
        }
        
        if price_stats:
            service_info['market_pricing'] = {
                'average': float(price_stats['average']),
                'median': float(price_stats['median']),
                'min_mechanic_price': float(price_stats['min_mechanic_price']),
                'max_mechanic_price': float(price_stats['max_mechanic_price']),
                'mechanic_count': price_stats['count'],
            }
        else:
            service_info['market_pricing'] = None
            service_info['mechanic_count'] = 0
        
        return Response(service_info, status=status.HTTP_200_OK)
    except Service.DoesNotExist:
        return Response({
            'error': 'Service not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
