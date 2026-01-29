from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from .models import Service, ServiceCategory

@api_view(['GET'])
@permission_classes([AllowAny])
def list_services(request):
    """
    Get list of all services
    Returns service details including category and pricing
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
                'price': float(service.price),
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

