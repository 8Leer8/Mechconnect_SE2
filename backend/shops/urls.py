from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_shops, name='list_shops'),
]