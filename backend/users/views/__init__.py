# Re-export all views from submodules for backward compatibility
from .auth_views import *
from .password_views import *
from .profile_views import *
from .role_views import *
from .discovery_views import *
from .wallet_views import *

__all__ = [
    # Authentication views
    'register',
    'login',
    'logout',
    'check_session',
    'send_verification_code',
    'verify_code',
    
    # Password views
    'send_password_change_verification_code',
    'verify_password_change_gmail_code',
    'change_password',
    'request_password_reset',
    'verify_password_reset_token',
    'confirm_password_reset',
    
    # Profile views
    'get_current_user',
    'update_profile',
    'get_profile_details',
    'update_profile_settings',
    'verify_profile_password',
    'change_profile_email',
    
    # Role management views
    'switch_role',
    'get_active_role',
    'get_role_status',
    'register_mechanic',
    'register_shop_owner',
    
    # Discovery views
    'list_mechanics',
    'get_mechanic_profile',
    'mechanic_wallet',
    'mechanic_wallet_topup',
    'get_token_pricing_view',
]
