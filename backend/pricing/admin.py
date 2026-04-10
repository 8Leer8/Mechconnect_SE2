from django.contrib import admin
from .models import PricingConfiguration


@admin.register(PricingConfiguration)
class PricingConfigurationAdmin(admin.ModelAdmin):
    list_display = ['id', 'base_token_price', 'token_deduction_percentage', 'price_per_km', 'updated_at']
