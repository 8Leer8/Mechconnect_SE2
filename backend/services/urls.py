from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_services, name='list_services'),
    path('categories/', views.list_service_categories, name='list_service_categories'),
]