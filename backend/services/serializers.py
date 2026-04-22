from rest_framework import serializers
<<<<<<< HEAD
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
=======

from MainBackend.storage_utils import get_media_url

from .models import ServiceAddOn


class ServiceAddOnPublicSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    service_name = serializers.SerializerMethodField()

    class Meta:
        model = ServiceAddOn
        fields = [
            "id",
            "name",
            "description",
            "price",
            "image",
            "service_name",
        ]

    def get_image(self, obj):
        service_picture = getattr(getattr(obj, "service", None), "service_picture", None)
        if not service_picture:
            return None
        request = self.context.get("request") if getattr(self, "context", None) else None
        return get_media_url(service_picture, request)

    def get_service_name(self, obj):
        service = getattr(obj, "service", None)
        return service.name if service else None
>>>>>>> 180ee47cd0de9b70869d2b155f25e1db2166b8a3
