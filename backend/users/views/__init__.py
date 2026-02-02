# Re-export all views from submodules for backward compatibility
from .auth_views import *
from .password_views import *
from .profile_views import *
from .role_views import *
from .discovery_views import *

__all__ = [
    # Authentication views
    'register',
    'login',
    'logout',
    'check_session',
    
    # Password views
    'change_password',
    'request_password_reset',
    'confirm_password_reset',
    
    # Profile views
    'get_current_user',
    'update_profile',
    'get_profile_details',
    'update_profile_settings',
    
    # Role management views
    'switch_role',
    'get_active_role',
    'get_role_status',
    'register_mechanic',
    
    # Discovery views
    'list_mechanics',
]
