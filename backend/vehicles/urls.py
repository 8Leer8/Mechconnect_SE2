from django.urls import path
from .views.admin import (
    admin_list_vehicle_types,
    admin_get_vehicle_type,
    admin_create_vehicle_type,
    admin_update_vehicle_type,
    admin_delete_vehicle_type,
    admin_list_vehicle_brands,
    admin_get_vehicle_brand,
    admin_create_vehicle_brand,
    admin_update_vehicle_brand,
    admin_delete_vehicle_brand,
    admin_list_vehicle_models,
    admin_get_vehicle_model,
    admin_create_vehicle_model,
    admin_update_vehicle_model,
    admin_delete_vehicle_model,
)

# Public URLs for vehicle data
urlpatterns = [
    # Vehicle Types
    path('types/', admin_list_vehicle_types, name='list-vehicle-types'),
    path('types/<int:type_id>/', admin_get_vehicle_type, name='get-vehicle-type'),
    path('types/create/', admin_create_vehicle_type, name='create-vehicle-type'),
    path('types/<int:type_id>/update/', admin_update_vehicle_type, name='update-vehicle-type'),
    path('types/<int:type_id>/delete/', admin_delete_vehicle_type, name='delete-vehicle-type'),

    # Vehicle Brands
    path('brands/', admin_list_vehicle_brands, name='list-vehicle-brands'),
    path('brands/<int:brand_id>/', admin_get_vehicle_brand, name='get-vehicle-brand'),
    path('brands/create/', admin_create_vehicle_brand, name='create-vehicle-brand'),
    path('brands/<int:brand_id>/update/', admin_update_vehicle_brand, name='update-vehicle-brand'),
    path('brands/<int:brand_id>/delete/', admin_delete_vehicle_brand, name='delete-vehicle-brand'),

    # Vehicle Models
    path('models/', admin_list_vehicle_models, name='list-vehicle-models'),
    path('models/<int:model_id>/', admin_get_vehicle_model, name='get-vehicle-model'),
    path('models/create/', admin_create_vehicle_model, name='create-vehicle-model'),
    path('models/<int:model_id>/update/', admin_update_vehicle_model, name='update-vehicle-model'),
    path('models/<int:model_id>/delete/', admin_delete_vehicle_model, name='delete-vehicle-model'),
]

# Keep admin_urlpatterns for backward compatibility (same as urlpatterns)
admin_urlpatterns = urlpatterns

app_name = 'vehicles'
