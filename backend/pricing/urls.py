from django.urls import path
from . import views


urlpatterns = [
    path('config/', views.get_pricing_config, name='get-pricing-config'),
    path('config/update/', views.update_pricing_config, name='update-pricing-config'),
]

admin_urlpatterns = urlpatterns
