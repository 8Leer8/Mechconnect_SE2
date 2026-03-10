from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_shops, name='list_shops'),
    path('<int:shop_id>/profile/', views.get_shop_profile, name='get_shop_profile'),
    path('dashboard/', views.shop_owner_dashboard, name='shop_owner_dashboard'),
    path('mechanics/', views.list_shop_mechanics, name='list_shop_mechanics'),
    path('mechanics/add/', views.add_mechanic_to_shop, name='add_mechanic_to_shop'),
    path('mechanics/search/', views.search_available_mechanics, name='search_available_mechanics'),
]