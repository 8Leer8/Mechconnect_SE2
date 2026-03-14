from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import ServiceCategory, Service, ServiceAddOn, Specialty, Tag
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

    q = request.GET.get('q')
    category_id = request.GET.get('category_id')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if q:
        queryset = queryset.filter(Q(name__icontains=q) | Q(description__icontains=q))

    if category_id:
        queryset = queryset.filter(category_id=category_id)

    queryset = queryset[:limit]

    results = []
    for service in queryset:
        results.append(
            {
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'minimum_price': service.minimum_price,
                'category_id': service.category_id,
                'category': service.category.name if service.category else None,
                'created_at': service.created_at,
                'updated_at': service.updated_at,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_specialties(request):
    queryset = Specialty.objects.all().order_by('-id')

    q = request.GET.get('q')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if q:
        queryset = queryset.filter(Q(name__icontains=q) | Q(description__icontains=q))

    queryset = queryset[:limit]

    results = []
    for specialty in queryset:
        results.append(
            {
                'id': specialty.id,
                'name': specialty.name,
                'description': specialty.description,
                'created_at': specialty.created_at,
                'updated_at': specialty.updated_at,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


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
