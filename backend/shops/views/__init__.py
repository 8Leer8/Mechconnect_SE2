# Re-export all views from submodules for backward compatibility
from .shop_views import *
from .shop_mechanic_list_view import *
from .shop_profile_views import *

__all__ = [
    'list_shops',
    'shop_owner_dashboard',
    'list_shop_mechanics',
    'add_mechanic_to_shop',
    'search_available_mechanics',
    'set_shop_mechanic_active',
    'remove_mechanic_from_shop',
    'get_shop_profile',
]
