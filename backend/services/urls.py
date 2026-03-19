from django.urls import path
from . import views
from .views.admin import (
    admin_service_overview,
    admin_list_services,
    admin_list_specialties,
    admin_update_service,
    admin_update_specialty,
)

urlpatterns = [
    path('', views.list_services, name='list_services'),
    path('specialties/', views.list_specialties, name='list_specialties'),
    path('with-pricing/', views.list_services_with_market_pricing, name='list_services_with_market_pricing'),
    path('<int:service_id>/detail-with-pricing/', views.get_service_detail_with_pricing, name='get_service_detail_with_pricing'),
    path('<int:service_id>/providers/', views.get_service_detail_with_providers, name='get_service_detail_with_providers'),
    path('categories/', views.list_service_categories, name='list_service_categories'),
    # Mechanic: services I offer (for profile)
    path('mechanic/my-services/', views.list_my_services, name='list_my_services'),
    path('mechanic/my-services/add/', views.add_my_service, name='add_my_service'),
    path('mechanic/my-services/remove/', views.remove_my_service, name='remove_my_service'),
    path('mechanic/my-services/update-price/', views.update_my_service_price, name='update_my_service_price'),
    path('mechanic/my-specialties/', views.list_my_specialties, name='list_my_specialties'),
    path('mechanic/my-specialties/add/', views.add_my_specialty, name='add_my_specialty'),
    path('mechanic/my-specialties/remove/', views.remove_my_specialty, name='remove_my_specialty'),
    # Shop owner: services the shop offers
    path('shop/my-services/', views.list_shop_services, name='list_shop_services'),
    path('shop/my-services/add/', views.add_shop_service, name='add_shop_service'),
    path('shop/my-services/remove/', views.remove_shop_service, name='remove_shop_service'),
    path('shop/my-services/update-price/', views.update_shop_service_price, name='update_shop_service_price'),
    # Shop owner: manage global ServiceAddOn rows for services your shop offers
    path('shop/addons/', views.list_shop_service_addons, name='list_shop_service_addons'),
    path('shop/addons/add/', views.add_shop_service_addon, name='add_shop_service_addon'),
    path('shop/addons/remove/', views.remove_shop_service_addon, name='remove_shop_service_addon'),
]

#Admin Urls
admin_urlpatterns = [
    path('overview/', admin_service_overview, name='admin-service-overview'),
    path('list/', admin_list_services, name='admin-list-services'),
    path('list/<int:service_id>/update/', admin_update_service, name='admin-update-service'),
    path('specialties/list/', admin_list_specialties, name='admin-list-specialties'),
    path('specialties/<int:specialty_id>/update/', admin_update_specialty, name='admin-update-specialty'),
]