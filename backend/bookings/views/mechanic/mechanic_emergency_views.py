from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Prefetch
from django.utils import timezone
from datetime import timedelta

from ...models import Request, EmergencyRequest
from ...serializers import RequestSerializer
from users.models import Account


EMERGENCY_REQUEST_TTL_MINUTES = 5


@api_view(['GET'])
@permission_classes([AllowAny])
def get_emergency_requests(request):
    """
    Get all emergency requests that don't have a provider assigned yet.
    These are available for any mechanic to accept.
    """
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'emergency_requests': [],
            'message': 'Please log in to see emergency requests'
        }, status=status.HTTP_200_OK)
    
    try:
        account = Account.objects.get(id=account_id)
        
        # Only mechanics can view emergency requests
        if not hasattr(account, 'mechanic'):
            return Response({
                'emergency_requests': [],
                'error': 'Only mechanics can view emergency requests'
            }, status=status.HTTP_403_FORBIDDEN)

        emergency_expiry_cutoff = timezone.now() - timedelta(minutes=EMERGENCY_REQUEST_TTL_MINUTES)

        # Auto-delete stale emergency requests that were never accepted.
        Request.objects.filter(
            request_type='emergency',
            provider__isnull=True,
            booking__isnull=True,
            created_at__lt=emergency_expiry_cutoff,
        ).delete()
        
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
        
        print(f"[DEBUG Emergency Endpoint] Found {emergency_requests.count()} emergency requests")
        for req in emergency_requests:
            print(f"[DEBUG Emergency Endpoint] Request ID: {req.id}, Client: {req.client.account.username}, Has Details: {hasattr(req, 'emergencyrequest')}")
        
        serialized_data = RequestSerializer(emergency_requests, many=True, context={'request': request}).data
        
        return Response({
            'emergency_requests': serialized_data,
            'count': len(serialized_data)
        }, status=status.HTTP_200_OK)
        
    except Account.DoesNotExist:
        return Response({
            'emergency_requests': [],
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"[DEBUG Emergency Endpoint] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return Response({
            'emergency_requests': [],
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
