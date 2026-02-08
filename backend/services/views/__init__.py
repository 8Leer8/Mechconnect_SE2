# Re-export all views from submodules for backward compatibility
from .service_views import *
from .mechanic_services_views import (
    list_my_services,
    add_my_service,
    remove_my_service,
)

__all__ = [
    'list_services',
    'list_service_categories',
    'list_my_services',
    'add_my_service',
    'remove_my_service',
]
