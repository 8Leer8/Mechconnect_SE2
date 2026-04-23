from django.urls import path
from . import views
from .views.token_payment_views import (
    initiate_token_purchase,
    token_purchase_webhook,
    token_redirect_success,
    token_redirect_failed,
    check_purchase_status,
)
from .views.admin import (
    admin_login,
    admin_logout,
    admin_check_session,
    admin_user_overview,
    admin_list_accounts,
    admin_verification_queue,
    admin_verification_decision,
    admin_list_reports,
    admin_wallet_overview,
    admin_list_wallet_transactions,
    create_admin,
)

urlpatterns = [
    # Authentication endpoints
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('token/', views.token_login, name='token_login'),
    path('check-session/', views.check_session, name='check_session'),

    # SMS OTP endpoints
    path('send-otp/', views.send_otp, name='send_otp'),
    path('verify-otp/', views.verify_otp, name='verify_otp'),

    # Email verification
    path('send-verification-code/', views.send_verification_code, name='send_verification_code'),
    path('verify-code/', views.verify_code, name='verify_code'),
    
    # Profile management
    path('profile/', views.get_current_user, name='get_current_user'),
    path('profile/update/', views.update_profile, name='update_profile'),
    
    # Profile page endpoints
    path('profile/details/', views.get_profile_details, name='get_profile_details'),
    path('profile/settings/', views.update_profile_settings, name='update_profile_settings'),
    path('profile/branches/', views.profile_branches, name='profile_branches'),
    path('profile/branches/<int:branch_id>/', views.profile_branch_detail, name='profile_branch_detail'),
    path('profile/branches/<int:branch_id>/set-main/', views.set_main_branch, name='set_main_branch'),
    path('profile/verify-password/', views.verify_profile_password, name='verify_profile_password'),
    path('profile/change-email/', views.change_profile_email, name='change_profile_email'),
    path('profile/deactivate/request/', views.request_account_deactivation, name='request_account_deactivation'),
    path('profile/deactivate/confirm/', views.confirm_account_deactivation, name='confirm_account_deactivation'),
    path('profile/switch-role/', views.switch_role, name='switch_role'),
    path('profile/active-role/', views.get_active_role, name='get_active_role'),
    path('profile/role-status/', views.get_role_status, name='get_role_status'),
    
    # Password management
    path('password/change/verify-gmail/', views.send_password_change_verification_code, name='send_password_change_verification_code'),
    path('password/change/verify-gmail/confirm/', views.verify_password_change_gmail_code, name='verify_password_change_gmail_code'),
    path('password/change/', views.change_password, name='change_password'),
    path('password/reset/request/', views.request_password_reset, name='request_password_reset'),
    path('password/reset/verify/', views.verify_password_reset_token, name='verify_password_reset_token'),
    path('password/reset/confirm/', views.confirm_password_reset, name='confirm_password_reset'),
    
    # Discovery endpoints
    path('mechanics/', views.list_mechanics, name='list_mechanics'),
    path('mechanics/nearby/', views.list_nearby_mechanics, name='list_nearby_mechanics'),
    path('mechanics/<int:mechanic_id>/profile/', views.get_mechanic_profile, name='get_mechanic_profile'),
    path('favorites/', views.list_favorites, name='list_favorites'),
    path('favorites/toggle/', views.toggle_favorite, name='toggle_favorite'),
    
    # Role registration
    path('register-mechanic/', views.register_mechanic, name='register_mechanic'),
    path('register-shop-owner/', views.register_shop_owner, name='register_shop_owner'),
    # Mechanic wallet endpoints
    path('shop-owner/wallet/', views.shop_owner_wallet, name='shop_owner_wallet'),
    path('shop-owner/wallet/transactions/', views.shop_owner_wallet_transactions, name='shop_owner_wallet_transactions'),
    path('shop-owner/wallet/topup/', views.shop_owner_wallet_topup, name='shop_owner_wallet_topup'),
    path('mechanic/wallet/', views.mechanic_wallet, name='mechanic_wallet'),
    path('mechanic/wallet/transactions/', views.mechanic_wallet_transactions, name='mechanic_wallet_transactions'),
    path('mechanic/wallet/topup/', views.mechanic_wallet_topup, name='mechanic_wallet_topup'),
    path('mechanic/wallet/token-pricing/', views.get_token_pricing_view, name='mechanic-wallet-token-pricing'),
    # Token purchase PayMongo payment flow (Mechanic)
    path('wallet/initiate-payment/', initiate_token_purchase, name='initiate_token_purchase'),
    path('wallet/webhook/', token_purchase_webhook, name='token_purchase_webhook'),
    path('wallet/redirect/success/', token_redirect_success, name='token_redirect_success'),
    path('wallet/redirect/failed/', token_redirect_failed, name='token_redirect_failed'),
    path('wallet/purchase/<int:purchase_id>/status/', check_purchase_status, name='check_purchase_status'),
    # Token purchase PayMongo payment flow (Shop Owner) - uses same views
    path('shop-owner/wallet/initiate-payment/', initiate_token_purchase, name='shop_owner_initiate_token_purchase'),
    path('shop-owner/wallet/purchase/<int:purchase_id>/status/', check_purchase_status, name='shop_owner_check_purchase_status'),
    path('shop-owner/redirect/success/', token_redirect_success, name='shop_owner_token_redirect_success'),
    path('shop-owner/redirect/failed/', token_redirect_failed, name='shop_owner_token_redirect_failed'),
]

#Admin Urls
admin_urlpatterns = [
    path('auth/login/', admin_login, name='admin-login'),
    path('auth/logout/', admin_logout, name='admin-logout'),
    path('auth/check-session/', admin_check_session, name='admin-check-session'),
    path('overview/', admin_user_overview, name='admin-user-overview'),
    path('accounts/', admin_list_accounts, name='admin-list-accounts'),
    path('verification-queue/', admin_verification_queue, name='admin-verification-queue'),
    path('verification/decision/', admin_verification_decision, name='admin-verification-decision'),
    path('reports/', admin_list_reports, name='admin-list-reports'),
    path('wallet/overview/', admin_wallet_overview, name='admin-wallet-overview'),
    path('wallet/transactions/', admin_list_wallet_transactions, name='admin-wallet-transactions'),
    path('admins/create/', create_admin, name='create-admin'),
]
