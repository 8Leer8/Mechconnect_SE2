from django.urls import path

from .views import list_notifications, mark_all_notifications_read, mark_notification_read
from .views.admin import admin_notification_overview, admin_list_notifications

urlpatterns = [
	path('', list_notifications, name='list-notifications'),
	path('read/<int:notification_id>/', mark_notification_read, name='mark-notification-read'),
	path('read-all/', mark_all_notifications_read, name='mark-all-notifications-read'),
]

#Admin Urls
admin_urlpatterns = [
	path('overview/', admin_notification_overview, name='admin-notification-overview'),
	path('list/', admin_list_notifications, name='admin-list-notifications'),
]