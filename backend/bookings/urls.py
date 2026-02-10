from django.urls import path
from . import views

urlpatterns = [
    path('home/', views.home_page, name='home-page'),

    # Client request endpoints
    path('requests/', views.list_requests, name='list-requests'),
    path('requests/custom/create/', views.create_custom_request, name='create-custom-request'),
    path('requests/direct/create/', views.create_direct_request, name='create-direct-request'),
    path('requests/emergency/create/', views.create_emergency_request, name='create-emergency-request'),
    path('requests/<int:request_id>/cancel/', views.cancel_request, name='cancel-request'),
    
    # Direct request discovery/creation (client side)
    path('direct/mechanics/', views.get_mechanics, name='get-mechanics'),
    path('direct/mechanics/<int:mechanic_id>/services/', views.get_mechanic_services, name='get-mechanic-services'),
    path('direct/services/<int:service_id>/addons/', views.get_service_addons, name='get-service-addons'),
    path('direct/mechanic/create/', views.create_mechanic_direct_request, name='create-mechanic-direct-request'),
    
    # Client booking endpoints
    path('bookings/', views.list_client_bookings, name='list-client-bookings'),
    path('bookings/<int:booking_id>/', views.get_booking_detail, name='get-booking-detail'),

    # Mechanic booking endpoints (provider side)
    path('mechanic/bookings/', views.list_mechanic_bookings, name='list-mechanic-bookings'),
    path('mechanic/bookings/<int:booking_id>/', views.get_mechanic_booking_detail, name='get-mechanic-booking-detail'),
    path('mechanic/bookings/<int:booking_id>/complete/', views.mechanic_complete_booking, name='mechanic-complete-booking'),
    path('mechanic/requests/<int:request_id>/accept/', views.mechanic_accept_direct_request, name='mechanic-accept-direct-request'),
    path('mechanic/requests/<int:request_id>/decline/', views.mechanic_decline_direct_request, name='mechanic-decline-direct-request'),
]