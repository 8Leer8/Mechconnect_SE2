from django.urls import path
from . import views

urlpatterns = [
    # Authentication endpoints
    path('register/', views.register, name='register'),
    path('login/', views.login, name='login'),
    path('logout/', views.logout, name='logout'),
    path('check-session/', views.check_session, name='check_session'),
    
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
    
    # Role registration
    path('register-mechanic/', views.register_mechanic, name='register_mechanic'),
]
