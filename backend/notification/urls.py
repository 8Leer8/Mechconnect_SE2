from django.urls import path
from .views.admin import admin_notification_overview, admin_list_notifications

urlpatterns = [
]

#Admin Urls
admin_urlpatterns = [
	path('overview/', admin_notification_overview, name='admin-notification-overview'),
	path('list/', admin_list_notifications, name='admin-list-notifications'),
]