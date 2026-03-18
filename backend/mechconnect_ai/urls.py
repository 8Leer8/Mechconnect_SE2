from django.urls import path
from . import views

urlpatterns = [
    path('predict/', views.predict_and_match, name='predict_and_match'),
]