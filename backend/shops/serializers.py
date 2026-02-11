from rest_framework import serializers
from .models import Shop, ShopMechanic, ShopDocument, ShopOwnerDocument


class ShopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shop
        fields = [
            'id', 'shop_name', 'contact_number', 'email', 'website',
            'description', 'service_banner', 'is_verified', 'status',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_verified', 'created_at', 'updated_at']


class ShopMechanicSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopMechanic
        fields = ['id', 'shop', 'mechanic', 'date_joined']
        read_only_fields = ['id', 'date_joined']


class ShopDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopDocument
        fields = [
            'id', 'shop', 'document_name', 'document_type', 'document_file',
            'date_issued', 'date_expiry', 'uploaded_at', 'updated_at'
        ]
        read_only_fields = ['id', 'uploaded_at', 'updated_at']


class ShopOwnerDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopOwnerDocument
        fields = [
            'id', 'shop_owner', 'document_name', 'document_type', 'document_file',
            'date_issued', 'date_expiry', 'uploaded_at', 'updated_at'
        ]
        read_only_fields = ['id', 'uploaded_at', 'updated_at']
