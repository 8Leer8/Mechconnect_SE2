from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_services, name='list_services'),
    path('categories/', views.list_service_categories, name='list_service_categories'),
    # Mechanic: services I offer (for profile)
    path('mechanic/my-services/', views.list_my_services, name='list_my_services'),
    path('mechanic/my-services/add/', views.add_my_service, name='add_my_service'),
    path('mechanic/my-services/remove/', views.remove_my_service, name='remove_my_service'),
]