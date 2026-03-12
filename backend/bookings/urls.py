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
    path('mechanic/bookings/<int:booking_id>/cancel-travel/', views.mechanic_cancel_travel, name='mechanic-cancel-travel'),
    path('mechanic/bookings/<int:booking_id>/start-job/', views.mechanic_start_job, name='mechanic-start-job'),
    path('mechanic/bookings/<int:booking_id>/cancel-job/', views.mechanic_cancel_job, name='mechanic-cancel-job'),
    path('mechanic/bookings/<int:booking_id>/pause-job/', views.mechanic_pause_job, name='mechanic-pause-job'),
    path('mechanic/bookings/<int:booking_id>/resume-job/', views.mechanic_resume_job, name='mechanic-resume-job'),
    path('mechanic/bookings/<int:booking_id>/finish-job/', views.mechanic_finish_job, name='mechanic-finish-job'),
    path('mechanic/bookings/<int:booking_id>/payment-received/', views.mechanic_payment_received, name='mechanic-payment-received'),
    path('mechanic/bookings/<int:booking_id>/quotation/', views.mechanic_quotation, name='mechanic-quotation'),
    path('mechanic/bookings/<int:booking_id>/revert-stage/', views.mechanic_revert_stage, name='mechanic-revert-stage'),
    path('mechanic/bookings/<int:booking_id>/cancel-booking/', views.mechanic_cancel_booking, name='mechanic-cancel-booking'),
    path('mechanic/requests/<int:request_id>/accept/', views.mechanic_accept_direct_request, name='mechanic-accept-direct-request'),
    path('mechanic/requests/<int:request_id>/decline/', views.mechanic_decline_direct_request, name='mechanic-decline-direct-request'),
    path('mechanic/emergency/<int:request_id>/accept/', views.mechanic_accept_emergency_request, name='mechanic-accept-emergency-request'),
    path('mechanic/emergency/', views.get_emergency_requests, name='get-emergency-requests'),

    # Shop owner: list pending requests (Jobs > Requests tab)
    path('shopowner/requests/', views.list_shopowner_requests, name='list-shopowner-requests'),
    path('shopowner/requests/declined/', views.list_shopowner_declined_requests, name='list-shopowner-declined-requests'),
    # Shop owner booking endpoints (accept/decline requests)
    path('shopowner/requests/<int:request_id>/accept/', views.shopowner_accept_direct_request, name='shopowner-accept-direct-request'),
    path('shopowner/requests/<int:request_id>/decline/', views.shopowner_decline_direct_request, name='shopowner-decline-direct-request'),
    path('shopowner/requests/<int:request_id>/accept-custom/', views.shopowner_accept_custom_request, name='shopowner-accept-custom-request'),
    path('shopowner/requests/<int:request_id>/decline-custom/', views.shopowner_decline_custom_request, name='shopowner-decline-custom-request'),

    # Shop owner booking list/detail
    path('shopowner/bookings/', views.list_shopowner_bookings, name='list-shopowner-bookings'),
    path('shopowner/bookings/<int:booking_id>/', views.get_shopowner_booking_detail, name='get-shopowner-booking-detail'),

    # Request assignment endpoints (shop owner assigns mechanics to jobs)
    path('requests/<int:request_id>/assignments/', views.list_request_assignments, name='list-request-assignments'),
    path('requests/<int:request_id>/assignments/add/', views.assign_mechanic, name='assign-mechanic'),
    path('requests/<int:request_id>/assignments/<int:assignment_id>/remove/', views.unassign_mechanic, name='unassign-mechanic'),
    path('requests/<int:request_id>/assignments/<int:assignment_id>/role/', views.update_assignment_role, name='update-assignment-role'),
]