from django.urls import path
from . import views

urlpatterns = [
    path('home/', views.home_page, name='home-page'),
    path('requests/', views.list_requests, name='list-requests'),
    path('requests/custom/create/', views.create_custom_request, name='create-custom-request'),
    path('requests/direct/create/', views.create_direct_request, name='create-direct-request'),
    path('requests/emergency/create/', views.create_emergency_request, name='create-emergency-request'),
    
    # Booking endpoints
    path('bookings/', views.list_client_bookings, name='list-client-bookings'),
    path('bookings/<int:booking_id>/', views.get_booking_detail, name='get-booking-detail'),
]