from django.urls import path
from . import views
from .views.mechanic import payment_views
from .views.client.client_request_list_views import get_request_detail
from .views.admin import (
    admin_booking_overview,
    admin_list_disputes,
    admin_resolve_dispute,
    admin_list_bookings,
    admin_list_requests,
    admin_booking_chat_history,
)

urlpatterns = [
    path('home/', views.home_page, name='home-page'),

    # Client request endpoints
    path('requests/', views.list_requests, name='list-requests'),
    path('requests/<int:request_id>/', get_request_detail, name='get-request-detail'),
    path('requests/custom/create/', views.create_custom_request, name='create-custom-request'),
    path('requests/emergency/create/', views.create_emergency_request, name='create-emergency-request'),
    path('requests/emergency/cooldown/', views.get_emergency_cooldown, name='get-emergency-cooldown'),
    path('requests/broadcast/create/', views.create_broadcast_request, name='create-broadcast-request'),
    path('requests/<int:request_id>/cancel/', views.cancel_request, name='cancel-request'),
    
    # Broadcast request endpoints (mechanic side)
    path('broadcasts/active/', views.get_active_broadcasts, name='get-active-broadcasts'),
    path('broadcasts/<int:broadcast_id>/accept/', views.accept_broadcast_request, name='accept-broadcast-request'),
    path('broadcasts/<int:broadcast_id>/withdraw/', views.withdraw_broadcast_offer, name='withdraw-broadcast-offer'),

    # Broadcast request endpoints (client selection side)
    path('broadcasts/<int:broadcast_id>/offers/', views.get_broadcast_offers, name='get-broadcast-offers'),
    path('broadcasts/<int:broadcast_id>/select-mechanic/', views.select_mechanic, name='select-mechanic'),
    
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
    path('<int:booking_id>/reschedule/', views.propose_reschedule, name='propose-reschedule-short'),
    path('<int:booking_id>/reschedule/respond/', views.respond_reschedule, name='respond-reschedule-short'),
    path('<int:booking_id>/reschedule/cancel/', views.cancel_reschedule, name='cancel-reschedule-short'),
    path('bookings/', views.list_client_bookings, name='list-client-bookings'),
    path('bookings/<int:booking_id>/', views.get_booking_detail, name='get-booking-detail'),
    path('bookings/<int:booking_id>/reschedule/', views.propose_reschedule, name='propose-reschedule'),
    path('bookings/<int:booking_id>/reschedule/respond/', views.respond_reschedule, name='respond-reschedule'),
    path('bookings/<int:booking_id>/reschedule/cancel/', views.cancel_reschedule, name='cancel-reschedule'),
    path('bookings/<int:booking_id>/cancel/', views.client_cancel_booking, name='client-cancel-booking'),
    path('bookings/<int:booking_id>/mechanic-review/', views.submit_mechanic_review, name='submit-mechanic-review'),
    path('bookings/<int:booking_id>/disputes/create/', views.create_dispute, name='create-dispute'),
    path('bookings/<int:booking_id>/disputes/resolve/', views.resolve_dispute, name='resolve-dispute'),
    path('bookings/<int:booking_id>/disputes/refund-details/', views.provide_refund_details, name='provide-refund-details'),
    path('bookings/<int:booking_id>/disputes/verify-refund/', views.client_verify_refund, name='client-verify-refund'),
    path('disputes/my/', views.list_my_disputes, name='list-my-disputes'),
    path('payments/initiate/', payment_views.initiate_payment, name='payments-initiate'),
    path('payments/qr/<int:booking_id>/', payment_views.get_qr_token, name='payments-qr-token'),
    path('payments/qr/scan/', payment_views.scan_qr, name='payments-qr-scan'),
    path('payments/qr/confirm/', payment_views.confirm_qr_payment, name='payments-qr-confirm'),
    path('payments/redirect/success/', payment_views.payment_redirect_success, name='payments-redirect-success'),
    path('payments/redirect/failed/', payment_views.payment_redirect_failed, name='payments-redirect-failed'),
    path('payments/webhook/', payment_views.paymongo_webhook, name='payments-webhook'),
    path('payments/pay-with-credits/', payment_views.pay_with_credits, name='pay-with-credits'),
    path('bookings/<int:booking_id>/quotation/accept/', views.client_accept_quotation, name='client-accept-quotation'),
    path('bookings/<int:booking_id>/quotation/reject/', views.client_reject_quotation, name='client-reject-quotation'),
    path('bookings/<int:booking_id>/report-no-show/', views.ReportNoShowView.as_view(), name='report-no-show'),
    # Live mechanic location (GET for client polling, POST for mechanic pushing GPS)
    path('bookings/<int:booking_id>/mechanic-location/', views.mechanic_location_view, name='mechanic-location'),

    # Mechanic booking endpoints (provider side)
    path('mechanic/bookings/', views.list_mechanic_bookings, name='list-mechanic-bookings'),
    path('mechanic/bookings/<int:booking_id>/', views.get_mechanic_booking_detail, name='get-mechanic-booking-detail'),
    path('mechanic/bookings/<int:booking_id>/complete/', views.mechanic_complete_booking, name='mechanic-complete-booking'),
    path('mechanic/bookings/<int:booking_id>/start-travel/', views.mechanic_start_travel, name='mechanic-start-travel'),
    path('mechanic/bookings/<int:booking_id>/cancel-travel/', views.mechanic_cancel_travel, name='mechanic-cancel-travel'),
    path('mechanic/bookings/<int:booking_id>/arrived/', views.mechanic_arrived, name='mechanic-arrived'),
    path('mechanic/bookings/<int:booking_id>/start-diagnosing/', views.mechanic_start_diagnosing, name='mechanic-start-diagnosing'),
    path('mechanic/bookings/<int:booking_id>/start-job/', views.mechanic_start_job, name='mechanic-start-job'),
    path('mechanic/bookings/<int:booking_id>/append-before-photos/', views.mechanic_append_before_photos, name='mechanic-append-before-photos'),
    path('mechanic/bookings/<int:booking_id>/cancel-job/', views.mechanic_cancel_job, name='mechanic-cancel-job'),
    path('mechanic/bookings/<int:booking_id>/pause-job/', views.mechanic_pause_job, name='mechanic-pause-job'),
    path('mechanic/bookings/<int:booking_id>/resume-job/', views.mechanic_resume_job, name='mechanic-resume-job'),
    path('mechanic/bookings/<int:booking_id>/finish-job/', views.mechanic_finish_job, name='mechanic-finish-job'),
    path('mechanic/bookings/<int:booking_id>/disputes/upload-receipt/', views.mechanic_upload_dispute_receipt, name='mechanic-upload-dispute-receipt'),
    path('mechanic/bookings/<int:booking_id>/quotation/items/<int:item_id>/receipt/', views.mechanic_upload_quotation_item_receipt, name='mechanic-upload-quotation-item-receipt'),
    path('mechanic/bookings/<int:booking_id>/disputes/submit-defense/', views.SubmitDisputeDefenseView.as_view(), name='mechanic-submit-dispute-defense'),
    path('mechanic/bookings/<int:booking_id>/payment-received/', views.mechanic_payment_received, name='mechanic-payment-received'),
    path('mechanic/bookings/<int:booking_id>/quotation/', views.mechanic_booking_quotation, name='mechanic-booking-quotation'),
    path('mechanic/bookings/<int:booking_id>/revert-stage/', views.mechanic_revert_stage, name='mechanic-revert-stage'),
    path('mechanic/bookings/<int:booking_id>/cancel-booking/', views.mechanic_cancel_booking, name='mechanic-cancel-booking'),
    path('mechanic/bookings/<int:booking_id>/accept-backjob/', views.mechanic_accept_backjob, name='mechanic-accept-backjob'),
    path('mechanic/requests/<int:request_id>/accept/', views.mechanic_accept_direct_request, name='mechanic-accept-direct-request'),
    path('mechanic/requests/<int:request_id>/decline/', views.mechanic_decline_direct_request, name='mechanic-decline-direct-request'),
    path('mechanic/emergency/<int:request_id>/accept/', views.mechanic_accept_emergency_request, name='mechanic-accept-emergency-request'),
    path('mechanic/emergency/', views.get_emergency_requests, name='get-emergency-requests'),
    path('shopowner/emergency/', views.list_shopowner_emergency_requests, name='shopowner-emergency-requests'),
    path('shopowner/emergency/<int:request_id>/accept/', views.shopowner_accept_emergency_request, name='shopowner-accept-emergency-request'),
    path('shopowner/broadcasts/<int:broadcast_id>/accept/', views.shopowner_accept_broadcast_request, name='shopowner-accept-broadcast-request'),

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
    path('shopowner/bookings/<int:booking_id>/quotation/', views.get_shopowner_booking_quotation, name='get-shopowner-booking-quotation'),
    path(
        'shopowner/bookings/<int:booking_id>/quotation/items/<int:item_id>/receipt/',
        views.shopowner_upload_quotation_item_receipt,
        name='shopowner-upload-quotation-item-receipt',
    ),
    path('shopowner/bookings/<int:booking_id>/accept-backjob/', views.shopowner_accept_backjob, name='shopowner-accept-backjob'),
    path('shopowner/cash-remittances/', views.list_cash_remittances, name='list-cash-remittances'),
    path('shopowner/cash-remittances/<int:remittance_id>/received/', views.mark_cash_remittance_received, name='mark-cash-remittance-received'),
    path('shopowner/cash-remittances/<int:remittance_id>/remind/', views.remind_cash_remittance, name='remind-cash-remittance'),

    # Request assignment endpoints (shop owner assigns mechanics to jobs)
    path('requests/<int:request_id>/assignments/', views.list_request_assignments, name='list-request-assignments'),
    path('requests/<int:request_id>/assignments/add/', views.assign_mechanic, name='assign-mechanic'),
    path('requests/<int:request_id>/assignments/<int:assignment_id>/remove/', views.unassign_mechanic, name='unassign-mechanic'),
    path('requests/<int:request_id>/assignments/<int:assignment_id>/role/', views.update_assignment_role, name='update-assignment-role'),
]

#Admin Urls
admin_urlpatterns = [
    path('overview/', admin_booking_overview, name='admin-booking-overview'),
    path('disputes/', admin_list_disputes, name='admin-list-disputes'),
    path('disputes/<int:dispute_id>/resolve/', admin_resolve_dispute, name='admin-resolve-dispute'),
    path('list/', admin_list_bookings, name='admin-list-bookings'),
    path('requests/', admin_list_requests, name='admin-list-requests'),
    path('<int:booking_id>/chat-history/', admin_booking_chat_history, name='admin-booking-chat-history'),
]