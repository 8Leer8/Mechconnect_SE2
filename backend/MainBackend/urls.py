"""
URL configuration for MainBackend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from users.urls import admin_urlpatterns as users_admin_urlpatterns
from bookings.urls import admin_urlpatterns as bookings_admin_urlpatterns
from shops.urls import admin_urlpatterns as shops_admin_urlpatterns
from services.urls import admin_urlpatterns as services_admin_urlpatterns
from notification.urls import admin_urlpatterns as notification_admin_urlpatterns
from pricing.urls import admin_urlpatterns as pricing_admin_urlpatterns


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),
    path('api/shops/', include('shops.urls')),
    path('api/services/', include('services.urls')),
    path('api/bookings/', include('bookings.urls')),
    path('api/notification/', include('notification.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/ai/', include('mechconnect_ai.urls')),  # added
    path('api/pricing/', include('pricing.urls')),
    # Admin Urls
    path('api/admin/users/', include(users_admin_urlpatterns)),
    path('api/admin/bookings/', include(bookings_admin_urlpatterns)),
    path('api/admin/shops/', include(shops_admin_urlpatterns)),
    path('api/admin/services/', include(services_admin_urlpatterns)),
    path('api/admin/notification/', include(notification_admin_urlpatterns)),
    path('api/admin/pricing/', include(pricing_admin_urlpatterns)),
]

# Serve media files during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)