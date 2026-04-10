from django.urls import path
from . import views
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
)

urlpatterns = [
    # Authentication endpoints
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('token/', views.token_login, name='token_login'),
    path('check-session/', views.check_session, name='check_session'),
    
    # Email verification
    path('send-verification-code/', views.send_verification_code, name='send_verification_code'),
    path('verify-code/', views.verify_code, name='verify_code'),
    
    # Profile management
    path('profile/', views.get_current_user, name='get_current_user'),
    path('profile/update/', views.update_profile, name='update_profile'),
    
    # Profile page endpoints
    path('profile/details/', views.get_profile_details, name='get_profile_details'),
    path('profile/settings/', views.update_profile_settings, name='update_profile_settings'),
    path('profile/switch-role/', views.switch_role, name='switch_role'),
    path('profile/active-role/', views.get_active_role, name='get_active_role'),
    path('profile/role-status/', views.get_role_status, name='get_role_status'),
    
    # Password management
    path('password/change/', views.change_password, name='change_password'),
    path('password/reset/request/', views.request_password_reset, name='request_password_reset'),
    path('password/reset/confirm/', views.confirm_password_reset, name='confirm_password_reset'),
    
    # Discovery endpoints
    path('mechanics/', views.list_mechanics, name='list_mechanics'),
    path('mechanics/nearby/', views.list_nearby_mechanics, name='list_nearby_mechanics'),
    path('mechanics/<int:mechanic_id>/profile/', views.get_mechanic_profile, name='get_mechanic_profile'),
    
    # Role registration
    path('register-mechanic/', views.register_mechanic, name='register_mechanic'),
    path('register-shop-owner/', views.register_shop_owner, name='register_shop_owner'),
    # Mechanic wallet endpoints
    path('mechanic/wallet/', views.mechanic_wallet, name='mechanic_wallet'),
    path('mechanic/wallet/topup/', views.mechanic_wallet_topup, name='mechanic_wallet_topup'),
    path('mechanic/wallet/token-pricing/', views.get_token_pricing_view, name='mechanic-wallet-token-pricing'),
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
]
