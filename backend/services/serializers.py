from rest_framework import serializers

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
