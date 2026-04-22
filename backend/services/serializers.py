from rest_framework import serializers
from .models import ServiceCategory, Service, Specialty


class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ['id', 'name', 'worth_token', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class ServiceSerializer(serializers.ModelSerializer):
    category = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    category_id = serializers.IntegerField(source='category.id', read_only=True, allow_null=True)

    class Meta:
        model = Service
        fields = ['id', 'name', 'description', 'minimum_price', 'category', 'category_id', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']


class ServiceCreateSerializer(serializers.ModelSerializer):
    category = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = Service
        fields = ['name', 'description', 'minimum_price', 'category']

    def create(self, validated_data):
        category_name = validated_data.pop('category', None)
        category = None
        if category_name:
            category, _ = ServiceCategory.objects.get_or_create(name=category_name)
        
        service = Service.objects.create(category=category, **validated_data)
        return service


class SpecialtySerializer(serializers.ModelSerializer):
    class Meta:
        model = Specialty
        fields = ['id', 'name', 'description', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']
