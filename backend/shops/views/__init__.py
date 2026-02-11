# Re-export all views from submodules for backward compatibility
from .shop_views import *
from .shop_mechanic_list_view import *

__all__ = [
    'list_shops',
    'shop_owner_dashboard',
    'list_shop_mechanics',
    'add_mechanic_to_shop',
    'search_available_mechanics',
]
