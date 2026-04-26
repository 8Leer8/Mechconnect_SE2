from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch
from django.utils import timezone
from datetime import timedelta
import logging

from ...models import Request, EmergencyRequest
from ...serializers import RequestSerializer
from users.models import Account

logger = logging.getLogger(__name__)


EMERGENCY_REQUEST_TTL_MINUTES = 5


@api_view(['GET'])
@permission_classes([AllowAny])
def get_emergency_requests(request):
    """
    Get all emergency requests that don't have a provider assigned yet.
    These are available for any mechanic to accept.
    """
    account_id_raw = request.session.get('account_id')

    if not account_id_raw:
        return Response({
            'emergency_requests': [],
            'message': 'Please log in to see emergency requests'
        }, status=status.HTTP_200_OK)

    try:
        account_id = int(account_id_raw)
    except (TypeError, ValueError):
        return Response({
            'emergency_requests': [],
            'error': 'Invalid session. Please log in again.'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.select_related('mechanic').get(id=account_id)
        
        # Only mechanics can view emergency requests
        if not hasattr(account, 'mechanic'):
            return Response({
                'emergency_requests': [],
                'error': 'Only mechanics can view emergency requests'
            }, status=status.HTTP_403_FORBIDDEN)

        mechanic = account.mechanic
        mechanic_status = str(getattr(mechanic, 'status', '') or '').lower()
        mechanic_can_accept = mechanic_status == mechanic.WorkStatus.AVAILABLE
        accept_disabled_reason = None
        if mechanic_status != mechanic.WorkStatus.AVAILABLE:
            accept_disabled_reason = 'mechanic_unavailable'

        emergency_expiry_cutoff = timezone.now() - timedelta(minutes=EMERGENCY_REQUEST_TTL_MINUTES)

        # Auto-delete stale emergency requests that were never accepted.
        try:
            Request.objects.filter(
                request_type='emergency',
                provider__isnull=True,
                booking__isnull=True,
                created_at__lt=emergency_expiry_cutoff,
            ).delete()
        except Exception:
            logger.exception("Failed to clean up stale emergency requests")
        
        # Fetch all emergency requests without a provider and without a booking
        emergency_requests = Request.objects.filter(
            request_type='emergency',
            provider__isnull=True,
            created_at__gte=emergency_expiry_cutoff,
        ).exclude(
            booking__isnull=False
        ).select_related(
            'client',
            'client__account',
            'service_location'
        ).prefetch_related(
            Prefetch('emergencyrequest', queryset=EmergencyRequest.objects.all())
        ).order_by('-created_at')
        
        serialized_data = []
        for emergency_request in emergency_requests:
            try:
                serialized_data.append(
                    RequestSerializer(emergency_request, context={'request': request}).data
                )
            except Exception:
                logger.exception(
                    "Failed to serialize emergency request id=%s",
                    getattr(emergency_request, 'id', None),
                )
        
        return Response({
            'emergency_requests': serialized_data,
            'count': len(serialized_data),
            'mechanic_can_accept': mechanic_can_accept,
            'mechanic_status': mechanic_status,
            'accept_disabled_reason': accept_disabled_reason,
        }, status=status.HTTP_200_OK)
        
    except Account.DoesNotExist:
        return Response({
            'emergency_requests': [],
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception:
        logger.exception("Unexpected error while fetching mechanic emergency requests")
        return Response({
            'emergency_requests': [],
            'error': 'Unable to load emergency requests right now.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
