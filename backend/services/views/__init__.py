# Re-export all views from submodules for backward compatibility
from .service_views import *
from .mechanic_services_views import (
    list_my_services,
    add_my_service,
    remove_my_service,
    update_my_service_price,
)
from .shop_services_views import (
    list_shop_services,
    add_shop_service,
    remove_shop_service,
    update_shop_service_price,
)

__all__ = [
    'list_services',
    'list_services_with_market_pricing',
    'get_service_detail_with_pricing',
    'get_service_detail_with_providers',
    'list_service_categories',
    'list_my_services',
    'add_my_service',
    'remove_my_service',
    'update_my_service_price',
    'list_shop_services',
    'add_shop_service',
    'remove_shop_service',
    'update_shop_service_price',
]
