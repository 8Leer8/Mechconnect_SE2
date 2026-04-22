from django.contrib import admin
from .models import VehicleType, VehicleBrand, VehicleModel


@admin.register(VehicleType)
class VehicleTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'brand_count', 'created_at']
    search_fields = ['name']

    def brand_count(self, obj):
        return obj.brands.count()
    brand_count.short_description = 'Brands'


@admin.register(VehicleBrand)
class VehicleBrandAdmin(admin.ModelAdmin):
    list_display = ['name', 'type', 'model_count', 'created_at']
    list_filter = ['type']
    search_fields = ['name', 'type__name']

    def model_count(self, obj):
        return obj.models.count()
    model_count.short_description = 'Models'


@admin.register(VehicleModel)
class VehicleModelAdmin(admin.ModelAdmin):
    list_display = ['name', 'brand', 'subcategory', 'created_at']
    list_filter = ['brand__type', 'subcategory']
    search_fields = ['name', 'brand__name', 'subcategory']
