from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_services, name='list_services'),
    path('with-pricing/', views.list_services_with_market_pricing, name='list_services_with_market_pricing'),
    path('<int:service_id>/detail-with-pricing/', views.get_service_detail_with_pricing, name='get_service_detail_with_pricing'),
    path('categories/', views.list_service_categories, name='list_service_categories'),
    # Mechanic: services I offer (for profile)
    path('mechanic/my-services/', views.list_my_services, name='list_my_services'),
    path('mechanic/my-services/add/', views.add_my_service, name='add_my_service'),
    path('mechanic/my-services/remove/', views.remove_my_service, name='remove_my_service'),
    path('mechanic/my-services/update-price/', views.update_my_service_price, name='update_my_service_price'),
    # Shop owner: services the shop offers
    path('shop/my-services/', views.list_shop_services, name='list_shop_services'),
    path('shop/my-services/add/', views.add_shop_service, name='add_shop_service'),
    path('shop/my-services/remove/', views.remove_shop_service, name='remove_shop_service'),
    path('shop/my-services/update-price/', views.update_shop_service_price, name='update_shop_service_price'),
]