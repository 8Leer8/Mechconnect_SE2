from django.urls import path
from . import views

urlpatterns = [
    path('home/', views.home_page, name='home-page'),

    # Client request endpoints
    path('requests/', views.list_requests, name='list-requests'),
    path('requests/custom/create/', views.create_custom_request, name='create-custom-request'),
    path('requests/direct/create/', views.create_direct_request, name='create-direct-request'),
    path('requests/emergency/create/', views.create_emergency_request, name='create-emergency-request'),
    path('requests/broadcast/create/', views.create_broadcast_request, name='create-broadcast-request'),
    path('requests/<int:request_id>/cancel/', views.cancel_request, name='cancel-request'),
    
    # Broadcast request endpoints (mechanic side)
    path('broadcasts/active/', views.get_active_broadcasts, name='get-active-broadcasts'),
    path('broadcasts/<int:broadcast_id>/accept/', views.accept_broadcast_request, name='accept-broadcast-request'),
    
    # Broadcast request endpoints (client side)
    path('requests/<int:request_id>/broadcast/resend/', views.resend_broadcast_request, name='resend-broadcast-request'),
    
    # Direct request discovery/creation (client side)
    path('direct/mechanics/', views.get_mechanics, name='get-mechanics'),
    path('direct/mechanics/<int:mechanic_id>/services/', views.get_mechanic_services, name='get-mechanic-services'),
    path('direct/services/<int:service_id>/addons/', views.get_service_addons, name='get-service-addons'),
    path('direct/mechanic/create/', views.create_mechanic_direct_request, name='create-mechanic-direct-request'),
    
    # Shop direct request endpoints (client side)
    path('direct/shops/', views.get_shops, name='get-shops'),
    path('direct/shops/<int:shop_id>/services/', views.get_shop_services, name='get-shop-services'),
    path('direct/shop/create/', views.create_shop_direct_request, name='create-shop-direct-request'),
    
    # Client booking endpoints
    path('bookings/', views.list_client_bookings, name='list-client-bookings'),
    path('bookings/<int:booking_id>/', views.get_booking_detail, name='get-booking-detail'),

    # Mechanic booking endpoints (provider side)
    path('mechanic/bookings/', views.list_mechanic_bookings, name='list-mechanic-bookings'),
    path('mechanic/bookings/<int:booking_id>/', views.get_mechanic_booking_detail, name='get-mechanic-booking-detail'),
    path('mechanic/bookings/<int:booking_id>/complete/', views.mechanic_complete_booking, name='mechanic-complete-booking'),
    path('mechanic/bookings/<int:booking_id>/start-travel/', views.mechanic_start_travel, name='mechanic-start-travel'),
    path('mechanic/bookings/<int:booking_id>/start-job/', views.mechanic_start_job, name='mechanic-start-job'),
    path('mechanic/requests/<int:request_id>/accept/', views.mechanic_accept_direct_request, name='mechanic-accept-direct-request'),
    path('mechanic/requests/<int:request_id>/decline/', views.mechanic_decline_direct_request, name='mechanic-decline-direct-request'),
]