# This file maintains backward compatibility by re-exporting all views
# All view implementations have been moved to the views/ directory

from .views.service_views import *
from .views.mechanic_services_views import (
    list_my_services,
    add_my_service,
    remove_my_service,
)

