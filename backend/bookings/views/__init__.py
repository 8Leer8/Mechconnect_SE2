# Re-export all views from submodules for backward compatibility
from .client_home_views import *
from .client_request_create_views import *
from .client_request_list_views import *
from .client_booking_views import *
from .broadcast_request_views import *
from .mechanic_broadcast_request_views import *
from .mechanic_booking_views import *
from .directrequest import *
from .request_assignment_views import *
from .shopowner_booking_views import *

__all__ = [
    # Home views
    'home_page',
    
    # Request list views
    'list_requests',
    'cancel_request',
    
    # Request create views
    'create_custom_request',
    'create_direct_request',
    'create_emergency_request',
    'create_broadcast_request',
    
    # Broadcast request views
    'get_active_broadcasts',
    'accept_broadcast_request',
    
    # Client booking views
    'list_client_bookings',
    'get_booking_detail',
    
    # Direct request views (client-side)
    'get_mechanics',
    'get_mechanic_services',
    'get_service_addons',
    'create_mechanic_direct_request',
    
    # Shop direct request views (client-side)
    'get_shops',
    'get_shop_services',
    'create_shop_direct_request',

    # Mechanic booking views
    'list_mechanic_bookings',
    'get_mechanic_booking_detail',
    'mechanic_accept_direct_request',
    'mechanic_decline_direct_request',
    'mechanic_complete_booking',

    # Shop owner booking views
    'shopowner_accept_direct_request',
    'shopowner_decline_direct_request',
    'shopowner_accept_custom_request',
    'shopowner_decline_custom_request',
    'list_shopowner_bookings',
    'get_shopowner_booking_detail',

    # Request assignment views (shop owner)
    'list_request_assignments',
    'assign_mechanic',
    'unassign_mechanic',
    'update_assignment_role',
]
