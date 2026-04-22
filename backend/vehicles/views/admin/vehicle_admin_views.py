from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from ...models import VehicleType, VehicleBrand, VehicleModel
from ...serializers import (
    VehicleTypeSerializer,
    VehicleTypeDetailSerializer,
    VehicleBrandSerializer,
    VehicleModelSerializer,
)


# Vehicle Type Views
@api_view(['GET'])
@permission_classes([AllowAny])
def admin_list_vehicle_types(request):
    """List all vehicle types with nested brands and models"""
    types = VehicleType.objects.prefetch_related('brands__models').order_by('name')
    serializer = VehicleTypeDetailSerializer(types, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def admin_get_vehicle_type(request, type_id):
    """Get single vehicle type with full nested brands and models"""
    try:
        vehicle_type = VehicleType.objects.prefetch_related('brands__models').get(id=type_id)
    except VehicleType.DoesNotExist:
        return Response({'error': 'Vehicle type not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = VehicleTypeDetailSerializer(vehicle_type)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_create_vehicle_type(request):
    """Create new vehicle type"""
    serializer = VehicleTypeSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def admin_update_vehicle_type(request, type_id):
    """Update vehicle type"""
    try:
        vehicle_type = VehicleType.objects.get(id=type_id)
    except VehicleType.DoesNotExist:
        return Response({'error': 'Vehicle type not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = VehicleTypeSerializer(vehicle_type, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def admin_delete_vehicle_type(request, type_id):
    """Delete vehicle type (cascades to brands and models)"""
    try:
        vehicle_type = VehicleType.objects.get(id=type_id)
    except VehicleType.DoesNotExist:
        return Response({'error': 'Vehicle type not found'}, status=status.HTTP_404_NOT_FOUND)

    vehicle_type.delete()
    return Response({'message': 'Vehicle type deleted successfully'}, status=status.HTTP_200_OK)


# Vehicle Brand Views
@api_view(['GET'])
@permission_classes([AllowAny])
def admin_list_vehicle_brands(request):
    """List all vehicle brands, optionally filtered by type"""
    queryset = VehicleBrand.objects.select_related('type').order_by('name')

    type_id = request.GET.get('type')
    if type_id:
        queryset = queryset.filter(type_id=type_id)

    serializer = VehicleBrandSerializer(queryset, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def admin_get_vehicle_brand(request, brand_id):
    """Get single vehicle brand with models"""
    try:
        brand = VehicleBrand.objects.prefetch_related('models').get(id=brand_id)
    except VehicleBrand.DoesNotExist:
        return Response({'error': 'Vehicle brand not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = VehicleBrandSerializer(brand)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_create_vehicle_brand(request):
    """Create new vehicle brand"""
    serializer = VehicleBrandSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def admin_update_vehicle_brand(request, brand_id):
    """Update vehicle brand"""
    try:
        brand = VehicleBrand.objects.get(id=brand_id)
    except VehicleBrand.DoesNotExist:
        return Response({'error': 'Vehicle brand not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = VehicleBrandSerializer(brand, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def admin_delete_vehicle_brand(request, brand_id):
    """Delete vehicle brand (cascades to models)"""
    try:
        brand = VehicleBrand.objects.get(id=brand_id)
    except VehicleBrand.DoesNotExist:
        return Response({'error': 'Vehicle brand not found'}, status=status.HTTP_404_NOT_FOUND)

    brand.delete()
    return Response({'message': 'Vehicle brand deleted successfully'}, status=status.HTTP_200_OK)


# Vehicle Model Views
@api_view(['GET'])
@permission_classes([AllowAny])
def admin_list_vehicle_models(request):
    """List all vehicle models, optionally filtered by brand or type"""
    queryset = VehicleModel.objects.select_related('brand', 'brand__type').order_by('name')

    brand_id = request.GET.get('brand')
    type_id = request.GET.get('type')

    if brand_id:
        queryset = queryset.filter(brand_id=brand_id)
    if type_id:
        queryset = queryset.filter(brand__type_id=type_id)

    serializer = VehicleModelSerializer(queryset, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def admin_get_vehicle_model(request, model_id):
    """Get single vehicle model"""
    try:
        model = VehicleModel.objects.select_related('brand', 'brand__type').get(id=model_id)
    except VehicleModel.DoesNotExist:
        return Response({'error': 'Vehicle model not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = VehicleModelSerializer(model)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_create_vehicle_model(request):
    """Create new vehicle model"""
    serializer = VehicleModelSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def admin_update_vehicle_model(request, model_id):
    """Update vehicle model"""
    try:
        model = VehicleModel.objects.get(id=model_id)
    except VehicleModel.DoesNotExist:
        return Response({'error': 'Vehicle model not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = VehicleModelSerializer(model, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def admin_delete_vehicle_model(request, model_id):
    """Delete vehicle model"""
    try:
        model = VehicleModel.objects.get(id=model_id)
    except VehicleModel.DoesNotExist:
        return Response({'error': 'Vehicle model not found'}, status=status.HTTP_404_NOT_FOUND)

    model.delete()
    return Response({'message': 'Vehicle model deleted successfully'}, status=status.HTTP_200_OK)
