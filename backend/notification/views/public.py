from django.core.paginator import Paginator
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from users.models import Account

from ..models import Notification
from ..serializers import NotificationSerializer

MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 10


def _get_authenticated_account(request):
    account_id = request.session.get('account_id')
    if not account_id:
        return None

    try:
        return Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None


def _parse_int(value, default, minimum=1, maximum=MAX_PAGE_SIZE):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    return max(minimum, min(maximum, parsed))


def _is_truthy(value):
    return str(value).strip().lower() in {'1', 'true', 'yes', 'on'}


@api_view(['GET'])
@permission_classes([AllowAny])
def list_notifications(request):
    account = _get_authenticated_account(request)
    if account is None:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    unread_only = _is_truthy(request.GET.get('unread'))
    page = _parse_int(request.GET.get('page', 1), default=1, maximum=1_000_000)
    page_size = _parse_int(request.GET.get('page_size', DEFAULT_PAGE_SIZE), default=DEFAULT_PAGE_SIZE)

    base_queryset = Notification.objects.filter(receiver=account).order_by('-updated_at', '-created_at')
    filtered_queryset = base_queryset.filter(is_read=False) if unread_only else base_queryset
    unread_count = base_queryset.filter(is_read=False).count()

    paginator = Paginator(filtered_queryset, page_size)
    page_obj = paginator.get_page(page)
    results = NotificationSerializer(page_obj.object_list, many=True).data

    return Response(
        {
            'count': paginator.count,
            'unread_count': unread_count,
            'page': page_obj.number,
            'page_size': page_size,
            'has_next': page_obj.has_next(),
            'has_previous': page_obj.has_previous(),
            'results': results,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def mark_notification_read(request, notification_id):
    account = _get_authenticated_account(request)
    if account is None:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        notification = Notification.objects.get(id=notification_id, receiver=account)
    except Notification.DoesNotExist:
        return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)

    if not notification.is_read:
        notification.is_read = True
        notification.save(update_fields=['is_read'])

    return Response(
        {
            'message': 'Notification marked as read',
            'notification': NotificationSerializer(notification).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def mark_all_notifications_read(request):
    account = _get_authenticated_account(request)
    if account is None:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    updated_count = Notification.objects.filter(receiver=account, is_read=False).update(is_read=True)
    return Response(
        {
            'message': 'All notifications marked as read',
            'updated_count': updated_count,
        },
        status=status.HTTP_200_OK,
    )