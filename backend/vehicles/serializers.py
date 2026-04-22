from rest_framework import serializers
from .models import VehicleType, VehicleBrand, VehicleModel


class VehicleModelSerializer(serializers.ModelSerializer):
    """Serializer for VehicleModel - nested under Brand"""
    brand_name = serializers.CharField(source='brand.name', read_only=True)

    class Meta:
        model = VehicleModel
        fields = ['id', 'brand', 'brand_name', 'name', 'subcategory', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class VehicleModelNestedSerializer(serializers.ModelSerializer):
    """Lightweight serializer for nested display"""
    class Meta:
        model = VehicleModel
        fields = ['id', 'name', 'subcategory']


class VehicleBrandSerializer(serializers.ModelSerializer):
    """Serializer for VehicleBrand - nested under Type"""
    type_name = serializers.CharField(source='type.name', read_only=True)
    models = VehicleModelNestedSerializer(many=True, read_only=True)

    class Meta:
        model = VehicleBrand
        fields = ['id', 'type', 'type_name', 'name', 'models', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class VehicleBrandNestedSerializer(serializers.ModelSerializer):
    """Lightweight serializer for nested display"""
    class Meta:
        model = VehicleBrand
        fields = ['id', 'name']


class VehicleTypeSerializer(serializers.ModelSerializer):
    """Serializer for VehicleType with nested brands"""
    brands = VehicleBrandNestedSerializer(many=True, read_only=True)

    class Meta:
        model = VehicleType
        fields = ['id', 'name', 'brands', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class VehicleTypeDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer with full nested structure"""
    brands = VehicleBrandSerializer(many=True, read_only=True)

    class Meta:
        model = VehicleType
        fields = ['id', 'name', 'brands', 'created_at', 'updated_at']
