from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import ServiceCategory, Service, ServiceAddOn, Specialty, Tag
from ...serializers import (
    ServiceCategorySerializer,
    ServiceSerializer,
    ServiceCreateSerializer,
    SpecialtySerializer,
)
from users.permissions import IsAdmin


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_service_overview(request):
    data = {
        'categories_total': ServiceCategory.objects.count(),
        'services_total': Service.objects.count(),
        'add_ons_total': ServiceAddOn.objects.count(),
        'specialties_total': Specialty.objects.count(),
        'tags_total': Tag.objects.count(),
    }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_services(request):
    queryset = Service.objects.select_related('category').order_by('-id')

    # Support both 'search' (frontend) and 'q' (legacy) parameters
    search = request.GET.get('search') or request.GET.get('q')
    category = request.GET.get('category')
    category_id = request.GET.get('category_id')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if search:
        queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

    # Support category name filtering (frontend sends category name)
    if category:
        queryset = queryset.filter(category__name=category)

    # Support category_id filtering (legacy)
    if category_id:
        queryset = queryset.filter(category_id=category_id)

    queryset = queryset[:limit]

    serializer = ServiceSerializer(queryset, many=True)
    return Response({'count': len(serializer.data), 'results': serializer.data}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_specialties(request):
    queryset = Specialty.objects.all().order_by('-id')

    # Support both 'search' (frontend) and 'q' (legacy) parameters
    search = request.GET.get('search') or request.GET.get('q')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if search:
        queryset = queryset.filter(Q(name__icontains=search) | Q(description__icontains=search))

    queryset = queryset[:limit]

    serializer = SpecialtySerializer(queryset, many=True)
    return Response({'count': len(serializer.data), 'results': serializer.data}, status=status.HTTP_200_OK)


@api_view(['PATCH'])
@permission_classes([IsAdmin])
def admin_update_service(request, service_id):
    try:
        service = Service.objects.get(pk=service_id)
    except Service.DoesNotExist:
        return Response({'error': 'Service not found.'}, status=status.HTTP_404_NOT_FOUND)

    name = request.data.get('name')
    description = request.data.get('description')
    minimum_price = request.data.get('minimum_price')
    category_id = request.data.get('category_id')

    if name is not None:
        name = str(name).strip()
        if not name:
            return Response({'error': 'Name cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        service.name = name

    if description is not None:
        description = str(description).strip()
        if not description:
            return Response({'error': 'Description cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        service.description = description

    if minimum_price is not None:
        try:
            parsed_price = Decimal(str(minimum_price))
        except (InvalidOperation, ValueError):
            return Response({'error': 'Invalid minimum price.'}, status=status.HTTP_400_BAD_REQUEST)

        if parsed_price < 0:
            return Response({'error': 'Minimum price cannot be negative.'}, status=status.HTTP_400_BAD_REQUEST)
        service.minimum_price = parsed_price

    if category_id is not None:
        if category_id in ['', None]:
            service.category = None
        else:
            try:
                category = ServiceCategory.objects.get(pk=category_id)
            except ServiceCategory.DoesNotExist:
                return Response({'error': 'Category not found.'}, status=status.HTTP_400_BAD_REQUEST)
            service.category = category

    service.save()

    return Response(
        {
            'id': service.id,
            'name': service.name,
            'description': service.description,
            'minimum_price': service.minimum_price,
            'category_id': service.category_id,
            'category': service.category.name if service.category else None,
            'updated_at': service.updated_at,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['PATCH'])
@permission_classes([IsAdmin])
def admin_update_specialty(request, specialty_id):
    try:
        specialty = Specialty.objects.get(pk=specialty_id)
    except Specialty.DoesNotExist:
        return Response({'error': 'Specialty not found.'}, status=status.HTTP_404_NOT_FOUND)

    name = request.data.get('name')
    description = request.data.get('description')

    if name is not None:
        name = str(name).strip()
        if not name:
            return Response({'error': 'Name cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        specialty.name = name

    if description is not None:
        description = str(description).strip()
        if not description:
            return Response({'error': 'Description cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        specialty.description = description

    specialty.save()

    return Response(
        {
            'id': specialty.id,
            'name': specialty.name,
            'description': specialty.description,
            'updated_at': specialty.updated_at,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAdmin])
def admin_create_service(request):
    serializer = ServiceCreateSerializer(data=request.data)
    if serializer.is_valid():
        service = serializer.save()
        # Return full service data with category name
        return Response({
            'id': service.id,
            'name': service.name,
            'description': service.description,
            'minimum_price': service.minimum_price,
            'category': service.category.name if service.category else None,
            'category_id': service.category_id,
            'created_at': service.created_at,
            'updated_at': service.updated_at,
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdmin])
def admin_create_specialty(request):
    serializer = SpecialtySerializer(data=request.data)
    if serializer.is_valid():
        specialty = serializer.save()
        return Response({
            'id': specialty.id,
            'name': specialty.name,
            'description': specialty.description,
            'created_at': specialty.created_at,
            'updated_at': specialty.updated_at,
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([IsAdmin])
def admin_delete_service(request, service_id):
    try:
        service = Service.objects.get(pk=service_id)
    except Service.DoesNotExist:
        return Response({'error': 'Service not found.'}, status=status.HTTP_404_NOT_FOUND)

    service.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['DELETE'])
@permission_classes([IsAdmin])
def admin_delete_specialty(request, specialty_id):
    try:
        specialty = Specialty.objects.get(pk=specialty_id)
    except Specialty.DoesNotExist:
        return Response({'error': 'Specialty not found.'}, status=status.HTTP_404_NOT_FOUND)

    specialty.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAdmin])
def admin_create_category(request):
    name = request.data.get('name')
    if not name or not str(name).strip():
        return Response({'error': 'Category name is required.'}, status=status.HTTP_400_BAD_REQUEST)

    name = str(name).strip()

    # Check if category already exists
    existing = ServiceCategory.objects.filter(name__iexact=name).first()
    if existing:
        return Response({
            'id': existing.id,
            'name': existing.name,
            'message': 'Category already exists.'
        }, status=status.HTTP_200_OK)

    category = ServiceCategory.objects.create(name=name)
    return Response({
        'id': category.id,
        'name': category.name,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_categories(request):
    categories = ServiceCategory.objects.all().order_by('name')
    serializer = ServiceCategorySerializer(categories, many=True)
    return Response({'count': len(serializer.data), 'results': serializer.data}, status=status.HTTP_200_OK)


@api_view(['PATCH', 'PUT'])
@permission_classes([IsAdmin])
def admin_update_category(request, category_id):
    try:
        category = ServiceCategory.objects.get(pk=category_id)
    except ServiceCategory.DoesNotExist:
        return Response({'error': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)

    name = request.data.get('name')
    if name is not None:
        name = str(name).strip()
        if not name:
            return Response({'error': 'Category name cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if another category with this name already exists
        existing = ServiceCategory.objects.filter(name__iexact=name).exclude(pk=category_id).first()
        if existing:
            return Response({'error': f'Category "{name}" already exists.'}, status=status.HTTP_400_BAD_REQUEST)
        
        category.name = name
        category.save()

    return Response({
        'id': category.id,
        'name': category.name,
        'updated_at': category.updated_at,
    }, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@permission_classes([IsAdmin])
def admin_delete_category(request, category_id):
    try:
        category = ServiceCategory.objects.get(pk=category_id)
    except ServiceCategory.DoesNotExist:
        return Response({'error': 'Category not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Check if any services are linked to this category
    linked_services_count = Service.objects.filter(category=category).count()
    if linked_services_count > 0:
        return Response(
            {'error': f'Cannot delete category: It is currently linked to {linked_services_count} active service(s). Please reassign or delete those services first.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    category.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
