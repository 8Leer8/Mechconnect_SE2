# Re-export all views from submodules for backward compatibility
from .client_home_views import *
from .client_request_list_views import *
from .client_request_create_views import *
from .client_booking_views import *
from .directrequest import *

__all__ = [
    # Home views
    'home_page',
    
    # Request list views
    'list_requests',
    
    # Request create views
    'create_custom_request',
    'create_direct_request',
    'create_emergency_request',
    
    # Booking views
    'list_client_bookings',
    'get_booking_detail',
    
    # Direct request views
    'get_mechanics',
    'get_mechanic_services',
    'get_service_addons',
    'create_mechanic_direct_request',
]
