from django.urls import path
from . import views

urlpatterns = [
    path('', views.list_conversations, name='chat-list-conversations'),
    path('create/', views.create_conversation, name='chat-create-conversation'),
    path('<int:pk>/messages/', views.messages_view, name='chat-messages'),
    path('booking/<int:booking_id>/', views.conversation_for_booking, name='chat-conversation-for-booking'),
    path('booking/<int:booking_id>/access/', views.booking_chat_access, name='chat-booking-access'),
    path('booking/<int:booking_id>/backjob/', views.request_backjob, name='chat-request-backjob'),
]
