from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Notification
from users.permissions import IsAdmin


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_notification_overview(request):
    data = {
        'notifications_total': Notification.objects.count(),
    }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_notifications(request):
    queryset = Notification.objects.select_related('receiver').order_by('-created_at')
    q = request.GET.get('q')

    if q:
        queryset = queryset.filter(
            Q(title__icontains=q)
            | Q(message__icontains=q)
            | Q(receiver__username__icontains=q)
        )

    queryset = queryset[:200]

    results = []
    for notification in queryset:
        results.append(
            {
                'id': notification.id,
                'receiver_id': notification.receiver_id,
                'receiver_username': notification.receiver.username,
                'title': notification.title,
                'message': notification.message,
                'created_at': notification.created_at,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)
